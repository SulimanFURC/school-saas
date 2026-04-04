const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const AcademicYear = sequelize.define(
  'AcademicYear',
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
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'academic_years',
    timestamps: true,
    underscored: true,
  }
);

const Tenant = require('../tenant/tenant.model');
AcademicYear.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = AcademicYear;
