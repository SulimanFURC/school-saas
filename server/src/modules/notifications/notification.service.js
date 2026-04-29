const Notification = require('./notification.model');
const NotificationRead = require('./notificationRead.model');
const User = require('../users/user.model');

/**
 * Centralised in-app notification helpers. Each writer returns the created
 * notification rows; callers should never let a notification failure abort
 * the primary business action.
 */

/**
 * Create one notification targeted at a specific user.
 * Tenant_id is mandatory.
 */
async function notifyUser(tenantId, userId, { title, body, data, transaction } = {}) {
  if (!tenantId || !userId || !title || !body) return null;
  return Notification.create(
    {
      tenant_id: tenantId,
      recipient_user_id: userId,
      title,
      body,
      data_json: data || null,
    },
    { transaction }
  );
}

/**
 * Create one broadcast notification for a role within the tenant. Per-user
 * read state is tracked separately in NotificationRead.
 */
async function notifyRole(tenantId, role, { title, body, data, transaction } = {}) {
  if (!tenantId || !role || !title || !body) return null;
  return Notification.create(
    {
      tenant_id: tenantId,
      recipient_role: role,
      title,
      body,
      data_json: data || null,
    },
    { transaction }
  );
}

/**
 * Create the same notification individually for many users (avoids broadcast).
 * Useful when a list of recipients is computed (e.g. teachers assigned to an exam).
 */
async function notifyUsers(tenantId, userIds, payload, options = {}) {
  if (!tenantId || !Array.isArray(userIds) || userIds.length === 0) return [];
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const rows = unique.map((uid) => ({
    tenant_id: tenantId,
    recipient_user_id: uid,
    title: payload.title,
    body: payload.body,
    data_json: payload.data || null,
  }));
  return Notification.bulkCreate(rows, { transaction: options.transaction });
}

/**
 * Resolve user_ids for all teachers in this tenant whose login user is active.
 * Used for "exam created" / "marks open" notifications.
 */
async function findTeacherUserIds(tenantId, teacherIds = null) {
  const where = { tenant_id: tenantId, role: 'teacher' };
  if (Array.isArray(teacherIds) && teacherIds.length > 0) {
    where.teacher_id = teacherIds;
  }
  const rows = await User.findAll({ where, attributes: ['id'] });
  return rows.map((r) => r.id);
}

/**
 * Resolve user_ids for student logins enrolled in given student_ids list.
 */
async function findStudentUserIds(tenantId, studentIds) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return [];
  const rows = await User.findAll({
    where: { tenant_id: tenantId, role: 'student', student_id: studentIds },
    attributes: ['id'],
  });
  return rows.map((r) => r.id);
}

module.exports = {
  notifyUser,
  notifyUsers,
  notifyRole,
  findTeacherUserIds,
  findStudentUserIds,
  Notification,
  NotificationRead,
};
