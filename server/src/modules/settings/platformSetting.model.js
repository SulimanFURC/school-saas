const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/** Global platform-level configuration (not tenant-scoped). */
const PlatformSetting = sequelize.define(
  'PlatformSetting',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    setting_key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    setting_value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'platform_settings',
    underscored: true,
    timestamps: true,
  }
);

module.exports = PlatformSetting;
