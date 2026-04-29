const express = require('express');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const controller = require('./settings.controller');

const router = express.Router();

router.use(authMiddleware);

router.get('/school-profile', authorize('admin', 'super_admin'), controller.getSchoolProfile);
router.put('/school-profile', authorize('admin', 'super_admin'), controller.updateSchoolProfile);

router.get('/academic-year', authorize('admin', 'super_admin'), controller.getAcademicYearSetting);

router.post('/change-password', controller.changePassword);

router.get('/notification-preferences', controller.getNotificationPreferences);
router.put('/notification-preferences', controller.updateNotificationPreferences);

module.exports = router;
