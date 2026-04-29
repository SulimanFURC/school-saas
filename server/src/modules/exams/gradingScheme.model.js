const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * A named grading scheme (e.g. "Standard Letter Grade", "CGPA 4.0").
 * Schemes are tenant-scoped and reusable across exams via ExamGradingConfig.
 *
 * `archived_at` implements soft-delete (historical results stay computable).
 */
const GradingScheme = sequelize.define(
  'GradingScheme',
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
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: true },
    /** Cached: true iff at least one band has grade_point set. */
    has_grade_points: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    archived_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'grading_schemes',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'name'],
        name: 'grading_schemes_tenant_name_unique',
      },
    ],
  }
);

module.exports = GradingScheme;
