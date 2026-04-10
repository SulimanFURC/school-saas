const express = require('express');
const router = express.Router();
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const studentController = require('./student.controller');

router.use(authMiddleware);
router.use(checkFeature('students'));
router.use(authorize('admin', 'super_admin'));

router.post('/students/register', studentController.register);
router.post('/students/promote', studentController.promote);
router.get('/students', studentController.list);
router.get('/students/lookup', studentController.lookupByAdmission);
router.get('/students/:id/login-details', studentController.getLoginDetails);
router.get('/students/:id', studentController.getById);
router.put('/students/:id', studentController.update);
router.delete('/students/:id', studentController.remove);
router.get('/enrollments', studentController.listEnrollments);

module.exports = router;
