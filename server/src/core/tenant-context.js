const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Request-scoped tenant id for Sequelize hooks (defense in depth with controller `where` clauses).
 * Set from {@link tenantMiddleware} via `runWithTenantContext` so async continuations keep the store.
 */
const als = new AsyncLocalStorage();

/**
 * @param {string | null} tenantId UUID of current tenant
 * @param {() => unknown} fn sync callback; may return a Promise — store stays active until it settles
 */
function runWithTenantContext(tenantId, fn) {
  return als.run({ tenantId, skipTenantScope: false }, fn);
}

/**
 * Cross-tenant work (super-admin, seeds). Nested inside school request context, this shadows the outer store.
 * @param {() => unknown} fn
 */
function runWithoutTenantScope(fn) {
  return als.run({ tenantId: null, skipTenantScope: true }, fn);
}

function getTenantIdForQuery() {
  const s = als.getStore();
  if (!s || s.skipTenantScope) return null;
  return s.tenantId ?? null;
}

module.exports = {
  runWithTenantContext,
  runWithoutTenantScope,
  getTenantIdForQuery,
};
