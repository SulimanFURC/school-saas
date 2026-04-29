const { Op } = require('sequelize');
const User = require('../users/user.model');

async function createTeacherLogin({
  tenantId,
  teacherId,
  displayName,
  username,
  passwordHash,
  accountStatus,
  email,
  transaction,
}) {
  return User.create(
    {
      tenant_id: tenantId,
      name: displayName,
      email,
      username,
      password: passwordHash,
      role: 'teacher',
      status: accountStatus,
      teacher_id: teacherId,
      student_id: null,
    },
    { transaction }
  );
}

async function syncTeacherLogin({
  tenantId,
  teacherId,
  loginUserId,
  accountStatus,
  firstName,
  lastName,
  email,
  transaction,
}) {
  const loginUser = await User.findOne({
    where: { teacher_id: teacherId, tenant_id: tenantId },
    transaction,
  });
  if (!loginUser) return null;
  const updates = {};
  if (accountStatus === 'inactive' || accountStatus === 'active') {
    updates.status = accountStatus;
  }
  if (firstName != null || lastName != null) {
    updates.name = `${firstName || ''} ${lastName || ''}`.trim();
  }
  if (email) {
    const where = { tenant_id: tenantId, email };
    if (loginUserId) where.id = { [Op.ne]: loginUserId };
    const dup = await User.findOne({ where, transaction });
    updates.email = dup ? null : email;
  }
  await loginUser.update(updates, { transaction });
  return loginUser;
}

module.exports = {
  createTeacherLogin,
  syncTeacherLogin,
};
