const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const controller = require('./subject.controller');

const router = express.Router();

router.use(authMiddleware);

// Subjects are an academic catalog; treat them like the classes module.
const adminSubjects = [checkFeature('classes'), authorize('admin', 'super_admin')];

router.get('/subjects', adminSubjects, asyncHandler(controller.list));
router.post('/subjects', adminSubjects, asyncHandler(controller.create));
router.patch('/subjects/:id', adminSubjects, asyncHandler(controller.update));
router.delete('/subjects/:id', adminSubjects, asyncHandler(controller.remove));

module.exports = router;

