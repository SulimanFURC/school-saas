const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Read-only audit trail for marks entries/edits.
 * - One row per change (create/update/delete).
 * - Stores full before/after JSON snapshots so we can reconstruct history.
 * - `reason` is mandatory for edits to existing marks (controller-enforced).
 */
const ExamMarkAudit = sequelize.define(
  'ExamMarkAudit',
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
    exam_mark_id: { type: DataTypes.UUID, allowNull: true },
    exam_timetable_id: { type: DataTypes.UUID, allowNull: false },
    student_id: { type: DataTypes.UUID, allowNull: false },
    actor_user_id: { type: DataTypes.UUID, allowNull: true },
    /** create | update | delete */
    action: { type: DataTypes.STRING(20), allowNull: false },
    before_json: { type: DataTypes.JSONB, allowNull: true },
    after_json: { type: DataTypes.JSONB, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    tableName: 'exam_mark_audits',
    timestamps: true,
    underscored: true,
    updatedAt: false,
    indexes: [
      {
        fields: ['tenant_id', 'exam_timetable_id'],
        name: 'exam_mark_audits_tenant_paper_idx',
      },
      {
        fields: ['tenant_id', 'student_id'],
        name: 'exam_mark_audits_tenant_student_idx',
      },
    ],
  }
);

module.exports = ExamMarkAudit;
