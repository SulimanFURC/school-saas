const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const Exam = require('./exam.model');
const ExamClass = require('./examClass.model');
const ExamTimetable = require('./examTimetable.model');
const ExamMark = require('./examMark.model');
const SchoolClass = require('../classes/class.model');
const AcademicYear = require('../classes/academicYear.model');
const TeacherAcademicAssignment = require('../teachers/teacherAcademicAssignment.model');
const Subject = require('../subjects/subject.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const notificationService = require('../notifications/notification.service');
const {
  EXAM_TYPES,
  EXAM_STATUSES,
  EXAM_FULLY_EDITABLE_STATUSES,
  EXAM_END_DATE_ONLY_STATUSES,
} = require('./exam.constants');
const {
  isUuid,
  parsePositiveInt,
  parseGradeLevel,
  isClassAllowedForInternalExam,
  isValidDate,
  deriveLiveStatus,
} = require('./exam.helpers');

function shapeExamRow(exam) {
  if (!exam) return null;
  const plain = exam.get ? exam.get({ plain: true }) : exam;
  return {
    id: plain.id,
    title: plain.title,
    exam_type: plain.exam_type,
    academic_year_id: plain.academic_year_id,
    academicYear: plain.academicYear || null,
    start_date: plain.start_date,
    end_date: plain.end_date,
    status: plain.status,
    live_status: deriveLiveStatus(plain.status, plain.start_date, plain.end_date),
    is_internal: plain.is_internal,
    timetable_finalized_at: plain.timetable_finalized_at,
    published_at: plain.published_at,
    archived_at: plain.archived_at,
    recheck_window_days: plain.recheck_window_days,
    recheck_open: plain.recheck_open,
    classes: Array.isArray(plain.classes)
      ? plain.classes.map((c) => ({
          id: c.id,
          class_id: c.class_id,
          class_name: c.schoolClass ? c.schoolClass.name : null,
          grade_level: c.grade_level,
        }))
      : undefined,
  };
}

function validateExamPayload(body) {
  const out = {};
  const title = body && body.title != null ? String(body.title).trim() : '';
  if (!title) return { ok: false, message: 'Title is required' };
  if (title.length > 150) return { ok: false, message: 'Title is too long' };
  out.title = title;

  const examType = body && body.exam_type != null ? String(body.exam_type).trim() : '';
  if (!EXAM_TYPES.includes(examType)) {
    return { ok: false, message: `Invalid exam_type. Allowed: ${EXAM_TYPES.join(', ')}` };
  }
  out.exam_type = examType;

  const academicYearId = parsePositiveInt(body && body.academic_year_id);
  if (!academicYearId) return { ok: false, message: 'academic_year_id is required' };
  out.academic_year_id = academicYearId;

  const start = body && body.start_date != null ? String(body.start_date).trim() : '';
  const end = body && body.end_date != null ? String(body.end_date).trim() : '';
  if (!isValidDate(start)) return { ok: false, message: 'start_date must be YYYY-MM-DD' };
  if (!isValidDate(end)) return { ok: false, message: 'end_date must be YYYY-MM-DD' };
  if (end < start) return { ok: false, message: 'end_date must be on or after start_date' };
  out.start_date = start;
  out.end_date = end;

  if (body && Object.prototype.hasOwnProperty.call(body, 'is_internal')) {
    out.is_internal = body.is_internal !== false;
  } else {
    out.is_internal = true;
  }

  const recheckDays = parsePositiveInt(body && body.recheck_window_days);
  if (recheckDays) out.recheck_window_days = recheckDays;

  return { ok: true, value: out };
}

async function loadExamWithClasses(tenantId, id, transaction) {
  return Exam.findOne({
    where: { id, tenant_id: tenantId },
    include: [
      { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name', 'is_active'] },
      {
        model: ExamClass,
        as: 'classes',
        required: false,
        include: [{ model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] }],
      },
    ],
    transaction,
  });
}

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const where = { tenant_id: tenantId };

    const yearId = parsePositiveInt(req.query.academic_year_id);
    if (yearId) where.academic_year_id = yearId;

    const status = req.query.status ? String(req.query.status).trim() : '';
    if (status && EXAM_STATUSES.includes(status)) {
      where.status = status;
    }

    const includeArchived = String(req.query.include_archived || '').toLowerCase() === 'true';
    if (!includeArchived) {
      where.status = where.status ? where.status : { [Op.ne]: 'archived' };
    }

    const q = req.query.q != null ? String(req.query.q).trim() : '';
    if (q) {
      where.title = { [Op.iLike]: `%${q}%` };
    }

    const rows = await Exam.findAll({
      where,
      include: [
        { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name', 'is_active'] },
        {
          model: ExamClass,
          as: 'classes',
          required: false,
          include: [{ model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] }],
        },
      ],
      order: [['start_date', 'DESC'], ['created_at', 'DESC']],
    });

    res.status(200).json({ data: rows.map(shapeExamRow) });
  } catch (err) {
    console.error('exams.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid id' });
    const exam = await loadExamWithClasses(tenantId, id);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.status(200).json({ data: shapeExamRow(exam) });
  } catch (err) {
    console.error('exams.getById error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const validation = validateExamPayload(req.body || {});
    if (!validation.ok) {
      await t.rollback();
      return res.status(400).json({ message: validation.message });
    }
    const v = validation.value;

    const year = await AcademicYear.findOne({
      where: { id: v.academic_year_id, tenant_id: tenantId },
      transaction: t,
    });
    if (!year) {
      await t.rollback();
      return res.status(404).json({ message: 'Academic year not found' });
    }

    const exam = await Exam.create(
      {
        tenant_id: tenantId,
        title: v.title,
        exam_type: v.exam_type,
        academic_year_id: v.academic_year_id,
        start_date: v.start_date,
        end_date: v.end_date,
        is_internal: v.is_internal,
        status: 'draft',
        created_by_user_id: req.user.userId,
        recheck_window_days: v.recheck_window_days || 7,
      },
      { transaction: t }
    );

    const requestedClassIds = Array.isArray(req.body && req.body.class_ids)
      ? req.body.class_ids.map((x) => parsePositiveInt(x)).filter(Boolean)
      : [];
    if (requestedClassIds.length > 0) {
      const result = await applyExamClasses(tenantId, exam, requestedClassIds, t);
      if (!result.ok) {
        await t.rollback();
        return res.status(result.status).json({ message: result.message });
      }
    }

    await t.commit();

    notifyExamCreated(tenantId, exam).catch((err) =>
      console.error('exams.notifyExamCreated error:', err)
    );

    const reloaded = await loadExamWithClasses(tenantId, exam.id);
    res.status(201).json({ message: 'Exam created', data: shapeExamRow(reloaded) });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('exams.create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Replace the set of classes assigned to an exam. Performs:
 *  - tenant-scoped lookup of all class_ids
 *  - validates board-class restriction for internal exams
 *  - removes detached classes (rejecting if marks already exist)
 *  - inserts new ones with cached grade_level
 */
async function applyExamClasses(tenantId, exam, classIds, transaction) {
  const dedup = [...new Set(classIds.map((x) => parsePositiveInt(x)).filter(Boolean))];
  if (dedup.length === 0) {
    return { ok: false, status: 400, message: 'class_ids must contain at least one entry' };
  }

  const classes = await SchoolClass.findAll({
    where: { id: dedup, tenant_id: tenantId },
    transaction,
  });
  if (classes.length !== dedup.length) {
    return { ok: false, status: 400, message: 'One or more class_ids are invalid for this tenant' };
  }

  if (exam.is_internal) {
    const offending = classes
      .filter((c) => !isClassAllowedForInternalExam(c.name))
      .map((c) => c.name);
    if (offending.length > 0) {
      return {
        ok: false,
        status: 400,
        message: `Internal exams are not allowed for board classes: ${offending.join(', ')}`,
      };
    }
  }

  const existing = await ExamClass.findAll({
    where: { tenant_id: tenantId, exam_id: exam.id },
    transaction,
  });
  const existingByClassId = new Map(existing.map((row) => [row.class_id, row]));

  const desired = new Set(dedup);
  const toRemove = existing.filter((row) => !desired.has(row.class_id));

  if (toRemove.length > 0) {
    const removeClassIds = toRemove.map((r) => r.class_id);
    const ttRows = await ExamTimetable.findAll({
      where: { tenant_id: tenantId, exam_id: exam.id, class_id: removeClassIds },
      attributes: ['id'],
      transaction,
    });
    if (ttRows.length > 0) {
      const ttIds = ttRows.map((r) => r.id);
      const markCount = await ExamMark.count({
        where: { tenant_id: tenantId, exam_timetable_id: ttIds },
        transaction,
      });
      if (markCount > 0) {
        return {
          ok: false,
          status: 409,
          message:
            'Cannot remove class: marks already entered. Archive the exam or delete those entries first.',
        };
      }
      await ExamTimetable.destroy({
        where: { tenant_id: tenantId, exam_id: exam.id, class_id: removeClassIds },
        transaction,
      });
    }
    await ExamClass.destroy({
      where: { tenant_id: tenantId, exam_id: exam.id, class_id: removeClassIds },
      transaction,
    });
  }

  const toAdd = classes
    .filter((c) => !existingByClassId.has(c.id))
    .map((c) => ({
      tenant_id: tenantId,
      exam_id: exam.id,
      class_id: c.id,
      grade_level: parseGradeLevel(c.name),
    }));
  if (toAdd.length > 0) {
    await ExamClass.bulkCreate(toAdd, { transaction });
  }

  return { ok: true };
}

exports.setClasses = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid id' });
    }
    const exam = await Exam.findOne({ where: { id, tenant_id: tenantId }, transaction: t });
    if (!exam) {
      await t.rollback();
      return res.status(404).json({ message: 'Exam not found' });
    }
    if (!EXAM_FULLY_EDITABLE_STATUSES.has(exam.status)) {
      await t.rollback();
      return res.status(409).json({
        message: 'Class selection can only be edited while the exam is draft or scheduled',
      });
    }
    const requested = Array.isArray(req.body && req.body.class_ids) ? req.body.class_ids : [];
    const result = await applyExamClasses(tenantId, exam, requested, t);
    if (!result.ok) {
      await t.rollback();
      return res.status(result.status).json({ message: result.message });
    }
    await t.commit();
    const reloaded = await loadExamWithClasses(tenantId, exam.id);
    res.status(200).json({ message: 'Classes updated', data: shapeExamRow(reloaded) });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('exams.setClasses error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid id' });
    }
    const exam = await Exam.findOne({ where: { id, tenant_id: tenantId }, transaction: t });
    if (!exam) {
      await t.rollback();
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (exam.status === 'archived') {
      await t.rollback();
      return res.status(409).json({ message: 'Archived exams cannot be edited' });
    }

    const body = req.body || {};
    const patch = {};

    if (EXAM_FULLY_EDITABLE_STATUSES.has(exam.status)) {
      if (Object.prototype.hasOwnProperty.call(body, 'title')) {
        const title = String(body.title || '').trim();
        if (!title) {
          await t.rollback();
          return res.status(400).json({ message: 'Title is required' });
        }
        patch.title = title;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'exam_type')) {
        const examType = String(body.exam_type || '').trim();
        if (!EXAM_TYPES.includes(examType)) {
          await t.rollback();
          return res.status(400).json({ message: `Invalid exam_type` });
        }
        patch.exam_type = examType;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'academic_year_id')) {
        const yid = parsePositiveInt(body.academic_year_id);
        if (!yid) {
          await t.rollback();
          return res.status(400).json({ message: 'Invalid academic_year_id' });
        }
        const year = await AcademicYear.findOne({
          where: { id: yid, tenant_id: tenantId },
          transaction: t,
        });
        if (!year) {
          await t.rollback();
          return res.status(404).json({ message: 'Academic year not found' });
        }
        patch.academic_year_id = yid;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'start_date')) {
        const start = String(body.start_date || '').trim();
        if (!isValidDate(start)) {
          await t.rollback();
          return res.status(400).json({ message: 'start_date must be YYYY-MM-DD' });
        }
        patch.start_date = start;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'is_internal')) {
        patch.is_internal = body.is_internal !== false;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'recheck_window_days')) {
        const v = parsePositiveInt(body.recheck_window_days);
        if (!v) {
          await t.rollback();
          return res.status(400).json({ message: 'recheck_window_days must be positive' });
        }
        patch.recheck_window_days = v;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'recheck_open')) {
        patch.recheck_open = !!body.recheck_open;
      }
    } else if (EXAM_END_DATE_ONLY_STATUSES.has(exam.status)) {
      const allowedKeys = ['end_date', 'recheck_window_days', 'recheck_open'];
      for (const k of Object.keys(body)) {
        if (!allowedKeys.includes(k)) {
          await t.rollback();
          return res.status(409).json({
            message: `Only end_date and recheck settings may be edited once the exam is ${exam.status}`,
          });
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'recheck_open')) {
        patch.recheck_open = !!body.recheck_open;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'recheck_window_days')) {
        const v = parsePositiveInt(body.recheck_window_days);
        if (!v) {
          await t.rollback();
          return res.status(400).json({ message: 'recheck_window_days must be positive' });
        }
        patch.recheck_window_days = v;
      }
    } else if (exam.status === 'published') {
      const allowedKeys = ['recheck_window_days', 'recheck_open'];
      for (const k of Object.keys(body)) {
        if (!allowedKeys.includes(k)) {
          await t.rollback();
          return res.status(409).json({
            message: 'Published exams allow editing recheck settings only',
          });
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'recheck_open')) {
        patch.recheck_open = !!body.recheck_open;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'recheck_window_days')) {
        const v = parsePositiveInt(body.recheck_window_days);
        if (!v) {
          await t.rollback();
          return res.status(400).json({ message: 'recheck_window_days must be positive' });
        }
        patch.recheck_window_days = v;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'end_date')) {
      const end = String(body.end_date || '').trim();
      if (!isValidDate(end)) {
        await t.rollback();
        return res.status(400).json({ message: 'end_date must be YYYY-MM-DD' });
      }
      const startCandidate = patch.start_date || exam.start_date;
      if (end < startCandidate) {
        await t.rollback();
        return res.status(400).json({ message: 'end_date must be on or after start_date' });
      }
      patch.end_date = end;
    }

    if (Object.keys(patch).length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'No updatable fields supplied' });
    }

    await exam.update(patch, { transaction: t });

    if (
      EXAM_FULLY_EDITABLE_STATUSES.has(exam.status) &&
      Array.isArray(body.class_ids)
    ) {
      const result = await applyExamClasses(tenantId, exam, body.class_ids, t);
      if (!result.ok) {
        await t.rollback();
        return res.status(result.status).json({ message: result.message });
      }
    }

    await t.commit();
    const reloaded = await loadExamWithClasses(tenantId, exam.id);
    res.status(200).json({ message: 'Exam updated', data: shapeExamRow(reloaded) });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('exams.update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.transition = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid id' });
    const target = req.body && req.body.status ? String(req.body.status).trim() : '';
    if (!EXAM_STATUSES.includes(target)) {
      return res.status(400).json({ message: 'Invalid target status' });
    }
    const exam = await Exam.findOne({ where: { id, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const allowed = {
      draft: new Set(['scheduled', 'archived']),
      scheduled: new Set(['ongoing', 'archived']),
      ongoing: new Set(['result_pending', 'archived']),
      result_pending: new Set(['published', 'archived']),
      published: new Set(['archived']),
      archived: new Set(),
    };
    if (!allowed[exam.status] || !allowed[exam.status].has(target)) {
      return res.status(409).json({
        message: `Cannot transition from ${exam.status} to ${target}`,
      });
    }

    if (target === 'scheduled') {
      const classCount = await ExamClass.count({
        where: { tenant_id: tenantId, exam_id: exam.id },
      });
      if (classCount === 0) {
        return res.status(409).json({
          message: 'Select at least one class before scheduling the exam',
        });
      }
    }

    const patch = { status: target };
    if (target === 'archived') patch.archived_at = new Date();

    await exam.update(patch);
    res.status(200).json({ message: 'Status updated', data: shapeExamRow(exam) });
  } catch (err) {
    console.error('exams.transition error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.archive = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid id' });
    const exam = await Exam.findOne({ where: { id, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status === 'archived') {
      return res.status(200).json({ message: 'Already archived', data: shapeExamRow(exam) });
    }
    await exam.update({ status: 'archived', archived_at: new Date() });
    res.status(200).json({ message: 'Exam archived', data: shapeExamRow(exam) });
  } catch (err) {
    console.error('exams.archive error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.clone = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid id' });
    }
    const original = await Exam.findOne({
      where: { id, tenant_id: tenantId },
      include: [{ model: ExamClass, as: 'classes', required: false }],
      transaction: t,
    });
    if (!original) {
      await t.rollback();
      return res.status(404).json({ message: 'Exam not found' });
    }

    const body = req.body || {};
    const validation = validateExamPayload({
      title: body.title || `${original.title} (Copy)`,
      exam_type: body.exam_type || original.exam_type,
      academic_year_id: body.academic_year_id || original.academic_year_id,
      start_date: body.start_date || original.start_date,
      end_date: body.end_date || original.end_date,
      is_internal: Object.prototype.hasOwnProperty.call(body, 'is_internal')
        ? body.is_internal
        : original.is_internal,
      recheck_window_days: original.recheck_window_days,
    });
    if (!validation.ok) {
      await t.rollback();
      return res.status(400).json({ message: validation.message });
    }
    const v = validation.value;

    const cloned = await Exam.create(
      {
        tenant_id: tenantId,
        title: v.title,
        exam_type: v.exam_type,
        academic_year_id: v.academic_year_id,
        start_date: v.start_date,
        end_date: v.end_date,
        is_internal: v.is_internal,
        status: 'draft',
        created_by_user_id: req.user.userId,
        recheck_window_days: v.recheck_window_days || original.recheck_window_days,
      },
      { transaction: t }
    );

    const sourceClassIds = (original.classes || []).map((c) => c.class_id);
    if (sourceClassIds.length > 0) {
      const result = await applyExamClasses(tenantId, cloned, sourceClassIds, t);
      if (!result.ok) {
        await t.rollback();
        return res.status(result.status).json({ message: result.message });
      }
    }

    await t.commit();
    const reloaded = await loadExamWithClasses(tenantId, cloned.id);
    res.status(201).json({ message: 'Exam cloned', data: shapeExamRow(reloaded) });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('exams.clone error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Notify all teachers whose academic-year assignments overlap the exam classes.
 * Best-effort; never throws to the caller.
 */
async function notifyExamCreated(tenantId, exam) {
  const examClasses = await ExamClass.findAll({
    where: { tenant_id: tenantId, exam_id: exam.id },
    attributes: ['class_id'],
  });
  const classIds = examClasses.map((c) => c.class_id);
  if (classIds.length === 0) return;

  const assignments = await TeacherAcademicAssignment.findAll({
    where: {
      tenant_id: tenantId,
      academic_year_id: exam.academic_year_id,
      class_id: classIds,
    },
    attributes: ['teacher_id'],
  });
  const teacherIds = [...new Set(assignments.map((a) => a.teacher_id))];
  if (teacherIds.length === 0) return;

  const userIds = await notificationService.findTeacherUserIds(tenantId, teacherIds);
  if (userIds.length === 0) return;

  await notificationService.notifyUsers(tenantId, userIds, {
    title: `New exam: ${exam.title}`,
    body: `An exam (${exam.exam_type}) has been scheduled from ${exam.start_date} to ${exam.end_date}.`,
    data: { exam_id: exam.id, kind: 'exam.created' },
  });
}

module.exports.applyExamClasses = applyExamClasses;
module.exports.shapeExamRow = shapeExamRow;
module.exports.loadExamWithClasses = loadExamWithClasses;
