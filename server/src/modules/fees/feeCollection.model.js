const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const FeeCollection = sequelize.define(
  'FeeCollection',
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
    student_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'students', key: 'id' },
    },
    invoice_number: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    registration_no: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    student_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    class_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    roll_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    fee_type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    collection_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    payment_method: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'Paid',
    },
    payment_reference_number: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    collected_by_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    tableName: 'fee_collections',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'invoice_number'],
        name: 'fee_collections_tenant_invoice_unique',
      },
    ],
  }
);

module.exports = FeeCollection;
