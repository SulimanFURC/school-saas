const { Op } = require('sequelize');
const Exam = require('./exam.model');
const ExamClass = require('./examClass.model');
const ExamTimetable = require('./examTimetable.model');
const ExamRecheckRequest = require('./examRecheckRequest.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const Subject = require('../subjects/subject.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const AcademicYear = require('../classes/academicYear.model');
const User = require('../users/user.model');
const notificationService = require('../notifications/notification.service');
const resultsService = require('./examResults.service');
const { isUuid } = require('./exam.helpers');

async function loadStudentForUser(tenantId, userId) {
  const user = await User.findOne({
    where: { id: userId, tenant_id: tenantId, role: 'student' },
  });
  if (!user || !user.student_id) return null;
  return user;
}

/**
 * List the exams visible to the logged-in student. An exam is visible once it
 * has reached `scheduled` (timetable visible) and is not archived.
 */
exports.listMyExams = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const user = await loadStudentForUser(tenantId, req.user.userId);
    if (!user) return res.status(403).json({ message: 'Forbidden' });

    const enrollments = await StudentEnrollment.findAll({
      where: {
        tenant_id: tenantId,
        student_id: user.student_id,
        status: 'active',
      },
      include: [
        { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name', 'is_active'] },
        { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
        { model: Section, as: 'section', attributes: ['id', 'name'] },
      ],
    });
    if (enrollments.length === 0) return res.status(200).json({ data: [] });

    const classIds = enrollments.map((e) => e.class_id);
    const yearIds = enrollments.map((e) => e.academic_year_id);

    const examClasses = await ExamClass.findAll({
      where: { tenant_id: tenantId, class_id: classIds },
      include: [
        {
          model: Exam,
          as: 'exam',
          required: true,
          where: {
            tenant_id: tenantId,
            academic_year_id: yearIds,
            status: { [Op.notIn]: ['draft', 'archived'] },
          },
        },
      ],
    });

    const examMap = new Map();
    for (const ec of examClasses) {
      const examPlain = ec.exam ? ec.exam.get({ plain: true }) : null;
      if (!examPlain) continue;
      examMap.set(examPlain.id, examPlain);
    }
    const data = [...examMap.values()].map((e) => ({
      id: e.id,
      title: e.title,
      exam_type: e.exam_type,
      start_date: e.start_date,
      end_date: e.end_date,
      status: e.status,
      timetable_finalized_at: e.timetable_finalized_at,
      published_at: e.published_at,
      can_view_results: e.status === 'published',
      can_download_admit_card: !!e.timetable_finalized_at,
      recheck_open: !!e.recheck_open,
    }));
    res.status(200).json({ data });
  } catch (err) {
    console.error('examStudent.listMyExams error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getMyTimetable = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const user = await loadStudentForUser(tenantId, req.user.userId);
    if (!user) return res.status(403).json({ message: 'Forbidden' });
    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid id' });

    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status === 'archived' || exam.status === 'draft') {
      return res.status(403).json({ message: 'Timetable not available yet' });
    }

    const enrollment = await StudentEnrollment.findOne({
      where: {
        tenant_id: tenantId,
        student_id: user.student_id,
        academic_year_id: exam.academic_year_id,
        status: 'active',
      },
    });
    if (!enrollment) {
      return res.status(403).json({ message: 'You are not enrolled for this exam' });
    }

    const tts = await ExamTimetable.findAll({
      where: {
        tenant_id: tenantId,
        exam_id: examId,
        class_id: enrollment.class_id,
      },
      include: [{ model: Subject, as: 'subject', attributes: ['id', 'name'] }],
      order: [['exam_date', 'ASC'], ['start_time', 'ASC']],
    });

    res.status(200).json({
      exam: {
        id: exam.id,
        title: exam.title,
        exam_type: exam.exam_type,
        status: exam.status,
        start_date: exam.start_date,
        end_date: exam.end_date,
        timetable_finalized_at: exam.timetable_finalized_at,
        published_at: exam.published_at,
      },
      data: tts.map((tt) => {
        const p = tt.get({ plain: true });
        return {
          id: p.id,
          subject_id: p.subject_id,
          subject_name: p.subject ? p.subject.name : null,
          exam_date: p.exam_date,
          start_time: p.start_time,
          end_time: p.end_time,
          room: p.room,
          total_marks: Number(p.total_marks),
          passing_marks: Number(p.passing_marks),
        };
      }),
    });
  } catch (err) {
    console.error('examStudent.getMyTimetable error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getMyResult = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const user = await loadStudentForUser(tenantId, req.user.userId);
    if (!user) return res.status(403).json({ message: 'Forbidden' });
    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid id' });

    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status !== 'published') {
      return res.status(403).json({ message: 'Results are not yet published' });
    }

    const result = await resultsService.buildStudentResult(tenantId, exam, user.student_id);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.status(200).json({
      exam: {
        id: exam.id,
        title: exam.title,
        exam_type: exam.exam_type,
        start_date: exam.start_date,
        end_date: exam.end_date,
        published_at: exam.published_at,
      },
      data: result.data,
    });
  } catch (err) {
    console.error('examStudent.getMyResult error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createRecheck = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const user = await loadStudentForUser(tenantId, req.user.userId);
    if (!user) return res.status(403).json({ message: 'Forbidden' });
    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid id' });
    const body = req.body || {};
    const ttId = body.exam_timetable_id;
    if (!isUuid(ttId)) {
      return res.status(400).json({ message: 'exam_timetable_id is required' });
    }
    const comment = body.comment != null ? String(body.comment).trim().slice(0, 1000) : null;

    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status !== 'published') {
      return res.status(403).json({ message: 'Recheck requests are only allowed after publication' });
    }
    if (!exam.recheck_open) {
      return res.status(403).json({ message: 'Recheck window is closed' });
    }
    if (exam.published_at && exam.recheck_window_days) {
      const closesAt = new Date(exam.published_at);
      closesAt.setDate(closesAt.getDate() + Number(exam.recheck_window_days));
      if (new Date() > closesAt) {
        return res.status(403).json({ message: 'Recheck window has expired' });
      }
    }

    const tt = await ExamTimetable.findOne({
      where: { id: ttId, tenant_id: tenantId, exam_id: examId },
    });
    if (!tt) return res.status(404).json({ message: 'Paper not found' });

    const enrollment = await StudentEnrollment.findOne({
      where: {
        tenant_id: tenantId,
        student_id: user.student_id,
        academic_year_id: exam.academic_year_id,
        status: 'active',
      },
    });
    if (!enrollment || enrollment.class_id !== tt.class_id) {
      return res.status(403).json({ message: 'You are not enrolled for that paper' });
    }

    const existing = await ExamRecheckRequest.findOne({
      where: {
        tenant_id: tenantId,
        exam_timetable_id: tt.id,
        student_id: user.student_id,
      },
    });
    if (existing) {
      return res.status(409).json({ message: 'A recheck request already exists for this paper' });
    }

    const created = await ExamRecheckRequest.create({
      tenant_id: tenantId,
      exam_id: examId,
      exam_timetable_id: tt.id,
      student_id: user.student_id,
      requested_by_user_id: req.user.userId,
      student_comment: comment,
      status: 'open',
    });

    notificationService
      .notifyRole(tenantId, 'admin', {
        title: 'New recheck request',
        body: `A student has requested re-evaluation for ${exam.title}.`,
        data: { exam_id: examId, recheck_id: created.id, kind: 'recheck.created' },
      })
      .catch((err) => console.error('examStudent.createRecheck notify error:', err));

    res.status(201).json({
      message: 'Recheck request submitted',
      data: { id: created.id, status: created.status },
    });
  } catch (err) {
    console.error('examStudent.createRecheck error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listMyRechecks = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const user = await loadStudentForUser(tenantId, req.user.userId);
    if (!user) return res.status(403).json({ message: 'Forbidden' });

    const rows = await ExamRecheckRequest.findAll({
      where: { tenant_id: tenantId, student_id: user.student_id },
      include: [
        {
          model: ExamTimetable,
          as: 'timetable',
          attributes: ['id', 'subject_id', 'class_id'],
          include: [{ model: Subject, as: 'subject', attributes: ['id', 'name'] }],
        },
        { model: Exam, as: 'exam', attributes: ['id', 'title', 'exam_type'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.status(200).json({
      data: rows.map((r) => {
        const p = r.get({ plain: true });
        return {
          id: p.id,
          status: p.status,
          student_comment: p.student_comment,
          teacher_comment: p.teacher_comment,
          created_at: p.created_at,
          resolved_at: p.resolved_at,
          exam: p.exam,
          subject_name: p.timetable && p.timetable.subject ? p.timetable.subject.name : null,
        };
      }),
    });
  } catch (err) {
    console.error('examStudent.listMyRechecks error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
