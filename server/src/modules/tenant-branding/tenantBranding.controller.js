const path = require('path');
const Tenant = require('../tenant/tenant.model');
const TenantBranding = require('./tenantBranding.model');

const HEX_RE = /^#([0-9A-Fa-f]{6})$/;

const DEFAULT_PRIMARY = '#1976d2';
const DEFAULT_SECONDARY = '#ffffff';

function isValidHex(color) {
  return typeof color === 'string' && HEX_RE.test(color.trim());
}

function normalizeHex(color) {
  return color.trim();
}

function brandingPayload(row, tenantId) {
  if (!row) {
    return {
      tenantId,
      primaryColor: DEFAULT_PRIMARY,
      secondaryColor: DEFAULT_SECONDARY,
      logoUrl: null,
      usesDefaults: true,
    };
  }
  return {
    tenantId,
    primaryColor: row.primary_color || DEFAULT_PRIMARY,
    secondaryColor: row.secondary_color || DEFAULT_SECONDARY,
    logoUrl: row.logo_url || null,
    usesDefaults: false,
  };
}

exports.getForCurrentTenant = async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant not resolved' });
    }
    const role = req.user?.role;
    if (role === 'super_admin') {
      return res.status(403).json({ message: 'Use super admin branding endpoints' });
    }
    const row = await TenantBranding.findOne({ where: { tenant_id: tenantId } });
    res.json(brandingPayload(row, tenantId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getForTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    const row = await TenantBranding.findOne({ where: { tenant_id: tenantId } });
    res.json(brandingPayload(row, tenantId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.upsertBranding = async (req, res) => {
  try {
    const { tenantId, primaryColor, secondaryColor } = req.body;

    if (!tenantId) {
      return res.status(400).json({ message: 'tenantId is required' });
    }

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    if (primaryColor !== undefined && primaryColor !== null && String(primaryColor).trim() !== '') {
      if (!isValidHex(primaryColor)) {
        return res.status(400).json({ message: 'primaryColor must be a valid HEX color (#RRGGBB)' });
      }
    }
    if (secondaryColor !== undefined && secondaryColor !== null && String(secondaryColor).trim() !== '') {
      if (!isValidHex(secondaryColor)) {
        return res.status(400).json({ message: 'secondaryColor must be a valid HEX color (#RRGGBB)' });
      }
    }

    let row = await TenantBranding.findOne({ where: { tenant_id: tenantId } });

    if (!row) {
      row = await TenantBranding.create({
        tenant_id: tenantId,
        primary_color:
          primaryColor === undefined || primaryColor === null || String(primaryColor).trim() === ''
            ? null
            : normalizeHex(primaryColor),
        secondary_color:
          secondaryColor === undefined || secondaryColor === null || String(secondaryColor).trim() === ''
            ? null
            : normalizeHex(secondaryColor),
      });
    } else {
      if (primaryColor !== undefined) {
        row.primary_color =
          primaryColor === null || String(primaryColor).trim() === ''
            ? null
            : normalizeHex(primaryColor);
      }
      if (secondaryColor !== undefined) {
        row.secondary_color =
          secondaryColor === null || String(secondaryColor).trim() === ''
            ? null
            : normalizeHex(secondaryColor);
      }
      await row.save();
    }

    const fresh = await TenantBranding.findOne({ where: { tenant_id: tenantId } });
    res.json(brandingPayload(fresh, tenantId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.uploadLogo = async (req, res) => {
  try {
    const tenantId = req.query?.tenantId || req.body?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'tenantId is required (query or body)' });
    }

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'PNG file is required' });
    }

    const relativePath = path.posix.join('uploads/logos', `${tenantId}.png`);

    const [row] = await TenantBranding.findOrCreate({
      where: { tenant_id: tenantId },
      defaults: {
        tenant_id: tenantId,
        logo_url: relativePath,
      },
    });

    if (!row.isNewRecord) {
      row.logo_url = relativePath;
      await row.save();
    }

    res.json({ logoUrl: relativePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

