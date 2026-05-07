const express = require('express');
const authMiddleware = require('../../core/middleware/auth.middleware');
const { requirePermission } = require('../../core/middleware/permission.middleware');
const controller = require('./settings.controller');

const router = express.Router();

router.use(authMiddleware);

router.get('/school-profile', requirePermission('settings.read'), controller.getSchoolProfile);
router.put('/school-profile', requirePermission('settings.update'), controller.updateSchoolProfile);

router.get('/academic-year', requirePermission('settings.read'), controller.getAcademicYearSetting);

router.post('/change-password', controller.changePassword);

router.get('/notification-preferences', controller.getNotificationPreferences);
router.put('/notification-preferences', controller.updateNotificationPreferences);

module.exports = router;
