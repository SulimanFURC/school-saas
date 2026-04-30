require('dotenv').config();

const bcrypt = require('bcrypt');
const sequelize = require('../config/db');
const Tenant = require('../modules/tenant/tenant.model');
const User = require('../modules/users/user.model');
require('../modules/module/module.model');
require('../modules/tenant-module/tenantModule.model');

const {
  seedModuleCatalog,
  backfillAllTenantModules,
} = require('../seed/moduleSeed');
const { backfillAcademicYearsAllTenants } = require('../seed/academicYearsSeed');

async function seedPlatformAndSuperAdmin() {
  const [platform] = await Tenant.findOrCreate({
    where: { subdomain: 'platform' },
    defaults: { name: 'Platform', status: 'active' },
  });

  const superPass = process.env.SUPER_ADMIN_PASSWORD || '123456';
  const hash = await bcrypt.hash(superPass, 10);

  await User.findOrCreate({
    where: { email: 'superadmin@platform.com', tenant_id: platform.id },
    defaults: {
      name: 'Super Admin',
      password: hash,
      role: 'super_admin',
      status: 'active',
    },
  });
}

async function main() {
  await sequelize.authenticate();
  console.log('[seed:bootstrap] DB connected');

  await seedPlatformAndSuperAdmin();
  console.log('[seed:bootstrap] Platform tenant and super admin ensured');

  await seedModuleCatalog();
  await backfillAllTenantModules();
  await backfillAcademicYearsAllTenants();
  console.log('[seed:bootstrap] Module and academic-year backfills completed');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed:bootstrap] failed:', err);
    process.exit(1);
  });
