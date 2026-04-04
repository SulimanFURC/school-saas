const express = require('express');
const router = express.Router();
const authMiddleware = require('../../core/middleware/auth.middleware');
const modulesController = require('./modules.controller');

router.get('/', authMiddleware, modulesController.listForTenant);

module.exports = router;
