const express = require('express');
const multer = require('multer');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');

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
router.get('/exams/grading-schemes/:id', adminExams, gradingSchemeController.getById);
router.patch('/exams/grading-schemes/:id', adminExams, gradingSchemeController.update);
router.post('/exams/grading-schemes/:id/archive', adminExams, gradingSchemeController.archive);

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
  teacherController.getMyExamPapers
);
router.get(
  '/exams/teachers/me/exams/:id/summary',
  checkFeature('exams'),
  authorize('teacher'),
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
  studentController.getMyTimetable
);
router.get(
  '/exams/students/me/:id/result',
  checkFeature('exams'),
  authorize('student'),
  studentController.getMyResult
);
router.post(
  '/exams/students/me/:id/recheck',
  checkFeature('exams'),
  authorize('student'),
  studentController.createRecheck
);
router.get(
  '/exams/students/me/:id/admit-card.pdf',
  checkFeature('exams'),
  authorize('student'),
  pdfController.studentAdmitCard
);
router.get(
  '/exams/students/me/:id/result-card.pdf',
  checkFeature('exams'),
  authorize('student'),
  pdfController.studentResultCard
);

router.get('/exams/:id', adminExams, examController.getById);
router.patch('/exams/:id', adminExams, examController.update);
router.post('/exams/:id/clone', adminExams, examController.clone);
router.post('/exams/:id/archive', adminExams, examController.archive);
router.post('/exams/:id/transition', adminExams, examController.transition);
router.post('/exams/:id/classes', adminExams, examController.setClasses);

router.get('/exams/:id/timetable', examViewers, timetableController.list);
router.post('/exams/:id/timetable', adminExams, timetableController.create);
router.patch('/exams/:id/timetable/:entryId', adminExams, timetableController.update);
router.delete('/exams/:id/timetable/:entryId', adminExams, timetableController.remove);
router.post('/exams/:id/timetable/finalize', adminExams, timetableController.finalize);
router.post('/exams/:id/timetable/:entryId/lock', adminExams, timetableController.lock);

router.get('/exams/:id/marks-sheet', examViewers, marksController.getMarksSheet);
router.put('/exams/:id/marks', examViewers, marksController.upsertMarks);
router.get('/exams/:id/progress', adminExams, marksController.adminProgress);
router.get('/exams/:id/audits', adminExams, marksController.listAudits);

router.get('/exams/:id/grading', adminExams, examGradingController.getConfig);
router.post('/exams/:id/grading', adminExams, examGradingController.setConfig);
router.get('/exams/:id/grade-distribution', adminExams, examGradingController.distribution);
router.post('/exams/:id/publish', adminExams, examGradingController.publish);

router.get('/exams/:id/marks-template.csv', examViewers, importController.template);
router.post(
  '/exams/:id/marks-import/preview',
  examViewers,
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
  pdfController.adminAdmitCard
);
router.get(
  '/exams/:id/students/:studentId/result-card.pdf',
  adminExams,
  pdfController.adminResultCard
);
router.get(
  '/exams/:id/classes/:classId/admit-cards.zip',
  adminExams,
  pdfController.bulkAdmitCards
);
router.get(
  '/exams/:id/classes/:classId/result-cards.zip',
  adminExams,
  pdfController.bulkResultCards
);
router.get(
  '/exams/:id/classes/:classId/results',
  adminExams,
  pdfController.classResults
);

router.get('/exams/:id/recheck-requests', adminExams, recheckController.list);
router.post(
  '/exams/recheck-requests/:requestId/assign',
  adminExams,
  recheckController.assign
);
router.post(
  '/exams/recheck-requests/:requestId/resolve',
  adminExams,
  recheckController.resolve
);

module.exports = router;
