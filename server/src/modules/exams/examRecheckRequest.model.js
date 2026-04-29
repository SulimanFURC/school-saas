const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * A re-check / re-evaluation request raised by a student after results are published.
 *
 * Status flow:
 *   open -> assigned -> resolved | rejected -> closed
 */
const ExamRecheckRequest = sequelize.define(
  'ExamRecheckRequest',
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
    requested_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    student_comment: { type: DataTypes.STRING(1000), allowNull: true },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'open',
    },
    assigned_teacher_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'teachers', key: 'id' },
    },
    teacher_comment: { type: DataTypes.STRING(1000), allowNull: true },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'exam_recheck_requests',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'exam_timetable_id', 'student_id'],
        name: 'exam_recheck_unique_paper_student',
      },
      {
        fields: ['tenant_id', 'exam_id', 'status'],
        name: 'exam_recheck_tenant_exam_status_idx',
      },
    ],
  }
);

module.exports = ExamRecheckRequest;
