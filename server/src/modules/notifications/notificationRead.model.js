const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Per-user read state for a broadcast Notification (recipient_role-targeted).
 * For user-targeted notifications we use Notification.read_at directly.
 */
const NotificationRead = sequelize.define(
  'NotificationRead',
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
    notification_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'notifications', key: 'id' },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    read_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'notification_reads',
    timestamps: true,
    underscored: true,
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'notification_id', 'user_id'],
        name: 'notification_reads_tenant_notif_user_unique',
      },
      {
        fields: ['tenant_id', 'user_id'],
        name: 'notification_reads_tenant_user_idx',
      },
    ],
  }
);

module.exports = NotificationRead;
