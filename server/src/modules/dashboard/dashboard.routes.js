const express = require('express');
const authMiddleware = require('../../core/middleware/auth.middleware');
const controller = require('./dashboard.controller');

const router = express.Router();

router.use(authMiddleware);

router.get('/admin', controller.adminDashboard);
router.get('/teacher', controller.teacherDashboard);
router.get('/student', controller.studentDashboard);

module.exports = router;
