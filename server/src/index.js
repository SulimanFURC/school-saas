require('dotenv').config();
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const sequelize = require('./config/db');
const Tenant = require('./modules/tenant/tenant.model');
const User = require('./modules/users/user.model');
require('./modules/auth/refreshToken.model');
require('./modules/auth/tokenBlocklist.model');
require('./modules/auth/passwordResetToken.model');
require('./modules/module/module.model');
require('./modules/tenant-module/tenantModule.model');
require('./modules/tenant-branding/tenantBranding.model');
require('./modules/subjects/subject.model');
const tenantMiddleware = require('./core/middleware/tenant.middleware');
const requestContextMiddleware = require('./core/middleware/request-context.middleware');
const logger = require('./core/logger/logger');
const { HttpError } = require('./core/http/http-error');
const { sendError, sendInternalError } = require('./core/http/response');
const { registerTenantQueryHooks } = require('./core/sequelize/tenant-query-hooks');
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
require('./modules/audit/auditLog.model');
const GradingScheme = require('./modules/exams/gradingScheme.model');
const GradingBand = require('./modules/exams/gradingBand.model');
const ExamGradingConfig = require('./modules/exams/examGradingConfig.model');
const ExamRecheckRequest = require('./modules/exams/examRecheckRequest.model');
const Notification = require('./modules/notifications/notification.model');
const NotificationRead = require('./modules/notifications/notificationRead.model');
const PlatformSetting = require('./modules/settings/platformSetting.model');
const UserNotificationPreference = require('./modules/settings/userNotificationPreference.model');
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

UserNotificationPreference.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserNotificationPreference.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

const academicRoutes = require('./modules/classes/academic.routes');
const studentApiRoutes = require('./modules/students/student.routes');
const teacherApiRoutes = require('./modules/teachers/teacher.routes');
const subjectRoutes = require('./modules/subjects/subject.routes');
const feeRoutes = require('./modules/fees/fee.routes');
const expenseRoutes = require('./modules/expenses/expense.routes');
const examRoutes = require('./modules/exams/exam.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const reportsRoutes = require('./modules/reports/reports.routes');


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
app.use(requestContextMiddleware);

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SIGNUP_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/auth/signup', signupLimiter, authController.signup);
app.use(tenantMiddleware);

app.use('/dashboard', dashboardRoutes);
app.use('/settings', settingsRoutes);
app.use('/reports', reportsRoutes);

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

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof HttpError) {
    return sendError(res, err.status, err.message, err.details);
  }
  return sendInternalError(res, req.log, 'Unhandled error', err);
});

const PORT = process.env.PORT || 5000;

sequelize
  .authenticate()
  .then(() => logger.info('DB connected'))
  .then(() => logger.info('DB schema migration expected via CLI'))
  .then(() => {
    registerTenantQueryHooks(sequelize);
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server running');
      logger.info('Student photo: JSON field photo_base64 on POST /students/register or PUT /students/:id');
    });
  })
  .catch((err) => {
    logger.error({ err }, 'Startup error');
    process.exit(1);
  });


