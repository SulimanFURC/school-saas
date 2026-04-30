const { Op, where, cast, col } = require('sequelize');

const User = require('../users/user.model');
const AuditLog = require('./auditLog.model');
const ExamMarkAudit = require('../exams/examMarkAudit.model');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseDateStart(value) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateEnd(value) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function createdAtClause(from, to) {
  if (!from && !to) return undefined;
  if (from && to) return { [Op.between]: [from, to] };
  if (from) return { [Op.gte]: from };
  return { [Op.lte]: to };
}

function toGenericAuditDto(row) {
  const plain = row.get({ plain: true });
  return {
    id: plain.id,
    source: 'audit_logs',
    entityType: plain.entity_type,
    entityId: plain.entity_id,
    action: plain.action,
    before: plain.before_json,
    after: plain.after_json,
    metadata: plain.metadata_json,
    actorUserId: plain.actor_user_id,
    createdAt: plain.created_at,
  };
}

function toExamAuditDto(row) {
  const plain = row.get({ plain: true });
  return {
    id: plain.id,
    source: 'exam_mark_audits',
    entityType: 'exam_mark',
    entityId: plain.exam_mark_id || plain.student_id,
    action: plain.action,
    before: plain.before_json,
    after: plain.after_json,
    metadata: {
      exam_mark_id: plain.exam_mark_id,
      exam_timetable_id: plain.exam_timetable_id,
      student_id: plain.student_id,
      reason: plain.reason || null,
    },
    actorUserId: plain.actor_user_id,
    createdAt: plain.created_at,
  };
}

exports.listUnifiedAuditLogs = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(MAX_LIMIT, parsePositiveInt(req.query.limit, DEFAULT_LIMIT));
    const offset = (page - 1) * limit;
    const fetchLimit = Math.min(MAX_LIMIT * 5, page * limit);

    const q = String(req.query.q ?? '').trim();
    const action = String(req.query.action ?? '').trim();
    const entityType = String(req.query.entityType ?? '').trim();
    const actorUserId = String(req.query.actorUserId ?? '').trim();
    const from = parseDateStart(req.query.from);
    const to = parseDateEnd(req.query.to);

    const createdAt = createdAtClause(from, to);

    const genericWhere = { tenant_id: tenantId };
    const examWhere = { tenant_id: tenantId };

    if (createdAt) {
      genericWhere.created_at = createdAt;
      examWhere.created_at = createdAt;
    }

    if (actorUserId) {
      genericWhere.actor_user_id = actorUserId;
      examWhere.actor_user_id = actorUserId;
    }

    let includeGeneric = true;
    let includeExam = true;
    if (entityType) {
      if (entityType === 'exam_mark') {
        includeGeneric = false;
      } else {
        includeExam = false;
        genericWhere.entity_type = entityType;
      }
    }

    if (action) {
      genericWhere.action = action;
      examWhere.action = action;
    }

    if (q) {
      const like = `%${q}%`;
      genericWhere[Op.or] = [
        { entity_type: { [Op.iLike]: like } },
        { entity_id: { [Op.iLike]: like } },
        { action: { [Op.iLike]: like } },
        where(cast(col('before_json'), 'TEXT'), { [Op.iLike]: like }),
        where(cast(col('after_json'), 'TEXT'), { [Op.iLike]: like }),
        where(cast(col('metadata_json'), 'TEXT'), { [Op.iLike]: like }),
      ];
      examWhere[Op.or] = [
        { exam_mark_id: { [Op.iLike]: like } },
        { exam_timetable_id: { [Op.iLike]: like } },
        { student_id: { [Op.iLike]: like } },
        { action: { [Op.iLike]: like } },
        { reason: { [Op.iLike]: like } },
        where(cast(col('before_json'), 'TEXT'), { [Op.iLike]: like }),
        where(cast(col('after_json'), 'TEXT'), { [Op.iLike]: like }),
      ];
    }

    const [
      genericCount,
      examCount,
      genericRows,
      examRows,
    ] = await Promise.all([
      includeGeneric ? AuditLog.count({ where: genericWhere }) : Promise.resolve(0),
      includeExam ? ExamMarkAudit.count({ where: examWhere }) : Promise.resolve(0),
      includeGeneric
        ? AuditLog.findAll({
            where: genericWhere,
            order: [['created_at', 'DESC']],
            limit: fetchLimit,
          })
        : Promise.resolve([]),
      includeExam
        ? ExamMarkAudit.findAll({
            where: examWhere,
            order: [['created_at', 'DESC']],
            limit: fetchLimit,
          })
        : Promise.resolve([]),
    ]);

    const merged = [
      ...genericRows.map(toGenericAuditDto),
      ...examRows.map(toExamAuditDto),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pageRows = merged.slice(offset, offset + limit);
    const actorIds = [...new Set(pageRows.map((r) => r.actorUserId).filter(Boolean))];
    const actors = actorIds.length
      ? await User.findAll({
          where: { id: actorIds, tenant_id: tenantId },
          attributes: ['id', 'name', 'role'],
        })
      : [];
    const actorMap = new Map(actors.map((u) => [u.id, u.get({ plain: true })]));

    const data = pageRows.map((row) => ({
      ...row,
      actor: row.actorUserId
        ? (actorMap.get(row.actorUserId) ?? null)
        : null,
    }));

    return res.status(200).json({
      data,
      total: genericCount + examCount,
      page,
      limit,
    });
  } catch (err) {
    console.error('audit.listUnifiedAuditLogs error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
