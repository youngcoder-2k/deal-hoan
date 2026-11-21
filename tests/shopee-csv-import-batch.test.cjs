const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const loadTs = require("./helpers/load-ts.cjs");

const uidA = "11111111-1111-4111-8111-111111111111";
const uidB = "22222222-2222-4222-8222-222222222222";
const uidDup = "11111111-9999-4999-8999-999999999999";

function loadCashback(db) {
  return loadTs({
    "@/lib/supabase/service": { getSupabaseServiceClient: () => db },
    "@/lib/deals/cashback-booster": {
      getBoosterSettingsSync: () => ({ safetyMarginPercent: 12, userCashbackPercent: 88 }),
    },
  })("lib/deals/cashback.ts");
}

test("resolveUserIdFromSubId uses preloadedUserIds without calling auth.admin.listUsers", async () => {
  let listUsersCalls = 0;
  const db = {
    auth: {
      admin: {
        listUsers: async () => {
          listUsersCalls++;
          return { data: { users: [] }, error: null };
        },
      },
    },
  };
  const { resolveUserIdFromSubId } = loadCashback(db);

  // Unique short prefix match -> resolves in-memory with zero network calls
  assert.equal(await resolveUserIdFromSubId("u_11111111", undefined, [uidA, uidB]), uidA);
  assert.equal(listUsersCalls, 0);

  // Ambiguous short prefix -> rejected safely
  assert.equal(await resolveUserIdFromSubId("u_11111111", undefined, [uidA, uidDup]), null);
  assert.equal(listUsersCalls, 0);

  // Explicit null (failed/truncated directory preload) -> rejected safely without retrying N times
  assert.equal(await resolveUserIdFromSubId("u_11111111", undefined, null), null);
  assert.equal(listUsersCalls, 0);

  // Full UUID still works regardless of preloaded list
  assert.equal(await resolveUserIdFromSubId(`u_${uidA}`, undefined, null), uidA);
});

test("loadAllAuthUserIds fetches directory once and guards against errors", async () => {
  let pagesFetched = 0;
  const dbOk = {
    auth: {
      admin: {
        listUsers: async ({ page }) => {
          pagesFetched++;
          return {
            data: { users: page === 1 ? [{ id: uidA }, { id: uidB }] : [] },
            error: null,
          };
        },
      },
    },
  };
  const { loadAllAuthUserIds } = loadCashback(dbOk);
  const ids = await loadAllAuthUserIds(dbOk);
  assert.deepEqual(Array.from(ids || []), [uidA, uidB]);
  assert.equal(pagesFetched, 1);

  const dbErr = {
    auth: {
      admin: {
        listUsers: async () => ({ data: null, error: { message: "rate limited" } }),
      },
    },
  };
  assert.equal(await loadAllAuthUserIds(dbErr), null);
});

test("Shopee CSV upload batches compact parsed orders on client and avoids N+1 / URL limits on server", () => {
  const clientCode = fs.readFileSync(
    path.join(process.cwd(), "app", "admin", "admin-users-client.tsx"),
    "utf-8"
  );
  const routeCode = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "admin", "shopee", "sync", "route.ts"),
    "utf-8"
  );

  // Client parses CSV locally and sends compact batches with retry and safe JSON handling
  assert.match(clientCode, /parseShopeeConversionReport\(text/, "Client must parse CSV before upload");
  assert.match(clientCode, /BATCH_SIZE\s*=\s*\d+/, "Client must split orders into small batches");
  assert.match(clientCode, /postBatchWithRetry/, "Client must retry transient network failures");
  assert.match(clientCode, /const rawBody = await res\.text\(\)/, "Client must safely read non-JSON HTTP responses");

  // Server handles both pre-parsed orders and raw csvContent, preloads auth users once, chunks .in()
  assert.match(routeCode, /hasOrdersBatch/, "Server must support pre-parsed orders batch");
  assert.match(routeCode, /loadAllAuthUserIds/, "Server must preload auth users once per batch");
  assert.match(routeCode, /EXISTING_CHUNK\s*=\s*100/, "Server must chunk existing order lookups");
  assert.match(routeCode, /CONCURRENCY\s*=\s*5/, "Server must process orders with bounded concurrency");
});
