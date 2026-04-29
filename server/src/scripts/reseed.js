/**
 * Three-phase DB reseed: wipe tenant data (keep super_admin + platform), create tmsc + steps-school, seed steps-school demo data.
 * Run: node src/scripts/reseed.js
 */
require('dotenv').config();

const sequelize = require('../config/db');
const Tenant = require('../modules/tenant/tenant.model');
const User = require('../modules/users/user.model');
const TenantBranding = require('../modules/tenant-branding/tenantBranding.model');
const SchoolClass = require('../modules/classes/class.model');
require('../modules/students/studentEnrollment.model'); // associations for include
const Student = require('../modules/students/student.model');
const StudentEnrollment = require('../modules/students/studentEnrollment.model');
const FeeCollection = require('../modules/fees/feeCollection.model');

const {
  seedModuleCatalog,
  seedTenantModulesForTenant,
} = require('../seed/moduleSeed');
const { seedAcademicYearsForTenant } = require('../seed/academicYearsSeed');
const { seedStepsSchoolSampleData } = require('../seed/stepsSchoolSampleData');

const RESEED_PWD =
  process.env.RESEED_PASSWORD || process.env.DUMMY_ADMIN_PASSWORD || 'Test@1234';

/**
 * Drops other client connections to this database so DELETEs are not blocked indefinitely
 * (common when the API dev server is running). Safe for local dev-only reseeds.
 */
async function terminateOtherDbSessions() {
  if (process.env.RESEED_SKIP_TERMINATE_OTHERS === '1') return;
  try {
    const [rows] = await sequelize.query(`
      SELECT pg_terminate_backend(pid) AS terminated
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
    `);
    const n = rows ? rows.filter((r) => r.terminated === true || r.terminated === 't').length : 0;
    if (n > 0) {
      console.log(`[reseed] Terminated ${n} other session(s) on ${process.env.DB_NAME || 'DB'}. Set RESEED_SKIP_TERMINATE_OTHERS=1 to skip.`);
    }
  } catch (err) {
    console.warn('[reseed] Could not terminate other sessions (non-fatal):', err.message);
  }
}

async function phase1Cleanup() {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`SET LOCAL lock_timeout = '60s'`, { transaction });

    /** Child-first delete order — keep platform tenant, super_admin user, modules catalog. */

    await sequelize.query(`DELETE FROM notification_reads`, { transaction });
    await sequelize.query(`DELETE FROM exam_mark_audits`, { transaction });
    await sequelize.query(`DELETE FROM exam_marks`, { transaction });
    await sequelize.query(`DELETE FROM exam_recheck_requests`, { transaction });
    await sequelize.query(`DELETE FROM exam_grading_configs`, { transaction });
    await sequelize.query(`DELETE FROM exam_timetables`, { transaction });
    await sequelize.query(`DELETE FROM exam_classes`, { transaction });
    await sequelize.query(`DELETE FROM exams`, { transaction });
    await sequelize.query(`DELETE FROM grading_bands`, { transaction });
    await sequelize.query(`DELETE FROM grading_schemes`, { transaction });
    await sequelize.query(`DELETE FROM fee_collections`, { transaction });
    await sequelize.query(`DELETE FROM expenses`, { transaction });
    await sequelize.query(`DELETE FROM student_promotions`, { transaction });
    await sequelize.query(`DELETE FROM student_enrollments`, { transaction });
    await sequelize.query(`DELETE FROM student_guardians`, { transaction });
    await sequelize.query(`DELETE FROM student_documents`, { transaction });
    await sequelize.query(`DELETE FROM student_previous_schools`, { transaction });
    await sequelize.query(`DELETE FROM teacher_academic_assignments`, { transaction });
    await sequelize.query(`DELETE FROM notifications`, { transaction });
    await sequelize.query(`DELETE FROM tenant_branding`, { transaction });
    await sequelize.query(`DELETE FROM tenant_modules`, { transaction });
    await sequelize.query(`DELETE FROM users WHERE role <> 'super_admin'`, { transaction });
    await sequelize.query(`DELETE FROM students`, { transaction });
    await sequelize.query(`DELETE FROM sections`, { transaction });
    await sequelize.query(`DELETE FROM classes`, { transaction });
    await sequelize.query(`DELETE FROM teachers`, { transaction });
    await sequelize.query(`DELETE FROM subjects`, { transaction });
    await sequelize.query(`DELETE FROM academic_years`, { transaction });
    await sequelize.query(`DELETE FROM tenants WHERE subdomain <> 'platform'`, { transaction });

    const [userCountRows] = await sequelize.query(
      `SELECT COUNT(*)::int AS cnt_users FROM users`,
      { transaction }
    );
    const [tenantCountRows] = await sequelize.query(
      `SELECT COUNT(*)::int AS cnt_tenants FROM tenants`,
      { transaction }
    );
    const cnt_users = Number(userCountRows[0].cnt_users);
    const cnt_tenants = Number(tenantCountRows[0].cnt_tenants);
    console.log('[Phase 1] OK — users=', cnt_users, 'tenants=', cnt_tenants, '(expect 1, 1)');
    if (cnt_users !== 1 || cnt_tenants !== 1) {
      throw new Error('Phase 1 verification failed');
    }
  });
}

async function phase2Tenants() {
  let tmscId;
  let stepsId;

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`SET LOCAL lock_timeout = '60s'`, { transaction });

    const tmsc = await Tenant.create(
      {
        name: 'TMSC',
        subdomain: 'tmsc',
        status: 'active',
      },
      { transaction }
    );
    tmscId = tmsc.id;

    const stepsSchool = await Tenant.create(
      {
        name: 'Steps School',
        subdomain: 'steps-school',
        status: 'active',
      },
      { transaction }
    );
    stepsId = stepsSchool.id;

    for (const t of [tmsc, stepsSchool]) {
      await seedTenantModulesForTenant(t.id, true, { transaction });
      await seedAcademicYearsForTenant(t.id, { transaction });
      await TenantBranding.findOrCreate({
        where: { tenant_id: t.id },
        defaults: {
          tenant_id: t.id,
          primary_color: '#1976d2',
          secondary_color: '#424242',
          logo_url: null,
        },
        transaction,
      });
    }

    const [rows] = await sequelize.query(
      `SELECT id, name, subdomain, status FROM tenants ORDER BY subdomain`,
      { transaction }
    );
    console.log('[Phase 2] tenants:', rows);
  });

  return { tmscId, stepsId };
}

async function phase3StepsSeed(stepsTenantId) {
  process.env.DUMMY_ADMIN_PASSWORD = RESEED_PWD;
  process.env.DUMMY_TEACHER_PASSWORD = RESEED_PWD;
  process.env.STUDENT_DEFAULT_PASSWORD = RESEED_PWD;

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`SET LOCAL lock_timeout = '60s'`, { transaction });

    await seedStepsSchoolSampleData({ transaction });

    const stepsTenant = await Tenant.findByPk(stepsTenantId, {
      transaction,
    });
    if (!stepsTenant || stepsTenant.subdomain !== 'steps-school') {
      throw new Error('steps-school tenant not found');
    }

    const adminUser = await User.findOne({
      where: {
        tenant_id: stepsTenant.id,
        email: 'admin@steps-school.com',
      },
      transaction,
    });
    if (!adminUser) {
      throw new Error('steps-school admin user missing');
    }

    const students = await Student.findAll({
      where: { tenant_id: stepsTenant.id },
      transaction,
    });

    const today = new Date().toISOString().slice(0, 10);

    for (const student of students) {
      const invoiceNumber = `INV-${student.admission_no}`;
      const existing = await FeeCollection.findOne({
        where: { tenant_id: stepsTenant.id, invoice_number: invoiceNumber },
        transaction,
      });
      if (existing) continue;

      const enrollment = await StudentEnrollment.findOne({
        where: { tenant_id: stepsTenant.id, student_id: student.id },
        include: [{ model: SchoolClass, as: 'schoolClass' }],
        transaction,
      });

      await FeeCollection.create(
        {
          tenant_id: stepsTenant.id,
          student_id: student.id,
          invoice_number: invoiceNumber,
          registration_no: student.admission_no,
          student_name: student.full_name || student.admission_no,
          class_name: enrollment && enrollment.schoolClass ? enrollment.schoolClass.name : null,
          roll_number: enrollment ? enrollment.roll_number : null,
          fee_type: 'Tuition',
          amount: 5000.0,
          collection_date: today,
          payment_method: 'Cash',
          status: 'Paid',
          collected_by_user_id: adminUser.id,
        },
        { transaction }
      );
    }

    const [feeRows] = await sequelize.query(
      `SELECT COUNT(*)::int AS fee_cnt FROM fee_collections WHERE tenant_id = :tid`,
      { replacements: { tid: stepsTenant.id }, transaction }
    );
    const fee_cnt = Number(feeRows[0].fee_cnt);
    console.log('[Phase 3] fee_collections for steps-school:', fee_cnt);
  });
}

async function main() {
  await sequelize.authenticate();
  console.log('DB connected');

  await terminateOtherDbSessions();

  await seedModuleCatalog();

  await phase1Cleanup();
  const { stepsId } = await phase2Tenants();
  await phase3StepsSeed(stepsId);

  console.log('Reseed finished successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Reseed failed:', err);
  process.exit(1);
});
