const express = require('express');
const router = express.Router();
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const academicController = require('./academic.controller');

router.use(authMiddleware);
router.use(checkFeature('classes'));
router.use(authorize('admin'));

router.get('/classes', academicController.listClasses);
router.post('/classes', academicController.createClass);
router.get('/sections', academicController.listSections);
router.post('/sections', academicController.createSection);
router.get('/academic-years', academicController.listAcademicYears);
router.post('/academic-years', academicController.createAcademicYear);
router.patch('/academic-years/:id/active', academicController.setActiveAcademicYear);

module.exports = router;
