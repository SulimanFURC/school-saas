const crypto = require('crypto');
const logger = require('../logger/logger');

function requestContextMiddleware(req, res, next) {
  const incomingRequestId = req.headers['x-request-id'];
  const requestId =
    typeof incomingRequestId === 'string' && incomingRequestId.trim()
      ? incomingRequestId.trim()
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  req.log = logger.child({
    request_id: requestId,
    method: req.method,
    path: req.originalUrl || req.url,
  });

  res.on('finish', () => {
    req.log.info({
      status_code: res.statusCode,
      tenant_id: req.tenant ? req.tenant.id : null,
      user_id: req.user ? req.user.userId : null,
    }, 'request completed');
  });

  next();
}

module.exports = requestContextMiddleware;
