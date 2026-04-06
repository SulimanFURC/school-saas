const jwt = require('jsonwebtoken');
const Tenant = require('../../modules/tenant/tenant.model');

const tenantMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const targetSub = req.headers['x-tenant-id']
          ? String(req.headers['x-tenant-id']).trim().toLowerCase()
          : null;
        if (decoded.role === 'super_admin' && targetSub) {
          const tenant = await Tenant.findOne({ where: { subdomain: targetSub } });
          if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found' });
          }
          req.tenant = tenant;
          return next();
        }
        if (decoded.tenant_id) {
          const tenant = await Tenant.findByPk(decoded.tenant_id);
          if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found' });
          }
          req.tenant = tenant;
          return next();
        }
      } catch {
        if (!req.headers['x-tenant-id']) {
          return res.status(401).json({ message: 'Invalid token' });
        }
      }
    }

    const subdomain = req.headers['x-tenant-id'];

    if (!subdomain) {
      return res.status(400).json({ message: 'Tenant not provided' });
    }

    const tenant = await Tenant.findOne({ where: { subdomain } });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = tenantMiddleware;
