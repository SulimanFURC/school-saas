const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Teacher = sequelize.define(
  'Teacher',
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
    first_name: { type: DataTypes.STRING(100), allowNull: false },
    last_name: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false },
    mobile_number: { type: DataTypes.STRING(30), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    joining_date: { type: DataTypes.DATEONLY, allowNull: true },
    designation: { type: DataTypes.STRING(150), allowNull: true },
    dob: { type: DataTypes.DATEONLY, allowNull: true },
    gender: { type: DataTypes.STRING(20), allowNull: true },
    qualification: { type: DataTypes.TEXT, allowNull: true },
    experience: { type: DataTypes.STRING(255), allowNull: true },
    photo_base64: { type: DataTypes.TEXT('long'), allowNull: true },
    photo_mime: { type: DataTypes.STRING(64), allowNull: true },
    cv_file_name: { type: DataTypes.STRING(255), allowNull: true },
    cv_file_url: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'teachers',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'email'],
        name: 'teachers_tenant_id_email_unique',
      },
    ],
  }
);

const Tenant = require('../tenant/tenant.model');
Teacher.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = Teacher;
