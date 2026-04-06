const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const SchoolClass = sequelize.define(
  'SchoolClass',
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
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    code: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'classes',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'name'],
        name: 'classes_tenant_id_name_unique',
      },
      {
        unique: true,
        fields: ['tenant_id', 'code'],
        name: 'classes_tenant_id_code_unique',
      },
    ],
  }
);

const Tenant = require('../tenant/tenant.model');
SchoolClass.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = SchoolClass;
