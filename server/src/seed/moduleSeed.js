const Module = require('../modules/module/module.model');
const TenantModule = require('../modules/tenant-module/tenantModule.model');
const Tenant = require('../modules/tenant/tenant.model');

const CATALOG = [
  { name: 'Students', key: 'students', group: 'academic' },
  { name: 'Teachers', key: 'teachers', group: 'academic' },
  { name: 'Classes', key: 'classes', group: 'academic' },
  { name: 'Attendance', key: 'attendance', group: 'academic' },
  { name: 'Fees', key: 'fees', group: 'finance' },
  { name: 'Expenses', key: 'expenses', group: 'finance' },
  { name: 'Exams', key: 'exams', group: 'management' },
  { name: 'Results', key: 'results', group: 'management' },
  { name: 'Library', key: 'library', group: 'academic' },
  { name: 'Transport', key: 'transport', group: 'management' },
  { name: 'Reports', key: 'reports', group: 'management' },
];

async function seedModuleCatalog() {
  for (const row of CATALOG) {
    await Module.findOrCreate({
      where: { key: row.key },
      defaults: { name: row.name, group: row.group },
    });
  }
  console.log('Module catalog seeded');
}

/**
 * Ensures every catalog module has a tenant_modules row for the given tenant.
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function seedTenantModulesForTenant(tenantId, defaultEnabled = true, options = {}) {
  const { transaction } = options;
  const keys = CATALOG.map((m) => m.key);
  for (const moduleKey of keys) {
    await TenantModule.findOrCreate({
      where: { tenant_id: tenantId, module_key: moduleKey },
      defaults: { is_enabled: defaultEnabled },
      transaction,
    });
  }
}

async function backfillAllTenantModules() {
  const tenants = await Tenant.findAll();
  for (const t of tenants) {
    await seedTenantModulesForTenant(t.id, true);
  }
  console.log('Tenant modules backfilled');
}

module.exports = {
  CATALOG,
  seedModuleCatalog,
  seedTenantModulesForTenant,
  backfillAllTenantModules,
};
