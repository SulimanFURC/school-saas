const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    actor_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    entity_type: { type: DataTypes.STRING(64), allowNull: false },
    entity_id: { type: DataTypes.STRING(120), allowNull: false },
    action: { type: DataTypes.STRING(32), allowNull: false },
    before_json: { type: DataTypes.JSONB, allowNull: true },
    after_json: { type: DataTypes.JSONB, allowNull: true },
    metadata_json: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    tableName: 'audit_logs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['tenant_id', 'created_at'] },
      { fields: ['tenant_id', 'entity_type', 'entity_id'] },
    ],
  }
);

module.exports = AuditLog;
