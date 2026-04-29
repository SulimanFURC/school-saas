const { Op, fn, col } = require('sequelize');
const sequelize = require('../../config/db');
const User = require('../users/user.model');
const Student = require('../students/student.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const FeeCollection = require('../fees/feeCollection.model');
const Expense = require('../expenses/expense.model');
const Exam = require('../exams/exam.model');
const ExamMark = require('../exams/examMark.model');
const ExamTimetable = require('../exams/examTimetable.model');
const Subject = require('../subjects/subject.model');
const Teacher = require('../teachers/teacher.model');
const TeacherAcademicAssignment = require('../teachers/teacherAcademicAssignment.model');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function badUuid(res, label = 'id') {
  return res.status(400).json({ message: `Invalid ${label}` });
}

exports.enrollmentSummary = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { academic_year_id: ayRaw, class_id: classRaw } = req.query;
    if (ayRaw == null || ayRaw === '') {
      return res.status(400).json({ message: 'academic_year_id is required' });
    }
    const ayId = parseInt(ayRaw, 10);
    if (!Number.isFinite(ayId)) return res.status(400).json({ message: 'Invalid academic_year_id' });

    const whereEnroll = {
      tenant_id: tenantId,
      academic_year_id: ayId,
      status: 'active',
    };
    if (classRaw != null && classRaw !== '') {
      const cid = parseInt(classRaw, 10);
      if (!Number.isFinite(cid)) return res.status(400).json({ message: 'Invalid class_id' });
      whereEnroll.class_id = cid;
    }

    const total = await StudentEnrollment.count({ where: whereEnroll });

    const rows = await sequelize.query(
      `
      SELECT COALESCE(s.gender, 'unknown') AS gender, COUNT(*)::int AS cnt
      FROM student_enrollments se
      INNER JOIN students s ON s.id = se.student_id AND s.tenant_id = :tenantId
      WHERE se.tenant_id = :tenantId
        AND se.academic_year_id = :ayId
        AND se.status = 'active'
        ${classRaw != null && classRaw !== '' ? 'AND se.class_id = :cid' : ''}
      GROUP BY COALESCE(s.gender, 'unknown')
      `,
      {
        replacements:
          classRaw != null && classRaw !== ''
            ? { tenantId, ayId, cid: parseInt(classRaw, 10) }
            : { tenantId, ayId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.status(200).json({
      data: {
        total_enrolled: total,
        by_gender: rows.map((r) => ({ gender: r.gender, count: Number(r.cnt) })),
      },
    });
  } catch (err) {
    console.error('enrollmentSummary error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.attendanceStub = async (req, res) => {
  try {
    res.status(200).json({ message: 'Attendance module coming soon', data: {} });
  } catch (err) {
    console.error('attendanceStub error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.studentListReport = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const {
      academic_year_id: ayRaw,
      class_id: classRaw,
      section_id: secRaw,
      status = 'active',
      page = '1',
      limit = '50',
    } = req.query;

    if (!ayRaw || !Number.isFinite(parseInt(ayRaw, 10))) {
      return res.status(400).json({ message: 'academic_year_id is required' });
    }
    const ayId = parseInt(ayRaw, 10);

    const whereEnroll = {
      tenant_id: tenantId,
      academic_year_id: ayId,
    };
    if (status === 'active') whereEnroll.status = 'active';
    if (classRaw != null && classRaw !== '') {
      whereEnroll.class_id = parseInt(classRaw, 10);
    }
    if (secRaw != null && secRaw !== '') {
      whereEnroll.section_id = parseInt(secRaw, 10);
    }

    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const pg = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pg - 1) * lim;

    const { count, rows } = await StudentEnrollment.findAndCountAll({
      where: whereEnroll,
      include: [
        {
          model: Student,
          as: 'student',
          attributes: ['id', 'full_name', 'first_name', 'last_name', 'admission_no'],
          required: true,
        },
        { model: SchoolClass, as: 'schoolClass', attributes: ['name'] },
        { model: Section, as: 'section', attributes: ['name'] },
      ],
      limit: lim,
      offset,
      order: [['student_id', 'ASC']],
    });

    const data = rows.map((e) => {
      const j = e.toJSON();
      const name =
        j.student?.full_name ||
        [j.student?.first_name, j.student?.last_name].filter(Boolean).join(' ') ||
        '';
      return {
        student_id: j.student?.id,
        admission_no: j.student?.admission_no,
        name,
        class_name: j.schoolClass?.name,
        section_name: j.section?.name,
        roll_number: j.roll_number,
      };
    });

    res.status(200).json({ data, total: count, page: pg, limit: lim });
  } catch (err) {
    console.error('studentListReport error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.feeCollectionSummary = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ message: 'date_from and date_to are required (YYYY-MM-DD)' });
    }
    const where = {
      tenant_id: tenantId,
      collection_date: { [Op.between]: [String(date_from), String(date_to)] },
    };

    const byMode = await FeeCollection.findAll({
      attributes: ['payment_method', [fn('SUM', col('amount')), 'total']],
      where: { tenant_id: tenantId, collection_date: where.collection_date },
      group: ['payment_method'],
      raw: true,
    });

    res.status(200).json({
      data: {
        total_collected: Number(total || 0),
        by_payment_mode: byMode.map((r) => ({
          mode: r.payment_method,
          total: Number(r.total),
        })),
      },
    });
  } catch (err) {
    console.error('feeCollectionSummary error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.feeDefaulters = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { academic_year_id: ayRaw } = req.query;
    if (!ayRaw) return res.status(400).json({ message: 'academic_year_id is required' });
    const ayId = parseInt(ayRaw, 10);

    const rows = await sequelize.query(
      `
      SELECT s.id AS student_id, s.admission_no,
             COALESCE(s.full_name, TRIM(CONCAT(COALESCE(s.first_name,''),' ',COALESCE(s.last_name,'')))) AS student_name,
             (
               SELECT MAX(fc.collection_date)::text
               FROM fee_collections fc
               WHERE fc.tenant_id = :tenantId AND fc.student_id = s.id
             ) AS last_payment_date
      FROM student_enrollments se
      INNER JOIN students s ON s.id = se.student_id AND s.tenant_id = :tenantId
      WHERE se.tenant_id = :tenantId
        AND se.academic_year_id = :ayId
        AND se.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM fee_collections fc2
          WHERE fc2.tenant_id = :tenantId
            AND fc2.student_id = se.student_id
            AND EXTRACT(YEAR FROM fc2.collection_date::date) = EXTRACT(YEAR FROM CURRENT_DATE)
        )
      ORDER BY s.admission_no ASC
      LIMIT 500
      `,
      { replacements: { tenantId, ayId }, type: sequelize.QueryTypes.SELECT }
    );

    res.status(200).json({ data: rows });
  } catch (err) {
    console.error('feeDefaulters error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.expenseSummary = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ message: 'date_from and date_to are required' });
    }
    const rows = await Expense.findAll({
      attributes: ['expense_type', [fn('SUM', col('amount')), 'total']],
      where: {
        tenant_id: tenantId,
        expense_date: { [Op.between]: [String(date_from), String(date_to)] },
      },
      group: ['expense_type'],
      raw: true,
    });
    const total = await Expense.sum('amount', {
      where: {
        tenant_id: tenantId,
        expense_date: { [Op.between]: [String(date_from), String(date_to)] },
      },
    });
    res.status(200).json({
      data: {
        total: Number(total || 0),
        by_category: rows.map((r) => ({
          category: r.expense_type,
          total: Number(r.total),
        })),
      },
    });
  } catch (err) {
    console.error('expenseSummary error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.examResultSummary = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.examId;
    if (!examId || !UUID_RE.test(examId)) return badUuid(res, 'exam id');

    const exam = await Exam.findOne({
      where: { id: examId, tenant_id: tenantId },
    });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status !== 'published') {
      return res.status(400).json({ message: 'Exam must be published' });
    }

    const marks = await ExamMark.findAll({
      where: { tenant_id: tenantId, exam_id: examId },
      attributes: ['marks_obtained', 'entry_status'],
      raw: true,
    });

    let pass = 0;
    let fail = 0;
    for (const m of marks) {
      if (m.entry_status !== 'present' || m.marks_obtained == null) continue;
      const v = Number(m.marks_obtained);
      if (Number.isNaN(v)) continue;
      if (v >= 40) pass += 1;
      else fail += 1;
    }

    res.status(200).json({
      data: {
        exam_id: examId,
        pass_count: pass,
        fail_count: fail,
      },
    });
  } catch (err) {
    console.error('examResultSummary error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.studentResultReport = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const studentId = req.params.studentId;
    if (!studentId || !UUID_RE.test(studentId)) return badUuid(res, 'student id');

    const role = String(req.user.role ?? '').toLowerCase();
    const requester = await User.findOne({
      where: { id: req.user.userId, tenant_id: tenantId },
      attributes: ['id', 'student_id'],
    });

    if (role === 'student') {
      if (!requester?.student_id || requester.student_id !== studentId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const ayRaw = req.query.academic_year_id;
    const whereMark = { tenant_id: tenantId, student_id: studentId };
    const includeExam = [
      {
        model: Exam,
        as: 'exam',
        attributes: ['title', 'academic_year_id'],
        required: true,
      },
      {
        model: ExamTimetable,
        as: 'timetable',
        attributes: ['exam_date', 'total_marks'],
        required: true,
        include: [{ model: Subject, as: 'subject', attributes: ['name'] }],
      },
    ];
    if (ayRaw != null && ayRaw !== '') {
      const ayId = parseInt(ayRaw, 10);
      if (!Number.isFinite(ayId)) return res.status(400).json({ message: 'Invalid academic_year_id' });
      includeExam[0].where = { academic_year_id: ayId };
    }

    const marks = await ExamMark.findAll({
      where: whereMark,
      include: includeExam,
      order: [['updated_at', 'DESC']],
    });

    const data = marks.map((m) => {
      const j = m.toJSON();
      return {
        exam_name: j.exam?.title,
        subject: j.timetable?.subject?.name,
        marks_obtained: j.marks_obtained != null ? Number(j.marks_obtained) : null,
        total_marks: j.timetable?.total_marks,
        date: j.timetable?.exam_date,
      };
    });

    res.status(200).json({ data });
  } catch (err) {
    console.error('studentResultReport error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.dailyFeeCollection = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    const rows = await FeeCollection.findAll({
      where: { tenant_id: tenantId, collection_date: String(date) },
      attributes: ['id', 'student_name', 'amount', 'class_name', 'invoice_number', 'payment_method'],
      order: [['created_at', 'DESC']],
    });
    const byClass = {};
    for (const r of rows) {
      const key = r.class_name || '—';
      if (!byClass[key]) byClass[key] = [];
      byClass[key].push(r.get({ plain: true }));
    }
    res.status(200).json({ data: { date, by_class: byClass } });
  } catch (err) {
    console.error('dailyFeeCollection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.teacherAssignmentSummary = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const ayRaw = req.query.academic_year_id;
    if (!ayRaw) return res.status(400).json({ message: 'academic_year_id is required' });
    const ayId = parseInt(ayRaw, 10);
    if (!Number.isFinite(ayId)) return res.status(400).json({ message: 'Invalid academic_year_id' });

    const assigns = await TeacherAcademicAssignment.findAll({
      where: { tenant_id: tenantId, academic_year_id: ayId },
      include: [{ model: Teacher, as: 'teacher', attributes: ['first_name', 'last_name'] }],
    });

    const map = new Map();
    for (const a of assigns) {
      const tid = a.teacher_id;
      const name = a.teacher
        ? `${a.teacher.first_name} ${a.teacher.last_name}`
        : String(tid);
      const prev = map.get(tid) ?? { teacher_name: name, assignments: 0 };
      prev.assignments += 1;
      map.set(tid, prev);
    }

    res.status(200).json({
      data: [...map.values()],
    });
  } catch (err) {
    console.error('teacherAssignmentSummary error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
