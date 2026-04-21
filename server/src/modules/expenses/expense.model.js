const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Expense = sequelize.define(
  'Expense',
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
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    expense_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    expense_type: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    attachment_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    created_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    tableName: 'expenses',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['tenant_id', 'expense_date'], name: 'expenses_tenant_date_idx' },
      { fields: ['tenant_id', 'status'], name: 'expenses_tenant_status_idx' },
    ],
  }
);

module.exports = Expense;
