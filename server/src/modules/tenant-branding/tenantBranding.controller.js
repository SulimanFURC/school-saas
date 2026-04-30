const path = require('path');
const Tenant = require('../tenant/tenant.model');
const TenantBranding = require('./tenantBranding.model');

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

const DEFAULT_PRIMARY = '#1976d2';
const DEFAULT_SECONDARY = '#ffffff';

function isValidHex(color) {
  return typeof color === 'string' && HEX_RE.test(color.trim());
}

function normalizeHex(color) {
  const normalized = color.trim();
  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return normalized;
}

function tenantIdentityFields(tenant) {
  if (!tenant) {
    return {
      tenantName: '',
      tenantAddress: null,
      tenantContactEmail: null,
    };
  }
  const plain = tenant.get ? tenant.get({ plain: true }) : tenant;
  return {
    tenantName: plain.name != null ? String(plain.name) : '',
    tenantAddress: plain.address != null && String(plain.address).trim() !== '' ? String(plain.address) : null,
    tenantContactEmail:
      plain.contact_email != null && String(plain.contact_email).trim() !== ''
        ? String(plain.contact_email)
        : null,
  };
}

function brandingPayload(row, tenantId, tenant) {
  const identity = tenantIdentityFields(tenant);
  if (!row) {
    return {
      tenantId,
      primaryColor: DEFAULT_PRIMARY,
      secondaryColor: DEFAULT_SECONDARY,
      logoUrl: null,
      usesDefaults: true,
      ...identity,
    };
  }
  return {
    tenantId,
    primaryColor: row.primary_color || DEFAULT_PRIMARY,
    secondaryColor: row.secondary_color || DEFAULT_SECONDARY,
    logoUrl: row.logo_url || null,
    usesDefaults: false,
    ...identity,
  };
}

function currentTenantPayload(row) {
  if (!row) {
    return {
      primary_color: null,
      secondary_color: null,
      logo_url: null,
    };
  }

  return {
    primary_color: row.primary_color ?? null,
    secondary_color: row.secondary_color ?? null,
    logo_url: row.logo_url ?? null,
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
    return res.status(200).json(currentTenantPayload(row));
  } catch (err) {
    console.error('getForCurrentTenant error:', err);
    res.status(500).json({ message: 'Internal server error' });
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
    res.json(brandingPayload(row, tenantId, tenant));
  } catch (err) {
    console.error('getForTenant branding error:', err);
    res.status(500).json({ message: 'Internal server error' });
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
        return res.status(400).json({ message: 'primaryColor must be a valid hex color (e.g. #4F46E5)' });
      }
    }
    if (secondaryColor !== undefined && secondaryColor !== null && String(secondaryColor).trim() !== '') {
      if (!isValidHex(secondaryColor)) {
        return res.status(400).json({ message: 'secondaryColor must be a valid hex color (e.g. #0EA5E9)' });
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
    res.json(brandingPayload(fresh, tenantId, tenant));
  } catch (err) {
    console.error('upsertBranding error:', err);
    res.status(500).json({ message: 'Internal server error' });
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
    req.log?.error({ err }, 'tenantBranding.uploadLogo failed');
    res.status(500).json({ message: 'Internal server error' });
  }
};

