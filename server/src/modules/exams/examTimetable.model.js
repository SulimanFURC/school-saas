const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * One exam paper for a (class, subject) under a given exam.
 * Contains scheduling info (date, time window, room) and marks bounds.
 *
 * Conflict detection (same class, overlapping time on the same day) is enforced
 * at the controller layer via an explicit query before saving.
 */
const ExamTimetable = sequelize.define(
  'ExamTimetable',
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
    subject_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'subjects', key: 'id' },
    },
    exam_date: { type: DataTypes.DATEONLY, allowNull: false },
    start_time: { type: DataTypes.STRING(5), allowNull: false },
    end_time: { type: DataTypes.STRING(5), allowNull: false },
    room: { type: DataTypes.STRING(60), allowNull: true },
    total_marks: { type: DataTypes.INTEGER, allowNull: false },
    passing_marks: { type: DataTypes.INTEGER, allowNull: false },
    /** Locked entries cannot accept new marks (admin can re-open). */
    is_locked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    locked_at: { type: DataTypes.DATE, allowNull: true },
    locked_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    /** Configurable per-paper deadline for marks entry. */
    deadline_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'exam_timetables',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'exam_id', 'class_id', 'subject_id'],
        name: 'exam_timetable_unique_subject',
      },
      {
        fields: ['tenant_id', 'exam_id', 'class_id'],
        name: 'exam_timetable_lookup_idx',
      },
    ],
  }
);

module.exports = ExamTimetable;
