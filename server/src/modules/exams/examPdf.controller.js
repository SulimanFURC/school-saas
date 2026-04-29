const { PassThrough } = require('stream');
const archiver = require('archiver');
const Exam = require('./exam.model');
const ExamClass = require('./examClass.model');
const ExamTimetable = require('./examTimetable.model');
const ExamMark = require('./examMark.model');
const Subject = require('../subjects/subject.model');
const Student = require('../students/student.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const TenantBranding = require('../tenant-branding/tenantBranding.model');
const Tenant = require('../tenant/tenant.model');
const User = require('../users/user.model');
const resultsService = require('./examResults.service');
const { newDoc, drawHeader, drawKeyValueRow, drawTable, resolveLogoPath } = require('../../core/pdf/pdfHelpers');
const { isUuid, parsePositiveInt } = require('./exam.helpers');

async function loadTenantContext(tenantId) {
  const [tenant, branding] = await Promise.all([
    Tenant.findOne({ where: { id: tenantId } }),
    TenantBranding.findOne({ where: { tenant_id: tenantId } }),
  ]);
  return {
    tenant,
    branding,
    logoPath: resolveLogoPath(branding),
    primaryColor: branding && branding.primary_color ? branding.primary_color : '#1f4f8b',
  };
}

async function loadStudentForUser(tenantId, userId) {
  const u = await User.findOne({
    where: { id: userId, tenant_id: tenantId, role: 'student' },
  });
  if (!u || !u.student_id) return null;
  return u;
}

function studentDisplay(s) {
  if (!s) return '';
  return (
    (s.full_name && String(s.full_name).trim()) ||
    [s.first_name, s.last_name].filter(Boolean).join(' ').trim()
  );
}

/**
 * Build admit card PDF for a single student into the given writable stream.
 */
async function streamAdmitCard(tenantId, exam, studentId, target) {
  const enrollment = await StudentEnrollment.findOne({
    where: {
      tenant_id: tenantId,
      student_id: studentId,
      academic_year_id: exam.academic_year_id,
      status: 'active',
    },
    include: [
      { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
      { model: Section, as: 'section', attributes: ['id', 'name'] },
    ],
  });
  if (!enrollment) {
    throw Object.assign(new Error('Student not enrolled for this exam'), { status: 404 });
  }
  const student = await Student.findOne({
    where: { id: studentId, tenant_id: tenantId },
    attributes: ['id', 'admission_no', 'full_name', 'first_name', 'last_name', 'dob', 'gender'],
  });
  if (!student) throw Object.assign(new Error('Student not found'), { status: 404 });

  const timetables = await ExamTimetable.findAll({
    where: { tenant_id: tenantId, exam_id: exam.id, class_id: enrollment.class_id },
    include: [{ model: Subject, as: 'subject', attributes: ['id', 'name'] }],
    order: [['exam_date', 'ASC'], ['start_time', 'ASC']],
  });

  const ctx = await loadTenantContext(tenantId);
  const doc = newDoc();
  doc.pipe(target);

  drawHeader(doc, {
    tenantName: ctx.tenant ? ctx.tenant.name : 'School',
    logoPath: ctx.logoPath,
    title: 'Admit Card',
    subtitle: `${exam.title} (${exam.exam_type})`,
    primaryColor: ctx.primaryColor,
  });

  drawKeyValueRow(doc, 'Student Name', studentDisplay(student));
  drawKeyValueRow(doc, 'Admission No', student.admission_no);
  drawKeyValueRow(doc, 'Class', enrollment.schoolClass ? enrollment.schoolClass.name : '—');
  drawKeyValueRow(doc, 'Section', enrollment.section ? enrollment.section.name : '—');
  drawKeyValueRow(doc, 'Roll Number', enrollment.roll_number != null ? enrollment.roll_number : '—');
  drawKeyValueRow(doc, 'Exam Window', `${exam.start_date} to ${exam.end_date}`);
  doc.moveDown(0.5);

  drawTable(doc, {
    columns: [
      { key: 'idx', label: '#', width: 30, align: 'center' },
      { key: 'subject', label: 'Subject', width: 160 },
      { key: 'date', label: 'Date', width: 80 },
      { key: 'time', label: 'Time', width: 90 },
      { key: 'room', label: 'Room', width: 100 },
      { key: 'marks', label: 'Marks', width: 60, align: 'right' },
    ],
    rows: timetables.map((tt, idx) => {
      const p = tt.get({ plain: true });
      return {
        idx: idx + 1,
        subject: p.subject ? p.subject.name : '—',
        date: p.exam_date,
        time: `${p.start_time} – ${p.end_time}`,
        room: p.room || '—',
        marks: Number(p.total_marks),
      };
    }),
    headerFill: ctx.primaryColor,
  });

  doc.moveDown(2);
  doc.font('Helvetica').fontSize(9).fillColor('#666').text(
    'Bring this admit card to every paper. Late entry may not be permitted. Mobile phones and unauthorised material are strictly prohibited.',
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
  );
  doc.moveDown(2);
  const sigY = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor('#000').text("Student's Signature", doc.page.margins.left, sigY + 18);
  doc.text("Principal's Signature", doc.page.width - doc.page.margins.right - 130, sigY + 18, {
    width: 130,
    align: 'right',
  });

  doc.end();
}

async function streamResultCard(tenantId, exam, studentId, target) {
  const result = await resultsService.buildStudentResult(tenantId, exam, studentId);
  if (!result.ok) {
    throw Object.assign(new Error(result.message), { status: result.status });
  }
  const data = result.data;
  const ctx = await loadTenantContext(tenantId);
  const doc = newDoc();
  doc.pipe(target);

  drawHeader(doc, {
    tenantName: ctx.tenant ? ctx.tenant.name : 'School',
    logoPath: ctx.logoPath,
    title: 'Result Card',
    subtitle: `${exam.title} (${exam.exam_type}) — Published ${exam.published_at ? new Date(exam.published_at).toISOString().slice(0, 10) : ''}`,
    primaryColor: ctx.primaryColor,
  });

  drawKeyValueRow(doc, 'Student Name', studentDisplay(data.student));
  drawKeyValueRow(doc, 'Admission No', data.student ? data.student.admission_no : '—');
  drawKeyValueRow(doc, 'Class', data.enrollment.class_name || '—');
  drawKeyValueRow(doc, 'Section', data.enrollment.section_name || '—');
  drawKeyValueRow(doc, 'Roll Number', data.enrollment.roll_number != null ? data.enrollment.roll_number : '—');
  doc.moveDown(0.5);

  drawTable(doc, {
    columns: [
      { key: 'idx', label: '#', width: 30, align: 'center' },
      { key: 'subject', label: 'Subject', width: 160 },
      { key: 'total', label: 'Max', width: 50, align: 'right' },
      { key: 'obtained', label: 'Obtained', width: 70, align: 'right' },
      { key: 'percentage', label: '%', width: 50, align: 'right' },
      { key: 'grade', label: 'Grade', width: 60, align: 'center' },
      { key: 'status', label: 'Status', width: 90 },
    ],
    rows: data.papers.map((p, idx) => {
      const status =
        !p.mark
          ? 'Not entered'
          : p.mark.entry_status === 'absent'
            ? 'Absent'
            : p.mark.entry_status === 'exempted'
              ? 'Exempted'
              : p.mark.entry_status === 'withheld'
                ? 'Withheld'
                : p.below_passing
                  ? 'Failed'
                  : 'Passed';
      return {
        idx: idx + 1,
        subject: p.subject_name || '—',
        total: p.total_marks,
        obtained:
          p.mark && p.mark.marks_obtained != null
            ? Number(p.mark.marks_obtained)
            : '—',
        percentage: p.percentage == null ? '—' : `${p.percentage}%`,
        grade: p.grade ? p.grade.grade_label : '—',
        status,
      };
    }),
    headerFill: ctx.primaryColor,
  });

  doc.moveDown(0.5);
  drawKeyValueRow(doc, 'Total Max', data.totals.total_max);
  drawKeyValueRow(doc, 'Total Obtained', data.totals.total_obtained);
  drawKeyValueRow(doc, 'Percentage', data.totals.percentage == null ? '—' : `${data.totals.percentage}%`);
  if (data.overall_grade) {
    drawKeyValueRow(doc, 'Overall Grade', `${data.overall_grade.grade_label}${data.overall_grade.remarks ? ` (${data.overall_grade.remarks})` : ''}`);
  }
  if (data.cgpa != null) drawKeyValueRow(doc, 'CGPA', data.cgpa);
  drawKeyValueRow(doc, 'Result', data.has_failure ? 'Failed' : 'Passed');

  doc.moveDown(2);
  doc.font('Helvetica').fontSize(9).fillColor('#666').text(
    'This result card is generated by the school management system. For any discrepancy, contact the examination office within the re-evaluation window.',
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
  );

  doc.moveDown(2);
  const sigY = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor('#000').text("Class Teacher", doc.page.margins.left, sigY + 18);
  doc.text("Principal's Signature", doc.page.width - doc.page.margins.right - 130, sigY + 18, {
    width: 130,
    align: 'right',
  });

  doc.end();
}

exports.adminAdmitCard = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const studentId = req.params.studentId;
    if (!isUuid(examId) || !isUuid(studentId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (!exam.timetable_finalized_at) {
      return res.status(409).json({ message: 'Timetable is not finalized yet' });
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="admit-card-${studentId}.pdf"`
    );
    await streamAdmitCard(tenantId, exam, studentId, res);
  } catch (err) {
    if (err && err.status) {
      if (!res.headersSent) {
        return res.status(err.status).json({ message: err.message });
      }
    }
    console.error('examPdf.adminAdmitCard error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    else res.end();
  }
};

exports.adminResultCard = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const studentId = req.params.studentId;
    if (!isUuid(examId) || !isUuid(studentId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="result-card-${studentId}.pdf"`
    );
    await streamResultCard(tenantId, exam, studentId, res);
  } catch (err) {
    if (err && err.status && !res.headersSent) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('examPdf.adminResultCard error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    else res.end();
  }
};

exports.studentAdmitCard = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid id' });
    const user = await loadStudentForUser(tenantId, req.user.userId);
    if (!user) return res.status(403).json({ message: 'Forbidden' });
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (!exam.timetable_finalized_at) {
      return res.status(403).json({ message: 'Admit card not yet available' });
    }
    if (exam.status === 'archived' || exam.status === 'draft') {
      return res.status(403).json({ message: 'Admit card not available' });
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="admit-card-${exam.id}.pdf"`
    );
    await streamAdmitCard(tenantId, exam, user.student_id, res);
  } catch (err) {
    if (err && err.status && !res.headersSent) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('examPdf.studentAdmitCard error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    else res.end();
  }
};

exports.studentResultCard = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid id' });
    const user = await loadStudentForUser(tenantId, req.user.userId);
    if (!user) return res.status(403).json({ message: 'Forbidden' });
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status !== 'published') {
      return res.status(403).json({ message: 'Results not yet published' });
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="result-card-${exam.id}.pdf"`
    );
    await streamResultCard(tenantId, exam, user.student_id, res);
  } catch (err) {
    if (err && err.status && !res.headersSent) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('examPdf.studentResultCard error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    else res.end();
  }
};

async function streamBulkPdfs({ tenantId, exam, classId, mode, res }) {
  const examClass = await ExamClass.findOne({
    where: { tenant_id: tenantId, exam_id: exam.id, class_id: classId },
  });
  if (!examClass) {
    res.status(404).json({ message: 'Class is not part of this exam' });
    return;
  }
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
    ],
    order: [['roll_number', 'ASC']],
  });
  if (enrollments.length === 0) {
    res.status(404).json({ message: 'No students enrolled in this class' });
    return;
  }

  const fileNamePrefix = mode === 'admit' ? 'admit-card' : 'result-card';
  res.status(200);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileNamePrefix}s-class-${classId}.zip"`
  );

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('examPdf.streamBulkPdfs archive error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    else res.end();
  });
  archive.pipe(res);

  for (const e of enrollments) {
    const stu = e.student;
    if (!stu) continue;
    const safeAdm = String(stu.admission_no || stu.id).replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${fileNamePrefix}-${safeAdm}.pdf`;
    const stream = new PassThrough();
    archive.append(stream, { name: filename });
    try {
      if (mode === 'admit') {
        await streamAdmitCard(tenantId, exam, stu.id, stream);
      } else {
        await streamResultCard(tenantId, exam, stu.id, stream);
      }
    } catch (err) {
      console.error('examPdf.bulk single failed:', err);
      stream.end();
    }
  }
  await archive.finalize();
}

exports.bulkAdmitCards = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const classId = parsePositiveInt(req.params.classId);
    if (!isUuid(examId) || !classId) return res.status(400).json({ message: 'Invalid id' });
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (!exam.timetable_finalized_at) {
      return res.status(409).json({ message: 'Timetable is not finalized yet' });
    }
    await streamBulkPdfs({ tenantId, exam, classId, mode: 'admit', res });
  } catch (err) {
    console.error('examPdf.bulkAdmitCards error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    else res.end();
  }
};

exports.bulkResultCards = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const classId = parsePositiveInt(req.params.classId);
    if (!isUuid(examId) || !classId) return res.status(400).json({ message: 'Invalid id' });
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status !== 'published') {
      return res.status(403).json({ message: 'Results not yet published' });
    }
    await streamBulkPdfs({ tenantId, exam, classId, mode: 'result', res });
  } catch (err) {
    console.error('examPdf.bulkResultCards error:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    else res.end();
  }
};

exports.classResults = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    const classId = parsePositiveInt(req.params.classId);
    if (!isUuid(examId) || !classId) return res.status(400).json({ message: 'Invalid id' });
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    const data = await resultsService.buildClassResults(tenantId, exam, classId);
    res.status(200).json({ data });
  } catch (err) {
    console.error('examPdf.classResults error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
