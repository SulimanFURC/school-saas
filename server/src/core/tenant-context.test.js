const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runWithTenantContext,
  runWithoutTenantScope,
  getTenantIdForQuery,
} = require('./tenant-context');

test('getTenantIdForQuery returns id inside runWithTenantContext', async () => {
  await runWithTenantContext('11111111-1111-1111-1111-111111111111', async () => {
    assert.equal(getTenantIdForQuery(), '11111111-1111-1111-1111-111111111111');
  });
});

test('runWithoutTenantScope clears tenant id for nested work', async () => {
  await runWithTenantContext('22222222-2222-2222-2222-222222222222', async () => {
    assert.equal(getTenantIdForQuery(), '22222222-2222-2222-2222-222222222222');
    await runWithoutTenantScope(async () => {
      assert.equal(getTenantIdForQuery(), null);
    });
    assert.equal(getTenantIdForQuery(), '22222222-2222-2222-2222-222222222222');
  });
});
