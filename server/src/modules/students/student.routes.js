const express = require('express');
const router = express.Router();
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const validate = require('../../core/middleware/validate.middleware');
const studentController = require('./student.controller');
const {
  studentIdParamSchema,
  registerSchema,
  promoteSchema,
  listQuerySchema,
  lookupQuerySchema,
  enrollmentsQuerySchema,
  updateSchema,
} = require('./student.schemas');

router.use(authMiddleware);

// checkFeature + authorize must be per-route (not router.use) because this router is
// mounted without a path prefix — router.use middleware runs for ALL requests, which
// would block teachers/students from reaching their own routes.
const adminStudents = [checkFeature('students'), authorize('admin', 'super_admin')];

router.post('/students/register', adminStudents, validate({ body: registerSchema }), studentController.register);
router.post('/students/promote', adminStudents, validate({ body: promoteSchema }), studentController.promote);
router.get('/students', adminStudents, validate({ query: listQuerySchema }), studentController.list);
router.get('/students/lookup', adminStudents, validate({ query: lookupQuerySchema }), studentController.lookupByAdmission);
router.get('/students/:id/login-details', adminStudents, validate({ params: studentIdParamSchema }), studentController.getLoginDetails);
router.get('/students/:id', adminStudents, validate({ params: studentIdParamSchema }), studentController.getById);
router.put('/students/:id', adminStudents, validate({ params: studentIdParamSchema, body: updateSchema }), studentController.update);
router.delete('/students/:id', adminStudents, validate({ params: studentIdParamSchema }), studentController.remove);
router.get('/enrollments', adminStudents, validate({ query: enrollmentsQuerySchema }), studentController.listEnrollments);

module.exports = router;
