const express = require('express');
const router = express.Router();
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const studentController = require('./student.controller');

router.use(authMiddleware);

// checkFeature + authorize must be per-route (not router.use) because this router is
// mounted without a path prefix — router.use middleware runs for ALL requests, which
// would block teachers/students from reaching their own routes.
const adminStudents = [checkFeature('students'), authorize('admin', 'super_admin')];

router.post('/students/register', adminStudents, studentController.register);
router.post('/students/promote', adminStudents, studentController.promote);
router.get('/students', adminStudents, studentController.list);
router.get('/students/lookup', adminStudents, studentController.lookupByAdmission);
router.get('/students/:id/login-details', adminStudents, studentController.getLoginDetails);
router.get('/students/:id', adminStudents, studentController.getById);
router.put('/students/:id', adminStudents, studentController.update);
router.delete('/students/:id', adminStudents, studentController.remove);
router.get('/enrollments', adminStudents, studentController.listEnrollments);

module.exports = router;
