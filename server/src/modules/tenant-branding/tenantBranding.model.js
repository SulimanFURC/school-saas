const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TenantBranding = sequelize.define(
  'TenantBranding',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'tenants',
        key: 'id',
      },
    },
    primary_color: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    secondary_color: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    logo_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'tenant_branding',
    timestamps: true,
    underscored: true,
  }
);

const Tenant = require('../tenant/tenant.model');
TenantBranding.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = TenantBranding;
