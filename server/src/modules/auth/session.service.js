const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const sequelize = require('../../config/db');
const User = require('../users/user.model');
const RefreshToken = require('./refreshToken.model');
const TokenBlocklist = require('./tokenBlocklist.model');

const OPAQUE_BYTES = 32;

function pepper() {
  return process.env.TOKEN_HASH_PEPPER || process.env.JWT_SECRET;
}

function hashOpaque(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  return crypto.createHmac('sha256', pepper()).update(raw).digest('hex');
}

function generateOpaqueRefresh() {
  return crypto.randomBytes(OPAQUE_BYTES).toString('base64url');
}

function accessExpiresInMinutes() {
  const n = parseInt(process.env.JWT_ACCESS_EXPIRES_MINUTES || '15', 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function refreshExpiresInDays() {
  const n = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '7', 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

function accessExpiresAtDate() {
  const ms = accessExpiresInMinutes() * 60 * 1000;
  return new Date(Date.now() + ms);
}

function refreshExpiresAtDate() {
  const ms = refreshExpiresInDays() * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

function signAccessToken(user, tenant, accessJti, tokenVersion) {
  return jwt.sign(
    {
      userId: user.id,
      tenant_id: tenant.id,
      role: user.role,
      jti: accessJti,
      ver: tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: `${accessExpiresInMinutes()}m` }
  );
}

function jwtExpiresAtFromToken(signed) {
  const decoded = jwt.decode(signed);
  if (!decoded || !decoded.exp) return accessExpiresAtDate();
  return new Date(decoded.exp * 1000);
}

/**
 * Issue new access JWT + opaque refresh, persist refresh hash.
 */
async function issueTokenPair(user, tenant, transaction = undefined) {
  const accessJti = crypto.randomUUID();
  const tokenVersion = user.token_version != null ? Number(user.token_version) : 0;
  const accessToken = signAccessToken(user, tenant, accessJti, tokenVersion);
  const rawRefresh = generateOpaqueRefresh();
  const tokenHash = hashOpaque(rawRefresh);

  await RefreshToken.create(
    {
      tenant_id: tenant.id,
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: refreshExpiresAtDate(),
    },
    { transaction }
  );

  return {
    accessToken,
    refreshToken: rawRefresh,
    accessJti,
    accessExpiresAt: jwtExpiresAtFromToken(accessToken),
  };
}

async function addAccessToBlocklist({ tenantId, userId, accessJti, expiresAt, reason }) {
  if (!accessJti) return;
  try {
    await TokenBlocklist.create({
      tenant_id: tenantId,
      user_id: userId,
      access_jti: accessJti,
      expires_at: expiresAt,
      reason: reason || null,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return;
    }
    throw err;
  }
}

async function revokeRefreshByPlainToken(plainToken, tenantId, transaction = undefined) {
  const tokenHash = hashOpaque(plainToken);
  if (!tokenHash) return 0;
  const [n] = await RefreshToken.update(
    { revoked_at: new Date() },
    {
      where: {
        tenant_id: tenantId,
        token_hash: tokenHash,
        revoked_at: null,
      },
      transaction,
    }
  );
  return n;
}

/**
 * Rotate refresh: revoke matching row and create a new one; return new pair.
 */
async function rotateRefreshToken(plainRefresh, tenant) {
  const tokenHash = hashOpaque(plainRefresh);
  if (!tokenHash) {
    return { ok: false, status: 401, message: 'Invalid refresh token' };
  }

  return sequelize.transaction(async (t) => {
    const row = await RefreshToken.findOne({
      where: {
        tenant_id: tenant.id,
        token_hash: tokenHash,
        revoked_at: null,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!row) {
      return { ok: false, status: 401, message: 'Invalid refresh token' };
    }

    if (row.expires_at < new Date()) {
      await row.update({ revoked_at: new Date() }, { transaction: t });
      return { ok: false, status: 401, message: 'Refresh token expired' };
    }

    const user = await User.findOne({
      where: { id: row.user_id, tenant_id: tenant.id },
      transaction: t,
    });
    if (!user || user.status === 'inactive') {
      await row.update({ revoked_at: new Date() }, { transaction: t });
      return { ok: false, status: 401, message: 'Invalid refresh token' };
    }

    const newRaw = generateOpaqueRefresh();
    const newHash = hashOpaque(newRaw);
    const newRow = await RefreshToken.create(
      {
        tenant_id: tenant.id,
        user_id: user.id,
        token_hash: newHash,
        expires_at: refreshExpiresAtDate(),
      },
      { transaction: t }
    );

    await row.update(
      { revoked_at: new Date(), replaced_by_id: newRow.id },
      { transaction: t }
    );

    const accessJti = crypto.randomUUID();
    const tokenVersion = user.token_version != null ? Number(user.token_version) : 0;
    const accessToken = signAccessToken(user, tenant, accessJti, tokenVersion);

    return {
      ok: true,
      accessToken,
      refreshToken: newRaw,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      accessExpiresAt: jwtExpiresAtFromToken(accessToken),
    };
  });
}

/**
 * Invalidate server-side sessions: bump token version (invalidates all access JWTs) and revoke refresh rows.
 */
async function invalidateUserSessions(userId, tenantId, transaction = undefined) {
  await User.increment('token_version', {
    by: 1,
    where: { id: userId, tenant_id: tenantId },
    transaction,
  });
  await RefreshToken.update(
    { revoked_at: new Date() },
    {
      where: {
        user_id: userId,
        tenant_id: tenantId,
        revoked_at: null,
      },
      transaction,
    }
  );
}

module.exports = {
  hashOpaque,
  generateOpaqueRefresh,
  signAccessToken,
  accessExpiresAtDate,
  refreshExpiresAtDate,
  issueTokenPair,
  addAccessToBlocklist,
  revokeRefreshByPlainToken,
  rotateRefreshToken,
  invalidateUserSessions,
  jwtExpiresAtFromToken,
};
