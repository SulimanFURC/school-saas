const express = require('express');
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const { requirePermission } = require('../../core/middleware/permission.middleware');
const controller = require('./subject.controller');

const router = express.Router();

router.use(authMiddleware);

// Subjects are an academic catalog; treat them like the classes module.
const subjectsRead = [checkFeature('classes'), requirePermission('classes.read')];
const subjectsCreate = [checkFeature('classes'), requirePermission('classes.create')];
const subjectsUpdate = [checkFeature('classes'), requirePermission('classes.update')];
const subjectsDelete = [checkFeature('classes'), requirePermission('classes.delete')];

router.get('/subjects', subjectsRead, asyncHandler(controller.list));
router.post('/subjects', subjectsCreate, asyncHandler(controller.create));
router.patch('/subjects/:id', subjectsUpdate, asyncHandler(controller.update));
router.delete('/subjects/:id', subjectsDelete, asyncHandler(controller.remove));

module.exports = router;

