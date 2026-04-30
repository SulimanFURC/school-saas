const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Student = sequelize.define(
  'Student',
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
    admission_no: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    full_name: { type: DataTypes.STRING(200), allowNull: true },
    first_name: { type: DataTypes.STRING(100), allowNull: true },
    last_name: { type: DataTypes.STRING(100), allowNull: true },
    gender: { type: DataTypes.STRING(20), allowNull: true },
    dob: { type: DataTypes.DATEONLY, allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    photo_url: { type: DataTypes.TEXT, allowNull: true },
    /** Optimized JPEG as base64 (see register/update photo_base64) */
    photo_base64: { type: DataTypes.TEXT('long'), allowNull: true },
    photo_mime: { type: DataTypes.STRING(64), allowNull: true },
    blood_group: { type: DataTypes.STRING(5), allowNull: true },
    current_address: { type: DataTypes.TEXT, allowNull: true },
    permanent_address: { type: DataTypes.TEXT, allowNull: true },
    extra_details: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'active',
    },
  },
  {
    tableName: 'students',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'admission_no'],
        name: 'students_tenant_admission_unique',
      },
    ],
  }
);

const Tenant = require('../tenant/tenant.model');
Student.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = Student;
