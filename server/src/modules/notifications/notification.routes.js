const express = require('express');
const authMiddleware = require('../../core/middleware/auth.middleware');
const controller = require('./notification.controller');

const router = express.Router();

router.use(authMiddleware);

router.get('/notifications', controller.list);
router.get('/notifications/unread-count', controller.unreadCount);
router.patch('/notifications/:id/read', controller.markRead);
router.post('/notifications/mark-all-read', controller.markAllRead);

module.exports = router;
