require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
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
const FeeCollection = require('./modules/fees/feeCollection.model');
const Expense = require('./modules/expenses/expense.model');
const Teacher = require('./modules/teachers/teacher.model');
const TeacherAcademicAssignment = require('./modules/teachers/teacherAcademicAssignment.model');
const Subject = require('./modules/subjects/subject.model');
const Exam = require('./modules/exams/exam.model');
const ExamClass = require('./modules/exams/examClass.model');
const ExamTimetable = require('./modules/exams/examTimetable.model');
const ExamMark = require('./modules/exams/examMark.model');
const ExamMarkAudit = require('./modules/exams/examMarkAudit.model');
const GradingScheme = require('./modules/exams/gradingScheme.model');
const GradingBand = require('./modules/exams/gradingBand.model');
const ExamGradingConfig = require('./modules/exams/examGradingConfig.model');
const ExamRecheckRequest = require('./modules/exams/examRecheckRequest.model');
const Notification = require('./modules/notifications/notification.model');
const NotificationRead = require('./modules/notifications/notificationRead.model');
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

Exam.belongsTo(AcademicYear, { foreignKey: 'academic_year_id', as: 'academicYear' });
Exam.hasMany(ExamClass, { foreignKey: 'exam_id', as: 'classes' });
Exam.hasMany(ExamTimetable, { foreignKey: 'exam_id', as: 'timetables' });
Exam.hasMany(ExamMark, { foreignKey: 'exam_id', as: 'marks' });
Exam.hasOne(ExamGradingConfig, { foreignKey: 'exam_id', as: 'gradingConfig' });
Exam.hasMany(ExamRecheckRequest, { foreignKey: 'exam_id', as: 'recheckRequests' });

ExamClass.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });
ExamClass.belongsTo(SchoolClass, { foreignKey: 'class_id', as: 'schoolClass' });

ExamTimetable.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });
ExamTimetable.belongsTo(SchoolClass, { foreignKey: 'class_id', as: 'schoolClass' });
ExamTimetable.belongsTo(Subject, { foreignKey: 'subject_id', as: 'subject' });
ExamTimetable.hasMany(ExamMark, { foreignKey: 'exam_timetable_id', as: 'marks' });

ExamMark.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });
ExamMark.belongsTo(ExamTimetable, { foreignKey: 'exam_timetable_id', as: 'timetable' });
ExamMark.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

GradingScheme.hasMany(GradingBand, { foreignKey: 'grading_scheme_id', as: 'bands' });
GradingBand.belongsTo(GradingScheme, { foreignKey: 'grading_scheme_id', as: 'scheme' });

ExamGradingConfig.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });
ExamGradingConfig.belongsTo(GradingScheme, { foreignKey: 'grading_scheme_id', as: 'scheme' });

ExamRecheckRequest.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });
ExamRecheckRequest.belongsTo(ExamTimetable, { foreignKey: 'exam_timetable_id', as: 'timetable' });
ExamRecheckRequest.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
ExamRecheckRequest.belongsTo(Teacher, { foreignKey: 'assigned_teacher_id', as: 'assignedTeacher' });

NotificationRead.belongsTo(Notification, { foreignKey: 'notification_id', as: 'notification' });
Notification.hasMany(NotificationRead, { foreignKey: 'notification_id', as: 'reads' });

const academicRoutes = require('./modules/classes/academic.routes');
const studentApiRoutes = require('./modules/students/student.routes');
const teacherApiRoutes = require('./modules/teachers/teacher.routes');
const subjectRoutes = require('./modules/subjects/subject.routes');
const feeRoutes = require('./modules/fees/fee.routes');
const expenseRoutes = require('./modules/expenses/expense.routes');
const examRoutes = require('./modules/exams/exam.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');


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
app.use(examRoutes);
app.use(notificationRoutes);
app.use('/fees', tenantMiddleware, feeRoutes);
app.use('/expenses', tenantMiddleware, expenseRoutes);

const PORT = process.env.PORT || 5000;

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
  .then(() => seedPlatformAndSuperAdmin())
  .then(() => seedModuleCatalog())
  .then(() => backfillAllTenantModules())
  .then(() => backfillAcademicYearsAllTenants())
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


