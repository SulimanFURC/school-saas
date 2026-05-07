const express = require('express');
const authMiddleware = require('../../core/middleware/auth.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const { requirePermission } = require('../../core/middleware/permission.middleware');
const controller = require('./reports.controller');

const router = express.Router();

router.use(authMiddleware);
router.use(checkFeature('reports'));

router.get('/students/enrollment-summary', requirePermission('reports.read'), controller.enrollmentSummary);
router.get('/students/attendance-summary', requirePermission('reports.read'), controller.attendanceStub);
router.get('/students/list', requirePermission('reports.read'), controller.studentListReport);

router.get('/fees/collection-summary', requirePermission('reports.read'), controller.feeCollectionSummary);
router.get('/fees/defaulters', requirePermission('reports.read'), controller.feeDefaulters);
router.get('/fees/daily-collection', requirePermission('reports.read'), controller.dailyFeeCollection);

router.get('/expenses/summary', requirePermission('reports.read'), controller.expenseSummary);

router.get('/exams/result-summary/:examId', requirePermission('reports.read'), controller.examResultSummary);
router.get('/exams/student-result/:studentId', controller.studentResultReport);

router.get('/teachers/assignment-summary', requirePermission('reports.read'), controller.teacherAssignmentSummary);

module.exports = router;
