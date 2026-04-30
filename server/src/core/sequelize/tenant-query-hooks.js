const { Op } = require('sequelize');
const { getTenantIdForQuery } = require('../tenant-context');

/**
 * Defense-in-depth: merge `tenant_id` from {@link getTenantIdForQuery} into ORM queries.
 * Super-admin and seeds use {@link runWithoutTenantScope} so hooks do not constrain cross-tenant work.
 * @param {import('sequelize').Model} model
 */
function attachTenantQueryHooks(model) {
  if (!model.rawAttributes?.tenant_id) return;

  const mergeWhere = (options) => {
    const tid = getTenantIdForQuery();
    if (!tid) return;
    const w = options.where;
    if (!w) {
      options.where = { tenant_id: tid };
      return;
    }
    options.where = { [Op.and]: [w, { tenant_id: tid }] };
  };

  model.addHook('beforeFind', (options) => mergeWhere(options));
  model.addHook('beforeCount', (options) => mergeWhere(options));
  model.addHook('beforeBulkUpdate', (options) => mergeWhere(options));
  model.addHook('beforeBulkDestroy', (options) => mergeWhere(options));
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 */
function registerTenantQueryHooks(sequelize) {
  for (const model of Object.values(sequelize.models)) {
    attachTenantQueryHooks(model);
  }
}

module.exports = { registerTenantQueryHooks, attachTenantQueryHooks };
