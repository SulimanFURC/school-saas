/**
 * Application HTTP error for use with async route handlers and the global error middleware.
 * @property {number} status HTTP status code
 * @property {string} message Client-safe message (matches API `{ message }` shape)
 * @property {unknown} [details] Optional validation or extra context
 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = { HttpError };
