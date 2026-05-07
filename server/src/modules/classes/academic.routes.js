const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const { requirePermission } = require('../../core/middleware/permission.middleware');
const academicController = require('./academic.controller');

router.use(authMiddleware);

// checkFeature + authorize must be per-route (not router.use) because this router is
// mounted without a path prefix — router.use middleware runs for ALL requests, which
// would block teachers/students from reaching their own routes.
const classesRead = [checkFeature('classes'), requirePermission('classes.read')];
const classesCreate = [checkFeature('classes'), requirePermission('classes.create')];
const classesUpdate = [checkFeature('classes'), requirePermission('classes.update')];
const classesDelete = [checkFeature('classes'), requirePermission('classes.delete')];

router.get('/classes', classesRead, asyncHandler(academicController.listClasses));
router.post('/classes', classesCreate, asyncHandler(academicController.createClass));
router.get('/classes/:id', classesRead, asyncHandler(academicController.getClass));
router.patch('/classes/:id', classesUpdate, asyncHandler(academicController.updateClass));
router.delete('/classes/:id', classesDelete, asyncHandler(academicController.deleteClass));
router.get('/sections', classesRead, asyncHandler(academicController.listSections));
router.post('/sections', classesCreate, asyncHandler(academicController.createSection));
router.patch('/sections/:id', classesUpdate, asyncHandler(academicController.updateSection));
router.delete('/sections/:id', classesDelete, asyncHandler(academicController.deleteSection));
router.get('/academic-years', classesRead, asyncHandler(academicController.listAcademicYears));
router.get('/academic-years/current', classesRead, asyncHandler(academicController.getCurrentAcademicYear));
router.post('/academic-years', classesCreate, asyncHandler(academicController.createAcademicYear));
router.patch('/academic-years/:id/active', classesUpdate, asyncHandler(academicController.setActiveAcademicYear));

module.exports = router;
