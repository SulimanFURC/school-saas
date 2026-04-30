const express = require('express');

const authorize = require('../../core/middleware/authorize.middleware');
const auditController = require('./audit.controller');

const router = express.Router();

router.use(authorize('super_admin'));
router.get('/', auditController.listUnifiedAuditLogs);

module.exports = router;
