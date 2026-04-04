const TenantModule = require('../../modules/tenant-module/tenantModule.model');

const checkFeature = (moduleKey) => {
  return async (req, res, next) => {
    try {
      const tenant = req.tenant;

      const feature = await TenantModule.findOne({
        where: {
          tenant_id: tenant.id,
          module_key: moduleKey,
        },
      });

      if (!feature || !feature.is_enabled) {
        return res.status(403).json({
          message: `${moduleKey} module is disabled for this tenant`,
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = checkFeature;
