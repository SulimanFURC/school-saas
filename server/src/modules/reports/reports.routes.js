const express = require('express');
const authMiddleware = require('../../core/middleware/auth.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const controller = require('./reports.controller');

const router = express.Router();

router.use(authMiddleware);
router.use(checkFeature('reports'));

router.get('/students/enrollment-summary', authorize('admin', 'super_admin'), controller.enrollmentSummary);
router.get('/students/attendance-summary', authorize('admin', 'super_admin'), controller.attendanceStub);
router.get('/students/list', authorize('admin', 'super_admin'), controller.studentListReport);

router.get('/fees/collection-summary', authorize('admin', 'super_admin'), controller.feeCollectionSummary);
router.get('/fees/defaulters', authorize('admin', 'super_admin'), controller.feeDefaulters);
router.get('/fees/daily-collection', authorize('admin', 'super_admin'), controller.dailyFeeCollection);

router.get('/expenses/summary', authorize('admin', 'super_admin'), controller.expenseSummary);

router.get('/exams/result-summary/:examId', authorize('admin', 'super_admin'), controller.examResultSummary);
router.get('/exams/student-result/:studentId', controller.studentResultReport);

router.get('/teachers/assignment-summary', authorize('admin', 'super_admin'), controller.teacherAssignmentSummary);

module.exports = router;
