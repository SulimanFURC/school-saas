const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const User = require('../users/user.model');
const Tenant = require('../tenant/tenant.model');
const Student = require('../students/student.model');
const Teacher = require('../teachers/teacher.model');
const SchoolClass = require('../classes/class.model');
const AcademicYear = require('../classes/academicYear.model');
const Section = require('../classes/section.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const FeeCollection = require('../fees/feeCollection.model');
const Expense = require('../expenses/expense.model');
const Exam = require('../exams/exam.model');
const ExamMark = require('../exams/examMark.model');
const ExamTimetable = require('../exams/examTimetable.model');
const ExamRecheckRequest = require('../exams/examRecheckRequest.model');
const TeacherAcademicAssignment = require('../teachers/teacherAcademicAssignment.model');
const Subject = require('../subjects/subject.model');
const Notification = require('../notifications/notification.model');
const NotificationRead = require('../notifications/notificationRead.model');

function todayDateOnly() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function startOfMonthDateOnly() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function startOfYearDateOnly() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function endOfYearDateOnly() {
  const d = new Date();
  return `${d.getFullYear()}-12-31`;
}

async function getActiveAcademicYear(tenantId) {
  return AcademicYear.findOne({
    where: { tenant_id: tenantId, is_active: true },
  });
}

exports.adminDashboard = async (req, res) => {
  try {
    const role = String(req.user?.role ?? '').toLowerCase();
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const tenantId = req.tenant.id;

    const activeYear = await getActiveAcademicYear(tenantId);

    const monthStart = startOfMonthDateOnly();
    const today = todayDateOnly();
    const yearStart = startOfYearDateOnly();
    const yearEnd = endOfYearDateOnly();

    const [
      studentsTotal,
      studentsActive,
      studentsNewMonth,
      teachersTotal,
      classesTotal,
      feesMonth,
      feesYear,
      expensesMonth,
      expensesYear,
      examsUpcoming,
      examsOngoing,
      examsCompleted,
      recentStudents,
      recentFees,
      pendingDefaulters,
    ] = await Promise.all([
      Student.count({ where: { tenant_id: tenantId } }),
      Student.count({ where: { tenant_id: tenantId, status: 'active' } }),
      Student.count({
        where: {
          tenant_id: tenantId,
          createdAt: { [Op.gte]: new Date(monthStart + 'T00:00:00.000Z') },
        },
      }),
      Teacher.count({ where: { tenant_id: tenantId } }),
      SchoolClass.count({ where: { tenant_id: tenantId } }),
      FeeCollection.sum('amount', {
        where: {
          tenant_id: tenantId,
          collection_date: { [Op.between]: [monthStart, today] },
        },
      }),
      FeeCollection.sum('amount', {
        where: {
          tenant_id: tenantId,
          collection_date: { [Op.between]: [yearStart, yearEnd] },
        },
      }),
      Expense.sum('amount', {
        where: {
          tenant_id: tenantId,
          expense_date: { [Op.between]: [monthStart, today] },
        },
      }).catch(() => null),
      Expense.sum('amount', {
        where: {
          tenant_id: tenantId,
          expense_date: { [Op.between]: [yearStart, yearEnd] },
        },
      }).catch(() => null),
      Exam.count({
        where: {
          tenant_id: tenantId,
          status: { [Op.in]: ['draft', 'scheduled'] },
          start_date: { [Op.gt]: today },
        },
      }),
      Exam.count({
        where: {
          tenant_id: tenantId,
          status: 'ongoing',
        },
      }),
      Exam.count({
        where: {
          tenant_id: tenantId,
          status: { [Op.in]: ['published', 'archived', 'result_pending'] },
        },
      }),
      Student.findAll({
        where: { tenant_id: tenantId },
        attributes: ['id', 'full_name', 'first_name', 'last_name', 'admission_no', 'createdAt'],
        include: activeYear
          ? [
              {
                model: StudentEnrollment,
                as: 'enrollments',
                required: false,
                where: {
                  tenant_id: tenantId,
                  academic_year_id: activeYear.id,
                  status: 'active',
                },
                include: [
                  { model: SchoolClass, as: 'schoolClass', attributes: ['name'] },
                  { model: Section, as: 'section', attributes: ['name'] },
                ],
              },
            ]
          : [],
        order: [['createdAt', 'DESC']],
        limit: 5,
      }),
      FeeCollection.findAll({
        where: { tenant_id: tenantId },
        attributes: ['id', 'student_name', 'amount', 'collection_date', 'invoice_number'],
        order: [['collection_date', 'DESC'], ['created_at', 'DESC']],
        limit: 5,
      }),
      (async () => {
        if (!activeYear) return 0;
        const yearNum = new Date().getFullYear();
        const rows = await sequelize.query(
          `
          SELECT COUNT(DISTINCT se.student_id)::int AS c
          FROM student_enrollments se
          WHERE se.tenant_id = :tenantId
            AND se.academic_year_id = :ayId
            AND se.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM fee_collections fc
              WHERE fc.tenant_id = :tenantId
                AND fc.student_id = se.student_id
                AND EXTRACT(YEAR FROM fc.collection_date::date) = :yearNum
            )
          `,
          {
            replacements: { tenantId, ayId: activeYear.id, yearNum },
            type: sequelize.QueryTypes.SELECT,
          }
        );
        const row = rows && rows[0];
        return row?.c ?? 0;
      })(),
    ]);

    const admissions = recentStudents.map((s) => {
      const j = s.toJSON();
      const en = j.enrollments?.[0];
      const displayName =
        j.full_name ||
        [j.first_name, j.last_name].filter(Boolean).join(' ') ||
        'Student';
      return {
        id: j.id,
        name: displayName,
        admission_no: j.admission_no,
        class_name: en?.schoolClass?.name ?? null,
        section_name: en?.section?.name ?? null,
        admitted_on: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : null,
      };
    });

    const feeRows = recentFees.map((f) => {
      const j = f.toJSON();
      return {
        id: j.id,
        student_name: j.student_name,
        amount: j.amount != null ? Number(j.amount) : 0,
        date: j.collection_date,
        receipt_no: j.invoice_number,
      };
    });

    res.set('Cache-Control', 'private, max-age=60');
    return res.status(200).json({
      students: {
        total: studentsTotal,
        active: studentsActive,
        new_this_month: studentsNewMonth,
      },
      teachers: { total: teachersTotal, active: teachersTotal },
      classes: { total: classesTotal },
      fees: {
        collected_this_month: Number(feesMonth || 0),
        collected_this_year: Number(feesYear || 0),
        pending_defaulters: pendingDefaulters,
      },
      expenses: {
        total_this_month: Number(expensesMonth || 0),
        total_this_year: Number(expensesYear || 0),
      },
      exams: {
        upcoming: examsUpcoming,
        ongoing: examsOngoing,
        completed: examsCompleted,
      },
      recent_admissions: admissions,
      recent_fee_collections: feeRows,
    });
  } catch (err) {
    console.error('adminDashboard error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.teacherDashboard = async (req, res) => {
  try {
    const role = String(req.user?.role ?? '').toLowerCase();
    if (role !== 'teacher') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const tenantId = req.tenant.id;
    const userRow = await User.findOne({
      where: { id: req.user.userId, tenant_id: tenantId },
      attributes: ['id', 'teacher_id'],
    });
    if (!userRow?.teacher_id) {
      return res.status(403).json({ message: 'Teacher profile not linked' });
    }

    const teacherId = userRow.teacher_id;
    const today = todayDateOnly();

    const assignments = await TeacherAcademicAssignment.findAll({
      where: { tenant_id: tenantId, teacher_id: teacherId },
      include: [
        { model: SchoolClass, as: 'schoolClass', attributes: ['name'] },
        { model: Section, as: 'section', attributes: ['name'] },
        { model: AcademicYear, as: 'academicYear', attributes: ['name'] },
        { model: Subject, as: 'subject', attributes: ['name'] },
      ],
      order: [['academic_year_id', 'DESC']],
    });

    const myAssignments = assignments.map((a) => {
      const j = a.toJSON();
      return {
        class_name: j.schoolClass?.name ?? '',
        section_name: j.section?.name ?? '',
        subject_name: j.subject?.name ?? '',
        academic_year: j.academicYear?.name ?? '',
      };
    });

    const upcomingExams = await Exam.count({
      where: {
        tenant_id: tenantId,
        status: { [Op.in]: ['draft', 'scheduled'] },
        start_date: { [Op.gt]: today },
      },
    });

    let marksPending = 0;
    const withSubject = assignments.filter((a) => a.subject_id != null);
    if (withSubject.length > 0) {
      const pairConditions = [];
      const seen = new Set();
      for (const a of withSubject) {
        const k = `${a.class_id}:${a.subject_id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        pairConditions.push({ class_id: a.class_id, subject_id: a.subject_id });
      }
      const timetables = await ExamTimetable.findAll({
        where: {
          tenant_id: tenantId,
          [Op.or]: pairConditions,
        },
        attributes: ['id'],
      });
      const ttIds = timetables.map((t) => t.id);
      if (ttIds.length > 0) {
        marksPending = await ExamMark.count({
          where: {
            tenant_id: tenantId,
            exam_timetable_id: { [Op.in]: ttIds },
            entry_status: 'present',
            marks_obtained: { [Op.is]: null },
          },
        });
      }
    }

    const completedExams = await Exam.count({
      where: {
        tenant_id: tenantId,
        status: { [Op.in]: ['published', 'archived'] },
      },
    });

    const uid = req.user.userId;
    const recentNotifications = await Notification.findAll({
      where: {
        tenant_id: tenantId,
        [Op.or]: [{ recipient_user_id: uid }, { recipient_role: 'teacher' }],
      },
      attributes: ['id', 'title', 'body', 'createdAt', 'read_at', 'recipient_user_id'],
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    const notifPayload = await Promise.all(
      recentNotifications.map(async (n) => {
        const j = n.toJSON();
        let isRead = !!j.read_at;
        if (!isRead && j.recipient_user_id !== uid) {
          const r = await NotificationRead.findOne({
            where: {
              tenant_id: tenantId,
              notification_id: j.id,
              user_id: uid,
            },
          });
          isRead = !!r;
        }
        return {
          id: j.id,
          title: j.title,
          message: j.body,
          created_at: j.createdAt ?? j.created_at,
          is_read: isRead,
        };
      })
    );

    res.set('Cache-Control', 'private, max-age=60');
    return res.status(200).json({
      my_assignments: myAssignments,
      my_exams: {
        upcoming: upcomingExams,
        marks_pending: marksPending,
        completed: completedExams,
      },
      recent_notifications: notifPayload,
    });
  } catch (err) {
    console.error('teacherDashboard error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.studentDashboard = async (req, res) => {
  try {
    const role = String(req.user?.role ?? '').toLowerCase();
    if (role !== 'student') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const tenantId = req.tenant.id;
    const userRow = await User.findOne({
      where: { id: req.user.userId, tenant_id: tenantId },
      attributes: ['id', 'student_id'],
    });
    if (!userRow?.student_id) {
      return res.status(403).json({ message: 'Student profile not linked' });
    }

    const studentId = userRow.student_id;
    const activeYear = await getActiveAcademicYear(tenantId);

    let enrollmentPayload = {
      class_name: null,
      section_name: null,
      roll_number: null,
      academic_year: null,
    };

    if (activeYear) {
      const en = await StudentEnrollment.findOne({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          academic_year_id: activeYear.id,
          status: 'active',
        },
        include: [
          { model: SchoolClass, as: 'schoolClass', attributes: ['name'] },
          { model: Section, as: 'section', attributes: ['name'] },
          { model: AcademicYear, as: 'academicYear', attributes: ['name'] },
        ],
      });
      if (en) {
        const j = en.toJSON();
        enrollmentPayload = {
          class_name: j.schoolClass?.name ?? null,
          section_name: j.section?.name ?? null,
          roll_number: j.roll_number,
          academic_year: j.academicYear?.name ?? activeYear.name,
        };
      }
    }

    const recheckPending = await ExamRecheckRequest.count({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { [Op.in]: ['open', 'assigned'] },
      },
    });

    const recentMarks = await ExamMark.findAll({
      where: { tenant_id: tenantId, student_id: studentId },
      include: [
        {
          model: Exam,
          as: 'exam',
          attributes: ['title'],
          required: true,
        },
        {
          model: ExamTimetable,
          as: 'timetable',
          attributes: ['exam_date', 'total_marks'],
          required: true,
          include: [{ model: Subject, as: 'subject', attributes: ['name'] }],
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 5,
    });

    const recentExams = recentMarks.map((m) => {
      const j = m.toJSON();
      const mo = j.marks_obtained != null ? Number(j.marks_obtained) : null;
      const tm = j.timetable;
      return {
        exam_name: j.exam?.title ?? '',
        subject: tm?.subject?.name ?? '',
        marks_obtained: mo,
        total_marks: tm?.total_marks ?? null,
        grade: null,
        date: tm?.exam_date ?? null,
      };
    });

    const yearStart = startOfYearDateOnly();
    const yearEnd = endOfYearDateOnly();
    const totalPaidYear = await FeeCollection.sum('amount', {
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        collection_date: { [Op.between]: [yearStart, yearEnd] },
      },
    });

    const lastFee = await FeeCollection.findOne({
      where: { tenant_id: tenantId, student_id: studentId },
      order: [['collection_date', 'DESC']],
    });

    res.set('Cache-Control', 'private, max-age=60');
    return res.status(200).json({
      enrollment: enrollmentPayload,
      attendance_summary: { present: 0, absent: 0, total: 0 },
      recent_exams: recentExams,
      pending_recheck_requests: recheckPending,
      fee_status: {
        last_payment_amount: lastFee?.amount != null ? Number(lastFee.amount) : null,
        last_payment_date: lastFee?.collection_date ?? null,
        total_paid_this_year: Number(totalPaidYear || 0),
      },
    });
  } catch (err) {
    console.error('studentDashboard error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
