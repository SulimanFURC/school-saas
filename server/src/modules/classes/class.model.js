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
    ],
  }
);

const Tenant = require('../tenant/tenant.model');
SchoolClass.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = SchoolClass;
