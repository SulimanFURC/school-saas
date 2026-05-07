const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TenantRolePermission = sequelize.define(
  'TenantRolePermission',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenant_roles', key: 'id' },
    },
    permission_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenant_permissions', key: 'id' },
    },
  },
  {
    tableName: 'tenant_role_permissions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'role_id', 'permission_id'],
        name: 'tenant_role_permissions_tenant_role_permission_unique',
      },
    ],
  }
);

module.exports = TenantRolePermission;

