const Module = require('../module/module.model');
const TenantModule = require('../tenant-module/tenantModule.model');

exports.listForTenant = async (req, res) => {
  try {
    const tenantId = req.tenant.id;

    const catalog = await Module.findAll({ order: [['id', 'ASC']] });
    const toggles = await TenantModule.findAll({
      where: { tenant_id: tenantId },
    });
    const byKey = new Map(toggles.map((r) => [r.module_key, r]));

    const merged = catalog.map((m) => {
      const tm = byKey.get(m.key);
      return {
        module_key: m.key,
        name: m.name,
        group: m.group,
        is_enabled: tm ? tm.is_enabled : false,
      };
    });

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
