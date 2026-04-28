const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * Maps a teacher to a specific class + section + subject for a given academic year.
 * One teacher can have many rows (e.g. teaches Math in Class 9-A, Class 10-B, etc.).
 * The legacy `classes.class_teacher_id` column still represents the homeroom class
 * teacher (one-to-one) and is independent from this many-to-many teaching mapping.
 */
const TeacherAcademicAssignment = sequelize.define(
  'TeacherAcademicAssignment',
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
    teacher_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'teachers', key: 'id' },
    },
    academic_year_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'academic_years', key: 'id' },
    },
    class_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'classes', key: 'id' },
    },
    section_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sections', key: 'id' },
    },
    /**
     * Normalized subject reference (preferred).
     * Kept nullable temporarily to allow legacy `subject_name` rows to exist.
     */
    subject_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'subjects', key: 'id' },
    },
    subject_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    tableName: 'teacher_academic_assignments',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: [
          'tenant_id',
          'teacher_id',
          'academic_year_id',
          'class_id',
          'section_id',
          'subject_name',
        ],
        name: 'teacher_assignment_unique',
      },
      {
        unique: true,
        fields: [
          'tenant_id',
          'academic_year_id',
          'class_id',
          'section_id',
          'subject_id',
        ],
        name: 'teacher_assignment_slot_unique',
      },
      {
        fields: ['tenant_id', 'teacher_id', 'academic_year_id'],
        name: 'teacher_assignment_lookup_idx',
      },
      {
        fields: ['tenant_id', 'academic_year_id', 'class_id', 'section_id'],
        name: 'teacher_assignment_class_section_idx',
      },
    ],
  }
);

module.exports = TeacherAcademicAssignment;
