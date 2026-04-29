const { ZodError } = require('zod');
const { sendError } = require('../http/response');

function formatZodIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.params) {
        const out = schemas.params.safeParse(req.params);
        if (!out.success) {
          return sendError(res, 400, 'Invalid route parameters', formatZodIssues(out.error.issues));
        }
        req.params = out.data;
      }
      if (schemas.query) {
        const out = schemas.query.safeParse(req.query);
        if (!out.success) {
          return sendError(res, 400, 'Invalid query parameters', formatZodIssues(out.error.issues));
        }
        req.query = out.data;
      }
      if (schemas.body) {
        const out = schemas.body.safeParse(req.body);
        if (!out.success) {
          return sendError(res, 400, 'Invalid request body', formatZodIssues(out.error.issues));
        }
        req.body = out.data;
      }
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return sendError(res, 400, 'Validation failed', formatZodIssues(err.issues));
      }
      return next(err);
    }
  };
}

module.exports = validate;
