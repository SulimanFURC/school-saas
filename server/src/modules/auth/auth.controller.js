const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sequelize = require('../../config/db');
const Tenant = require('../tenant/tenant.model');
const User = require('../users/user.model');
const { seedTenantModulesForTenant } = require('../../seed/moduleSeed');
const {
  RESERVED_SUBDOMAINS,
  normalizeSubdomain,
  isValidSubdomain,
} = require('../../core/utils/subdomain');

function signToken(user, tenant) {
  return jwt.sign(
    {
      userId: user.id,
      tenant_id: tenant.id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
}

exports.signup = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { schoolName, subdomain, adminName, email, password } = req.body;

    if (!schoolName || !subdomain || !adminName || !email || !password) {
      await t.rollback();
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      await t.rollback();
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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

    const tenant = await Tenant.create(
      {
        name: String(schoolName).trim(),
        subdomain: sub,
        status: 'active',
      },
      { transaction: t }
    );

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create(
      {
        tenant_id: tenant.id,
        name: String(adminName).trim(),
        email: String(email).trim().toLowerCase(),
        password: hash,
        role: 'admin',
        status: 'active',
      },
      { transaction: t }
    );

    await t.commit();

    await seedTenantModulesForTenant(tenant.id, true);

    const token = signToken(user, tenant);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
      },
    });
  } catch (err) {
    await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Email already registered for this tenant' });
    }
    return res.status(500).json({ error: err.message });
  }
};

const { Op } = require('sequelize');

exports.login = async (req, res) => {
  try {
    const { email, password, login } = req.body;
    const tenant = req.tenant;

    const loginRaw = login != null && login !== '' ? login : email;
    if (!loginRaw || !password) {
      return res.status(400).json({ message: 'login (or email) and password are required' });
    }

    const trimmed = String(loginRaw).trim();
    const emailNorm = trimmed.toLowerCase();

    const user = await User.findOne({
      where: {
        tenant_id: tenant.id,
        [Op.or]: [{ email: emailNorm }, { username: trimmed.toLowerCase() }],
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ message: 'Account is inactive' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken(user, tenant);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
