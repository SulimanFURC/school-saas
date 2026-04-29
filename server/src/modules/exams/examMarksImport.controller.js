const sequelize = require('../../config/db');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { Op } = require('sequelize');
const Exam = require('./exam.model');
const ExamTimetable = require('./examTimetable.model');
const ExamMark = require('./examMark.model');
const ExamMarkAudit = require('./examMarkAudit.model');
const Student = require('../students/student.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const Subject = require('../subjects/subject.model');
const { MARK_ENTRY_STATUSES } = require('./exam.constants');
const { isUuid } = require('./exam.helpers');

/**
 * CSV format (header row required):
 *   admission_no,entry_status,marks_obtained,reason
 *
 * `reason` is only consulted when overwriting existing marks (controller still
 * enforces it server-side based on existing rows).
 */
const TEMPLATE_HEADERS = [
  'admission_no',
  'entry_status',
  'marks_obtained',
  'reason',
];

async function loadPaperContext(tenantId, examId, ttId) {
  const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
  if (!exam) return { ok: false, status: 404, message: 'Exam not found' };
  const tt = await ExamTimetable.findOne({
    where: { id: ttId, tenant_id: tenantId, exam_id: examId },
    include: [
      { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
      { model: Subject, as: 'subject', attributes: ['id', 'name'] },
    ],
  });
  if (!tt) return { ok: false, status: 404, message: 'Paper not found' };
  return { ok: true, exam, tt };
}

exports.template = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ttId = req.query.exam_timetable_id;
    if (!isUuid(examId) || !isUuid(ttId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const ctx = await loadPaperContext(tenantId, examId, ttId);
    if (!ctx.ok) return res.status(ctx.status).json({ message: ctx.message });

    const enrollments = await StudentEnrollment.findAll({
      where: {
        tenant_id: tenantId,
        academic_year_id: ctx.exam.academic_year_id,
        class_id: ctx.tt.class_id,
        status: 'active',
      },
      include: [
        {
          model: Student,
          as: 'student',
          required: true,
          attributes: ['id', 'admission_no', 'full_name', 'first_name', 'last_name'],
        },
      ],
      order: [['roll_number', 'ASC']],
    });
    const rows = enrollments.map((e) => {
      const stu = e.student || {};
      return {
        admission_no: stu.admission_no || '',
        entry_status: 'present',
        marks_obtained: '',
        reason: '',
      };
    });
    const csv = stringify(rows, { header: true, columns: TEMPLATE_HEADERS });
    res.status(200);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="marks-template-${ctx.tt.subject ? ctx.tt.subject.name.replace(/[^a-z0-9_-]/gi, '_') : 'paper'}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error('examMarksImport.template error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

function parseCsv(buffer) {
  return parse(buffer, {
    columns: true,
    trim: true,
    skip_empty_lines: true,
    bom: true,
  });
}

async function buildPreview(tenantId, ctx, parsedRows) {
  const totalMarks = Number(ctx.tt.total_marks);
  const errors = [];
  const ready = [];

  const enrollments = await StudentEnrollment.findAll({
    where: {
      tenant_id: tenantId,
      academic_year_id: ctx.exam.academic_year_id,
      class_id: ctx.tt.class_id,
      status: 'active',
    },
    include: [
      {
        model: Student,
        as: 'student',
        required: true,
        attributes: ['id', 'admission_no'],
      },
    ],
  });
  const studentByAdm = new Map();
  for (const e of enrollments) {
    if (e.student) studentByAdm.set(String(e.student.admission_no), e.student.id);
  }

  const studentIds = enrollments.map((e) => e.student_id);
  const existing = studentIds.length
    ? await ExamMark.findAll({
        where: {
          tenant_id: tenantId,
          exam_timetable_id: ctx.tt.id,
          student_id: studentIds,
        },
      })
    : [];
  const existingByStudent = new Map(existing.map((m) => [m.student_id, m]));

  for (let i = 0; i < parsedRows.length; i += 1) {
    const r = parsedRows[i] || {};
    const lineNo = i + 2; // header is line 1
    const adm = (r.admission_no != null ? String(r.admission_no) : '').trim();
    const status = (r.entry_status != null ? String(r.entry_status) : 'present').trim().toLowerCase();
    const marksRaw = r.marks_obtained != null ? String(r.marks_obtained).trim() : '';
    const reason = r.reason != null ? String(r.reason).trim() : '';

    if (!adm) {
      errors.push({ line: lineNo, admission_no: adm, message: 'admission_no is required' });
      continue;
    }
    if (!MARK_ENTRY_STATUSES.includes(status)) {
      errors.push({
        line: lineNo,
        admission_no: adm,
        message: `entry_status must be one of: ${MARK_ENTRY_STATUSES.join(', ')}`,
      });
      continue;
    }
    const studentId = studentByAdm.get(adm);
    if (!studentId) {
      errors.push({
        line: lineNo,
        admission_no: adm,
        message: 'Student not enrolled in this class',
      });
      continue;
    }
    let marks = null;
    if (status === 'present') {
      if (!marksRaw) {
        errors.push({
          line: lineNo,
          admission_no: adm,
          message: 'marks_obtained is required when entry_status is present',
        });
        continue;
      }
      const num = Number(marksRaw);
      if (!Number.isFinite(num) || num < 0 || num > totalMarks) {
        errors.push({
          line: lineNo,
          admission_no: adm,
          message: `marks_obtained must be a number between 0 and ${totalMarks}`,
        });
        continue;
      }
      marks = num;
    }
    const existingMark = existingByStudent.get(studentId);
    const willChange = !existingMark
      ? true
      : existingMark.entry_status !== status ||
        Number(existingMark.marks_obtained || 0) !== Number(marks || 0) ||
        (existingMark.marks_obtained == null) !== (marks == null);

    ready.push({
      line: lineNo,
      admission_no: adm,
      student_id: studentId,
      entry_status: status,
      marks_obtained: marks,
      reason,
      is_existing: !!existingMark,
      will_change: willChange,
    });
  }

  return {
    total: parsedRows.length,
    errors,
    summary: {
      to_create: ready.filter((r) => !r.is_existing).length,
      to_update: ready.filter((r) => r.is_existing && r.will_change).length,
      unchanged: ready.filter((r) => r.is_existing && !r.will_change).length,
    },
    rows: ready,
  };
}

exports.preview = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ttId = (req.body && req.body.exam_timetable_id) || req.query.exam_timetable_id;
    if (!isUuid(examId) || !isUuid(ttId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });
    const ctx = await loadPaperContext(tenantId, examId, ttId);
    if (!ctx.ok) return res.status(ctx.status).json({ message: ctx.message });

    let parsed;
    try {
      parsed = parseCsv(req.file.buffer);
    } catch (parseErr) {
      return res.status(400).json({ message: `Invalid CSV: ${parseErr.message}` });
    }
    if (parsed.length === 0) {
      return res.status(400).json({ message: 'CSV has no data rows' });
    }
    const preview = await buildPreview(tenantId, ctx, parsed);
    res.status(200).json({ data: preview });
  } catch (err) {
    console.error('examMarksImport.preview error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.commit = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ttId = (req.body && req.body.exam_timetable_id) || req.query.exam_timetable_id;
    if (!isUuid(examId) || !isUuid(ttId)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid id' });
    }
    if (!req.file) {
      await t.rollback();
      return res.status(400).json({ message: 'CSV file is required' });
    }
    const ctx = await loadPaperContext(tenantId, examId, ttId);
    if (!ctx.ok) {
      await t.rollback();
      return res.status(ctx.status).json({ message: ctx.message });
    }
    if (ctx.tt.is_locked) {
      await t.rollback();
      return res.status(409).json({ message: 'This paper is locked' });
    }

    let parsed;
    try {
      parsed = parseCsv(req.file.buffer);
    } catch (parseErr) {
      await t.rollback();
      return res.status(400).json({ message: `Invalid CSV: ${parseErr.message}` });
    }

    const preview = await buildPreview(tenantId, ctx, parsed);
    if (preview.errors.length > 0) {
      await t.rollback();
      return res.status(400).json({
        message: 'CSV has errors. Fix them and re-upload.',
        data: preview,
      });
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const row of preview.rows) {
      const existing = await ExamMark.findOne({
        where: {
          tenant_id: tenantId,
          exam_timetable_id: ctx.tt.id,
          student_id: row.student_id,
        },
        transaction: t,
      });
      if (existing) {
        const sameStatus = existing.entry_status === row.entry_status;
        const sameMarks =
          (existing.marks_obtained == null && row.marks_obtained == null) ||
          (existing.marks_obtained != null &&
            row.marks_obtained != null &&
            Number(existing.marks_obtained) === Number(row.marks_obtained));
        if (sameStatus && sameMarks) {
          unchanged += 1;
          continue;
        }
        if (!row.reason) {
          await t.rollback();
          return res.status(400).json({
            message: `Reason required to overwrite marks for admission_no ${row.admission_no}`,
          });
        }
        const before = {
          entry_status: existing.entry_status,
          marks_obtained:
            existing.marks_obtained == null ? null : Number(existing.marks_obtained),
        };
        await existing.update(
          {
            entry_status: row.entry_status,
            marks_obtained: row.marks_obtained,
            updated_by_user_id: req.user.userId,
          },
          { transaction: t }
        );
        await ExamMarkAudit.create(
          {
            tenant_id: tenantId,
            exam_mark_id: existing.id,
            exam_timetable_id: ctx.tt.id,
            student_id: row.student_id,
            actor_user_id: req.user.userId,
            action: 'update',
            before_json: before,
            after_json: {
              entry_status: row.entry_status,
              marks_obtained: row.marks_obtained,
            },
            reason: row.reason,
          },
          { transaction: t }
        );
        updated += 1;
      } else {
        const createdRow = await ExamMark.create(
          {
            tenant_id: tenantId,
            exam_id: examId,
            exam_timetable_id: ctx.tt.id,
            student_id: row.student_id,
            entry_status: row.entry_status,
            marks_obtained: row.marks_obtained,
            entered_by_user_id: req.user.userId,
            updated_by_user_id: req.user.userId,
          },
          { transaction: t }
        );
        await ExamMarkAudit.create(
          {
            tenant_id: tenantId,
            exam_mark_id: createdRow.id,
            exam_timetable_id: ctx.tt.id,
            student_id: row.student_id,
            actor_user_id: req.user.userId,
            action: 'create',
            before_json: null,
            after_json: {
              entry_status: row.entry_status,
              marks_obtained: row.marks_obtained,
            },
            reason: row.reason || 'CSV import',
          },
          { transaction: t }
        );
        created += 1;
      }
    }

    await t.commit();
    res.status(200).json({
      message: 'Marks imported',
      data: { created, updated, unchanged },
    });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('examMarksImport.commit error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
