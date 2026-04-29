const { Op } = require('sequelize');
const Exam = require('./exam.model');
const ExamTimetable = require('./examTimetable.model');
const ExamMark = require('./examMark.model');
const ExamGradingConfig = require('./examGradingConfig.model');
const GradingScheme = require('./gradingScheme.model');
const GradingBand = require('./gradingBand.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const Subject = require('../subjects/subject.model');
const Student = require('../students/student.model');
const StudentEnrollment = require('../students/studentEnrollment.model');

/**
 * Pure helpers and services for result computation. Kept separate from
 * controllers so PDFs, REST handlers, and reports can all reuse the same logic.
 */

function findBandForPercent(bands, percent) {
  if (percent == null || !Number.isFinite(Number(percent))) return null;
  const p = Number(percent);
  for (const band of bands) {
    const min = Number(band.min_percent);
    const max = Number(band.max_percent);
    if (p >= min && p <= max) return band;
  }
  return null;
}

/**
 * Load grading config + bands for an exam (or null if none).
 */
async function loadGradingConfig(tenantId, examId) {
  const config = await ExamGradingConfig.findOne({
    where: { tenant_id: tenantId, exam_id: examId },
  });
  if (!config) return null;
  const scheme = await GradingScheme.findOne({
    where: { id: config.grading_scheme_id, tenant_id: tenantId },
  });
  if (!scheme) return null;
  const bands = await GradingBand.findAll({
    where: { tenant_id: tenantId, grading_scheme_id: scheme.id },
    order: [['min_percent', 'ASC']],
  });
  return {
    grading_mode: config.grading_mode,
    scheme: scheme.get({ plain: true }),
    bands: bands.map((b) => b.get({ plain: true })),
  };
}

/**
 * Compute per-subject result rows for a single student in one exam.
 * Returns:
 *   {
 *     papers: [{ timetable, mark, percentage, grade_band, is_failing }],
 *     totals: { total_max, total_obtained, percentage },
 *     overall_grade_band, has_failure
 *   }
 *
 * If gradingCfg is null we still compute totals/percentage but no grades.
 */
function computeStudentResult({ timetables, marksByTt, gradingCfg }) {
  const papers = [];
  let totalMax = 0;
  let totalObtained = 0;
  let countedPapers = 0;
  let hasFailure = false;
  const bands = gradingCfg ? gradingCfg.bands : [];
  const mode = gradingCfg ? gradingCfg.grading_mode : null;

  for (const tt of timetables) {
    const total = Number(tt.total_marks);
    const mark = marksByTt.get(tt.id) || null;
    let percentage = null;
    let band = null;
    let belowPassing = false;
    if (mark && mark.entry_status === 'present' && mark.marks_obtained != null) {
      const obtained = Number(mark.marks_obtained);
      percentage = total > 0 ? (obtained / total) * 100 : 0;
      if (mode === 'per_subject') {
        band = findBandForPercent(bands, percentage);
      }
      belowPassing = obtained < Number(tt.passing_marks);
      totalObtained += obtained;
      totalMax += total;
      countedPapers += 1;
      if (belowPassing) hasFailure = true;
      if (band && band.is_failing) hasFailure = true;
    } else if (mark && mark.entry_status === 'absent') {
      totalMax += total;
      countedPapers += 1;
      hasFailure = true;
    } else {
      totalMax += total;
    }

    papers.push({
      timetable_id: tt.id,
      class_id: tt.class_id,
      subject_id: tt.subject_id,
      subject_name: tt.subject_name || null,
      total_marks: total,
      passing_marks: Number(tt.passing_marks),
      mark: mark
        ? {
            entry_status: mark.entry_status,
            marks_obtained:
              mark.marks_obtained == null ? null : Number(mark.marks_obtained),
          }
        : null,
      percentage:
        percentage == null
          ? null
          : Number(percentage.toFixed(2)),
      grade: band
        ? {
            grade_label: band.grade_label,
            grade_point: band.grade_point == null ? null : Number(band.grade_point),
            remarks: band.remarks,
            is_failing: !!band.is_failing,
          }
        : null,
      below_passing: !!belowPassing,
    });
  }

  const overallPct = totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
  let overallBand = null;
  if (gradingCfg && mode === 'aggregate' && overallPct != null) {
    overallBand = findBandForPercent(bands, overallPct);
    if (overallBand && overallBand.is_failing) hasFailure = true;
  }

  let cgpa = null;
  if (gradingCfg && mode === 'per_subject' && countedPapers > 0) {
    const points = papers
      .map((p) => (p.grade ? p.grade.grade_point : null))
      .filter((x) => x != null);
    if (points.length > 0) {
      cgpa = Number((points.reduce((a, b) => a + Number(b), 0) / points.length).toFixed(2));
    }
  }

  return {
    papers,
    totals: {
      total_max: totalMax,
      total_obtained: Number(totalObtained.toFixed(2)),
      percentage: overallPct == null ? null : Number(overallPct.toFixed(2)),
    },
    overall_grade: overallBand
      ? {
          grade_label: overallBand.grade_label,
          grade_point:
            overallBand.grade_point == null ? null : Number(overallBand.grade_point),
          remarks: overallBand.remarks,
          is_failing: !!overallBand.is_failing,
        }
      : null,
    cgpa,
    has_failure: hasFailure,
  };
}

/**
 * Resolve a single student's full result for an exam: their enrolled class
 * timetable, marks, computed totals, and grades. Throws when the student is
 * not enrolled in any class participating in the exam.
 */
async function buildStudentResult(tenantId, exam, studentId) {
  const enrollment = await StudentEnrollment.findOne({
    where: {
      tenant_id: tenantId,
      academic_year_id: exam.academic_year_id,
      student_id: studentId,
      status: 'active',
    },
    include: [
      { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
      { model: Section, as: 'section', attributes: ['id', 'name'] },
    ],
  });
  if (!enrollment) {
    return {
      ok: false,
      status: 404,
      message: 'Student is not enrolled in this academic year',
    };
  }

  const timetables = await ExamTimetable.findAll({
    where: { tenant_id: tenantId, exam_id: exam.id, class_id: enrollment.class_id },
    include: [{ model: Subject, as: 'subject', attributes: ['id', 'name'] }],
    order: [['exam_date', 'ASC'], ['start_time', 'ASC']],
  });
  const ttPlain = timetables.map((tt) => {
    const p = tt.get({ plain: true });
    return {
      id: p.id,
      class_id: p.class_id,
      subject_id: p.subject_id,
      subject_name: p.subject ? p.subject.name : null,
      total_marks: p.total_marks,
      passing_marks: p.passing_marks,
      exam_date: p.exam_date,
      start_time: p.start_time,
      end_time: p.end_time,
      room: p.room,
    };
  });

  const marks = await ExamMark.findAll({
    where: {
      tenant_id: tenantId,
      exam_id: exam.id,
      student_id: studentId,
    },
  });
  const marksByTt = new Map(
    marks.map((m) => [m.exam_timetable_id, m.get({ plain: true })])
  );

  const gradingCfg = await loadGradingConfig(tenantId, exam.id);
  const result = computeStudentResult({
    timetables: ttPlain,
    marksByTt,
    gradingCfg,
  });

  const student = await Student.findOne({
    where: { id: studentId, tenant_id: tenantId },
    attributes: [
      'id',
      'admission_no',
      'full_name',
      'first_name',
      'last_name',
      'gender',
      'dob',
    ],
  });

  return {
    ok: true,
    data: {
      student: student ? student.get({ plain: true }) : null,
      enrollment: {
        class_id: enrollment.class_id,
        class_name: enrollment.schoolClass ? enrollment.schoolClass.name : null,
        section_id: enrollment.section_id,
        section_name: enrollment.section ? enrollment.section.name : null,
        roll_number: enrollment.roll_number,
      },
      papers: result.papers,
      totals: result.totals,
      overall_grade: result.overall_grade,
      cgpa: result.cgpa,
      has_failure: result.has_failure,
      grading_mode: gradingCfg ? gradingCfg.grading_mode : null,
    },
  };
}

/**
 * Build a class-level results dataset (one row per student). Includes ranks
 * computed by total_obtained desc within the class.
 */
async function buildClassResults(tenantId, exam, classId) {
  const enrollments = await StudentEnrollment.findAll({
    where: {
      tenant_id: tenantId,
      academic_year_id: exam.academic_year_id,
      class_id: classId,
      status: 'active',
    },
    include: [
      {
        model: Student,
        as: 'student',
        required: true,
        attributes: ['id', 'admission_no', 'full_name', 'first_name', 'last_name'],
      },
      { model: Section, as: 'section', attributes: ['id', 'name'] },
    ],
    order: [['roll_number', 'ASC']],
  });

  const timetables = await ExamTimetable.findAll({
    where: { tenant_id: tenantId, exam_id: exam.id, class_id: classId },
    include: [{ model: Subject, as: 'subject', attributes: ['id', 'name'] }],
    order: [['exam_date', 'ASC']],
  });
  const ttPlain = timetables.map((tt) => {
    const p = tt.get({ plain: true });
    return {
      id: p.id,
      class_id: p.class_id,
      subject_id: p.subject_id,
      subject_name: p.subject ? p.subject.name : null,
      total_marks: p.total_marks,
      passing_marks: p.passing_marks,
      exam_date: p.exam_date,
      start_time: p.start_time,
      end_time: p.end_time,
    };
  });

  const studentIds = enrollments.map((e) => e.student_id);
  const allMarks = studentIds.length
    ? await ExamMark.findAll({
        where: {
          tenant_id: tenantId,
          exam_id: exam.id,
          student_id: studentIds,
        },
      })
    : [];
  const marksByStudent = new Map();
  for (const m of allMarks) {
    const arr = marksByStudent.get(m.student_id) || new Map();
    arr.set(m.exam_timetable_id, m.get({ plain: true }));
    marksByStudent.set(m.student_id, arr);
  }

  const gradingCfg = await loadGradingConfig(tenantId, exam.id);

  const rows = enrollments.map((e) => {
    const plain = e.get({ plain: true });
    const studentMarks = marksByStudent.get(e.student_id) || new Map();
    const result = computeStudentResult({
      timetables: ttPlain,
      marksByTt: studentMarks,
      gradingCfg,
    });
    const stu = plain.student || {};
    const display =
      (stu.full_name && String(stu.full_name).trim()) ||
      [stu.first_name, stu.last_name].filter(Boolean).join(' ').trim();
    return {
      student_id: stu.id,
      admission_no: stu.admission_no,
      display_name: display,
      first_name: stu.first_name,
      last_name: stu.last_name,
      section_id: plain.section_id,
      section_name: plain.section ? plain.section.name : null,
      roll_number: plain.roll_number,
      papers: result.papers,
      totals: result.totals,
      overall_grade: result.overall_grade,
      cgpa: result.cgpa,
      has_failure: result.has_failure,
    };
  });

  rows.sort((a, b) => (b.totals.total_obtained || 0) - (a.totals.total_obtained || 0));
  let lastScore = null;
  let lastRank = 0;
  rows.forEach((row, idx) => {
    const score = row.totals.total_obtained || 0;
    if (lastScore !== null && score === lastScore) {
      row.rank = lastRank;
    } else {
      row.rank = idx + 1;
      lastRank = row.rank;
      lastScore = score;
    }
  });

  return {
    timetables: ttPlain,
    rows,
    grading_mode: gradingCfg ? gradingCfg.grading_mode : null,
  };
}

/**
 * Compute a grade distribution preview from currently-entered marks for an
 * exam. Useful before publishing to sanity-check the chosen scheme.
 */
async function buildGradeDistribution(tenantId, exam) {
  const gradingCfg = await loadGradingConfig(tenantId, exam.id);
  if (!gradingCfg) {
    return { configured: false, totals: { students: 0, papers: 0 }, distribution: [] };
  }

  const timetables = await ExamTimetable.findAll({
    where: { tenant_id: tenantId, exam_id: exam.id },
    include: [{ model: Subject, as: 'subject', attributes: ['id', 'name'] }],
  });
  const ttPlain = timetables.map((t) => {
    const p = t.get({ plain: true });
    return {
      id: p.id,
      class_id: p.class_id,
      subject_id: p.subject_id,
      total_marks: p.total_marks,
      passing_marks: p.passing_marks,
    };
  });

  const marks = await ExamMark.findAll({
    where: { tenant_id: tenantId, exam_id: exam.id },
  });

  const counts = new Map();
  for (const band of gradingCfg.bands) {
    counts.set(band.grade_label, { ...band, count: 0 });
  }
  counts.set('__ungraded__', { grade_label: 'Ungraded', count: 0 });

  if (gradingCfg.grading_mode === 'per_subject') {
    const ttById = new Map(ttPlain.map((t) => [t.id, t]));
    for (const m of marks) {
      const tt = ttById.get(m.exam_timetable_id);
      if (!tt) continue;
      if (m.entry_status !== 'present' || m.marks_obtained == null) {
        counts.get('__ungraded__').count += 1;
        continue;
      }
      const pct = (Number(m.marks_obtained) / Number(tt.total_marks)) * 100;
      const band = findBandForPercent(gradingCfg.bands, pct);
      if (band) counts.get(band.grade_label).count += 1;
      else counts.get('__ungraded__').count += 1;
    }
    return {
      configured: true,
      grading_mode: 'per_subject',
      totals: { papers: marks.length },
      distribution: [...counts.values()].filter((b) => b.count > 0 || b.grade_label !== 'Ungraded'),
    };
  }

  const byStudent = new Map();
  const ttById = new Map(ttPlain.map((t) => [t.id, t]));
  for (const m of marks) {
    const tt = ttById.get(m.exam_timetable_id);
    if (!tt) continue;
    const total = Number(tt.total_marks);
    const obtained = m.entry_status === 'present' ? Number(m.marks_obtained || 0) : 0;
    const cur = byStudent.get(m.student_id) || { obtained: 0, max: 0 };
    cur.obtained += obtained;
    cur.max += total;
    byStudent.set(m.student_id, cur);
  }
  for (const totals of byStudent.values()) {
    if (totals.max <= 0) {
      counts.get('__ungraded__').count += 1;
      continue;
    }
    const pct = (totals.obtained / totals.max) * 100;
    const band = findBandForPercent(gradingCfg.bands, pct);
    if (band) counts.get(band.grade_label).count += 1;
    else counts.get('__ungraded__').count += 1;
  }

  return {
    configured: true,
    grading_mode: 'aggregate',
    totals: { students: byStudent.size },
    distribution: [...counts.values()].filter((b) => b.count > 0 || b.grade_label !== 'Ungraded'),
  };
}

module.exports = {
  loadGradingConfig,
  findBandForPercent,
  computeStudentResult,
  buildStudentResult,
  buildClassResults,
  buildGradeDistribution,
};
