const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tenants',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'active',
    },
    student_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'students',
        key: 'id',
      },
    },
    teacher_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'teachers',
        key: 'id',
      },
    },
  },
  {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'email'],
        name: 'users_tenant_id_email_unique',
      },
      {
        unique: true,
        fields: ['tenant_id', 'username'],
        name: 'users_tenant_id_username_unique',
      },
    ],
  }
);

const Tenant = require('../tenant/tenant.model');
User.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

module.exports = User;
