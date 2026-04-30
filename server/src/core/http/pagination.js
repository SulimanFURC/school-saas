/**
 * Parse `page` and `limit` from `req.query` with caps.
 * @param {import('express').Request} req
 * @param {{ maxLimit?: number; defaultLimit?: number }} [options]
 * @returns {{ page: number; limit: number; offset: number }}
 */
function parsePagination(req, options = {}) {
  const maxLimit = options.maxLimit ?? 1000;
  const defaultLimit = options.defaultLimit ?? 20;
  const pageRaw = parseInt(req.query.page, 10);
  const limitRaw = parseInt(req.query.limit, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  let limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

module.exports = { parsePagination };
