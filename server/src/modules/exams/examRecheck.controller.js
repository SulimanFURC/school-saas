const sequelize = require('../../config/db');
const Exam = require('./exam.model');
const ExamTimetable = require('./examTimetable.model');
const ExamRecheckRequest = require('./examRecheckRequest.model');
const Subject = require('../subjects/subject.model');
const SchoolClass = require('../classes/class.model');
const Student = require('../students/student.model');
const Teacher = require('../teachers/teacher.model');
const User = require('../users/user.model');
const notificationService = require('../notifications/notification.service');
const { RECHECK_STATUSES } = require('./exam.constants');
const { isUuid } = require('./exam.helpers');

function shapeRecheck(plain) {
  if (!plain) return null;
  return {
    id: plain.id,
    exam_id: plain.exam_id,
    exam_timetable_id: plain.exam_timetable_id,
    student_id: plain.student_id,
    status: plain.status,
    student_comment: plain.student_comment,
    teacher_comment: plain.teacher_comment,
    assigned_teacher_id: plain.assigned_teacher_id,
    created_at: plain.created_at,
    resolved_at: plain.resolved_at,
    student: plain.student
      ? {
          id: plain.student.id,
          admission_no: plain.student.admission_no,
          full_name: plain.student.full_name,
          first_name: plain.student.first_name,
          last_name: plain.student.last_name,
        }
      : null,
    timetable: plain.timetable
      ? {
          id: plain.timetable.id,
          class_id: plain.timetable.class_id,
          class_name: plain.timetable.schoolClass ? plain.timetable.schoolClass.name : null,
          subject_id: plain.timetable.subject_id,
          subject_name: plain.timetable.subject ? plain.timetable.subject.name : null,
        }
      : null,
    exam: plain.exam ? { id: plain.exam.id, title: plain.exam.title, exam_type: plain.exam.exam_type } : null,
  };
}

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const where = { tenant_id: tenantId };
    if (req.params.id) where.exam_id = req.params.id;
    const status = req.query.status ? String(req.query.status).trim() : '';
    if (status && RECHECK_STATUSES.includes(status)) where.status = status;

    const rows = await ExamRecheckRequest.findAll({
      where,
      include: [
        {
          model: Student,
          as: 'student',
          attributes: ['id', 'admission_no', 'full_name', 'first_name', 'last_name'],
        },
        {
          model: ExamTimetable,
          as: 'timetable',
          attributes: ['id', 'class_id', 'subject_id'],
          include: [
            { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
            { model: Subject, as: 'subject', attributes: ['id', 'name'] },
          ],
        },
        { model: Exam, as: 'exam', attributes: ['id', 'title', 'exam_type'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.status(200).json({ data: rows.map((r) => shapeRecheck(r.get({ plain: true }))) });
  } catch (err) {
    console.error('examRecheck.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.assign = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.requestId;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid id' });
    const teacherId = (req.body && req.body.teacher_id) || null;
    if (!isUuid(teacherId)) return res.status(400).json({ message: 'teacher_id required' });
    const teacher = await Teacher.findOne({ where: { id: teacherId, tenant_id: tenantId } });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    const row = await ExamRecheckRequest.findOne({ where: { id, tenant_id: tenantId } });
    if (!row) return res.status(404).json({ message: 'Recheck request not found' });
    await row.update({ assigned_teacher_id: teacherId, status: 'assigned' });

    const teacherUser = await User.findOne({
      where: { tenant_id: tenantId, role: 'teacher', teacher_id: teacherId },
    });
    if (teacherUser) {
      notificationService
        .notifyUser(tenantId, teacherUser.id, {
          title: 'Recheck request assigned',
          body: 'A re-evaluation request has been assigned to you. Please review the marks.',
          data: { recheck_id: row.id, exam_id: row.exam_id, kind: 'recheck.assigned' },
        })
        .catch((err) => console.error('examRecheck.assign notify error:', err));
    }

    res.status(200).json({ message: 'Recheck assigned', data: shapeRecheck(row.get({ plain: true })) });
  } catch (err) {
    console.error('examRecheck.assign error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.resolve = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.requestId;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid id' });
    const body = req.body || {};
    const target = body.status ? String(body.status).trim() : 'resolved';
    if (!['resolved', 'rejected', 'closed'].includes(target)) {
      return res.status(400).json({ message: 'Invalid target status' });
    }
    const comment = body.teacher_comment != null ? String(body.teacher_comment).trim() : '';
    if (!comment) {
      return res.status(400).json({ message: 'teacher_comment is required' });
    }
    const row = await ExamRecheckRequest.findOne({ where: { id, tenant_id: tenantId } });
    if (!row) return res.status(404).json({ message: 'Recheck request not found' });
    await row.update({
      status: target,
      teacher_comment: comment.slice(0, 1000),
      resolved_at: new Date(),
    });
    res.status(200).json({ message: 'Recheck updated', data: shapeRecheck(row.get({ plain: true })) });
  } catch (err) {
    console.error('examRecheck.resolve error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
