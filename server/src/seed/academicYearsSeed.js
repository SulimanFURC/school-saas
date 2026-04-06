const AcademicYear = require('../modules/classes/academicYear.model');
const Tenant = require('../modules/tenant/tenant.model');

/** First school year label, e.g. 2001-2002 */
const RANGE_START = 2001;
/** Exclusive end for start year (last created: (RANGE_END-1)-RANGE_END) */
const RANGE_END = 2036;

/**
 * Typical July–June academic session: if month >= July, current year starts the session.
 */
function suggestedActiveYearName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 7) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

/**
 * Creates consecutive academic years "2001-2002", "2002-2003", … for the tenant and sets one active.
 */
async function seedAcademicYearsForTenant(tenantId) {
  for (let start = RANGE_START; start < RANGE_END; start += 1) {
    const name = `${start}-${start + 1}`;
    await AcademicYear.findOrCreate({
      where: { tenant_id: tenantId, name },
      defaults: { is_active: false },
    });
  }

  await AcademicYear.update({ is_active: false }, { where: { tenant_id: tenantId } });

  const targetName = suggestedActiveYearName();
  let row = await AcademicYear.findOne({
    where: { tenant_id: tenantId, name: targetName },
  });
  if (!row) {
    row = await AcademicYear.findOne({
      where: { tenant_id: tenantId, name: '2025-2026' },
    });
  }
  if (!row) {
    row = await AcademicYear.findOne({
      where: { tenant_id: tenantId },
      order: [['id', 'DESC']],
    });
  }
  if (row) {
    await row.update({ is_active: true });
  }
}

async function backfillAcademicYearsAllTenants() {
  const tenants = await Tenant.findAll();
  for (const t of tenants) {
    if (t.subdomain === 'platform') continue;
    await seedAcademicYearsForTenant(t.id);
  }
  console.log('Academic years backfilled for tenants');
}

module.exports = {
  seedAcademicYearsForTenant,
  suggestedActiveYearName,
  backfillAcademicYearsAllTenants,
};
