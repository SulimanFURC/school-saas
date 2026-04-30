const jwt = require('jsonwebtoken');
const User = require('../../modules/users/user.model');
const TokenBlocklist = require('../../modules/auth/tokenBlocklist.model');
const Tenant = require('../../modules/tenant/tenant.model');

function tenantStatusBlockedMessage(status) {
  if (status === 'inactive') {
    return 'Your school account is inactive. Please contact your administrator.';
  }
  if (status === 'pending') {
    return 'Your school account is pending approval. Please try again later.';
  }
  return null;
}

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (!decoded.jti || decoded.ver === undefined || decoded.ver === null) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (!decoded.tenant_id || !decoded.userId) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const tenant = await Tenant.findByPk(decoded.tenant_id, { attributes: ['id', 'status'] });
    if (!tenant) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    const tenantBlockedMessage = tenantStatusBlockedMessage(String(tenant.status || '').toLowerCase());
    if (tenantBlockedMessage) {
      return res.status(403).json({ message: tenantBlockedMessage });
    }

    const blocked = await TokenBlocklist.findOne({
      where: {
        tenant_id: decoded.tenant_id,
        access_jti: String(decoded.jti),
      },
    });
    if (blocked) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const user = await User.findOne({
      where: { id: decoded.userId, tenant_id: decoded.tenant_id },
      attributes: ['id', 'token_version'],
    });
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (Number(user.token_version) !== Number(decoded.ver)) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error('authMiddleware error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = authMiddleware;
