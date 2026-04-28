const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Tenant-scoped subject catalog.
 * Used for normalized teacher academic assignments.
 */
const Subject = sequelize.define(
  'Subject',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    /** Lowercased/trimmed key for case-insensitive uniqueness within a tenant. */
    name_key: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'subjects',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'name_key'],
        name: 'subjects_tenant_name_key_unique',
      },
      {
        fields: ['tenant_id', 'is_active'],
        name: 'subjects_tenant_active_idx',
      },
    ],
  }
);

const Tenant = require('../tenant/tenant.model');
Subject.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = Subject;

