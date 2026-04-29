const AuditLog = require('./auditLog.model');

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
  return AuditLog.create(
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
}

module.exports = {
  recordAudit,
};
