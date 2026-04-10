const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');
const Student = require('./student.model');
const AcademicYear = require('../classes/academicYear.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const User = require('../users/user.model');

const StudentPromotion = sequelize.define(
  'StudentPromotion',
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
    from_academic_year_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'academic_years', key: 'id' },
    },
    to_academic_year_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'academic_years', key: 'id' },
    },
    from_class_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'classes', key: 'id' },
    },
    to_class_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'classes', key: 'id' },
    },
    from_section_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sections', key: 'id' },
    },
    to_section_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'sections', key: 'id' },
    },
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    created_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    tableName: 'student_promotions',
    timestamps: true,
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['tenant_id', 'student_id'], name: 'promotions_tenant_student_idx' },
      { fields: ['tenant_id', 'to_academic_year_id'], name: 'promotions_tenant_to_year_idx' },
    ],
  }
);

StudentPromotion.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
StudentPromotion.belongsTo(AcademicYear, { foreignKey: 'from_academic_year_id', as: 'fromYear' });
StudentPromotion.belongsTo(AcademicYear, { foreignKey: 'to_academic_year_id', as: 'toYear' });
StudentPromotion.belongsTo(SchoolClass, { foreignKey: 'from_class_id', as: 'fromClass' });
StudentPromotion.belongsTo(SchoolClass, { foreignKey: 'to_class_id', as: 'toClass' });
StudentPromotion.belongsTo(Section, { foreignKey: 'from_section_id', as: 'fromSection' });
StudentPromotion.belongsTo(Section, { foreignKey: 'to_section_id', as: 'toSection' });
StudentPromotion.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdBy' });

module.exports = StudentPromotion;
