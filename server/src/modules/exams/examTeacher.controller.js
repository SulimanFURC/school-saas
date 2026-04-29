const { Op, fn, col } = require('sequelize');
const Exam = require('./exam.model');
const ExamClass = require('./examClass.model');
const ExamTimetable = require('./examTimetable.model');
const ExamMark = require('./examMark.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const Subject = require('../subjects/subject.model');
const TeacherAcademicAssignment = require('../teachers/teacherAcademicAssignment.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const Teacher = require('../teachers/teacher.model');
const User = require('../users/user.model');
const { isUuid, parsePositiveInt } = require('./exam.helpers');
const { buildClassResults } = require('./examResults.service');

async function loadTeacher(tenantId, userId) {
  const u = await User.findOne({
    where: { id: userId, tenant_id: tenantId, role: 'teacher' },
  });
  if (!u || !u.teacher_id) return null;
  return Teacher.findOne({ where: { id: u.teacher_id, tenant_id: tenantId } });
}

/**
 * List exams that touch a teacher's assignments (year + class + subject).
 */
exports.listMyExams = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const teacher = await loadTeacher(tenantId, req.user.userId);
    if (!teacher) return res.status(403).json({ message: 'Forbidden' });

    const assignments = await TeacherAcademicAssignment.findAll({
      where: { tenant_id: tenantId, teacher_id: teacher.id },
      attributes: ['academic_year_id', 'class_id', 'subject_id', 'section_id'],
    });
    if (assignments.length === 0) return res.status(200).json({ data: [] });

    const yearIds = [...new Set(assignments.map((a) => a.academic_year_id))];
    const classIds = [...new Set(assignments.map((a) => a.class_id))];

    const examClassRows = await ExamClass.findAll({
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
    for (const ec of examClassRows) {
      const e = ec.exam ? ec.exam.get({ plain: true }) : null;
      if (!e) continue;
      examMap.set(e.id, e);
    }

    res.status(200).json({
      data: [...examMap.values()].map((e) => ({
        id: e.id,
        title: e.title,
        exam_type: e.exam_type,
        academic_year_id: e.academic_year_id,
        start_date: e.start_date,
        end_date: e.end_date,
        status: e.status,
        timetable_finalized_at: e.timetable_finalized_at,
        published_at: e.published_at,
      })),
    });
  } catch (err) {
    console.error('examTeacher.listMyExams error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * For a single exam, list all timetable entries that the teacher is responsible
 * for (assigned to that subject + class), and per-paper progress.
 */
exports.getMyExamPapers = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const teacher = await loadTeacher(tenantId, req.user.userId);
    if (!teacher) return res.status(403).json({ message: 'Forbidden' });

    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid id' });

    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status === 'draft' || exam.status === 'archived') {
      return res.status(403).json({ message: 'Exam not visible to teachers in this state' });
    }

    const assignments = await TeacherAcademicAssignment.findAll({
      where: {
        tenant_id: tenantId,
        teacher_id: teacher.id,
        academic_year_id: exam.academic_year_id,
      },
      attributes: ['class_id', 'section_id', 'subject_id'],
    });
    if (assignments.length === 0) return res.status(200).json({ data: [] });

    const subjectByClass = new Map();
    for (const a of assignments) {
      const key = `${a.class_id}`;
      const set = subjectByClass.get(key) || new Set();
      set.add(a.subject_id);
      subjectByClass.set(key, set);
    }
    const orFilters = [];
    for (const [classId, subjects] of subjectByClass.entries()) {
      orFilters.push({ class_id: parseInt(classId, 10), subject_id: [...subjects] });
    }
    if (orFilters.length === 0) return res.status(200).json({ data: [] });

    const timetables = await ExamTimetable.findAll({
      where: {
        tenant_id: tenantId,
        exam_id: examId,
        [Op.or]: orFilters,
      },
      include: [
        { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
      ],
      order: [['exam_date', 'ASC'], ['start_time', 'ASC']],
    });

    const sectionAssignments = new Map();
    for (const a of assignments) {
      const key = `${a.class_id}:${a.subject_id}`;
      const set = sectionAssignments.get(key) || new Set();
      set.add(a.section_id);
      sectionAssignments.set(key, set);
    }

    const ttIds = timetables.map((t) => t.id);
    const enteredCounts = ttIds.length
      ? await ExamMark.findAll({
          where: { tenant_id: tenantId, exam_timetable_id: ttIds },
          attributes: [
            'exam_timetable_id',
            [fn('COUNT', col('id')), 'cnt'],
          ],
          group: ['exam_timetable_id'],
          raw: true,
        })
      : [];
    const enteredMap = new Map(
      enteredCounts.map((r) => [String(r.exam_timetable_id), Number(r.cnt)])
    );

    const enrollmentCounts = await StudentEnrollment.findAll({
      where: {
        tenant_id: tenantId,
        academic_year_id: exam.academic_year_id,
        status: 'active',
        [Op.or]: timetables.map((tt) => {
          const key = `${tt.class_id}:${tt.subject_id}`;
          const sectionIds = [...(sectionAssignments.get(key) || [])];
          return {
            class_id: tt.class_id,
            section_id: sectionIds.length > 0 ? sectionIds : -1,
          };
        }),
      },
      attributes: [
        'class_id',
        'section_id',
        [fn('COUNT', col('id')), 'cnt'],
      ],
      group: ['class_id', 'section_id'],
      raw: true,
    });
    const enrollMap = new Map();
    for (const row of enrollmentCounts) {
      enrollMap.set(`${row.class_id}:${row.section_id}`, Number(row.cnt));
    }

    const data = timetables.map((tt) => {
      const key = `${tt.class_id}:${tt.subject_id}`;
      const allowedSections = [...(sectionAssignments.get(key) || [])];
      let total = 0;
      for (const sid of allowedSections) {
        total += enrollMap.get(`${tt.class_id}:${sid}`) || 0;
      }
      return {
        id: tt.id,
        class_id: tt.class_id,
        class_name: tt.schoolClass ? tt.schoolClass.name : null,
        subject_id: tt.subject_id,
        subject_name: tt.subject ? tt.subject.name : null,
        exam_date: tt.exam_date,
        start_time: tt.start_time,
        end_time: tt.end_time,
        room: tt.room,
        total_marks: Number(tt.total_marks),
        passing_marks: Number(tt.passing_marks),
        is_locked: !!tt.is_locked,
        deadline_at: tt.deadline_at,
        section_ids: allowedSections,
        total_students: total,
        entered: enteredMap.get(String(tt.id)) || 0,
      };
    });
    res.status(200).json({ data });
  } catch (err) {
    console.error('examTeacher.getMyExamPapers error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Per-student multi-subject summary for an exam, scoped to the classes/sections
 * the teacher is assigned to. Reuses the same result-computation pipeline as
 * the admin/PDF endpoints so the totals/grades match published values.
 */
exports.getMyExamSummary = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const teacher = await loadTeacher(tenantId, req.user.userId);
    if (!teacher) return res.status(403).json({ message: 'Forbidden' });

    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid id' });

    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status === 'draft' || exam.status === 'archived') {
      return res.status(403).json({ message: 'Exam not visible to teachers in this state' });
    }

    const assignments = await TeacherAcademicAssignment.findAll({
      where: {
        tenant_id: tenantId,
        teacher_id: teacher.id,
        academic_year_id: exam.academic_year_id,
      },
      attributes: ['class_id', 'section_id'],
    });
    if (assignments.length === 0) {
      return res.status(200).json({ data: [], grading_mode: null });
    }

    const allowedByClass = new Map();
    for (const a of assignments) {
      const set = allowedByClass.get(a.class_id) || new Set();
      set.add(a.section_id);
      allowedByClass.set(a.class_id, set);
    }

    const classRowMap = new Map();
    const classIds = [...allowedByClass.keys()];
    if (classIds.length > 0) {
      const classRows = await SchoolClass.findAll({
        where: { tenant_id: tenantId, id: classIds },
        attributes: ['id', 'name'],
      });
      for (const c of classRows) classRowMap.set(c.id, c.name);
    }

    let gradingMode = null;
    const out = [];
    for (const classId of classIds) {
      const allowedSections = allowedByClass.get(classId) || new Set();
      const built = await buildClassResults(tenantId, exam, classId);
      if (gradingMode == null) gradingMode = built.grading_mode;
      const className = classRowMap.get(classId) || null;
      for (const row of built.rows) {
        if (!allowedSections.has(row.section_id)) continue;
        out.push({
          student_id: row.student_id,
          admission_no: row.admission_no,
          display_name: row.display_name,
          class_id: classId,
          class_name: className,
          section_id: row.section_id,
          section_name: row.section_name,
          roll_number: row.roll_number,
          totals: row.totals,
          overall_grade: row.overall_grade,
          cgpa: row.cgpa,
          has_failure: row.has_failure,
          rank: row.rank,
        });
      }
    }

    out.sort((a, b) => {
      const cls = String(a.class_name || '').localeCompare(String(b.class_name || ''));
      if (cls !== 0) return cls;
      const sec = String(a.section_name || '').localeCompare(String(b.section_name || ''));
      if (sec !== 0) return sec;
      const ar = a.roll_number == null ? Number.POSITIVE_INFINITY : Number(a.roll_number);
      const br = b.roll_number == null ? Number.POSITIVE_INFINITY : Number(b.roll_number);
      return ar - br;
    });

    res.status(200).json({ data: out, grading_mode: gradingMode });
  } catch (err) {
    console.error('examTeacher.getMyExamSummary error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
