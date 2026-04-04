const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const SchoolClass = require('./class.model');

const Section = sequelize.define(
  'Section',
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
    class_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'classes', key: 'id' },
    },
    name: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
  },
  {
    tableName: 'sections',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'class_id', 'name'],
        name: 'sections_tenant_class_name_unique',
      },
    ],
  }
);

const Tenant = require('../tenant/tenant.model');
Section.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Section.belongsTo(SchoolClass, { foreignKey: 'class_id', as: 'schoolClass' });
SchoolClass.hasMany(Section, { foreignKey: 'class_id', as: 'sections' });

module.exports = Section;
