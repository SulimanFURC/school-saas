const express = require('express');
const router = express.Router();
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const controller = require('./fee.controller');

router.use(authMiddleware);
router.use(checkFeature('fees'));
router.use(authorize('admin', 'super_admin'));

router.get('/student/:studentId', controller.getByStudent);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getOne);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
