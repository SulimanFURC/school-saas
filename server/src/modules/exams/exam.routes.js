const express = require('express');
const multer = require('multer');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const validate = require('../../core/middleware/validate.middleware');
const {
  examIdParam,
  examEntryParam,
  examStudentParam,
  examClassParam,
  recheckParam,
  gradesIdParam,
} = require('./exam.schemas');

const examController = require('./exam.controller');
const timetableController = require('./examTimetable.controller');
const marksController = require('./examMarks.controller');
const gradingSchemeController = require('./gradingScheme.controller');
const examGradingController = require('./examGrading.controller');
const studentController = require('./examStudent.controller');
const teacherController = require('./examTeacher.controller');
const recheckController = require('./examRecheck.controller');
const pdfController = require('./examPdf.controller');
const importController = require('./examMarksImport.controller');

const router = express.Router();

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain']);
    if (
      !allowed.has(file.mimetype) &&
      !(file.originalname || '').toLowerCase().endsWith('.csv')
    ) {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  },
});

router.use(authMiddleware);

const adminExams = [checkFeature('exams'), authorize('admin', 'super_admin')];
const examViewers = [
  checkFeature('exams'),
  authorize('admin', 'super_admin', 'teacher'),
];

router.get('/exams', adminExams, examController.list);
router.post('/exams', adminExams, examController.create);
router.get('/exams/grading-schemes', adminExams, gradingSchemeController.list);
router.post('/exams/grading-schemes', adminExams, gradingSchemeController.create);
router.get('/exams/grading-schemes/:id', adminExams, validate({ params: gradesIdParam }), gradingSchemeController.getById);
router.patch('/exams/grading-schemes/:id', adminExams, validate({ params: gradesIdParam }), gradingSchemeController.update);
router.post('/exams/grading-schemes/:id/archive', adminExams, validate({ params: gradesIdParam }), gradingSchemeController.archive);

router.get('/exams/recheck-requests', adminExams, recheckController.list);

router.get(
  '/exams/teachers/me/exams',
  checkFeature('exams'),
  authorize('teacher'),
  teacherController.listMyExams
);
router.get(
  '/exams/teachers/me/exams/:id/papers',
  checkFeature('exams'),
  authorize('teacher'),
  validate({ params: examIdParam }),
  teacherController.getMyExamPapers
);
router.get(
  '/exams/teachers/me/exams/:id/summary',
  checkFeature('exams'),
  authorize('teacher'),
  validate({ params: examIdParam }),
  teacherController.getMyExamSummary
);

router.get(
  '/exams/students/me',
  checkFeature('exams'),
  authorize('student'),
  studentController.listMyExams
);
router.get(
  '/exams/students/me/rechecks',
  checkFeature('exams'),
  authorize('student'),
  studentController.listMyRechecks
);
router.get(
  '/exams/students/me/:id/timetable',
  checkFeature('exams'),
  authorize('student'),
  validate({ params: examIdParam }),
  studentController.getMyTimetable
);
router.get(
  '/exams/students/me/:id/result',
  checkFeature('exams'),
  authorize('student'),
  validate({ params: examIdParam }),
  studentController.getMyResult
);
router.post(
  '/exams/students/me/:id/recheck',
  checkFeature('exams'),
  authorize('student'),
  validate({ params: examIdParam }),
  studentController.createRecheck
);
router.get(
  '/exams/students/me/:id/admit-card.pdf',
  checkFeature('exams'),
  authorize('student'),
  validate({ params: examIdParam }),
  pdfController.studentAdmitCard
);
router.get(
  '/exams/students/me/:id/result-card.pdf',
  checkFeature('exams'),
  authorize('student'),
  validate({ params: examIdParam }),
  pdfController.studentResultCard
);

router.get('/exams/:id', adminExams, validate({ params: examIdParam }), examController.getById);
router.patch('/exams/:id', adminExams, validate({ params: examIdParam }), examController.update);
router.post('/exams/:id/clone', adminExams, validate({ params: examIdParam }), examController.clone);
router.post('/exams/:id/archive', adminExams, validate({ params: examIdParam }), examController.archive);
router.post('/exams/:id/transition', adminExams, validate({ params: examIdParam }), examController.transition);
router.post('/exams/:id/classes', adminExams, validate({ params: examIdParam }), examController.setClasses);

router.get('/exams/:id/timetable', examViewers, validate({ params: examIdParam }), timetableController.list);
router.post('/exams/:id/timetable', adminExams, validate({ params: examIdParam }), timetableController.create);
router.patch('/exams/:id/timetable/:entryId', adminExams, validate({ params: examEntryParam }), timetableController.update);
router.delete('/exams/:id/timetable/:entryId', adminExams, validate({ params: examEntryParam }), timetableController.remove);
router.post('/exams/:id/timetable/finalize', adminExams, validate({ params: examIdParam }), timetableController.finalize);
router.post('/exams/:id/timetable/:entryId/lock', adminExams, validate({ params: examEntryParam }), timetableController.lock);

router.get('/exams/:id/marks-sheet', examViewers, validate({ params: examIdParam }), marksController.getMarksSheet);
router.put('/exams/:id/marks', examViewers, validate({ params: examIdParam }), marksController.upsertMarks);
router.get('/exams/:id/progress', adminExams, validate({ params: examIdParam }), marksController.adminProgress);
router.get('/exams/:id/audits', adminExams, validate({ params: examIdParam }), marksController.listAudits);

router.get('/exams/:id/grading', adminExams, validate({ params: examIdParam }), examGradingController.getConfig);
router.post('/exams/:id/grading', adminExams, validate({ params: examIdParam }), examGradingController.setConfig);
router.get('/exams/:id/grade-distribution', adminExams, validate({ params: examIdParam }), examGradingController.distribution);
router.post('/exams/:id/publish', adminExams, validate({ params: examIdParam }), examGradingController.publish);

router.get('/exams/:id/marks-template.csv', examViewers, validate({ params: examIdParam }), importController.template);
router.post(
  '/exams/:id/marks-import/preview',
  examViewers,
  validate({ params: examIdParam }),
  (req, res, next) => {
    csvUpload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
      next();
    });
  },
  importController.preview
);
router.post(
  '/exams/:id/marks-import/commit',
  examViewers,
  validate({ params: examIdParam }),
  (req, res, next) => {
    csvUpload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
      next();
    });
  },
  importController.commit
);

router.get(
  '/exams/:id/students/:studentId/admit-card.pdf',
  adminExams,
  validate({ params: examStudentParam }),
  pdfController.adminAdmitCard
);
router.get(
  '/exams/:id/students/:studentId/result-card.pdf',
  adminExams,
  validate({ params: examStudentParam }),
  pdfController.adminResultCard
);
router.get(
  '/exams/:id/classes/:classId/admit-cards.zip',
  adminExams,
  validate({ params: examClassParam }),
  pdfController.bulkAdmitCards
);
router.get(
  '/exams/:id/classes/:classId/result-cards.zip',
  adminExams,
  validate({ params: examClassParam }),
  pdfController.bulkResultCards
);
router.get(
  '/exams/:id/classes/:classId/results',
  adminExams,
  validate({ params: examClassParam }),
  pdfController.classResults
);

router.get('/exams/:id/recheck-requests', adminExams, validate({ params: examIdParam }), recheckController.list);
router.post(
  '/exams/recheck-requests/:requestId/assign',
  adminExams,
  validate({ params: recheckParam }),
  recheckController.assign
);
router.post(
  '/exams/recheck-requests/:requestId/resolve',
  adminExams,
  validate({ params: recheckParam }),
  recheckController.resolve
);

module.exports = router;
