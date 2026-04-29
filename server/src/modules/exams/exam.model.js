const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Tenant-scoped exam header.
 *
 * Lifecycle (`status`):
 *   draft -> scheduled -> ongoing -> result_pending -> published -> archived
 *
 * Soft-delete is implemented via `archived_at` + `status='archived'`. We never
 * hard-delete an exam so historical data (marks, audits) is preserved.
 */
const Exam = sequelize.define(
  'Exam',
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
    title: { type: DataTypes.STRING(150), allowNull: false },
    /** first_term, second_term, mid_term, final, unit_test, mock */
    exam_type: { type: DataTypes.STRING(40), allowNull: false },
    academic_year_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'academic_years', key: 'id' },
    },
    start_date: { type: DataTypes.DATEONLY, allowNull: false },
    end_date: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'draft',
    },
    /** Internal exams are forbidden for board classes (Grade 9+). */
    is_internal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    /** Whether the timetable is finalised (admit cards become available after this). */
    timetable_finalized_at: { type: DataTypes.DATE, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    /** Optional configurable re-evaluation window, in days, after publish. */
    recheck_window_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 7,
    },
    /** Open/closed flag for re-evaluation requests (overrides date window). */
    recheck_open: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: 'exams',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['tenant_id', 'status'], name: 'exams_tenant_status_idx' },
      { fields: ['tenant_id', 'academic_year_id'], name: 'exams_tenant_year_idx' },
    ],
  }
);

module.exports = Exam;
