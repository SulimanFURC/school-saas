require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const sequelize = require('./config/db');
const Tenant = require('./modules/tenant/tenant.model');
const User = require('./modules/users/user.model');
require('./modules/module/module.model');
require('./modules/tenant-module/tenantModule.model');
require('./modules/tenant-branding/tenantBranding.model');
require('./modules/subjects/subject.model');
const {
  seedModuleCatalog,
  backfillAllTenantModules,
} = require('./seed/moduleSeed');
const { backfillAcademicYearsAllTenants } = require('./seed/academicYearsSeed');
const tenantMiddleware = require('./core/middleware/tenant.middleware');
const authRoutes = require('./modules/auth/auth.routes');
const authController = require('./modules/auth/auth.controller');
const authMiddleware = require('./core/middleware/auth.middleware');
const authorize = require('./core/middleware/authorize.middleware');
const modulesRoutes = require('./modules/modules/modules.routes');
const superAdminRoutes = require('./modules/super-admin/super-admin.routes');
const checkFeature = require('./core/middleware/feature.middleware');
const tenantBrandingController = require('./modules/tenant-branding/tenantBranding.controller');
require('./modules/classes/class.model');
require('./modules/classes/section.model');
require('./modules/classes/academicYear.model');
require('./modules/students/student.model');
require('./modules/students/studentEnrollment.model');
require('./modules/students/studentGuardian.model');
require('./modules/students/studentPreviousSchool.model');
require('./modules/students/studentDocument.model');
require('./modules/students/studentPromotion.model');
const SchoolClass = require('./modules/classes/class.model');
const Section = require('./modules/classes/section.model');
const AcademicYear = require('./modules/classes/academicYear.model');
const Student = require('./modules/students/student.model');
const StudentEnrollment = require('./modules/students/studentEnrollment.model');
const StudentGuardian = require('./modules/students/studentGuardian.model');
const StudentPreviousSchool = require('./modules/students/studentPreviousSchool.model');
const StudentDocument = require('./modules/students/studentDocument.model');
const FeeCollection = require('./modules/fees/feeCollection.model');
const Expense = require('./modules/expenses/expense.model');
const Teacher = require('./modules/teachers/teacher.model');
const TeacherAcademicAssignment = require('./modules/teachers/teacherAcademicAssignment.model');
const Subject = require('./modules/subjects/subject.model');
User.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
User.belongsTo(Teacher, { foreignKey: 'teacher_id', as: 'teacher' });
Teacher.hasOne(User, { foreignKey: 'teacher_id', as: 'login_user' });
SchoolClass.belongsTo(Teacher, { foreignKey: 'class_teacher_id', as: 'classTeacher' });
Teacher.hasOne(SchoolClass, { foreignKey: 'class_teacher_id', as: 'assignedClass' });

TeacherAcademicAssignment.belongsTo(Teacher, { foreignKey: 'teacher_id', as: 'teacher' });
Teacher.hasMany(TeacherAcademicAssignment, { foreignKey: 'teacher_id', as: 'academic_assignments' });
TeacherAcademicAssignment.belongsTo(SchoolClass, { foreignKey: 'class_id', as: 'schoolClass' });
TeacherAcademicAssignment.belongsTo(Section, { foreignKey: 'section_id', as: 'section' });
TeacherAcademicAssignment.belongsTo(AcademicYear, { foreignKey: 'academic_year_id', as: 'academicYear' });
TeacherAcademicAssignment.belongsTo(Subject, { foreignKey: 'subject_id', as: 'subject' });
FeeCollection.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
Student.hasMany(FeeCollection, { foreignKey: 'student_id', as: 'feeCollections' });
FeeCollection.belongsTo(User, { foreignKey: 'collected_by_user_id', as: 'collectedBy' });
Expense.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdBy' });
const academicRoutes = require('./modules/classes/academic.routes');
const studentApiRoutes = require('./modules/students/student.routes');
const teacherApiRoutes = require('./modules/teachers/teacher.routes');
const subjectRoutes = require('./modules/subjects/subject.routes');
const feeRoutes = require('./modules/fees/fee.routes');
const expenseRoutes = require('./modules/expenses/expense.routes');


const app = express();

app.use(
  cors({
    origin: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  })
);
/** Base64 expands ~33%; allow large phone photos. Override with JSON_BODY_LIMIT in .env */
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '50mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.post('/auth/signup', authController.signup);
app.use(tenantMiddleware);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
  res.json({
    message: 'API running',
    tenant: req.tenant.name,
  });
});

app.use('/auth', authRoutes);
app.get('/tenant-branding', authMiddleware, tenantBrandingController.getForCurrentTenant);
app.use('/modules', modulesRoutes);
app.use('/super-admin', authMiddleware, superAdminRoutes);

app.get('/secure', authMiddleware, (req, res) => {
  res.json({ message: 'Secure route', user: req.user });
});

app.get('/admin/ping', authMiddleware, authorize('admin'), (req, res) => {
  res.json({ message: 'Admin only', user: req.user });
});

app.get(
  '/students/ping',
  authMiddleware,
  checkFeature('students'),
  (req, res) => {
    res.json({ message: 'Students module enabled for this tenant' });
  }
);

app.use(academicRoutes);
app.use(subjectRoutes);
app.use(studentApiRoutes);
app.use(teacherApiRoutes);
app.use('/fees', tenantMiddleware, feeRoutes);
app.use('/expenses', tenantMiddleware, expenseRoutes);

const PORT = process.env.PORT || 5000;

async function seedTenants() {
  await Tenant.findOrCreate({
    where: { subdomain: 'abc' },
    defaults: { name: 'ABC School', status: 'active' },
  });
  await Tenant.findOrCreate({
    where: { subdomain: 'xyz' },
    defaults: { name: 'XYZ College', status: 'active' },
  });
  console.log('Tenants seeded');
}

async function seedUsers() {
  const tenant = await Tenant.findOne({ where: { subdomain: 'abc' } });
  if (!tenant) {
    console.log('Skip user seed: tenant abc not found');
    return;
  }
  const hash = await bcrypt.hash('123456', 10);
  await User.findOrCreate({
    where: { email: 'admin@abc.com', tenant_id: tenant.id },
    defaults: {
      name: 'Admin User',
      password: hash,
      role: 'admin',
      status: 'active',
    },
  });
  console.log('Users seeded');
}



async function seedAbcSampleData() {
  const tenant = await Tenant.findOne({ where: { subdomain: 'abc' } });
  if (!tenant) {
    console.log('Skip ABC sample data: tenant not found');
    return;
  }

  const [year] = await AcademicYear.findOrCreate({
    where: { tenant_id: tenant.id, name: '2025-2026' },
    defaults: { is_active: true },
  });
  await AcademicYear.update(
    { is_active: false },
    { where: { tenant_id: tenant.id, id: { [Op.ne]: year.id } } }
  );
  await year.update({ is_active: true });

  // Sample class is now admin-created (requires a class teacher); skip enrollment seed if missing.
  const cls = await SchoolClass.findOne({
    where: { tenant_id: tenant.id, name: 'Class 10th' },
  });
  if (!cls) {
    console.log('Skip ABC enrollment: sample class not found (admin must create classes)');
    return;
  }

  const [section] = await Section.findOrCreate({
    where: { tenant_id: tenant.id, class_id: cls.id, name: 'A' },
    defaults: { tenant_id: tenant.id, class_id: cls.id, name: 'A' },
  });

  const [student] = await Student.findOrCreate({
    where: { tenant_id: tenant.id, admission_no: 'DEMO-001' },
    defaults: {
      full_name: 'Seth Hallam',
      first_name: 'Seth',
      last_name: 'Hallam',
      gender: 'male',
      dob: '2010-05-12',
      phone: '555-0100',
      email: 'seth.hallam@example.com',
      blood_group: 'O+',
      status: 'active',
      current_address: '123 Main Street',
      permanent_address: '123 Main Street',
      extra_details: 'Sample student seeded for development.',
      room_type: 'Double',
    },
  });

  await StudentEnrollment.findOrCreate({
    where: {
      tenant_id: tenant.id,
      student_id: student.id,
      academic_year_id: year.id,
    },
    defaults: {
      class_id: cls.id,
      section_id: section.id,
      roll_number: 10,
      category: 'Science',
      promotion_type: 'initial',
      status: 'active',
    },
  });

  await StudentGuardian.findOrCreate({
    where: { tenant_id: tenant.id, student_id: student.id },
    defaults: {
      guardian_type: 'father',
      father_name: 'John Hallam',
      father_phone: '555-1111',
      father_occupation: 'Engineer',
      mother_name: 'Jane Hallam',
      mother_occupation: 'Teacher',
      guardian_name: '',
      guardian_phone: '',
      guardian_occupation: '',
      guardian_relation: '',
      guardian_address: '',
    },
  });

  await StudentPreviousSchool.findOrCreate({
    where: { tenant_id: tenant.id, student_id: student.id },
    defaults: {
      school_name: 'Previous Primary School',
      school_address: 'Old Town',
    },
  });

  await StudentDocument.findOrCreate({
    where: {
      tenant_id: tenant.id,
      student_id: student.id,
      file_name: 'BirthCertificate.pdf',
    },
    defaults: {
      file_url: 'https://example.com/demo/BirthCertificate.pdf',
    },
  });

  const demoUsername = (tenant.subdomain + '-' + String(student.admission_no).trim()).toLowerCase();
  const demoPass = await bcrypt.hash(process.env.STUDENT_DEFAULT_PASSWORD || '123456', 10);
  await User.findOrCreate({
    where: { tenant_id: tenant.id, username: demoUsername },
    defaults: {
      name: [student.first_name, student.last_name].filter(Boolean).join(' ').trim() || 'Demo Student',
      email: null,
      username: demoUsername,
      password: demoPass,
      role: 'student',
      status: 'inactive',
      student_id: student.id,
    },
  });

  console.log('ABC sample academic + student data seeded');
}

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
  console.log('Platform tenant and super admin seeded');
}

sequelize
  .authenticate()
  .then(() => console.log('DB connected'))
  .then(() => sequelize.sync({ alter: true }))
  .then(() => console.log('DB synced'))
  .then(() => seedTenants())
  .then(() => seedPlatformAndSuperAdmin())
  .then(() => seedUsers())
  .then(() => seedModuleCatalog())
  .then(() => backfillAllTenantModules())
  .then(() => backfillAcademicYearsAllTenants())
  .then(() => seedAbcSampleData())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Student photo: JSON field photo_base64 on POST /students/register or PUT /students/:id');
    });
  })
  .catch((err) => {
    console.error('Startup error:', err);
    process.exit(1);
  });


