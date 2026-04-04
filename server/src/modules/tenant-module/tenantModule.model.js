const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TenantModule = sequelize.define(
  'TenantModule',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tenants',
        key: 'id',
      },
    },
    module_key: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    is_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'tenant_modules',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'module_key'],
        name: 'tenant_modules_tenant_id_module_key_unique',
      },
    ],
  }
);

const Tenant = require('../tenant/tenant.model');
TenantModule.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantModule, { foreignKey: 'tenant_id', as: 'tenantModules' });

module.exports = TenantModule;
