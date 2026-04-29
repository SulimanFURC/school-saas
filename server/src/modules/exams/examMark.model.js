const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Marks for a single (timetable entry, student).
 *
 * `entry_status` describes the attendance/state of the student for that paper:
 *   - present  : marks_obtained must be a number within [0, timetable.total_marks]
 *   - absent   : marks_obtained must be null
 *   - exempted : marks_obtained must be null
 *   - withheld : marks_obtained must be null (held for review)
 */
const ExamMark = sequelize.define(
  'ExamMark',
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
    exam_timetable_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'exam_timetables', key: 'id' },
    },
    student_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'students', key: 'id' },
    },
    entry_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'present',
    },
    marks_obtained: { type: DataTypes.DECIMAL(7, 2), allowNull: true },
    entered_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    updated_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    tableName: 'exam_marks',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'exam_timetable_id', 'student_id'],
        name: 'exam_marks_unique_paper_student',
      },
      {
        fields: ['tenant_id', 'exam_id', 'student_id'],
        name: 'exam_marks_tenant_exam_student_idx',
      },
    ],
  }
);

module.exports = ExamMark;
