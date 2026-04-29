const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const Exam = require('./exam.model');
const ExamClass = require('./examClass.model');
const ExamTimetable = require('./examTimetable.model');
const ExamMark = require('./examMark.model');
const ExamMarkAudit = require('./examMarkAudit.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const Subject = require('../subjects/subject.model');
const Student = require('../students/student.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const Teacher = require('../teachers/teacher.model');
const User = require('../users/user.model');
const TeacherAcademicAssignment = require('../teachers/teacherAcademicAssignment.model');
const notificationService = require('../notifications/notification.service');
const { MARK_ENTRY_STATUSES } = require('./exam.constants');
const { isUuid, parsePositiveInt } = require('./exam.helpers');

async function loadTeacherForUser(tenantId, userId) {
  const loginUser = await User.findOne({
    where: { id: userId, tenant_id: tenantId, role: 'teacher' },
  });
  if (!loginUser || !loginUser.teacher_id) return null;
  return Teacher.findOne({
    where: { id: loginUser.teacher_id, tenant_id: tenantId },
  });
}

async function ensureExam(tenantId, examId) {
  if (!isUuid(examId)) return { ok: false, status: 400, message: 'Invalid exam id' };
  const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
  if (!exam) return { ok: false, status: 404, message: 'Exam not found' };
  return { ok: true, exam };
}

async function loadTimetable(tenantId, examId, ttId) {
  if (!isUuid(ttId)) return null;
  return ExamTimetable.findOne({
    where: { id: ttId, tenant_id: tenantId, exam_id: examId },
    include: [
      { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
      { model: Subject, as: 'subject', attributes: ['id', 'name'] },
    ],
  });
}

function shapeMark(plain, totalMarks) {
  if (!plain) return null;
  const obtained =
    plain.marks_obtained == null ? null : Number(plain.marks_obtained);
  return {
    id: plain.id,
    student_id: plain.student_id,
    entry_status: plain.entry_status,
    marks_obtained: obtained,
    percentage:
      obtained != null && Number(totalMarks) > 0
        ? Number(((obtained / Number(totalMarks)) * 100).toFixed(2))
        : null,
    updated_at: plain.updated_at,
  };
}

/**
 * Build the roster of students enrolled in (class, year). Only students with
 * a section enrolled in the academic year of the exam are considered.
 */
async function loadRoster(tenantId, exam, classId, sectionId = null) {
  const where = {
    tenant_id: tenantId,
    academic_year_id: exam.academic_year_id,
    class_id: classId,
    status: 'active',
  };
  if (sectionId) where.section_id = sectionId;
  const enrollments = await StudentEnrollment.findAll({
    where,
    include: [
      {
        model: Student,
        as: 'student',
        required: true,
        attributes: ['id', 'admission_no', 'full_name', 'first_name', 'last_name', 'status'],
        where: { status: { [Op.ne]: 'inactive' } },
      },
      { model: Section, as: 'section', attributes: ['id', 'name'] },
    ],
    order: [
      [{ model: Section, as: 'section' }, 'name', 'ASC'],
      ['roll_number', 'ASC'],
      [{ model: Student, as: 'student' }, 'admission_no', 'ASC'],
    ],
  });
  return enrollments.map((e) => {
    const plain = e.get({ plain: true });
    const s = plain.student || {};
    const display =
      (s.full_name && String(s.full_name).trim()) ||
      [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
    return {
      enrollment_id: plain.id,
      student_id: s.id,
      admission_no: s.admission_no,
      display_name: display,
      first_name: s.first_name,
      last_name: s.last_name,
      section_id: plain.section_id,
      section_name: plain.section ? plain.section.name : null,
      roll_number: plain.roll_number,
    };
  });
}

/**
 * Determine if the actor (teacher or admin) may edit marks for this paper.
 * Admins can always edit; teachers must be assigned to the (class, subject, year).
 * For teachers, an optional `section_id` parameter further restricts which
 * students they may edit in the response, but admins see all sections.
 */
async function authorizeMarksAccess(tenantId, exam, timetable, req) {
  if (req.user.role === 'admin' || req.user.role === 'super_admin') {
    return { ok: true, scope: 'admin' };
  }
  if (req.user.role !== 'teacher') {
    return { ok: false, status: 403, message: 'Forbidden' };
  }
  const teacher = await loadTeacherForUser(tenantId, req.user.userId);
  if (!teacher) return { ok: false, status: 403, message: 'Forbidden' };

  const assignments = await TeacherAcademicAssignment.findAll({
    where: {
      tenant_id: tenantId,
      teacher_id: teacher.id,
      academic_year_id: exam.academic_year_id,
      class_id: timetable.class_id,
      subject_id: timetable.subject_id,
    },
    attributes: ['section_id'],
  });
  if (assignments.length === 0) {
    return { ok: false, status: 403, message: 'You are not assigned to this subject/class' };
  }
  return {
    ok: true,
    scope: 'teacher',
    teacher_id: teacher.id,
    section_ids: assignments.map((a) => a.section_id),
  };
}

exports.getMarksSheet = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ttId = req.query.exam_timetable_id;

    const ensure = await ensureExam(tenantId, examId);
    if (!ensure.ok) return res.status(ensure.status).json({ message: ensure.message });
    const tt = await loadTimetable(tenantId, examId, ttId);
    if (!tt) return res.status(404).json({ message: 'Paper not found' });

    const auth = await authorizeMarksAccess(tenantId, ensure.exam, tt, req);
    if (!auth.ok) return res.status(auth.status).json({ message: auth.message });

    const requestedSection = parsePositiveInt(req.query.section_id);
    let sectionFilter = requestedSection || null;
    if (auth.scope === 'teacher') {
      if (sectionFilter && !auth.section_ids.includes(sectionFilter)) {
        return res.status(403).json({ message: 'Section not in your assignments' });
      }
      if (!sectionFilter && auth.section_ids.length === 1) {
        sectionFilter = auth.section_ids[0];
      }
    }

    let roster = await loadRoster(tenantId, ensure.exam, tt.class_id, sectionFilter);
    if (auth.scope === 'teacher' && !sectionFilter) {
      const allowed = new Set(auth.section_ids);
      roster = roster.filter((r) => allowed.has(r.section_id));
    }

    const marks = await ExamMark.findAll({
      where: {
        tenant_id: tenantId,
        exam_timetable_id: tt.id,
      },
    });
    const byStudent = new Map();
    for (const m of marks) byStudent.set(m.student_id, m);

    const totalMarks = Number(tt.total_marks);
    const data = roster.map((r) => {
      const m = byStudent.get(r.student_id);
      return {
        ...r,
        mark: m ? shapeMark(m.get({ plain: true }), totalMarks) : null,
      };
    });

    res.status(200).json({
      timetable: {
        id: tt.id,
        class_id: tt.class_id,
        class_name: tt.schoolClass ? tt.schoolClass.name : null,
        subject_id: tt.subject_id,
        subject_name: tt.subject ? tt.subject.name : null,
        exam_date: tt.exam_date,
        start_time: tt.start_time,
        end_time: tt.end_time,
        total_marks: totalMarks,
        passing_marks: Number(tt.passing_marks),
        is_locked: !!tt.is_locked,
        deadline_at: tt.deadline_at,
      },
      data,
      total: data.length,
      entered: data.filter((r) => r.mark != null).length,
      can_edit: !tt.is_locked && ensure.exam.status !== 'archived',
    });
  } catch (err) {
    console.error('examMarks.getMarksSheet error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

function validateMarkEntry(entry, totalMarks) {
  const status = entry.entry_status != null ? String(entry.entry_status).trim() : 'present';
  if (!MARK_ENTRY_STATUSES.includes(status)) {
    return { ok: false, message: `Invalid entry_status. Allowed: ${MARK_ENTRY_STATUSES.join(', ')}` };
  }
  if (status !== 'present') {
    return { ok: true, value: { entry_status: status, marks_obtained: null } };
  }
  if (entry.marks_obtained == null || entry.marks_obtained === '') {
    return { ok: false, message: 'marks_obtained is required when entry_status is present' };
  }
  const num = Number(entry.marks_obtained);
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false, message: 'marks_obtained must be a non-negative number' };
  }
  if (num > totalMarks) {
    return {
      ok: false,
      message: `marks_obtained cannot exceed total_marks (${totalMarks})`,
    };
  }
  return { ok: true, value: { entry_status: 'present', marks_obtained: num } };
}

exports.upsertMarks = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const body = req.body || {};
    const ttId = body.exam_timetable_id;
    const reason = body.reason != null ? String(body.reason).trim() : '';
    const entries = Array.isArray(body.entries) ? body.entries : [];

    const ensure = await ensureExam(tenantId, examId);
    if (!ensure.ok) {
      await t.rollback();
      return res.status(ensure.status).json({ message: ensure.message });
    }
    const tt = await loadTimetable(tenantId, examId, ttId);
    if (!tt) {
      await t.rollback();
      return res.status(404).json({ message: 'Paper not found' });
    }
    if (tt.is_locked) {
      await t.rollback();
      return res.status(409).json({ message: 'This paper is locked. Contact admin to unlock.' });
    }
    if (ensure.exam.status === 'archived') {
      await t.rollback();
      return res.status(409).json({ message: 'Archived exams cannot be edited' });
    }
    const auth = await authorizeMarksAccess(tenantId, ensure.exam, tt, req);
    if (!auth.ok) {
      await t.rollback();
      return res.status(auth.status).json({ message: auth.message });
    }

    if (entries.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'entries[] must contain at least one item' });
    }

    let allowedStudentIds = null;
    if (auth.scope === 'teacher') {
      const enrollments = await StudentEnrollment.findAll({
        where: {
          tenant_id: tenantId,
          academic_year_id: ensure.exam.academic_year_id,
          class_id: tt.class_id,
          section_id: auth.section_ids,
          status: 'active',
        },
        attributes: ['student_id'],
        transaction: t,
      });
      allowedStudentIds = new Set(enrollments.map((e) => e.student_id));
    }

    const totalMarks = Number(tt.total_marks);
    const studentIds = entries.map((e) => e.student_id).filter(Boolean);
    const existingMarks = await ExamMark.findAll({
      where: {
        tenant_id: tenantId,
        exam_timetable_id: tt.id,
        student_id: studentIds,
      },
      transaction: t,
    });
    const existingByStudent = new Map(existingMarks.map((m) => [m.student_id, m]));

    const errors = [];
    const results = [];

    for (const entry of entries) {
      const sid = entry.student_id;
      if (!isUuid(sid)) {
        errors.push({ student_id: sid, message: 'Invalid student_id' });
        continue;
      }
      if (allowedStudentIds && !allowedStudentIds.has(sid)) {
        errors.push({ student_id: sid, message: 'Student not in your assignment' });
        continue;
      }
      const validation = validateMarkEntry(entry, totalMarks);
      if (!validation.ok) {
        errors.push({ student_id: sid, message: validation.message });
        continue;
      }
      const v = validation.value;
      const existing = existingByStudent.get(sid);

      if (existing) {
        const prevStatus = existing.entry_status;
        const prevMarks =
          existing.marks_obtained == null ? null : Number(existing.marks_obtained);
        const sameStatus = prevStatus === v.entry_status;
        const sameMarks =
          (prevMarks == null && v.marks_obtained == null) ||
          (prevMarks != null && v.marks_obtained != null && Number(prevMarks) === Number(v.marks_obtained));
        if (sameStatus && sameMarks) {
          results.push({ student_id: sid, status: 'unchanged' });
          continue;
        }
        if (!reason) {
          errors.push({
            student_id: sid,
            message: 'reason is required when editing existing marks',
          });
          continue;
        }
        const before = {
          entry_status: prevStatus,
          marks_obtained: prevMarks,
        };
        await existing.update(
          {
            entry_status: v.entry_status,
            marks_obtained: v.marks_obtained,
            updated_by_user_id: req.user.userId,
          },
          { transaction: t }
        );
        await ExamMarkAudit.create(
          {
            tenant_id: tenantId,
            exam_mark_id: existing.id,
            exam_timetable_id: tt.id,
            student_id: sid,
            actor_user_id: req.user.userId,
            action: 'update',
            before_json: before,
            after_json: {
              entry_status: existing.entry_status,
              marks_obtained:
                existing.marks_obtained == null
                  ? null
                  : Number(existing.marks_obtained),
            },
            reason,
          },
          { transaction: t }
        );
        results.push({ student_id: sid, status: 'updated' });
      } else {
        const created = await ExamMark.create(
          {
            tenant_id: tenantId,
            exam_id: examId,
            exam_timetable_id: tt.id,
            student_id: sid,
            entry_status: v.entry_status,
            marks_obtained: v.marks_obtained,
            entered_by_user_id: req.user.userId,
            updated_by_user_id: req.user.userId,
          },
          { transaction: t }
        );
        await ExamMarkAudit.create(
          {
            tenant_id: tenantId,
            exam_mark_id: created.id,
            exam_timetable_id: tt.id,
            student_id: sid,
            actor_user_id: req.user.userId,
            action: 'create',
            before_json: null,
            after_json: {
              entry_status: created.entry_status,
              marks_obtained:
                created.marks_obtained == null ? null : Number(created.marks_obtained),
            },
            reason: reason || null,
          },
          { transaction: t }
        );
        results.push({ student_id: sid, status: 'created' });
      }
    }

    if (errors.length > 0 && results.every((r) => r.status === 'unchanged')) {
      await t.rollback();
      return res.status(400).json({ message: 'No marks saved', errors });
    }

    await t.commit();

    if (errors.length === 0) {
      checkAdminCompletionNotification(tenantId, ensure.exam.id).catch((err) =>
        console.error('examMarks.checkCompletion error:', err)
      );
    }

    res.status(200).json({
      message: errors.length > 0 ? 'Saved with errors' : 'Marks saved',
      results,
      errors,
    });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('examMarks.upsertMarks error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Per-paper progress for the entire exam: total expected vs entered counts.
 * Visible to admins only.
 */
exports.adminProgress = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ensure = await ensureExam(tenantId, examId);
    if (!ensure.ok) return res.status(ensure.status).json({ message: ensure.message });

    const timetables = await ExamTimetable.findAll({
      where: { tenant_id: tenantId, exam_id: examId },
      include: [
        { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
      ],
      order: [['exam_date', 'ASC'], ['start_time', 'ASC']],
    });

    const enrollmentCounts = await StudentEnrollment.findAll({
      where: {
        tenant_id: tenantId,
        academic_year_id: ensure.exam.academic_year_id,
        class_id: timetables.map((t) => t.class_id),
        status: 'active',
      },
      attributes: ['class_id', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
      group: ['class_id'],
      raw: true,
    });
    const enrollByClass = new Map(
      enrollmentCounts.map((row) => [Number(row.class_id), Number(row.cnt)])
    );

    const markCounts = await ExamMark.findAll({
      where: {
        tenant_id: tenantId,
        exam_id: examId,
      },
      attributes: ['exam_timetable_id', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
      group: ['exam_timetable_id'],
      raw: true,
    });
    const marksByTt = new Map(
      markCounts.map((row) => [String(row.exam_timetable_id), Number(row.cnt)])
    );

    const data = timetables.map((tt) => ({
      timetable_id: tt.id,
      class_id: tt.class_id,
      class_name: tt.schoolClass ? tt.schoolClass.name : null,
      subject_id: tt.subject_id,
      subject_name: tt.subject ? tt.subject.name : null,
      total_students: enrollByClass.get(Number(tt.class_id)) || 0,
      entered: marksByTt.get(String(tt.id)) || 0,
      is_locked: !!tt.is_locked,
    }));

    const overall = data.reduce(
      (acc, row) => {
        acc.total += row.total_students;
        acc.entered += row.entered;
        return acc;
      },
      { total: 0, entered: 0 }
    );

    res.status(200).json({
      data,
      overall: { ...overall, complete: overall.total > 0 && overall.entered >= overall.total },
    });
  } catch (err) {
    console.error('examMarks.adminProgress error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listAudits = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const ensure = await ensureExam(tenantId, examId);
    if (!ensure.ok) return res.status(ensure.status).json({ message: ensure.message });

    const where = { tenant_id: tenantId };
    const ttId = req.query.exam_timetable_id;
    if (ttId && isUuid(ttId)) where.exam_timetable_id = ttId;
    const studentId = req.query.student_id;
    if (studentId && isUuid(studentId)) where.student_id = studentId;

    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));

    const audits = await ExamMarkAudit.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
    });
    const userIds = [...new Set(audits.map((a) => a.actor_user_id).filter(Boolean))];
    const users = userIds.length
      ? await User.findAll({ where: { id: userIds, tenant_id: tenantId }, attributes: ['id', 'name', 'role'] })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = audits.map((a) => {
      const plain = a.get({ plain: true });
      const actor = plain.actor_user_id ? userMap.get(plain.actor_user_id) : null;
      return {
        id: plain.id,
        exam_timetable_id: plain.exam_timetable_id,
        student_id: plain.student_id,
        action: plain.action,
        before: plain.before_json,
        after: plain.after_json,
        reason: plain.reason,
        created_at: plain.created_at,
        actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
      };
    });

    res.status(200).json({ data });
  } catch (err) {
    console.error('examMarks.listAudits error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Notify admins when every paper in an exam has had marks entered for every
 * enrolled student. No-op if not yet complete.
 */
async function checkAdminCompletionNotification(tenantId, examId) {
  const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
  if (!exam) return;

  const timetables = await ExamTimetable.findAll({
    where: { tenant_id: tenantId, exam_id: examId },
    attributes: ['id', 'class_id'],
  });
  if (timetables.length === 0) return;

  const enrollmentCounts = await StudentEnrollment.findAll({
    where: {
      tenant_id: tenantId,
      academic_year_id: exam.academic_year_id,
      class_id: [...new Set(timetables.map((t) => t.class_id))],
      status: 'active',
    },
    attributes: ['class_id', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
    group: ['class_id'],
    raw: true,
  });
  const enrollByClass = new Map(
    enrollmentCounts.map((row) => [Number(row.class_id), Number(row.cnt)])
  );

  const markCounts = await ExamMark.findAll({
    where: { tenant_id: tenantId, exam_id: examId },
    attributes: ['exam_timetable_id', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
    group: ['exam_timetable_id'],
    raw: true,
  });
  const marksByTt = new Map(
    markCounts.map((row) => [String(row.exam_timetable_id), Number(row.cnt)])
  );

  for (const tt of timetables) {
    const expected = enrollByClass.get(Number(tt.class_id)) || 0;
    const got = marksByTt.get(String(tt.id)) || 0;
    if (expected === 0 || got < expected) return;
  }

  if (exam.status === 'ongoing') {
    await exam.update({ status: 'result_pending' });
  }

  await notificationService.notifyRole(tenantId, 'admin', {
    title: 'Marks fully entered',
    body: `All marks have been entered for ${exam.title}. Configure grading and publish results.`,
    data: { exam_id: examId, kind: 'marks.complete' },
  });
}
