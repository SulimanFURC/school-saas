const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TenantPermission = sequelize.define(
  'TenantPermission',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    module_key: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(140),
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: 'tenant_permissions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['module_key', 'action'],
        name: 'tenant_permissions_module_action_unique',
      },
    ],
  }
);

module.exports = TenantPermission;

