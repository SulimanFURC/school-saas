const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Many-to-many: classes that participate in a given exam.
 * One row per (exam, class). Unique within tenant + exam.
 */
const ExamClass = sequelize.define(
  'ExamClass',
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
    exam_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'exams', key: 'id' },
    },
    class_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'classes', key: 'id' },
    },
    /** Cached integer parsed from class name (e.g. 'Grade 10' -> 10). */
    grade_level: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: 'exam_classes',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'exam_id', 'class_id'],
        name: 'exam_classes_tenant_exam_class_unique',
      },
      {
        fields: ['tenant_id', 'class_id'],
        name: 'exam_classes_tenant_class_idx',
      },
    ],
  }
);

module.exports = ExamClass;
