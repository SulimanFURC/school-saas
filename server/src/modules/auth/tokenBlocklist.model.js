const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TokenBlocklist = sequelize.define(
  'TokenBlocklist',
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    access_jti: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
  },
  {
    tableName: 'token_blocklist',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'access_jti'],
        name: 'token_blocklist_tenant_id_access_jti_unique',
      },
      { fields: ['expires_at'] },
    ],
  }
);

module.exports = TokenBlocklist;
