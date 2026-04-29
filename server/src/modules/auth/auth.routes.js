const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('./auth.controller');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

router.post('/login', loginLimiter, authController.login);

module.exports = router;
