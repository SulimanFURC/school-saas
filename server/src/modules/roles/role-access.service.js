const { Op } = require('sequelize');
const TenantRole = require('./tenantRole.model');
const TenantPermission = require('./tenantPermission.model');
const TenantRolePermission = require('./tenantRolePermission.model');
const UserTenantRole = require('./userTenantRole.model');
const User = require('../users/user.model');

const SYSTEM_BYPASS_ROLES = new Set(['admin', 'super_admin']);

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

async function getAssignedRoleRow(tenantId, userId, fallbackRole) {
  const assignment = await UserTenantRole.findOne({
    where: { tenant_id: tenantId, user_id: userId },
    include: [{ model: TenantRole, as: 'role' }],
  });
  if (assignment?.role) {
    return assignment.role;
  }
  if (!fallbackRole) return null;
  return TenantRole.findOne({
    where: { tenant_id: tenantId, name: normalizeRole(fallbackRole) },
  });
}

async function getPermissionCodesForRole(tenantId, roleId) {
  const rows = await TenantRolePermission.findAll({
    where: { tenant_id: tenantId, role_id: roleId },
    include: [{ model: TenantPermission, as: 'permission', attributes: ['code', 'module_key', 'action'] }],
  });
  return rows
    .map((r) => r.permission?.code)
    .filter(Boolean);
}

async function resolveAccessContext({ tenantId, userId, fallbackRole }) {
  const normalized = normalizeRole(fallbackRole);
  if (SYSTEM_BYPASS_ROLES.has(normalized)) {
    return {
      roleName: normalized,
      permissions: ['*'],
      isBypass: true,
    };
  }
  const role = await getAssignedRoleRow(tenantId, userId, normalized);
  if (!role) {
    return {
      roleName: normalized || 'unknown',
      permissions: [],
      isBypass: false,
    };
  }
  const permissions = await getPermissionCodesForRole(tenantId, role.id);
  return {
    roleId: role.id,
    roleName: role.name,
    permissions,
    isBypass: false,
  };
}

async function assignRoleToUser({ tenantId, userId, roleId }) {
  const user = await User.findOne({ where: { id: userId, tenant_id: tenantId } });
  if (!user) return { ok: false, status: 404, message: 'User not found' };

  const role = await TenantRole.findOne({ where: { id: roleId, tenant_id: tenantId } });
  if (!role) return { ok: false, status: 404, message: 'Role not found' };

  const existing = await UserTenantRole.findOne({ where: { tenant_id: tenantId, user_id: userId } });
  if (existing) {
    await existing.update({ role_id: roleId });
  } else {
    await UserTenantRole.create({ tenant_id: tenantId, user_id: userId, role_id: roleId });
  }

  await user.update({ role: role.name });
  return { ok: true, role };
}

async function listAssignableUsers(tenantId) {
  return User.findAll({
    where: { tenant_id: tenantId, role: { [Op.ne]: 'super_admin' } },
    attributes: ['id', 'name', 'email', 'role', 'status'],
    include: [
      {
        model: UserTenantRole,
        as: 'tenantRoleAssignment',
        required: false,
        include: [{ model: TenantRole, as: 'role', attributes: ['id', 'name'] }],
      },
    ],
    order: [['created_at', 'DESC']],
  });
}

module.exports = {
  resolveAccessContext,
  assignRoleToUser,
  listAssignableUsers,
};

