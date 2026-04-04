const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const Student = require('./student.model');

const StudentGuardian = sequelize.define(
  'StudentGuardian',
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
    guardian_type: { type: DataTypes.STRING(20), allowNull: true },
    father_name: { type: DataTypes.STRING(100), allowNull: true },
    father_phone: { type: DataTypes.STRING(20), allowNull: true },
    father_occupation: { type: DataTypes.STRING(100), allowNull: true },
    mother_name: { type: DataTypes.STRING(100), allowNull: true },
    mother_occupation: { type: DataTypes.STRING(100), allowNull: true },
    guardian_name: { type: DataTypes.STRING(100), allowNull: true },
    guardian_phone: { type: DataTypes.STRING(20), allowNull: true },
    guardian_occupation: { type: DataTypes.STRING(100), allowNull: true },
    guardian_relation: { type: DataTypes.STRING(100), allowNull: true },
    guardian_address: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'student_guardians',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'student_id'],
        name: 'guardian_student_unique',
      },
    ],
  }
);

StudentGuardian.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
Student.hasOne(StudentGuardian, { foreignKey: 'student_id', as: 'guardian' });

module.exports = StudentGuardian;
