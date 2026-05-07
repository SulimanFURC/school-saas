const { resolveAccessContext } = require('../../modules/roles/role-access.service');

const SYSTEM_BYPASS = new Set(['admin', 'super_admin']);

function requirePermission(permissionCode) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.tenant) return res.status(401).json({ message: 'Unauthorized' });
      const role = String(req.user.role || '').toLowerCase();
      if (SYSTEM_BYPASS.has(role)) return next();

      const access = await resolveAccessContext({
        tenantId: req.tenant.id,
        userId: req.user.userId,
        fallbackRole: req.user.role,
      });
      req.user.permissions = access.permissions;
      req.user.assignedRole = access.roleName;

      if (access.permissions.includes('*') || access.permissions.includes(permissionCode)) {
        return next();
      }
      return res.status(403).json({ message: 'Forbidden' });
    } catch (err) {
      console.error('requirePermission middleware error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

module.exports = { requirePermission };

