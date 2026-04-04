const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const Student = require('./student.model');

const StudentDocument = sequelize.define(
  'StudentDocument',
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
    file_name: { type: DataTypes.STRING(255), allowNull: false },
    file_url: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: 'student_documents',
    timestamps: true,
    underscored: true,
  }
);

StudentDocument.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
Student.hasMany(StudentDocument, { foreignKey: 'student_id', as: 'documents' });

module.exports = StudentDocument;
