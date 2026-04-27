const express = require('express');
const router = express.Router();
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const academicController = require('./academic.controller');

router.use(authMiddleware);

// checkFeature + authorize must be per-route (not router.use) because this router is
// mounted without a path prefix — router.use middleware runs for ALL requests, which
// would block teachers/students from reaching their own routes.
const adminClasses = [checkFeature('classes'), authorize('admin', 'super_admin')];

router.get('/classes', adminClasses, academicController.listClasses);
router.post('/classes', adminClasses, academicController.createClass);
router.patch('/classes/:id', adminClasses, academicController.updateClass);
router.delete('/classes/:id', adminClasses, academicController.deleteClass);
router.get('/sections', adminClasses, academicController.listSections);
router.post('/sections', adminClasses, academicController.createSection);
router.patch('/sections/:id', adminClasses, academicController.updateSection);
router.delete('/sections/:id', adminClasses, academicController.deleteSection);
router.get('/academic-years', adminClasses, academicController.listAcademicYears);
router.get('/academic-years/current', adminClasses, academicController.getCurrentAcademicYear);
router.post('/academic-years', adminClasses, academicController.createAcademicYear);
router.patch('/academic-years/:id/active', adminClasses, academicController.setActiveAcademicYear);

module.exports = router;
