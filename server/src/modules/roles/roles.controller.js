const { Op } = require('sequelize');
const TenantRole = require('./tenantRole.model');
const TenantPermission = require('./tenantPermission.model');
const TenantRolePermission = require('./tenantRolePermission.model');
const UserTenantRole = require('./userTenantRole.model');
const { resolveAccessContext, assignRoleToUser, listAssignableUsers } = require('./role-access.service');

function normalizeRoleName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

exports.listRoles = async (req, res) => {
  try {
    const rows = await TenantRole.findAll({
      where: { tenant_id: req.tenant.id },
      include: [
        {
          model: TenantRolePermission,
          as: 'rolePermissions',
          required: false,
          include: [{ model: TenantPermission, as: 'permission', attributes: ['id', 'code', 'module_key', 'action'] }],
        },
      ],
      order: [['is_system_role', 'DESC'], ['name', 'ASC']],
    });
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      is_system_role: r.is_system_role,
      permissions: (r.rolePermissions || [])
        .map((rp) => rp.permission)
        .filter(Boolean),
    }));
    res.status(200).json({ data });
  } catch (err) {
    console.error('listRoles error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createRole = async (req, res) => {
  try {
    const normalizedName = normalizeRoleName(req.body?.name);
    const description = req.body?.description ? String(req.body.description).trim() : null;
    if (!normalizedName) return res.status(400).json({ message: 'name is required' });

    const existing = await TenantRole.findOne({
      where: { tenant_id: req.tenant.id, name: normalizedName },
      attributes: ['id'],
    });
    if (existing) return res.status(409).json({ message: 'Role name already exists' });

    const created = await TenantRole.create({
      tenant_id: req.tenant.id,
      name: normalizedName,
      description,
      is_system_role: false,
    });

    res.status(201).json({
      message: 'Role created',
      data: {
        id: created.id,
        name: created.name,
        description: created.description,
        is_system_role: created.is_system_role,
      },
    });
  } catch (err) {
    console.error('createRole error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const role = await TenantRole.findOne({
      where: { id: req.params.id, tenant_id: req.tenant.id },
    });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role.is_system_role) return res.status(400).json({ message: 'System role cannot be renamed' });

    const updates = {};
    if (req.body?.name != null) {
      const normalized = normalizeRoleName(req.body.name);
      if (!normalized) return res.status(400).json({ message: 'name cannot be empty' });
      const dupe = await TenantRole.findOne({
        where: { tenant_id: req.tenant.id, name: normalized, id: { [Op.ne]: role.id } },
        attributes: ['id'],
      });
      if (dupe) return res.status(409).json({ message: 'Role name already exists' });
      updates.name = normalized;
    }
    if (req.body?.description !== undefined) {
      updates.description = req.body.description ? String(req.body.description).trim() : null;
    }
    await role.update(updates);
    res.status(200).json({ message: 'Role updated' });
  } catch (err) {
    console.error('updateRole error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const role = await TenantRole.findOne({
      where: { id: req.params.id, tenant_id: req.tenant.id },
    });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role.is_system_role) return res.status(400).json({ message: 'System role cannot be deleted' });

    const assigned = await UserTenantRole.count({
      where: { tenant_id: req.tenant.id, role_id: role.id },
    });
    if (assigned > 0) {
      return res.status(400).json({ message: 'Role is assigned to users. Reassign users before delete.' });
    }

    await TenantRolePermission.destroy({ where: { tenant_id: req.tenant.id, role_id: role.id } });
    await role.destroy();
    res.status(200).json({ message: 'Role deleted' });
  } catch (err) {
    console.error('deleteRole error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listPermissions = async (req, res) => {
  try {
    const rows = await TenantPermission.findAll({
      attributes: ['id', 'module_key', 'action', 'code'],
      order: [['module_key', 'ASC'], ['action', 'ASC']],
    });
    res.status(200).json({ data: rows });
  } catch (err) {
    console.error('listPermissions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.replaceRolePermissions = async (req, res) => {
  try {
    const role = await TenantRole.findOne({
      where: { id: req.params.id, tenant_id: req.tenant.id },
      attributes: ['id'],
    });
    if (!role) return res.status(404).json({ message: 'Role not found' });

    const permissionIds = Array.isArray(req.body?.permission_ids) ? req.body.permission_ids : null;
    if (!permissionIds) {
      return res.status(400).json({ message: 'permission_ids must be an array' });
    }

    const perms = await TenantPermission.findAll({
      where: { id: permissionIds },
      attributes: ['id'],
    });
    if (perms.length !== permissionIds.length) {
      return res.status(400).json({ message: 'One or more permission_ids are invalid' });
    }

    await TenantRolePermission.destroy({
      where: { tenant_id: req.tenant.id, role_id: role.id },
    });
    if (permissionIds.length > 0) {
      await TenantRolePermission.bulkCreate(
        permissionIds.map((pid) => ({
          tenant_id: req.tenant.id,
          role_id: role.id,
          permission_id: pid,
        }))
      );
    }
    res.status(200).json({ message: 'Role permissions updated' });
  } catch (err) {
    console.error('replaceRolePermissions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listRoleAssignments = async (req, res) => {
  try {
    const users = await listAssignableUsers(req.tenant.id);
    const data = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      assigned_role_id: u.tenantRoleAssignment?.role_id ?? null,
      assigned_role_name: u.tenantRoleAssignment?.role?.name ?? null,
    }));
    res.status(200).json({ data });
  } catch (err) {
    console.error('listRoleAssignments error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.assignUserRole = async (req, res) => {
  try {
    const roleId = String(req.body?.role_id || '').trim();
    if (!roleId) return res.status(400).json({ message: 'role_id is required' });

    const result = await assignRoleToUser({
      tenantId: req.tenant.id,
      userId: req.params.userId,
      roleId,
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.status(200).json({ message: 'User role updated' });
  } catch (err) {
    console.error('assignUserRole error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.myPermissions = async (req, res) => {
  try {
    const access = await resolveAccessContext({
      tenantId: req.tenant.id,
      userId: req.user.userId,
      fallbackRole: req.user.role,
    });
    res.status(200).json({
      data: {
        role: access.roleName,
        permissions: access.permissions,
      },
    });
  } catch (err) {
    console.error('myPermissions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

