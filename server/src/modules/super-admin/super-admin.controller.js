const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const Tenant = require('../tenant/tenant.model');
const User = require('../users/user.model');
const Module = require('../module/module.model');
const TenantModule = require('../tenant-module/tenantModule.model');
const Student = require('../students/student.model');
const { seedTenantModulesForTenant } = require('../../seed/moduleSeed');
const { seedCanonicalClassesForTenant } = require('../../seed/canonicalClasses');
const { seedAcademicYearsForTenant } = require('../../seed/academicYearsSeed');
const {
  RESERVED_SUBDOMAINS,
  normalizeSubdomain,
  isValidSubdomain,
} = require('../../core/utils/subdomain');

const ALLOWED_STATUS = new Set(['active', 'inactive', 'pending']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function humanizeModuleKey(key) {
  if (!key) return '';
  const s = String(key).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parsePagination(req) {
  const pageRaw = parseInt(req.query.page, 10);
  const limitRaw = parseInt(req.query.limit, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  let limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
  if (limit > 1000) limit = 1000;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

exports.listTenants = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where = {};
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { subdomain: { [Op.iLike]: `%${q}%` } },
        { contact_email: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const [listResult, activeSchools, pendingSchools, totalStudents, totalSchools] = await Promise.all([
      Tenant.findAndCountAll({
        where,
        attributes: [
          'id',
          'name',
          'subdomain',
          'status',
          'contact_email',
          'phone',
          'address',
          'createdAt',
          'updatedAt',
        ],
        order: [['updatedAt', 'DESC']],
        limit,
        offset,
      }),
      Tenant.count({ where: { status: 'active' } }),
      Tenant.count({ where: { status: 'pending' } }),
      Student.count(),
      Tenant.count(),
    ]);

    const { rows, count } = listResult;
    const totalPages = Math.max(1, Math.ceil(count / limit));

    const tenantIds = rows.map((r) => r.id);
    let modulesByTenant = new Map();
    if (tenantIds.length > 0) {
      const tmRows = await TenantModule.findAll({
        where: { tenant_id: { [Op.in]: tenantIds } },
        attributes: ['tenant_id', 'module_key', 'is_enabled'],
      });
      modulesByTenant = tmRows.reduce((m, row) => {
        const tid = row.tenant_id;
        const list = m.get(tid) || [];
        list.push(row);
        m.set(tid, list);
        return m;
      }, new Map());
    }

    const data = rows.map((r) => {
      const j = r.toJSON();
      const modules = (modulesByTenant.get(j.id) || [])
        .filter((tm) => tm.is_enabled)
        .map((tm) => tm.module_key);
      j.enabled_modules =
        modules.map(humanizeModuleKey).filter(Boolean).join(', ') || '—';
      return j;
    });

    res.json({
      data,
      total: count,
      page,
      limit,
      totalPages,
      stats: {
        totalSchools,
        activeSchools,
        pendingSchools,
        totalStudents,
      },
    });
  } catch (err) {
    console.error('listTenants error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createTenant = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      name,
      subdomain,
      status,
      contact_email,
      phone,
      address,
      adminName,
      adminEmail,
      password,
    } = req.body;

    if (!name || !subdomain || !contact_email || !adminName || !adminEmail || !password) {
      await t.rollback();
      return res.status(400).json({
        message: 'name, subdomain, contact_email, adminName, adminEmail, and password are required',
      });
    }

    if (status == null || String(status).trim() === '') {
      await t.rollback();
      return res.status(400).json({ message: 'status is required' });
    }

    const nameTrim = String(name).trim();
    if (nameTrim.length < 2 || nameTrim.length > 200) {
      await t.rollback();
      return res.status(400).json({ message: 'Organization name must be between 2 and 200 characters' });
    }

    const emailNorm = String(contact_email).trim().toLowerCase();
    if (!EMAIL_RE.test(emailNorm)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid contact email format' });
    }

    const adminEmailNorm = String(adminEmail).trim().toLowerCase();
    if (!EMAIL_RE.test(adminEmailNorm)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid admin email format' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      await t.rollback();
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const statusVal = String(status).trim().toLowerCase();
    if (!ALLOWED_STATUS.has(statusVal)) {
      await t.rollback();
      return res.status(400).json({ message: 'status must be active, inactive, or pending' });
    }

    const sub = normalizeSubdomain(subdomain);
    if (!isValidSubdomain(sub)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid subdomain format' });
    }

    if (RESERVED_SUBDOMAINS.has(sub)) {
      await t.rollback();
      return res.status(400).json({ message: 'This subdomain is reserved' });
    }

    const existingTenant = await Tenant.findOne({ where: { subdomain: sub }, transaction: t });
    if (existingTenant) {
      await t.rollback();
      return res.status(409).json({ message: 'Subdomain already taken' });
    }

    let phoneTrim = phone != null ? String(phone).trim() : '';
    if (phoneTrim.length > 50) {
      await t.rollback();
      return res.status(400).json({ message: 'Phone must be at most 50 characters' });
    }
    if (phoneTrim === '') phoneTrim = null;

    let addressTrim = address != null ? String(address).trim() : '';
    if (addressTrim.length > 5000) {
      await t.rollback();
      return res.status(400).json({ message: 'Address is too long' });
    }
    if (addressTrim === '') addressTrim = null;

    const tenant = await Tenant.create(
      {
        name: nameTrim,
        subdomain: sub,
        status: statusVal,
        contact_email: emailNorm,
        phone: phoneTrim,
        address: addressTrim,
      },
      { transaction: t }
    );

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create(
      {
        tenant_id: tenant.id,
        name: String(adminName).trim(),
        email: adminEmailNorm,
        password: hash,
        role: 'admin',
        status: 'active',
      },
      { transaction: t }
    );

    await t.commit();

    await seedTenantModulesForTenant(tenant.id, true);
    await seedCanonicalClassesForTenant(tenant.id);
    await seedAcademicYearsForTenant(tenant.id);

    const fresh = await Tenant.findByPk(tenant.id, {
      attributes: [
        'id',
        'name',
        'subdomain',
        'status',
        'contact_email',
        'phone',
        'address',
        'createdAt',
        'updatedAt',
      ],
    });

    return res.status(201).json({
      tenant: fresh.toJSON(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Duplicate value (subdomain or email for tenant)' });
    }
    return res.status(500).json({ error: err.message });
  }
};

exports.getTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await Tenant.findByPk(tenantId, {
      attributes: [
        'id',
        'name',
        'subdomain',
        'status',
        'contact_email',
        'phone',
        'address',
        'createdAt',
        'updatedAt',
      ],
    });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    return res.status(200).json({ tenant: tenant.toJSON() });
  } catch (err) {
    console.error('getTenant error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const { name, status, contact_email, phone, address } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      const nameTrim = String(name).trim();
      if (nameTrim.length < 2 || nameTrim.length > 200) {
        return res
          .status(400)
          .json({ message: 'Organization name must be between 2 and 200 characters' });
      }
      updates.name = nameTrim;
    }

    if (status !== undefined) {
      const statusVal = String(status).trim().toLowerCase();
      if (!ALLOWED_STATUS.has(statusVal)) {
        return res.status(400).json({ message: 'status must be active, inactive, or pending' });
      }
      updates.status = statusVal;
    }

    if (contact_email !== undefined) {
      const emailNorm = String(contact_email).trim().toLowerCase();
      if (emailNorm === '') {
        return res.status(400).json({ message: 'Contact email is required' });
      }
      if (!EMAIL_RE.test(emailNorm)) {
        return res.status(400).json({ message: 'Invalid contact email format' });
      }
      updates.contact_email = emailNorm;
    }

    if (phone !== undefined) {
      let phoneTrim = phone == null ? '' : String(phone).trim();
      if (phoneTrim.length > 50) {
        return res.status(400).json({ message: 'Phone must be at most 50 characters' });
      }
      updates.phone = phoneTrim === '' ? null : phoneTrim;
    }

    if (address !== undefined) {
      let addressTrim = address == null ? '' : String(address).trim();
      if (addressTrim.length > 5000) {
        return res.status(400).json({ message: 'Address is too long' });
      }
      updates.address = addressTrim === '' ? null : addressTrim;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided to update' });
    }

    await tenant.update(updates);

    const fresh = await Tenant.findByPk(tenant.id, {
      attributes: [
        'id',
        'name',
        'subdomain',
        'status',
        'contact_email',
        'phone',
        'address',
        'createdAt',
        'updatedAt',
      ],
    });

    return res.status(200).json({ message: 'Tenant updated', tenant: fresh.toJSON() });
  } catch (err) {
    console.error('updateTenant error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getTenantModules = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    await seedTenantModulesForTenant(tenant.id, true);

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

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        status: tenant.status,
      },
      modules: merged,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateTenantModules = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const body = req.body;
    if (!Array.isArray(body)) {
      return res.status(400).json({ message: 'Body must be an array of { module_key, is_enabled }' });
    }

    const catalog = await Module.findAll();
    const validKeys = new Set(catalog.map((m) => m.key));

    for (const row of body) {
      if (!row || typeof row.module_key !== 'string') {
        return res.status(400).json({ message: 'Each item must have module_key' });
      }
      if (!validKeys.has(row.module_key)) {
        return res.status(400).json({ message: `Unknown module_key: ${row.module_key}` });
      }
      if (typeof row.is_enabled !== 'boolean') {
        return res.status(400).json({ message: 'is_enabled must be boolean' });
      }
    }

    await seedTenantModulesForTenant(tenant.id, true);

    for (const row of body) {
      await TenantModule.update(
        { is_enabled: row.is_enabled },
        { where: { tenant_id: tenantId, module_key: row.module_key } }
      );
    }

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

    res.json({ modules: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
