const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * One grade band inside a GradingScheme.
 * Bands are inclusive ranges of percentage [min_percent, max_percent].
 * No two bands within a scheme may overlap (controller-enforced).
 */
const GradingBand = sequelize.define(
  'GradingBand',
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
    grading_scheme_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'grading_schemes', key: 'id' },
    },
    grade_label: { type: DataTypes.STRING(20), allowNull: false },
    min_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    max_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    grade_point: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
    remarks: { type: DataTypes.STRING(120), allowNull: true },
    is_failing: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: 'grading_bands',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['tenant_id', 'grading_scheme_id'],
        name: 'grading_bands_tenant_scheme_idx',
      },
    ],
  }
);

module.exports = GradingBand;
