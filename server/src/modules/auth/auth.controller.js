const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sequelize = require('../../config/db');
const Tenant = require('../tenant/tenant.model');
const User = require('../users/user.model');
const PasswordResetToken = require('./passwordResetToken.model');
const { seedTenantModulesForTenant } = require('../../seed/moduleSeed');
const { seedAcademicYearsForTenant } = require('../../seed/academicYearsSeed');
const {
  RESERVED_SUBDOMAINS,
  normalizeSubdomain,
  isValidSubdomain,
} = require('../../core/utils/subdomain');
const {
  issueTokenPair,
  addAccessToBlocklist,
  revokeRefreshByPlainToken,
  rotateRefreshToken,
  invalidateUserSessions,
  hashOpaque,
  accessExpiresAtDate,
} = require('./session.service');

const { Op } = require('sequelize');

function tenantStatusBlockedMessage(status) {
  if (status === 'inactive') {
    return 'Your school account is inactive. Please contact your administrator.';
  }
  if (status === 'pending') {
    return 'Your school account is pending approval. Please try again later.';
  }
  return null;
}

function jsonUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
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
    await seedAcademicYearsForTenant(tenant.id);

    const pair = await issueTokenPair(user, tenant);

    return res.status(201).json({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      token: pair.accessToken,
      user: jsonUser(user),
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
    console.error('signup error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, login } = req.body;
    const tenant = req.tenant;
    const tenantBlockedMessage = tenantStatusBlockedMessage(String(tenant?.status || '').toLowerCase());
    if (tenantBlockedMessage) {
      return res.status(403).json({ message: tenantBlockedMessage });
    }

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

    const pair = await issueTokenPair(user, tenant);

    res.json({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      token: pair.accessToken,
      user: jsonUser(user),
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.refresh = async (req, res) => {
  try {
    const tenant = req.tenant;
    const { refreshToken } = req.body || {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ message: 'refreshToken is required' });
    }

    const result = await rotateRefreshToken(String(refreshToken).trim(), tenant);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      token: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    console.error('auth.refresh error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.logout = async (req, res) => {
  try {
    const accessJti = req.user.jti;
    const userId = req.user.userId;
    if (!accessJti || !userId) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const expiresAt =
      req.user.exp != null ? new Date(Number(req.user.exp) * 1000) : accessExpiresAtDate();

    await addAccessToBlocklist({
      tenantId: req.tenant.id,
      userId,
      accessJti,
      expiresAt,
      reason: 'logout',
    });

    const { refreshToken } = req.body || {};
    if (refreshToken && typeof refreshToken === 'string') {
      await revokeRefreshByPlainToken(refreshToken.trim(), req.tenant.id);
    }

    res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    console.error('auth.logout error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this school and login, password reset instructions would be sent.';

exports.forgotPassword = async (req, res) => {
  try {
    const tenant = req.tenant;
    const { email, login } = req.body || {};
    const loginRaw = login != null && login !== '' ? login : email;
    if (!loginRaw || typeof loginRaw !== 'string') {
      return res.status(400).json({ message: 'login or email is required' });
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
      return res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE });
    }

    await PasswordResetToken.destroy({
      where: { user_id: user.id, tenant_id: tenant.id, used_at: null },
    });

    const raw = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashOpaque(raw);
    const mins = parseInt(process.env.PASSWORD_RESET_EXPIRES_MINUTES || '60', 10);
    const expiresAt = new Date(Date.now() + (Number.isFinite(mins) && mins > 0 ? mins : 60) * 60 * 1000);

    await PasswordResetToken.create({
      tenant_id: tenant.id,
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const devReturn =
      process.env.PASSWORD_RESET_RETURN_TOKEN === 'true' ||
      process.env.NODE_ENV === 'development';

    const body = { message: FORGOT_PASSWORD_MESSAGE };
    if (devReturn) {
      body.resetToken = raw;
      body.expiresAt = expiresAt.toISOString();
    }

    res.status(200).json(body);
  } catch (err) {
    console.error('auth.forgotPassword error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const tenant = req.tenant;
    const { token, newPassword } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ message: 'token is required' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'newPassword must be at least 6 characters' });
    }

    const tokenHash = hashOpaque(token.trim());
    if (!tokenHash) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const row = await PasswordResetToken.findOne({
      where: {
        tenant_id: tenant.id,
        token_hash: tokenHash,
        used_at: null,
      },
    });

    if (!row || row.expires_at < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const user = await User.findOne({
      where: { id: row.user_id, tenant_id: tenant.id },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await sequelize.transaction(async (trx) => {
      await row.update({ used_at: new Date() }, { transaction: trx });
      await user.update(
        { password: hash, password_changed_at: new Date() },
        { transaction: trx }
      );
      await invalidateUserSessions(user.id, tenant.id, trx);
    });

    res.status(200).json({ message: 'Password has been reset. You can sign in.' });
  } catch (err) {
    console.error('auth.resetPassword error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
