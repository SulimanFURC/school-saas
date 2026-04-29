const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Tenant-scoped in-app notification.
 *
 * Targeting rules:
 *  - If `recipient_user_id` is set, only that user can read/mark it.
 *  - Else if `recipient_role` is set, every user in that role for the tenant can
 *    see it (broadcast). Per-user read-state is tracked via NotificationRead.
 */
const Notification = sequelize.define(
  'Notification',
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
    recipient_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    recipient_role: { type: DataTypes.STRING(20), allowNull: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    body: { type: DataTypes.STRING(1000), allowNull: false },
    /** Free-form payload (e.g. exam_id, link path) consumed by the UI. */
    data_json: { type: DataTypes.JSONB, allowNull: true },
    /** Per-user notification: timestamp when this user marked it read. */
    read_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'notifications',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['tenant_id', 'recipient_user_id'], name: 'notifications_tenant_user_idx' },
      { fields: ['tenant_id', 'recipient_role'], name: 'notifications_tenant_role_idx' },
    ],
  }
);

module.exports = Notification;
