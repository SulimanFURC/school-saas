const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const RefreshToken = sequelize.define(
  'RefreshToken',
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
    token_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    replaced_by_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'refresh_tokens', key: 'id' },
    },
  },
  {
    tableName: 'refresh_tokens',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['tenant_id', 'user_id'] },
      { fields: ['expires_at'] },
    ],
  }
);

const User = require('../users/user.model');
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = RefreshToken;
