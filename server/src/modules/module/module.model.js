const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Module = sequelize.define(
  'Module',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    group: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    tableName: 'modules',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

module.exports = Module;
