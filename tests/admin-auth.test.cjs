const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./helpers/load-ts.cjs');

test('isAdminUser identifies trungquan2000bg@gmail.com as admin', () => {
  const load = loadTs({
    '@supabase/supabase-js': {
      createClient: () => ({}),
    },
  });

  const { isAdminUser, getAdminEmails } = load('lib/auth/admin.ts');

  // Verify getAdminEmails contains trungquan2000bg@gmail.com
  const adminEmails = getAdminEmails();
  assert.ok(adminEmails.includes('trungquan2000bg@gmail.com'));

  // Test exact match
  assert.equal(isAdminUser({ email: 'trungquan2000bg@gmail.com' }), true);

  // Test case-insensitivity
  assert.equal(isAdminUser({ email: 'TrungQuan2000bg@GMAIL.COM' }), true);
  assert.equal(isAdminUser({ email: ' TRUNGQUAN2000BG@GMAIL.COM ' }), true);

  // Test other admin emails
  assert.equal(isAdminUser({ email: 'quangvh.technical@gmail.com' }), true);

  // Removed emails should NOT be admin
  assert.equal(isAdminUser({ email: 'admin@dealhoan.vn' }), false);
  assert.equal(isAdminUser({ email: 'contact@dealhoan.vn' }), false);

  // Test non-admin user
  assert.equal(isAdminUser({ email: 'regularuser@example.com' }), false);
  assert.equal(isAdminUser(null), false);
  assert.equal(isAdminUser({}), false);
});

test('isAuthorizedCron accepts Supabase pg_cron token and rejects unauthorized requests', () => {
  const load = loadTs({});
  const { isAuthorizedCron } = load('lib/cron/auth.ts');

  // Supabase pg_cron request
  assert.equal(
    isAuthorizedCron(
      new Request('https://deal-hoan.vercel.app/api/cron/sync-orders', {
        headers: { authorization: 'Bearer dealhoan_cron_secret_auto_sync_32chars_key' },
      })
    ),
    true
  );

  // Unauthorized request
  assert.equal(
    isAuthorizedCron(
      new Request('https://deal-hoan.vercel.app/api/cron/sync-orders', {
        headers: { authorization: 'Bearer wrong_token' },
      })
    ),
    false
  );

  // Missing authorization
  assert.equal(
    isAuthorizedCron(
      new Request('https://deal-hoan.vercel.app/api/cron/sync-orders')
    ),
    false
  );
});
