const express = require('express');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const controller = require('./roles.controller');

const router = express.Router();

router.use(authMiddleware);

router.get('/me', controller.myPermissions);

router.get('/', authorize('admin', 'super_admin'), controller.listRoles);
router.post('/', authorize('admin', 'super_admin'), controller.createRole);
router.patch('/:id', authorize('admin', 'super_admin'), controller.updateRole);
router.delete('/:id', authorize('admin', 'super_admin'), controller.deleteRole);

router.get('/permissions/catalog', authorize('admin', 'super_admin'), controller.listPermissions);
router.put('/:id/permissions', authorize('admin', 'super_admin'), controller.replaceRolePermissions);

router.get('/users/assignments', authorize('admin', 'super_admin'), controller.listRoleAssignments);
router.put('/users/:userId/assign', authorize('admin', 'super_admin'), controller.assignUserRole);

module.exports = router;

