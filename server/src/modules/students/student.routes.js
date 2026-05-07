const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const { requirePermission } = require('../../core/middleware/permission.middleware');
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
const adminStudentsRead = [checkFeature('students'), requirePermission('students.read')];
const adminStudentsCreate = [checkFeature('students'), requirePermission('students.create')];
const adminStudentsUpdate = [checkFeature('students'), requirePermission('students.update')];
const adminStudentsDelete = [checkFeature('students'), requirePermission('students.delete')];

router.post('/students/register', adminStudentsCreate, validate({ body: registerSchema }), asyncHandler(studentController.register));
router.post('/students/promote', adminStudentsUpdate, validate({ body: promoteSchema }), asyncHandler(studentController.promote));
router.get('/students', adminStudentsRead, validate({ query: listQuerySchema }), asyncHandler(studentController.list));
router.get('/students/lookup', adminStudentsRead, validate({ query: lookupQuerySchema }), asyncHandler(studentController.lookupByAdmission));
router.get('/students/:id/login-details', adminStudentsRead, validate({ params: studentIdParamSchema }), asyncHandler(studentController.getLoginDetails));
router.get('/students/:id', adminStudentsRead, validate({ params: studentIdParamSchema }), asyncHandler(studentController.getById));
router.put('/students/:id', adminStudentsUpdate, validate({ params: studentIdParamSchema, body: updateSchema }), asyncHandler(studentController.update));
router.delete('/students/:id', adminStudentsDelete, validate({ params: studentIdParamSchema }), asyncHandler(studentController.remove));
router.get('/enrollments', adminStudentsRead, validate({ query: enrollmentsQuerySchema }), asyncHandler(studentController.listEnrollments));

module.exports = router;
