const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const Student = require('./student.model');
const AcademicYear = require('../classes/academicYear.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');

const StudentEnrollment = sequelize.define(
  'StudentEnrollment',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tenants', key: 'id' },
    },
    student_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'students', key: 'id' },
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
    roll_number: { type: DataTypes.INTEGER, allowNull: true },
    category: { type: DataTypes.STRING(100), allowNull: true },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'active',
    },
  },
  {
    tableName: 'student_enrollments',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'student_id', 'academic_year_id'],
        name: 'enroll_student_year_unique',
      },
    ],
  }
);

StudentEnrollment.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
Student.hasMany(StudentEnrollment, { foreignKey: 'student_id', as: 'enrollments' });

StudentEnrollment.belongsTo(AcademicYear, { foreignKey: 'academic_year_id', as: 'academicYear' });
StudentEnrollment.belongsTo(SchoolClass, { foreignKey: 'class_id', as: 'schoolClass' });
StudentEnrollment.belongsTo(Section, { foreignKey: 'section_id', as: 'section' });

module.exports = StudentEnrollment;
