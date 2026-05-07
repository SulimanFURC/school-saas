const express = require('express');

const authorize = require('../../core/middleware/authorize.middleware');
const auditController = require('./audit.controller');

const router = express.Router();

router.use(authorize('admin', 'super_admin'));
router.get('/', auditController.listUnifiedAuditLogs);
router.get('/entities/:entityType/:entityId/history', auditController.listEntityHistory);
router.get('/users/:userId/timeline', auditController.listUserTimeline);

module.exports = router;
