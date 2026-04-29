const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const Exam = require('./exam.model');
const ExamClass = require('./examClass.model');
const ExamTimetable = require('./examTimetable.model');
const ExamMark = require('./examMark.model');
const SchoolClass = require('../classes/class.model');
const Subject = require('../subjects/subject.model');
const TeacherAcademicAssignment = require('../teachers/teacherAcademicAssignment.model');
const notificationService = require('../notifications/notification.service');
const {
  EXAM_FULLY_EDITABLE_STATUSES,
  EXAM_END_DATE_ONLY_STATUSES,
} = require('./exam.constants');
const {
  isUuid,
  parsePositiveInt,
  isValidDate,
  isValidTime,
  timeRangesOverlap,
} = require('./exam.helpers');

function shapeTimetableRow(row) {
  if (!row) return null;
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: plain.id,
    exam_id: plain.exam_id,
    class_id: plain.class_id,
    class_name: plain.schoolClass ? plain.schoolClass.name : null,
    subject_id: plain.subject_id,
    subject_name: plain.subject ? plain.subject.name : null,
    exam_date: plain.exam_date,
    start_time: plain.start_time,
    end_time: plain.end_time,
    room: plain.room,
    total_marks: Number(plain.total_marks),
    passing_marks: Number(plain.passing_marks),
    is_locked: !!plain.is_locked,
    locked_at: plain.locked_at,
    deadline_at: plain.deadline_at,
  };
}

function validateTimetableEntry(input) {
  const out = {};
  const classId = parsePositiveInt(input && input.class_id);
  if (!classId) return { ok: false, message: 'class_id is required' };
  out.class_id = classId;

  const subjectId = parsePositiveInt(input && input.subject_id);
  if (!subjectId) return { ok: false, message: 'subject_id is required' };
  out.subject_id = subjectId;

  const date = input && input.exam_date != null ? String(input.exam_date).trim() : '';
  if (!isValidDate(date)) return { ok: false, message: 'exam_date must be YYYY-MM-DD' };
  out.exam_date = date;

  const start = input && input.start_time != null ? String(input.start_time).trim() : '';
  const end = input && input.end_time != null ? String(input.end_time).trim() : '';
  if (!isValidTime(start)) return { ok: false, message: 'start_time must be HH:MM' };
  if (!isValidTime(end)) return { ok: false, message: 'end_time must be HH:MM' };
  if (start >= end) return { ok: false, message: 'end_time must be after start_time' };
  out.start_time = start;
  out.end_time = end;

  const total = parsePositiveInt(input && input.total_marks);
  if (!total) return { ok: false, message: 'total_marks must be a positive integer' };
  out.total_marks = total;

  const passing = input && input.passing_marks != null ? parseInt(input.passing_marks, 10) : NaN;
  if (!Number.isFinite(passing) || passing < 0 || passing > total) {
    return {
      ok: false,
      message: 'passing_marks must be between 0 and total_marks',
    };
  }
  out.passing_marks = passing;

  const room = input && input.room != null ? String(input.room).trim() : '';
  out.room = room ? room.slice(0, 60) : null;

  if (input && Object.prototype.hasOwnProperty.call(input, 'deadline_at')) {
    if (input.deadline_at) {
      const d = new Date(input.deadline_at);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, message: 'deadline_at must be a valid date' };
      }
      out.deadline_at = d;
    } else {
      out.deadline_at = null;
    }
  }
  return { ok: true, value: out };
}

async function ensureExam(tenantId, examId, transaction) {
  if (!isUuid(examId)) return { ok: false, status: 400, message: 'Invalid exam id' };
  const exam = await Exam.findOne({
    where: { id: examId, tenant_id: tenantId },
    transaction,
  });
  if (!exam) return { ok: false, status: 404, message: 'Exam not found' };
  return { ok: true, exam };
}

async function ensureClassInExam(tenantId, examId, classId, transaction) {
  const ec = await ExamClass.findOne({
    where: { tenant_id: tenantId, exam_id: examId, class_id: classId },
    transaction,
  });
  if (!ec) {
    return {
      ok: false,
      status: 400,
      message: 'class is not part of this exam — add it via /exams/:id/classes first',
    };
  }
  return { ok: true };
}

async function detectClassConflict(tenantId, examId, entry, ignoreId, transaction) {
  const existing = await ExamTimetable.findAll({
    where: {
      tenant_id: tenantId,
      exam_id: examId,
      class_id: entry.class_id,
      exam_date: entry.exam_date,
      ...(ignoreId ? { id: { [Op.ne]: ignoreId } } : {}),
    },
    transaction,
  });
  for (const row of existing) {
    if (
      timeRangesOverlap(entry.start_time, entry.end_time, row.start_time, row.end_time)
    ) {
      return {
        conflict: true,
        message: `Time conflict on ${entry.exam_date} ${entry.start_time}-${entry.end_time} with another paper for this class`,
      };
    }
  }
  return { conflict: false };
}

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ensure = await ensureExam(tenantId, examId);
    if (!ensure.ok) return res.status(ensure.status).json({ message: ensure.message });

    const where = { tenant_id: tenantId, exam_id: examId };
    const classId = parsePositiveInt(req.query.class_id);
    if (classId) where.class_id = classId;

    const rows = await ExamTimetable.findAll({
      where,
      include: [
        { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
      ],
      order: [
        ['exam_date', 'ASC'],
        ['start_time', 'ASC'],
        [{ model: SchoolClass, as: 'schoolClass' }, 'name', 'ASC'],
      ],
    });

    res.status(200).json({
      data: rows.map(shapeTimetableRow),
      exam: {
        id: ensure.exam.id,
        status: ensure.exam.status,
        timetable_finalized_at: ensure.exam.timetable_finalized_at,
      },
    });
  } catch (err) {
    console.error('examTimetable.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ensure = await ensureExam(tenantId, examId, t);
    if (!ensure.ok) {
      await t.rollback();
      return res.status(ensure.status).json({ message: ensure.message });
    }
    const exam = ensure.exam;
    if (!EXAM_FULLY_EDITABLE_STATUSES.has(exam.status)) {
      await t.rollback();
      return res.status(409).json({
        message: 'Timetable can only be edited while the exam is draft or scheduled',
      });
    }

    const validation = validateTimetableEntry(req.body || {});
    if (!validation.ok) {
      await t.rollback();
      return res.status(400).json({ message: validation.message });
    }
    const v = validation.value;

    if (v.exam_date < exam.start_date || v.exam_date > exam.end_date) {
      await t.rollback();
      return res.status(400).json({
        message: `exam_date must fall within ${exam.start_date} and ${exam.end_date}`,
      });
    }

    const inExam = await ensureClassInExam(tenantId, examId, v.class_id, t);
    if (!inExam.ok) {
      await t.rollback();
      return res.status(inExam.status).json({ message: inExam.message });
    }

    const subject = await Subject.findOne({
      where: { id: v.subject_id, tenant_id: tenantId },
      transaction: t,
    });
    if (!subject || !subject.is_active) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid or inactive subject' });
    }

    const conflict = await detectClassConflict(tenantId, examId, v, null, t);
    if (conflict.conflict) {
      await t.rollback();
      return res.status(409).json({ message: conflict.message });
    }

    let row;
    try {
      row = await ExamTimetable.create(
        {
          tenant_id: tenantId,
          exam_id: examId,
          class_id: v.class_id,
          subject_id: v.subject_id,
          exam_date: v.exam_date,
          start_time: v.start_time,
          end_time: v.end_time,
          room: v.room,
          total_marks: v.total_marks,
          passing_marks: v.passing_marks,
          deadline_at: v.deadline_at || null,
        },
        { transaction: t }
      );
    } catch (createErr) {
      if (createErr && createErr.name === 'SequelizeUniqueConstraintError') {
        await t.rollback();
        return res.status(409).json({
          message: 'A paper for this subject already exists in this exam for this class',
        });
      }
      throw createErr;
    }

    await t.commit();
    const reloaded = await ExamTimetable.findOne({
      where: { id: row.id, tenant_id: tenantId },
      include: [
        { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
      ],
    });
    res.status(201).json({ message: 'Paper added', data: shapeTimetableRow(reloaded) });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('examTimetable.create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const entryId = req.params.entryId;
    if (!isUuid(entryId)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid entry id' });
    }
    const ensure = await ensureExam(tenantId, examId, t);
    if (!ensure.ok) {
      await t.rollback();
      return res.status(ensure.status).json({ message: ensure.message });
    }
    const exam = ensure.exam;
    const row = await ExamTimetable.findOne({
      where: { id: entryId, tenant_id: tenantId, exam_id: examId },
      transaction: t,
    });
    if (!row) {
      await t.rollback();
      return res.status(404).json({ message: 'Paper not found' });
    }

    if (!EXAM_FULLY_EDITABLE_STATUSES.has(exam.status)) {
      const allowed = ['deadline_at', 'is_locked', 'room'];
      for (const key of Object.keys(req.body || {})) {
        if (!allowed.includes(key)) {
          await t.rollback();
          return res.status(409).json({
            message: 'Once exam is ongoing, only deadline_at/is_locked/room are editable',
          });
        }
      }
    }

    const merged = {
      class_id: row.class_id,
      subject_id: row.subject_id,
      exam_date: row.exam_date,
      start_time: row.start_time,
      end_time: row.end_time,
      room: row.room,
      total_marks: row.total_marks,
      passing_marks: row.passing_marks,
      ...req.body,
    };
    if (Object.keys(req.body || {}).some((k) =>
      ['exam_date', 'start_time', 'end_time', 'class_id', 'subject_id', 'total_marks', 'passing_marks'].includes(k)
    )) {
      const validation = validateTimetableEntry(merged);
      if (!validation.ok) {
        await t.rollback();
        return res.status(400).json({ message: validation.message });
      }
      const v = validation.value;
      if (v.exam_date < exam.start_date || v.exam_date > exam.end_date) {
        await t.rollback();
        return res.status(400).json({
          message: `exam_date must fall within ${exam.start_date} and ${exam.end_date}`,
        });
      }
      if (v.class_id !== row.class_id) {
        const inExam = await ensureClassInExam(tenantId, examId, v.class_id, t);
        if (!inExam.ok) {
          await t.rollback();
          return res.status(inExam.status).json({ message: inExam.message });
        }
      }
      if (v.subject_id !== row.subject_id) {
        const subject = await Subject.findOne({
          where: { id: v.subject_id, tenant_id: tenantId },
          transaction: t,
        });
        if (!subject || !subject.is_active) {
          await t.rollback();
          return res.status(400).json({ message: 'Invalid or inactive subject' });
        }
      }
      if (v.total_marks !== Number(row.total_marks)) {
        const exceeded = await ExamMark.count({
          where: {
            tenant_id: tenantId,
            exam_timetable_id: row.id,
            marks_obtained: { [Op.gt]: v.total_marks },
          },
          transaction: t,
        });
        if (exceeded > 0) {
          await t.rollback();
          return res.status(409).json({
            message:
              'Cannot reduce total_marks below previously entered marks for this paper',
          });
        }
      }
      const conflict = await detectClassConflict(tenantId, examId, v, row.id, t);
      if (conflict.conflict) {
        await t.rollback();
        return res.status(409).json({ message: conflict.message });
      }
      Object.assign(row, v);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'room')) {
      const room = req.body.room != null ? String(req.body.room).trim() : '';
      row.room = room ? room.slice(0, 60) : null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'deadline_at')) {
      if (req.body.deadline_at) {
        const d = new Date(req.body.deadline_at);
        if (Number.isNaN(d.getTime())) {
          await t.rollback();
          return res.status(400).json({ message: 'deadline_at must be a valid date' });
        }
        row.deadline_at = d;
      } else {
        row.deadline_at = null;
      }
    }

    await row.save({ transaction: t });
    await t.commit();
    const reloaded = await ExamTimetable.findOne({
      where: { id: row.id, tenant_id: tenantId },
      include: [
        { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
      ],
    });
    res.status(200).json({ message: 'Paper updated', data: shapeTimetableRow(reloaded) });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: 'Another paper for this subject already exists in this exam/class',
      });
    }
    console.error('examTimetable.update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const entryId = req.params.entryId;
    if (!isUuid(entryId)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid entry id' });
    }
    const ensure = await ensureExam(tenantId, examId, t);
    if (!ensure.ok) {
      await t.rollback();
      return res.status(ensure.status).json({ message: ensure.message });
    }
    if (!EXAM_FULLY_EDITABLE_STATUSES.has(ensure.exam.status)) {
      await t.rollback();
      return res.status(409).json({
        message: 'Papers can only be removed while the exam is draft or scheduled',
      });
    }
    const row = await ExamTimetable.findOne({
      where: { id: entryId, tenant_id: tenantId, exam_id: examId },
      transaction: t,
    });
    if (!row) {
      await t.rollback();
      return res.status(404).json({ message: 'Paper not found' });
    }
    const markCount = await ExamMark.count({
      where: { tenant_id: tenantId, exam_timetable_id: row.id },
      transaction: t,
    });
    if (markCount > 0) {
      await t.rollback();
      return res.status(409).json({
        message: 'Cannot delete: marks have already been entered for this paper',
      });
    }
    await row.destroy({ transaction: t });
    await t.commit();
    res.status(204).send();
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('examTimetable.remove error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.finalize = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ensure = await ensureExam(tenantId, examId);
    if (!ensure.ok) return res.status(ensure.status).json({ message: ensure.message });

    const total = await ExamTimetable.count({
      where: { tenant_id: tenantId, exam_id: examId },
    });
    if (total === 0) {
      return res.status(409).json({
        message: 'Cannot finalize an empty timetable. Add at least one paper first.',
      });
    }
    await ensure.exam.update({ timetable_finalized_at: new Date() });
    res.status(200).json({
      message: 'Timetable finalized',
      data: { exam_id: ensure.exam.id, timetable_finalized_at: ensure.exam.timetable_finalized_at },
    });
  } catch (err) {
    console.error('examTimetable.finalize error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.lock = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const entryId = req.params.entryId;
    if (!isUuid(entryId)) return res.status(400).json({ message: 'Invalid entry id' });
    const lock = !!(req.body && req.body.locked);
    const row = await ExamTimetable.findOne({
      where: { id: entryId, tenant_id: tenantId, exam_id: examId },
    });
    if (!row) return res.status(404).json({ message: 'Paper not found' });

    await row.update({
      is_locked: lock,
      locked_at: lock ? new Date() : null,
      locked_by_user_id: lock ? req.user.userId : null,
    });

    notifyLockChange(tenantId, examId, row, lock).catch((err) =>
      console.error('examTimetable.notifyLockChange error:', err)
    );

    res.status(200).json({
      message: lock ? 'Paper locked' : 'Paper unlocked',
      data: { id: row.id, is_locked: row.is_locked, locked_at: row.locked_at },
    });
  } catch (err) {
    console.error('examTimetable.lock error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

async function notifyLockChange(tenantId, examId, timetable, locked) {
  const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
  if (!exam) return;
  const assignments = await TeacherAcademicAssignment.findAll({
    where: {
      tenant_id: tenantId,
      academic_year_id: exam.academic_year_id,
      class_id: timetable.class_id,
      subject_id: timetable.subject_id,
    },
    attributes: ['teacher_id'],
  });
  const teacherIds = assignments.map((a) => a.teacher_id);
  if (teacherIds.length === 0) return;
  const userIds = await notificationService.findTeacherUserIds(tenantId, teacherIds);
  if (userIds.length === 0) return;
  await notificationService.notifyUsers(tenantId, userIds, {
    title: locked ? 'Marks entry locked' : 'Marks entry re-opened',
    body: `${exam.title}: a paper for your subject has been ${locked ? 'locked' : 're-opened'}.`,
    data: { exam_id: examId, exam_timetable_id: timetable.id, kind: locked ? 'marks.locked' : 'marks.unlocked' },
  });
}

module.exports.shapeTimetableRow = shapeTimetableRow;
