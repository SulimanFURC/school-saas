const { runWithTenantContext, runWithoutTenantScope } = require('../tenant-context');

/**
 * Wraps an async Express handler so rejections are forwarded to `next(err)` for the global error middleware.
 * Re-binds {@link runWithTenantContext} for the handler lifetime so Sequelize tenant hooks see `req.tenant.id`
 * even if the route was not entered synchronously from {@link tenantMiddleware}'s `run` callback.
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>} fn
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    const tid = req.tenant?.id ?? null;
    const run = tid ? (inner) => runWithTenantContext(tid, inner) : (inner) => inner();
    Promise.resolve(run(() => Promise.resolve(fn(req, res, next)))).catch(next);
  };
}

/**
 * Super-admin routes: disable automatic tenant_id merge on tenant-scoped models for this handler.
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>} fn
 */
function asyncSuperAdminHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(runWithoutTenantScope(() => Promise.resolve(fn(req, res, next)))).catch(next);
  };
}

module.exports = { asyncHandler, asyncSuperAdminHandler };
