const StudentPromotion = require('./studentPromotion.model');
const StudentEnrollment = require('./studentEnrollment.model');
const StudentGuardian = require('./studentGuardian.model');
const StudentPreviousSchool = require('./studentPreviousSchool.model');
const StudentDocument = require('./studentDocument.model');
const User = require('../users/user.model');

async function deleteStudentAggregate({ tenantId, studentId, student, transaction }) {
  await StudentPromotion.destroy({ where: { tenant_id: tenantId, student_id: studentId }, transaction });
  await StudentEnrollment.destroy({ where: { tenant_id: tenantId, student_id: studentId }, transaction });
  await StudentGuardian.destroy({ where: { tenant_id: tenantId, student_id: studentId }, transaction });
  await StudentPreviousSchool.destroy({ where: { tenant_id: tenantId, student_id: studentId }, transaction });
  await StudentDocument.destroy({ where: { tenant_id: tenantId, student_id: studentId }, transaction });
  await User.destroy({ where: { student_id: studentId, tenant_id: tenantId }, transaction });
  await student.destroy({ transaction });
}

module.exports = {
  deleteStudentAggregate,
};
