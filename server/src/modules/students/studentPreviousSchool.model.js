const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const Student = require('./student.model');

const StudentPreviousSchool = sequelize.define(
  'StudentPreviousSchool',
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
    school_name: { type: DataTypes.STRING(255), allowNull: true },
    school_address: { type: DataTypes.TEXT, allowNull: true },
    current_school_name: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: 'student_previous_schools',
    timestamps: true,
    underscored: true,
  }
);

StudentPreviousSchool.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
Student.hasOne(StudentPreviousSchool, { foreignKey: 'student_id', as: 'previousSchool' });

module.exports = StudentPreviousSchool;
