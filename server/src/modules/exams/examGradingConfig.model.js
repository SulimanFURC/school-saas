const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Binds a GradingScheme to an Exam, plus how to compute grades.
 *
 * `grading_mode`:
 *   - per_subject : grade is computed per timetable entry from
 *                   marks_obtained / total_marks * 100, then mapped to a band.
 *   - aggregate   : grade is computed once from total_obtained / total_max * 100
 *                   (sum across all subjects in the exam for that student).
 */
const ExamGradingConfig = sequelize.define(
  'ExamGradingConfig',
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
    grading_scheme_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'grading_schemes', key: 'id' },
    },
    grading_mode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'per_subject',
    },
  },
  {
    tableName: 'exam_grading_configs',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'exam_id'],
        name: 'exam_grading_configs_tenant_exam_unique',
      },
    ],
  }
);

module.exports = ExamGradingConfig;
