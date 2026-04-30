const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const controller = require('./fee.controller');

router.use(authMiddleware);
router.use(checkFeature('fees'));
router.use(authorize('admin', 'super_admin'));

router.get('/student/:studentId', asyncHandler(controller.getByStudent));
router.get('/', asyncHandler(controller.list));
router.post('/', asyncHandler(controller.create));
router.get('/:id', asyncHandler(controller.getOne));
router.put('/:id', asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));

module.exports = router;
