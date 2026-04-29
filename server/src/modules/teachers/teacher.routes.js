const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const validate = require('../../core/middleware/validate.middleware');
const controller = require('./teacher.controller');
const assignmentController = require('./teacherAssignment.controller');
const {
  uuidParam,
  assignmentParam,
  listQuery,
  createTeacher,
  updateTeacher,
  changePassword,
} = require('./teacher.schemas');

const router = express.Router();

const uploadsRoot = path.join(__dirname, '../../../uploads');

const cvStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = req.tenant.id;
    const dir = path.join(uploadsRoot, 'teachers', String(tenantId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${base}${ext}`);
  },
});

const cvUpload = multer({
  storage: cvStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('Only PDF or Word documents are allowed'));
    }
    cb(null, true);
  },
});

router.use(authMiddleware);

// Self-service endpoints: a logged-in teacher must always be able to read/update
// their own profile and view their dashboard. The `teachers` feature flag gates
// the admin module (managing staff) and must not lock teachers out of their own
// account or dashboard.
router.get('/teachers/me', authorize('teacher'), controller.getMe);
router.patch('/teachers/me', authorize('teacher'), validate({ body: updateTeacher }), controller.updateMe);
router.patch('/teachers/me/password', authorize('teacher'), validate({ body: changePassword }), controller.changeMyPassword);
router.get('/teachers/me/dashboard', authorize('teacher'), assignmentController.getMyDashboard);
router.get('/teachers/me/students', authorize('teacher'), assignmentController.listMyStudents);

// Admin-facing endpoints: gated by the teachers feature flag and admin role.
const adminTeachers = [checkFeature('teachers'), authorize('admin', 'super_admin')];

router.get('/teachers', adminTeachers, validate({ query: listQuery }), controller.list);
router.post('/teachers', adminTeachers, validate({ body: createTeacher }), controller.create);
router.get('/teachers/assignment-stats', adminTeachers, assignmentController.assignmentStats);
router.get('/teachers/:id/assignments', adminTeachers, validate({ params: uuidParam }), assignmentController.listForTeacher);
router.post('/teachers/:id/assignments', adminTeachers, validate({ params: uuidParam, body: updateTeacher }), assignmentController.create);
router.delete(
  '/teachers/:id/assignments/:assignmentId',
  adminTeachers,
  validate({ params: assignmentParam }),
  assignmentController.remove
);
router.get('/teachers/:id/login-details', adminTeachers, validate({ params: uuidParam }), controller.getLoginDetails);
router.patch('/teachers/:id/password', adminTeachers, validate({ params: uuidParam }), controller.resetPassword);
router.post(
  '/teachers/:id/cv',
  adminTeachers,
  (req, res, next) => {
    cvUpload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Upload failed' });
      }
      next();
    });
  },
  controller.uploadCv
);
router.get('/teachers/:id', adminTeachers, validate({ params: uuidParam }), controller.getById);
router.put('/teachers/:id', adminTeachers, validate({ params: uuidParam, body: updateTeacher }), controller.update);
router.delete('/teachers/:id', adminTeachers, validate({ params: uuidParam }), controller.remove);

module.exports = router;
