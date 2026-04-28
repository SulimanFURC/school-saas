const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const Teacher = require('./teacher.model');
const TeacherAcademicAssignment = require('./teacherAcademicAssignment.model');
const User = require('../users/user.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const AcademicYear = require('../classes/academicYear.model');
const Subject = require('../subjects/subject.model');
const Student = require('../students/student.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const {
  isUuid,
  parsePositiveInt,
  shapeAssignmentRow,
  validateCreateAssignmentInput,
  summarizeAssignments,
} = require('./teacherAssignment.helpers');

async function getActiveAcademicYear(tenantId) {
  return AcademicYear.findOne({
    where: { tenant_id: tenantId, is_active: true },
    order: [['id', 'DESC']],
  });
}

async function loadTeacherForUser(tenantId, userId) {
  const loginUser = await User.findOne({
    where: { id: userId, tenant_id: tenantId, role: 'teacher' },
  });
  if (!loginUser || !loginUser.teacher_id) {
    return null;
  }
  return Teacher.findOne({
    where: { id: loginUser.teacher_id, tenant_id: tenantId },
  });
}

function loadAssignments(tenantId, where) {
  return TeacherAcademicAssignment.findAll({
    where,
    include: [
      { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name', 'is_active'] },
      { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
      { model: Section, as: 'section', attributes: ['id', 'name'] },
      { model: Subject, as: 'subject', attributes: ['id', 'name', 'is_active'] },
    ],
    order: [
      [{ model: SchoolClass, as: 'schoolClass' }, 'name', 'ASC'],
      [{ model: Section, as: 'section' }, 'name', 'ASC'],
      [{ model: Subject, as: 'subject' }, 'name', 'ASC'],
      ['subject_name', 'ASC'],
    ],
  });
}

async function ensureClassSectionMatch(tenantId, classId, sectionId, transaction) {
  const cls = await SchoolClass.findOne({
    where: { id: classId, tenant_id: tenantId },
    transaction,
  });
  if (!cls) {
    return { ok: false, status: 404, message: 'Class not found' };
  }
  const sec = await Section.findOne({
    where: { id: sectionId, tenant_id: tenantId, class_id: classId },
    transaction,
  });
  if (!sec) {
    return { ok: false, status: 400, message: 'Section does not belong to the selected class' };
  }
  return { ok: true, schoolClass: cls, section: sec };
}

/**
 * Admin: list a teacher's assignments. Optional `academic_year_id` filter.
 */
exports.listForTeacher = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const teacherId = req.params.id;
    if (!isUuid(teacherId)) {
      return res.status(400).json({ message: 'Invalid teacher id' });
    }
    const teacher = await Teacher.findOne({
      where: { id: teacherId, tenant_id: tenantId },
    });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const where = { tenant_id: tenantId, teacher_id: teacherId };
    const yearId = parsePositiveInt(req.query.academic_year_id);
    if (yearId) {
      where.academic_year_id = yearId;
    }

    const rows = await loadAssignments(tenantId, where);
    res.status(200).json({
      data: rows.map((r) => shapeAssignmentRow(r.get({ plain: true }))),
    });
  } catch (err) {
    console.error('teacherAssignments.listForTeacher error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Admin: create a teaching assignment for a teacher.
 * Replace semantics: for the same (year, class, section, subject) slot, there is
 * at most one teacher. Creating an assignment will upsert that slot to the given teacher.
 *
 * Body: { academic_year_id, class_id, section_id, subject_id }
 */
exports.create = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const teacherId = req.params.id;
    if (!isUuid(teacherId)) {
      return res.status(400).json({ message: 'Invalid teacher id' });
    }
    const validation = validateCreateAssignmentInput(req.body || {});
    if (!validation.ok) {
      return res.status(validation.status).json({ message: validation.message });
    }
    const { academic_year_id: academicYearId, class_id: classId, section_id: sectionId, subject_id: subjectId } =
      validation.value;

    const teacher = await Teacher.findOne({
      where: { id: teacherId, tenant_id: tenantId },
    });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const year = await AcademicYear.findOne({
      where: { id: academicYearId, tenant_id: tenantId },
    });
    if (!year) {
      return res.status(404).json({ message: 'Academic year not found' });
    }

    const subject = await Subject.findOne({
      where: { id: subjectId, tenant_id: tenantId },
    });
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    if (!subject.is_active) {
      return res.status(409).json({ message: 'This subject is inactive' });
    }

    const match = await ensureClassSectionMatch(tenantId, classId, sectionId);
    if (!match.ok) {
      return res.status(match.status).json({ message: match.message });
    }

    // Replace-style upsert for the slot.
    const whereSlot = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
      class_id: classId,
      section_id: sectionId,
      subject_id: subjectId,
    };

    const existing = await TeacherAcademicAssignment.findOne({ where: whereSlot });
    if (existing) {
      if (existing.teacher_id === teacherId) {
        const reloaded = await TeacherAcademicAssignment.findOne({
          where: { id: existing.id, tenant_id: tenantId },
          include: [
            { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name', 'is_active'] },
            { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
            { model: Section, as: 'section', attributes: ['id', 'name'] },
            { model: Subject, as: 'subject', attributes: ['id', 'name', 'is_active'] },
          ],
        });
        return res.status(200).json({
          message: 'Already assigned',
          data: shapeAssignmentRow(reloaded.get({ plain: true })),
        });
      }

      await existing.update({
        teacher_id: teacherId,
        subject_name: subject.name, // keep legacy display field consistent
      });

      const reloaded = await TeacherAcademicAssignment.findOne({
        where: { id: existing.id, tenant_id: tenantId },
        include: [
          { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name', 'is_active'] },
          { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
          { model: Section, as: 'section', attributes: ['id', 'name'] },
          { model: Subject, as: 'subject', attributes: ['id', 'name', 'is_active'] },
        ],
      });
      return res.status(200).json({
        message: 'Assignment reassigned',
        data: shapeAssignmentRow(reloaded.get({ plain: true })),
      });
    }

    const created = await TeacherAcademicAssignment.create({
      tenant_id: tenantId,
      teacher_id: teacherId,
      academic_year_id: academicYearId,
      class_id: classId,
      section_id: sectionId,
      subject_id: subjectId,
      subject_name: subject.name,
    });

    const reloaded = await TeacherAcademicAssignment.findOne({
      where: { id: created.id, tenant_id: tenantId },
      include: [
        { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name', 'is_active'] },
        { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
        { model: Section, as: 'section', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'is_active'] },
      ],
    });

    res.status(201).json({
      message: 'Assignment created',
      data: shapeAssignmentRow(reloaded.get({ plain: true })),
    });
  } catch (err) {
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Assignment conflict' });
    }
    console.error('teacherAssignments.create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Admin: remove a teaching assignment from a teacher.
 */
exports.remove = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const teacherId = req.params.id;
    const assignmentId = req.params.assignmentId;
    if (!isUuid(teacherId)) {
      return res.status(400).json({ message: 'Invalid teacher id' });
    }
    if (!isUuid(assignmentId)) {
      return res.status(400).json({ message: 'Invalid assignment id' });
    }
    const row = await TeacherAcademicAssignment.findOne({
      where: { id: assignmentId, teacher_id: teacherId, tenant_id: tenantId },
    });
    if (!row) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    await row.destroy();
    res.status(204).send();
  } catch (err) {
    console.error('teacherAssignments.remove error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Resolve the academic year for a teacher dashboard request.
 * Defaults to the active year. Returns null when not found.
 */
async function resolveYear(tenantId, requestedYearId) {
  if (requestedYearId) {
    return AcademicYear.findOne({
      where: { id: requestedYearId, tenant_id: tenantId },
    });
  }
  return getActiveAcademicYear(tenantId);
}

function parseCsvUuids(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => isUuid(x));
}

/**
 * Admin: stats for teacher load for a given (or active) academic year.
 * Query params:
 * - academic_year_id?: number (defaults to active year)
 * - teacher_ids?: comma-separated UUID list (optional filter)
 */
exports.assignmentStats = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const requestedYearId = parsePositiveInt(req.query.academic_year_id);
    const year = await resolveYear(tenantId, requestedYearId);
    if (!year) {
      return res.status(200).json({
        academic_year: null,
        is_active_year: false,
        data: [],
      });
    }

    const teacherIds = parseCsvUuids(req.query.teacher_ids);
    const where = {
      tenant_id: tenantId,
      academic_year_id: year.id,
    };
    if (teacherIds.length > 0) {
      where.teacher_id = { [Op.in]: teacherIds };
    }

    const rows = await TeacherAcademicAssignment.findAll({
      where,
      attributes: [
        'teacher_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'assignment_count'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('class_id'))), 'distinct_class_count'],
        [
          sequelize.fn(
            'COUNT',
            sequelize.literal(`DISTINCT (class_id::text || ':' || section_id::text)`)
          ),
          'distinct_section_count',
        ],
      ],
      group: ['teacher_id'],
      raw: true,
    });

    const homeroomWhere = { tenant_id: tenantId };
    if (teacherIds.length > 0) homeroomWhere.class_teacher_id = { [Op.in]: teacherIds };
    const homeroomRows = await SchoolClass.findAll({
      where: homeroomWhere,
      attributes: [
        'class_teacher_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'homeroom_class_count'],
      ],
      group: ['class_teacher_id'],
      raw: true,
    });

    const byTeacher = new Map();
    for (const r of rows) {
      const id = String(r.teacher_id);
      byTeacher.set(id, {
        teacher_id: id,
        assignment_count: Number(r.assignment_count || 0),
        distinct_class_count: Number(r.distinct_class_count || 0),
        distinct_section_count: Number(r.distinct_section_count || 0),
        homeroom_class_count: 0,
      });
    }
    for (const r of homeroomRows) {
      const id = r.class_teacher_id ? String(r.class_teacher_id) : '';
      if (!id) continue;
      const current =
        byTeacher.get(id) ||
        ({
          teacher_id: id,
          assignment_count: 0,
          distinct_class_count: 0,
          distinct_section_count: 0,
          homeroom_class_count: 0,
        });
      current.homeroom_class_count = Number(r.homeroom_class_count || 0);
      byTeacher.set(id, current);
    }

    res.status(200).json({
      academic_year: { id: year.id, name: year.name, is_active: year.is_active },
      is_active_year: !!year.is_active,
      data: Array.from(byTeacher.values()).sort((a, b) =>
        a.teacher_id.localeCompare(b.teacher_id)
      ),
    });
  } catch (err) {
    console.error('teacherAssignments.assignmentStats error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Teacher self-service: dashboard payload (assignments + class-teacher status + year).
 */
exports.getMyDashboard = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const teacher = await loadTeacherForUser(tenantId, req.user.userId);
    if (!teacher) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const requestedYearId = parsePositiveInt(req.query.academic_year_id);
    const year = await resolveYear(tenantId, requestedYearId);
    if (!year) {
      return res.status(200).json({
        teacher: {
          id: teacher.id,
          first_name: teacher.first_name,
          last_name: teacher.last_name,
          designation: teacher.designation,
        },
        academic_year: null,
        is_active_year: false,
        class_teacher_of: [],
        teaching_assignments: [],
        summary: [],
      });
    }

    const [assignmentRows, homeroomClasses] = await Promise.all([
      loadAssignments(tenantId, {
        tenant_id: tenantId,
        teacher_id: teacher.id,
        academic_year_id: year.id,
      }),
      SchoolClass.findAll({
        where: { tenant_id: tenantId, class_teacher_id: teacher.id },
        include: [
          { model: Section, as: 'sections', required: false, attributes: ['id', 'name'] },
        ],
        order: [['name', 'ASC']],
      }),
    ]);

    const teaching = assignmentRows.map((r) => shapeAssignmentRow(r.get({ plain: true })));
    const homeroom = homeroomClasses.map((c) => {
      const plain = c.get({ plain: true });
      return {
        class_id: plain.id,
        class_name: plain.name,
        sections: (plain.sections || [])
          .map((s) => ({ section_id: s.id, section_name: s.name }))
          .sort((a, b) => a.section_name.localeCompare(b.section_name)),
      };
    });

    res.status(200).json({
      teacher: {
        id: teacher.id,
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        designation: teacher.designation,
      },
      academic_year: { id: year.id, name: year.name, is_active: year.is_active },
      is_active_year: !!year.is_active,
      class_teacher_of: homeroom,
      teaching_assignments: teaching,
      summary: summarizeAssignments(teaching),
    });
  } catch (err) {
    console.error('teacherAssignments.getMyDashboard error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Teacher self-service: list students that the teacher is allowed to see for the
 * current/selected academic year. Optional `class_id` and `section_id` further narrow
 * the result, but only within the teacher's own assignments — never across other
 * classes/sections. Includes homeroom (class teacher) classes too.
 */
exports.listMyStudents = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const teacher = await loadTeacherForUser(tenantId, req.user.userId);
    if (!teacher) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const requestedYearId = parsePositiveInt(req.query.academic_year_id);
    const year = await resolveYear(tenantId, requestedYearId);
    if (!year) {
      return res.status(200).json({
        data: [],
        total: 0,
        page: 1,
        pageSize: 0,
        totalPages: 1,
        academic_year: null,
        is_active_year: false,
      });
    }

    const requestedClassId = parsePositiveInt(req.query.class_id);
    const requestedSectionId = parsePositiveInt(req.query.section_id);

    // Build the teacher's allowed (class, section) pairs from teaching assignments
    // plus homeroom classes (where they are the class_teacher and so see all sections).
    const [assignmentRows, homeroomClasses] = await Promise.all([
      TeacherAcademicAssignment.findAll({
        where: {
          tenant_id: tenantId,
          teacher_id: teacher.id,
          academic_year_id: year.id,
        },
        attributes: ['class_id', 'section_id'],
      }),
      SchoolClass.findAll({
        where: { tenant_id: tenantId, class_teacher_id: teacher.id },
        include: [
          { model: Section, as: 'sections', required: false, attributes: ['id'] },
        ],
      }),
    ]);

    const allowedPairs = new Map(); // key: `${classId}:${sectionId}`
    for (const a of assignmentRows) {
      const cId = a.class_id;
      const sId = a.section_id;
      allowedPairs.set(`${cId}:${sId}`, { class_id: cId, section_id: sId });
    }
    for (const cls of homeroomClasses) {
      const plain = cls.get({ plain: true });
      const sections = plain.sections || [];
      for (const s of sections) {
        allowedPairs.set(`${plain.id}:${s.id}`, {
          class_id: plain.id,
          section_id: s.id,
        });
      }
    }

    // No assignments and no homeroom — return empty rather than failing.
    if (allowedPairs.size === 0) {
      return res.status(200).json({
        data: [],
        total: 0,
        page: 1,
        pageSize: 0,
        totalPages: 1,
        academic_year: { id: year.id, name: year.name, is_active: year.is_active },
        is_active_year: !!year.is_active,
      });
    }

    // Apply optional narrowing filters (must intersect with allowed scope).
    let workingPairs = Array.from(allowedPairs.values());
    if (requestedClassId) {
      workingPairs = workingPairs.filter((p) => p.class_id === requestedClassId);
    }
    if (requestedSectionId) {
      workingPairs = workingPairs.filter((p) => p.section_id === requestedSectionId);
    }
    if (workingPairs.length === 0) {
      return res.status(403).json({
        message: 'You are not assigned to that class/section',
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;
    const q = req.query.q != null ? String(req.query.q).trim() : '';

    // Build OR of (class_id = X AND section_id = Y) tuples.
    const enrollmentWhere = {
      tenant_id: tenantId,
      academic_year_id: year.id,
      status: 'active',
      [Op.or]: workingPairs.map((p) => ({
        class_id: p.class_id,
        section_id: p.section_id,
      })),
    };

    const studentWhere = { tenant_id: tenantId };
    if (q) {
      studentWhere[Op.or] = [
        { admission_no: { [Op.iLike]: `%${q}%` } },
        { full_name: { [Op.iLike]: `%${q}%` } },
        { first_name: { [Op.iLike]: `%${q}%` } },
        { last_name: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const studentInclude = [
      {
        model: Student,
        as: 'student',
        where: studentWhere,
        required: true,
        // Avoid heavy base64 in list payloads.
        attributes: [
          'id',
          'admission_no',
          'full_name',
          'first_name',
          'last_name',
          'gender',
          'dob',
          'phone',
          'status',
        ],
      },
      { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
      { model: Section, as: 'section', attributes: ['id', 'name'] },
      { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] },
    ];

    const [rows, count] = await Promise.all([
      StudentEnrollment.findAll({
        where: enrollmentWhere,
        include: studentInclude,
        limit: pageSize,
        offset,
        order: [
          [{ model: SchoolClass, as: 'schoolClass' }, 'name', 'ASC'],
          [{ model: Section, as: 'section' }, 'name', 'ASC'],
          [{ model: Student, as: 'student' }, 'admission_no', 'ASC'],
        ],
      }),
      StudentEnrollment.count({
        where: enrollmentWhere,
        include: [
          { model: Student, as: 'student', where: studentWhere, required: true },
        ],
      }),
    ]);

    const data = rows.map((r) => {
      const plain = r.get({ plain: true });
      const s = plain.student || {};
      const display =
        (s.full_name && String(s.full_name).trim()) ||
        [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
      return {
        id: s.id,
        admission_no: s.admission_no,
        full_name: s.full_name,
        first_name: s.first_name,
        last_name: s.last_name,
        display_name: display,
        gender: s.gender,
        dob: s.dob,
        phone: s.phone,
        status: s.status,
        class_name: plain.schoolClass ? plain.schoolClass.name : null,
        section_name: plain.section ? plain.section.name : null,
        roll_number: plain.roll_number,
        current_enrollment: {
          id: plain.id,
          academic_year_id: plain.academic_year_id,
          class_id: plain.class_id,
          section_id: plain.section_id,
          roll_number: plain.roll_number,
          academicYear: plain.academicYear || null,
          schoolClass: plain.schoolClass || null,
          section: plain.section || null,
        },
      };
    });

    res.status(200).json({
      data,
      total: count,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
      academic_year: { id: year.id, name: year.name, is_active: year.is_active },
      is_active_year: !!year.is_active,
    });
  } catch (err) {
    console.error('teacherAssignments.listMyStudents error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
