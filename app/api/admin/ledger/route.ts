import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth, fetchRealAdminUsers } from "@/lib/auth/admin-server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import type { LedgerReconciliationRow, WalletLedgerEntry } from "@/lib/referral/types";

export const dynamic = "force-dynamic";

const GROUP_ENTRY_TYPES: Record<string, string[]> = {
  cashback: [
    "cashback_pending",
    "cashback_settled",
    "cashback_reverted",
    "cashback_rejected",
    "cashback_adjusted",
  ],
  referral: ["referral_locked", "referral_unlocked", "referral_expired", "referral_revoked"],
  withdrawal: ["withdrawal_requested", "withdrawal_completed", "withdrawal_rejected"],
  admin: ["admin_adjustment", "reconciliation_sync"],
};

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền truy cập Sổ cái tài chính." }, { status: 403 });
    }

    const db = getSupabaseAdminClient();
    if (!db) {
      return NextResponse.json({
        success: true,
        entries: [],
        reconciliation: [],
        summary: {
          totalEntries: 0,
          totalCashbackSettled: 0,
          totalReferralUnlocked: 0,
          totalReferralLockedNet: 0,
          totalWithdrawnNet: 0,
          mismatchedWallets: 0,
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get("userId") || "").trim();
    const entryType = (searchParams.get("entryType") || "all").trim();
    const group = (searchParams.get("group") || "all").trim();
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const from = (searchParams.get("from") || "").trim();
    const to = (searchParams.get("to") || "").trim();
    const limit = Math.min(500, Math.max(20, Number(searchParams.get("limit") || 200) || 200));

    let query = db
      .from("wallet_ledger")
      .select("*", { count: "exact" })
      .order("seq", { ascending: false })
      .limit(limit);

    if (userId) query = query.eq("user_id", userId);
    if (entryType && entryType !== "all") {
      query = query.eq("entry_type", entryType);
    } else if (group && group !== "all" && GROUP_ENTRY_TYPES[group]) {
      query = query.in("entry_type", GROUP_ENTRY_TYPES[group]);
    }
    if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
    if (to) query = query.lte("created_at", `${to}T23:59:59+07:00`);

    const [ledgerRes, reconRes, usersResult] = await Promise.all([
      query,
      db.from("wallet_ledger_reconciliation").select("*").limit(500),
      fetchRealAdminUsers(),
    ]);

    if (ledgerRes.error) {
      return NextResponse.json({
        success: true,
        entries: [],
        reconciliation: [],
        migrationNeeded: true,
        warning: `Bảng wallet_ledger chưa được khởi tạo (${ledgerRes.error.message}). Hãy chạy supabase/schema-referral-ledger.sql trong Supabase SQL Editor.`,
        summary: {
          totalEntries: 0,
          totalCashbackSettled: 0,
          totalReferralUnlocked: 0,
          totalReferralLockedNet: 0,
          totalWithdrawnNet: 0,
          mismatchedWallets: 0,
        },
      });
    }

    const userMap = new Map(usersResult.users.map((u) => [u.id, u]));
    const rawEntries = (Array.isArray(ledgerRes.data) ? ledgerRes.data : []) as WalletLedgerEntry[];

    let entries: WalletLedgerEntry[] = rawEntries.map((row) => {
      const u = userMap.get(row.user_id);
      return {
        ...row,
        seq: Number(row.seq || 0),
        delta_balance: Number(row.delta_balance || 0),
        delta_pending: Number(row.delta_pending || 0),
        delta_locked: Number(row.delta_locked || 0),
        delta_withdrawn: Number(row.delta_withdrawn || 0),
        balance_after: Number(row.balance_after || 0),
        pending_after: Number(row.pending_after || 0),
        locked_after: Number(row.locked_after || 0),
        withdrawn_after: Number(row.withdrawn_after || 0),
        user_email: u?.email || "",
        user_name: u?.fullName || u?.email?.split("@")[0] || row.user_id.slice(0, 8),
        user_ref_code: u?.refCode || `u_${row.user_id.slice(0, 8)}`,
      };
    });

    if (q) {
      entries = entries.filter((e) => {
        const hay = [
          e.user_email,
          e.user_name,
          e.user_ref_code,
          e.user_id,
          e.reference_id,
          e.note,
          e.actor_id,
          String(e.seq),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const rawRecon = (Array.isArray(reconRes.data) ? reconRes.data : []) as LedgerReconciliationRow[];
    const reconciliation: LedgerReconciliationRow[] = rawRecon.map((r) => {
      const u = userMap.get(r.user_id);
      return {
        ...r,
        user_email: u?.email || "",
        user_name: u?.fullName || u?.email?.split("@")[0] || r.user_id.slice(0, 8),
        wallet_balance: Number(r.wallet_balance || 0),
        wallet_pending: Number(r.wallet_pending || 0),
        wallet_locked: Number(r.wallet_locked || 0),
        wallet_withdrawn: Number(r.wallet_withdrawn || 0),
        ledger_balance: Number(r.ledger_balance || 0),
        ledger_pending: Number(r.ledger_pending || 0),
        ledger_locked: Number(r.ledger_locked || 0),
        ledger_withdrawn: Number(r.ledger_withdrawn || 0),
        diff_balance: Number(r.diff_balance || 0),
        diff_pending: Number(r.diff_pending || 0),
        diff_locked: Number(r.diff_locked || 0),
        diff_withdrawn: Number(r.diff_withdrawn || 0),
        ledger_entries: Number(r.ledger_entries || 0),
      };
    });

    const totalMatchedCount =
      typeof ledgerRes.count === "number" ? ledgerRes.count : rawEntries.length;
    const isTruncated = totalMatchedCount > rawEntries.length;

    const summary = {
      totalEntries: entries.length,
      totalMatchedCount: q ? entries.length : totalMatchedCount,
      isTruncated,
      totalCashbackSettled: entries
        .filter((e) => e.entry_type === "cashback_settled")
        .reduce((s, e) => s + e.delta_balance, 0),
      totalReferralUnlocked: entries
        .filter((e) => e.entry_type === "referral_unlocked")
        .reduce((s, e) => s + e.delta_balance, 0),
      totalReferralLockedNet: entries
        .filter((e) => e.entry_type.startsWith("referral_"))
        .reduce((s, e) => s + e.delta_locked, 0),
      totalWithdrawnNet: entries
        .filter((e) => e.entry_type === "withdrawal_requested" || e.entry_type === "withdrawal_rejected")
        .reduce((s, e) => s + e.delta_withdrawn, 0),
      mismatchedWallets: reconciliation.filter(
        (r) =>
          r.ledger_entries > 0 &&
          (r.diff_balance !== 0 || r.diff_pending !== 0 || r.diff_locked !== 0 || r.diff_withdrawn !== 0)
      ).length,
      openingBalanceWallets: reconciliation.filter(
        (r) =>
          r.ledger_entries === 0 &&
          (r.diff_balance !== 0 || r.diff_pending !== 0 || r.diff_locked !== 0 || r.diff_withdrawn !== 0)
      ).length,
    };

    return NextResponse.json({
      success: true,
      entries,
      reconciliation,
      summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
