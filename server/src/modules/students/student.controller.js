
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const sequelize = require('../../config/db');
const Student = require('./student.model');
const StudentEnrollment = require('./studentEnrollment.model');
const StudentGuardian = require('./studentGuardian.model');
const StudentPreviousSchool = require('./studentPreviousSchool.model');
const StudentDocument = require('./studentDocument.model');
const User = require('../users/user.model');
const AcademicYear = require('../classes/academicYear.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getActiveAcademicYear(tenantId) {
  return AcademicYear.findOne({
    where: { tenant_id: tenantId, is_active: true },
    order: [['id', 'DESC']],
  });
}

async function assertRollUnique(tenantId, academicYearId, classId, sectionId, rollNumber, excludeEnrollmentId) {
  if (rollNumber == null || rollNumber === '') return;
  const where = {
    tenant_id: tenantId,
    academic_year_id: academicYearId,
    class_id: classId,
    section_id: sectionId,
    roll_number: Number(rollNumber),
  };
  if (excludeEnrollmentId) {
    where.id = { [Op.ne]: excludeEnrollmentId };
  }
  const existing = await StudentEnrollment.findOne({ where });
  if (existing) {
    const err = new Error('ROLL_TAKEN');
    err.code = 'ROLL_TAKEN';
    throw err;
  }
}

async function assertEnrollmentRefs(tenantId, academicYearId, classId, sectionId) {
  const [year, cls, sec] = await Promise.all([
    AcademicYear.findOne({ where: { id: academicYearId, tenant_id: tenantId } }),
    SchoolClass.findOne({ where: { id: classId, tenant_id: tenantId } }),
    Section.findOne({
      where: { id: sectionId, tenant_id: tenantId, class_id: classId },
    }),
  ]);
  if (!year) {
    const e = new Error('BAD_YEAR');
    e.code = 'BAD_YEAR';
    throw e;
  }
  if (!cls) {
    const e = new Error('BAD_CLASS');
    e.code = 'BAD_CLASS';
    throw e;
  }
  if (!sec) {
    const e = new Error('BAD_SECTION');
    e.code = 'BAD_SECTION';
    throw e;
  }
}

exports.register = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const subdomain = req.tenant.subdomain;
    const body = req.body || {};

    const admission_no = body.admission_no != null ? String(body.admission_no).trim() : '';
    if (!admission_no) {
      await t.rollback();
      return res.status(400).json({ message: 'admission_no is required' });
    }

    const {
      first_name,
      last_name,
      gender,
      dob,
      phone,
      email,
      photo_url,
      blood_group,
      current_address,
      permanent_address,
      extra_details,
      bank_name,
      bank_branch,
      bank_ifsc,
      height_cm,
      weight_kg,
      hostel_name,
      room_no,
      room_type,
      guardian,
      previous_school,
      enrollment,
      documents,
      create_student_login,
    } = body;

    if (email && !EMAIL_RE.test(String(email).trim())) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid email format' });
    }

    if (!enrollment || !enrollment.academic_year_id || !enrollment.class_id || !enrollment.section_id) {
      await t.rollback();
      return res.status(400).json({
        message: 'enrollment with academic_year_id, class_id, section_id is required',
      });
    }

    await assertEnrollmentRefs(
      tenantId,
      enrollment.academic_year_id,
      enrollment.class_id,
      enrollment.section_id
    );

    await assertRollUnique(
      tenantId,
      enrollment.academic_year_id,
      enrollment.class_id,
      enrollment.section_id,
      enrollment.roll_number,
      null
    );

    const student = await Student.create(
      {
        tenant_id: tenantId,
        admission_no,
        first_name: first_name != null ? String(first_name).trim() : null,
        last_name: last_name != null ? String(last_name).trim() : null,
        gender: gender != null ? String(gender).trim() : null,
        dob: dob || null,
        phone: phone != null ? String(phone).trim() : null,
        email: email != null ? String(email).trim().toLowerCase() : null,
        photo_url: photo_url || null,
        blood_group: blood_group || null,
        current_address: current_address || null,
        permanent_address: permanent_address || null,
        extra_details: extra_details || null,
        bank_name: bank_name || null,
        bank_branch: bank_branch || null,
        bank_ifsc: bank_ifsc || null,
        height_cm: height_cm != null ? String(height_cm) : null,
        weight_kg: weight_kg != null ? String(weight_kg) : null,
        hostel_name: hostel_name || null,
        room_no: room_no || null,
        room_type: room_type || null,
        status: 'active',
      },
      { transaction: t }
    );

    if (guardian && typeof guardian === 'object') {
      await StudentGuardian.create(
        {
          tenant_id: tenantId,
          student_id: student.id,
          guardian_type: guardian.guardian_type || null,
          father_name: guardian.father_name || null,
          father_phone: guardian.father_phone || null,
          father_occupation: guardian.father_occupation || null,
          mother_name: guardian.mother_name || null,
          mother_occupation: guardian.mother_occupation || null,
          guardian_name: guardian.guardian_name || null,
          guardian_phone: guardian.guardian_phone || null,
          guardian_occupation: guardian.guardian_occupation || null,
          guardian_relation: guardian.guardian_relation || null,
          guardian_address: guardian.guardian_address || null,
        },
        { transaction: t }
      );
    }

    if (previous_school && typeof previous_school === 'object') {
      await StudentPreviousSchool.create(
        {
          tenant_id: tenantId,
          student_id: student.id,
          school_name: previous_school.school_name || null,
          school_address: previous_school.school_address || null,
          current_school_name: previous_school.current_school_name || null,
        },
        { transaction: t }
      );
    }

    await StudentEnrollment.create(
      {
        tenant_id: tenantId,
        student_id: student.id,
        academic_year_id: enrollment.academic_year_id,
        class_id: enrollment.class_id,
        section_id: enrollment.section_id,
        roll_number:
          enrollment.roll_number != null && enrollment.roll_number !== ''
            ? Number(enrollment.roll_number)
            : null,
        category: enrollment.category || null,
        status: 'active',
      },
      { transaction: t }
    );

    if (Array.isArray(documents)) {
      for (const d of documents) {
        if (d && d.file_name && d.file_url) {
          await StudentDocument.create(
            {
              tenant_id: tenantId,
              student_id: student.id,
              file_name: String(d.file_name),
              file_url: String(d.file_url),
            },
            { transaction: t }
          );
        }
      }
    }

    let loginUser = null;
    if (create_student_login === true) {
      const username = `${subdomain}-${admission_no}`.toLowerCase();
      const defaultPass = process.env.STUDENT_DEFAULT_PASSWORD || '123456';
      const hash = await bcrypt.hash(String(defaultPass), 10);
      const displayName =
        [student.first_name, student.last_name].filter(Boolean).join(' ').trim() || admission_no;
      loginUser = await User.create(
        {
          tenant_id: tenantId,
          name: displayName,
          email: null,
          username,
          password: hash,
          role: 'student',
          status: 'inactive',
          student_id: student.id,
        },
        { transaction: t }
      );
    }

    await t.commit();

    const full = await exports.loadStudentDetail(tenantId, student.id);
    res.status(201).json({ student: full, login: loginUser ? { username: loginUser.username } : null });
  } catch (err) {
    await t.rollback();
    if (err.code === 'ROLL_TAKEN') {
      return res.status(409).json({ message: 'Roll number already taken for this class/section/year' });
    }
    if (err.code === 'BAD_YEAR' || err.code === 'BAD_CLASS' || err.code === 'BAD_SECTION') {
      return res.status(400).json({ message: 'Invalid enrollment references' });
    }
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Duplicate admission number or constraint violation' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.loadStudentDetail = async (tenantId, studentId) => {
  const activeYear = await getActiveAcademicYear(tenantId);
  const student = await Student.findOne({
    where: { id: studentId, tenant_id: tenantId },
    include: [
      { model: StudentGuardian, as: 'guardian', required: false },
      { model: StudentPreviousSchool, as: 'previousSchool', required: false },
      { model: StudentDocument, as: 'documents', required: false },
      {
        model: StudentEnrollment,
        as: 'enrollments',
        required: false,
        include: [
          { model: AcademicYear, as: 'academicYear' },
          { model: SchoolClass, as: 'schoolClass' },
          { model: Section, as: 'section' },
        ],
      },
    ],
  });
  if (!student) return null;

  const plain = student.get({ plain: true });
  let currentEnrollment = null;
  if (activeYear && plain.enrollments) {
    currentEnrollment = plain.enrollments.find((e) => e.academic_year_id === activeYear.id) || null;
  }
  plain.current_enrollment = currentEnrollment;
  const user = await User.findOne({
    where: { student_id: studentId, tenant_id: tenantId },
    attributes: ['id', 'username', 'status', 'email'],
  });
  plain.login_user = user ? user.get({ plain: true }) : null;
  return plain;
};

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const activeYear = await getActiveAcademicYear(tenantId);
    const students = await Student.findAll({
      where: { tenant_id: tenantId },
      order: [['admission_no', 'ASC']],
      limit: 500,
      include: [
        {
          model: StudentEnrollment,
          as: 'enrollments',
          required: false,
          where: activeYear ? { academic_year_id: activeYear.id } : undefined,
          include: [
            { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
            { model: Section, as: 'section', attributes: ['id', 'name'] },
          ],
        },
      ],
    });
    const rows = students.map((s) => {
      const p = s.get({ plain: true });
      const ce = p.enrollments && p.enrollments[0] ? p.enrollments[0] : null;
      return {
        id: p.id,
        admission_no: p.admission_no,
        first_name: p.first_name,
        last_name: p.last_name,
        dob: p.dob,
        gender: p.gender,
        phone: p.phone,
        status: p.status,
        current_enrollment: ce,
        class_name: ce && ce.schoolClass ? ce.schoolClass.name : null,
      };
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const full = await exports.loadStudentDetail(tenantId, req.params.id);
    if (!full) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const student = await Student.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!student) {
      await t.rollback();
      return res.status(404).json({ message: 'Student not found' });
    }

    const body = req.body || {};
    const updatable = [
      'first_name',
      'last_name',
      'gender',
      'dob',
      'phone',
      'email',
      'photo_url',
      'blood_group',
      'current_address',
      'permanent_address',
      'extra_details',
      'bank_name',
      'bank_branch',
      'bank_ifsc',
      'height_cm',
      'weight_kg',
      'hostel_name',
      'room_no',
      'room_type',
      'status',
    ];
    const patch = {};
    for (const k of updatable) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        patch[k] = body[k];
      }
    }
    if (patch.email && !EMAIL_RE.test(String(patch.email).trim())) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (patch.email) patch.email = String(patch.email).trim().toLowerCase();

    await student.update(patch, { transaction: t });

    if (body.guardian && typeof body.guardian === 'object') {
      const [g] = await StudentGuardian.findOrCreate({
        where: { tenant_id: tenantId, student_id: student.id },
        defaults: { tenant_id: tenantId, student_id: student.id },
        transaction: t,
      });
      await g.update(
        {
          guardian_type: body.guardian.guardian_type,
          father_name: body.guardian.father_name,
          father_phone: body.guardian.father_phone,
          father_occupation: body.guardian.father_occupation,
          mother_name: body.guardian.mother_name,
          mother_occupation: body.guardian.mother_occupation,
          guardian_name: body.guardian.guardian_name,
          guardian_phone: body.guardian.guardian_phone,
          guardian_occupation: body.guardian.guardian_occupation,
          guardian_relation: body.guardian.guardian_relation,
          guardian_address: body.guardian.guardian_address,
        },
        { transaction: t }
      );
    }

    if (body.previous_school && typeof body.previous_school === 'object') {
      const [ps] = await StudentPreviousSchool.findOrCreate({
        where: { tenant_id: tenantId, student_id: student.id },
        defaults: { tenant_id: tenantId, student_id: student.id },
        transaction: t,
      });
      await ps.update(
        {
          school_name: body.previous_school.school_name,
          school_address: body.previous_school.school_address,
          current_school_name: body.previous_school.current_school_name,
        },
        { transaction: t }
      );
    }

    await t.commit();
    const full = await exports.loadStudentDetail(tenantId, student.id);
    res.json(full);
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const student = await Student.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    await User.destroy({ where: { student_id: student.id, tenant_id: tenantId } });
    await student.destroy();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listEnrollments = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const studentId = req.query.student_id;
    if (!studentId) {
      return res.status(400).json({ message: 'student_id is required' });
    }
    const student = await Student.findOne({
      where: { id: studentId, tenant_id: tenantId },
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    const rows = await StudentEnrollment.findAll({
      where: { tenant_id: tenantId, student_id: studentId },
      include: [
        { model: AcademicYear, as: 'academicYear' },
        { model: SchoolClass, as: 'schoolClass' },
        { model: Section, as: 'section' },
      ],
      order: [[{ model: AcademicYear, as: 'academicYear' }, 'id', 'DESC']],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.promote = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const { student_ids: studentIds, new_class_id: newClassId, new_section_id: newSectionId, academic_year_id: academicYearId, roll_number: rollNumber } =
      req.body || {};

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'student_ids array is required' });
    }
    if (!newClassId || !newSectionId || !academicYearId) {
      await t.rollback();
      return res.status(400).json({
        message: 'new_class_id, new_section_id, academic_year_id are required',
      });
    }

    await assertEnrollmentRefs(tenantId, academicYearId, newClassId, newSectionId);

    const created = [];
    for (const sid of studentIds) {
      const student = await Student.findOne({
        where: { id: sid, tenant_id: tenantId },
        transaction: t,
      });
      if (!student) {
        await t.rollback();
        return res.status(404).json({ message: `Student not found: ${sid}` });
      }

      const existing = await StudentEnrollment.findOne({
        where: {
          tenant_id: tenantId,
          student_id: sid,
          academic_year_id: academicYearId,
        },
        transaction: t,
      });
      if (existing) {
        await t.rollback();
        return res.status(409).json({
          message: `Student ${sid} already has enrollment for this academic year`,
        });
      }

      await assertRollUnique(
        tenantId,
        academicYearId,
        newClassId,
        newSectionId,
        rollNumber,
        null
      );

      const row = await StudentEnrollment.create(
        {
          tenant_id: tenantId,
          student_id: sid,
          academic_year_id: academicYearId,
          class_id: newClassId,
          section_id: newSectionId,
          roll_number: rollNumber != null && rollNumber !== '' ? Number(rollNumber) : null,
          category: null,
          status: 'promoted',
        },
        { transaction: t }
      );
      created.push(row);
    }

    await t.commit();
    res.status(201).json({ created: created.length, enrollments: created });
  } catch (err) {
    await t.rollback();
    if (err.code === 'ROLL_TAKEN') {
      return res.status(409).json({ message: 'Roll number already taken for this class/section/year' });
    }
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Enrollment conflict' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.getLoginDetails = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const full = await exports.loadStudentDetail(tenantId, req.params.id);
    if (!full) {
      return res.status(404).json({ message: 'Student not found' });
    }
    const u = full.login_user;
    res.json({
      username: u ? u.username : null,
      status: u ? u.status : null,
      has_account: !!u,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
