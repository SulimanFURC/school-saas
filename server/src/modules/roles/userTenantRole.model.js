const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const UserTenantRole = sequelize.define(
  'UserTenantRole',
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenant_roles', key: 'id' },
    },
  },
  {
    tableName: 'user_tenant_roles',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'user_id'],
        name: 'user_tenant_roles_tenant_id_user_id_unique',
      },
    ],
  }
);

module.exports = UserTenantRole;

