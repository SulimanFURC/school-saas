function sendError(res, status, message, details) {
  const payload = { message };
  if (details !== undefined) {
    payload.details = details;
  }
  return res.status(status).json(payload);
}

function sendInternalError(res, log, context, err) {
  if (log && typeof log.error === 'function') {
    log.error({ err }, context || 'request failed');
  } else {
    console.error(context || 'request failed:', err);
  }
  return sendError(res, 500, 'Internal server error');
}

module.exports = {
  sendError,
  sendInternalError,
};
