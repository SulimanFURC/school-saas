const AuditLog = require('./auditLog.model');
const logger = require('../../core/logger/logger');

async function recordAudit({
  tenantId,
  actorUserId = null,
  entityType,
  entityId,
  action,
  before = null,
  after = null,
  metadata = null,
  transaction,
}) {
  if (!tenantId || !entityType || !entityId || !action) {
    return null;
  }
  try {
    return await AuditLog.create(
      {
        tenant_id: tenantId,
        actor_user_id: actorUserId,
        entity_type: entityType,
        entity_id: String(entityId),
        action,
        before_json: before,
        after_json: after,
        metadata_json: metadata,
      },
      transaction ? { transaction } : undefined
    );
  } catch (err) {
    // Keep core workflows running even if audit schema migration has not been applied yet.
    if (err?.name === 'SequelizeDatabaseError' && err?.original?.code === '42P01') {
      logger.warn({ err }, 'recordAudit skipped: audit_logs relation missing');
      return null;
    }
    throw err;
  }
}

module.exports = {
  recordAudit,
};
