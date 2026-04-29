const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const UserNotificationPreference = sequelize.define(
  'UserNotificationPreference',
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
    email_notifications: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sms_notifications: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    in_app_notifications: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'user_notification_preferences',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'user_id'],
        name: 'user_notif_pref_tenant_user_unique',
      },
    ],
  }
);

module.exports = UserNotificationPreference;
