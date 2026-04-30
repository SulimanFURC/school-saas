const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const academicController = require('./academic.controller');

router.use(authMiddleware);

// checkFeature + authorize must be per-route (not router.use) because this router is
// mounted without a path prefix — router.use middleware runs for ALL requests, which
// would block teachers/students from reaching their own routes.
const adminClasses = [checkFeature('classes'), authorize('admin', 'super_admin')];

router.get('/classes', adminClasses, asyncHandler(academicController.listClasses));
router.post('/classes', adminClasses, asyncHandler(academicController.createClass));
router.get('/classes/:id', adminClasses, asyncHandler(academicController.getClass));
router.patch('/classes/:id', adminClasses, asyncHandler(academicController.updateClass));
router.delete('/classes/:id', adminClasses, asyncHandler(academicController.deleteClass));
router.get('/sections', adminClasses, asyncHandler(academicController.listSections));
router.post('/sections', adminClasses, asyncHandler(academicController.createSection));
router.patch('/sections/:id', adminClasses, asyncHandler(academicController.updateSection));
router.delete('/sections/:id', adminClasses, asyncHandler(academicController.deleteSection));
router.get('/academic-years', adminClasses, asyncHandler(academicController.listAcademicYears));
router.get('/academic-years/current', adminClasses, asyncHandler(academicController.getCurrentAcademicYear));
router.post('/academic-years', adminClasses, asyncHandler(academicController.createAcademicYear));
router.patch('/academic-years/:id/active', adminClasses, asyncHandler(academicController.setActiveAcademicYear));

module.exports = router;
