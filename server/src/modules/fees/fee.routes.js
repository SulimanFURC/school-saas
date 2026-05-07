const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const { requirePermission } = require('../../core/middleware/permission.middleware');
const controller = require('./fee.controller');

router.use(authMiddleware);
router.use(checkFeature('fees'));

router.get('/student/:studentId', requirePermission('fees.read'), asyncHandler(controller.getByStudent));
router.get('/', requirePermission('fees.read'), asyncHandler(controller.list));
router.post('/', requirePermission('fees.create'), asyncHandler(controller.create));
router.get('/:id', requirePermission('fees.read'), asyncHandler(controller.getOne));
router.put('/:id', requirePermission('fees.update'), asyncHandler(controller.update));
router.delete('/:id', requirePermission('fees.delete'), asyncHandler(controller.remove));

module.exports = router;
