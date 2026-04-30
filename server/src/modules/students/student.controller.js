const crypto = require('crypto');
const sharp = require('sharp');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const sequelize = require('../../config/db');
const Student = require('./student.model');
const StudentEnrollment = require('./studentEnrollment.model');
const StudentGuardian = require('./studentGuardian.model');
const StudentPreviousSchool = require('./studentPreviousSchool.model');
const StudentDocument = require('./studentDocument.model');
const StudentPromotion = require('./studentPromotion.model');
const User = require('../users/user.model');
const { invalidateUserSessions } = require('../auth/session.service');
const AcademicYear = require('../classes/academicYear.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const { validateEnrollmentCategory } = require('../../seed/canonicalClasses');
const { recordAudit } = require('../audit/audit.service');
const { deleteStudentAggregate } = require('./student.service');

/** Set has_photo for UI (base64, legacy http URL). */
function sanitizeStudentJson(plain) {
  if (!plain || typeof plain !== 'object') return plain;
  const hasB64 = plain.photo_base64 != null && String(plain.photo_base64).trim().length > 0;
  const legacyHttp =
    plain.photo_url && /^https?:\/\//i.test(String(plain.photo_url).trim());
  plain.has_photo = !!(hasB64 || legacyHttp);
  return plain;
}

async function optimizeStudentPhoto(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** Decode optional data-URL or raw base64 PNG/JPEG, return optimized JPEG as base64. */
async function photoPayloadFromInput(photoBase64Raw) {
  if (photoBase64Raw == null || typeof photoBase64Raw !== 'string') {
    return { photo_base64: null, photo_mime: null, photo_url: null };
  }
  const raw = String(photoBase64Raw).trim();
  if (!raw) return { photo_base64: null, photo_mime: null, photo_url: null };
  const b64 = raw.replace(/^data:image\/\w+;base64,/, '').trim();
  if (!b64) return { photo_base64: null, photo_mime: null, photo_url: null };
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  if (!buf.length) return null;
  try {
    const jpegBuf = await optimizeStudentPhoto(buf);
    return {
      photo_base64: jpegBuf.toString('base64'),
      photo_mime: 'image/jpeg',
      photo_url: null,
    };
  } catch {
    return null;
  }
}

async function resolvePhotoForCreate(body) {
  const raw = body.photo_base64;
  if (raw == null || String(raw).trim() === '') {
    return { photo_base64: null, photo_mime: null, photo_url: null };
  }
  const out = await photoPayloadFromInput(raw);
  if (!out || !out.photo_base64) return null;
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BLOOD_GROUPS = new Set([
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'A1+',
  'A1-',
  'A2+',
  'A2-',
  'Bombay',
  'Unknown',
]);

async function getActiveAcademicYear(tenantId) {
  return AcademicYear.findOne({
    where: { tenant_id: tenantId, is_active: true },
    order: [['id', 'DESC']],
  });
}

function displayNameFromStudent(s) {
  const plain = s.get ? s.get({ plain: true }) : s;
  if (plain.full_name && String(plain.full_name).trim()) {
    return String(plain.full_name).trim();
  }
  return [plain.first_name, plain.last_name].filter(Boolean).join(' ').trim();
}

/** When only full name is provided (no separate first/last), split for storage and APIs that expect parts. */
function splitFullName(trimmed) {
  if (!trimmed || typeof trimmed !== 'string') {
    return { first_name: null, last_name: null };
  }
  const parts = trimmed.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

async function generateUniqueUsername(tenantId, subdomain, admissionNo) {
  const raw = `${subdomain}-${String(admissionNo).trim()}`.toLowerCase();
  const base = raw.replace(/[^a-z0-9_-]/g, '') || `stu-${String(admissionNo).trim()}`;
  let username = base;
  let n = 2;
  for (;;) {
    const existing = await User.findOne({ where: { tenant_id: tenantId, username } });
    if (!existing) return username;
    username = `${base}-${n}`;
    n += 1;
  }
}

function randomPassword(len = 12) {
  return crypto.randomBytes(16).toString('base64url').slice(0, len);
}

async function assertRollUnique(tenantId, academicYearId, classId, sectionId, rollNumber, excludeEnrollmentId) {
  if (rollNumber == null || rollNumber === '') return;
  const where = {
    tenant_id: tenantId,
    academic_year_id: academicYearId,
    class_id: classId,
    section_id: sectionId,
    roll_number: Number(rollNumber),
    status: 'active',
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
      full_name: fullName,
      first_name,
      last_name,
      gender,
      dob,
      phone,
      email,
      blood_group,
      current_address,
      permanent_address,
      extra_details,
      room_type,
      guardian,
      previous_school,
      enrollment,
      documents,
      create_student_login: createStudentLoginRaw,
      login_password: loginPasswordIn,
    } = body;

    const create_student_login =
      createStudentLoginRaw === undefined || createStudentLoginRaw === null ? true : Boolean(createStudentLoginRaw);

    if (email && !EMAIL_RE.test(String(email).trim())) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid email format' });
    }

    if (blood_group && !BLOOD_GROUPS.has(String(blood_group).trim())) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid blood_group' });
    }

    if (!enrollment || !enrollment.academic_year_id || !enrollment.class_id || !enrollment.section_id) {
      await t.rollback();
      return res.status(400).json({
        message: 'enrollment with academic_year_id, class_id, section_id is required',
      });
    }

    const clsRow = await SchoolClass.findOne({
      where: { id: enrollment.class_id, tenant_id: tenantId },
    });
    if (!clsRow) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid class for enrollment' });
    }
    const catCheck = validateEnrollmentCategory(clsRow.name, enrollment.category);
    if (!catCheck.ok) {
      await t.rollback();
      return res.status(400).json({ message: catCheck.message });
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

    let fn = first_name != null && String(first_name).trim() !== '' ? String(first_name).trim() : null;
    let ln = last_name != null && String(last_name).trim() !== '' ? String(last_name).trim() : null;
    const fullNameTrim = fullName != null ? String(fullName).trim() : null;

    if (!fn && !ln && fullNameTrim) {
      const sp = splitFullName(fullNameTrim);
      fn = sp.first_name;
      ln = sp.last_name;
    }

    if (!fn) {
      await t.rollback();
      return res.status(400).json({ message: 'first_name is required' });
    }

    const photoInit = await resolvePhotoForCreate(body);
    if (photoInit === null) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid or unsupported photo image' });
    }

    const student = await Student.create(
      {
        tenant_id: tenantId,
        admission_no,
        full_name: fullNameTrim || (fn || ln ? [fn, ln].filter(Boolean).join(' ').trim() : null),
        first_name: fn,
        last_name: ln,
        gender: gender != null ? String(gender).trim() : null,
        dob: dob || null,
        phone: phone != null ? String(phone).trim() : null,
        email: email != null ? String(email).trim().toLowerCase() : null,
        photo_url: photoInit.photo_url,
        photo_base64: photoInit.photo_base64,
        photo_mime: photoInit.photo_mime,
        blood_group: blood_group || null,
        current_address: current_address || null,
        permanent_address: permanent_address || null,
        extra_details: extra_details || null,
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
          mother_phone: guardian.mother_phone || null,
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
        promotion_type: 'initial',
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
    let plaintextPassword = null;
    if (create_student_login) {
      const username = await generateUniqueUsername(tenantId, subdomain, admission_no);
      plaintextPassword =
        loginPasswordIn && String(loginPasswordIn).length >= 6
          ? String(loginPasswordIn)
          : randomPassword();
      const hash = await bcrypt.hash(plaintextPassword, 10);
      const displayName = displayNameFromStudent(student) || admission_no;
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

    await recordAudit({
      tenantId,
      actorUserId: req.user?.userId || null,
      entityType: 'student',
      entityId: student.id,
      action: 'create',
      after: { student_id: student.id, admission_no: student.admission_no },
    });

    const full = await exports.loadStudentDetail(tenantId, student.id);
    res.status(201).json({
      student: full,
      login: loginUser
        ? {
            username: loginUser.username,
            password: plaintextPassword,
            user_status: loginUser.status,
          }
        : null,
    });
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
    req.log?.error({ err }, 'students.register failed');
    res.status(500).json({ message: 'Internal server error' });
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
  plain.current_enrollment = resolveCurrentEnrollment(activeYear, plain.enrollments);
  const user = await User.findOne({
    where: { student_id: studentId, tenant_id: tenantId },
    attributes: ['id', 'username', 'status', 'email'],
  });
  plain.login_user = user ? user.get({ plain: true }) : null;
  return sanitizeStudentJson(plain);
};

function parseQueryInt(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

/** Parse integer from JSON body (Number(x, 10) is wrong — Number ignores radix). */
function parseBodyInt(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Profile "current" placement: prefer active enrollment for the tenant's active academic year;
 * otherwise the active enrollment with the greatest academic_year_id (forward session after promote).
 */
function resolveCurrentEnrollment(activeYear, enrollments) {
  if (!enrollments || !enrollments.length) return null;
  const active = enrollments.filter((e) => e.status === 'active');
  if (!active.length) return null;
  if (activeYear) {
    const match = active.find((e) => e.academic_year_id === activeYear.id);
    if (match) return match;
  }
  return active.reduce(
    (best, e) => (!best || e.academic_year_id > best.academic_year_id ? e : best),
    null
  );
}

/** Next academic year for tenant after `afterYearId` (by ascending `id`). */
async function getNextAcademicYearAfter(tenantId, afterYearId, transaction) {
  return AcademicYear.findOne({
    where: { tenant_id: tenantId, id: { [Op.gt]: afterYearId } },
    order: [['id', 'ASC']],
    transaction,
  });
}

function mapPlainEnrollmentToListCurrentEnrollment(ePlain) {
  if (!ePlain) return null;
  const ay = ePlain.academicYear;
  return {
    id: ePlain.id,
    student_id: ePlain.student_id,
    academic_year_id: ePlain.academic_year_id,
    class_id: ePlain.class_id,
    section_id: ePlain.section_id,
    roll_number: ePlain.roll_number,
    category: ePlain.category,
    promotion_type: ePlain.promotion_type,
    status: ePlain.status,
    schoolClass: ePlain.schoolClass,
    section: ePlain.section,
    academicYear: ay ? { id: ay.id, name: ay.name } : null,
  };
}

function listRowFromStudentAndEnrollmentPlain(p, ePlain) {
  const ce = mapPlainEnrollmentToListCurrentEnrollment(ePlain);
  const displayName =
    p.full_name && String(p.full_name).trim()
      ? String(p.full_name).trim()
      : [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return {
    id: p.id,
    admission_no: p.admission_no,
    full_name: p.full_name,
    first_name: p.first_name,
    last_name: p.last_name,
    display_name: displayName,
    dob: p.dob,
    gender: p.gender,
    phone: p.phone,
    status: p.status,
    current_enrollment: ce,
    class_name: ce && ce.schoolClass ? ce.schoolClass.name : null,
  };
}

exports.lookupByAdmission = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const raw = req.query.admission_no != null ? String(req.query.admission_no).trim() : '';
    if (!raw) {
      return res.status(400).json({ message: 'admission_no query parameter is required' });
    }
    const activeYear = await getActiveAcademicYear(tenantId);
    const student = await Student.findOne({
      where: {
        tenant_id: tenantId,
        [Op.and]: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('admission_no')),
          raw.toLowerCase()
        ),
      },
      attributes: { exclude: ['photo_base64'] },
    });
    if (!student) {
      return res.status(404).json({ message: 'No student found with this admission number' });
    }
    const enrollments = await StudentEnrollment.findAll({
      where: { tenant_id: tenantId, student_id: student.id },
      include: [
        { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] },
        { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
        { model: Section, as: 'section', attributes: ['id', 'name'] },
      ],
    });
    const plainEnrolls = enrollments.map((e) => e.get({ plain: true }));
    const cePlain = resolveCurrentEnrollment(activeYear, plainEnrolls);
    if (!cePlain) {
      return res.status(404).json({ message: 'No active enrollment found for this student' });
    }
    const p = student.get({ plain: true });
    res.json({ data: listRowFromStudentAndEnrollmentPlain(p, cePlain) });
  } catch (err) {
    req.log?.error({ err }, 'students.lookupByAdmission failed');
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Paginated student directory: `page`, `pageSize` (default 20, max 100). Supports `q`, `class_id`, `section_id`, `academic_year_id`.
 */
exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const activeYear = await getActiveAcademicYear(tenantId);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    const q = req.query.q != null ? String(req.query.q).trim() : '';
    const classId = parseQueryInt(req.query.class_id);
    const sectionId = parseQueryInt(req.query.section_id);
    const explicitYear = parseQueryInt(req.query.academic_year_id);

    let yearForEnrollment = explicitYear;
    if (!yearForEnrollment && (classId || sectionId)) {
      yearForEnrollment = activeYear ? activeYear.id : null;
    }

    const studentWhere = { tenant_id: tenantId };
    if (q) {
      studentWhere[Op.or] = [
        { admission_no: { [Op.iLike]: `%${q}%` } },
        { full_name: { [Op.iLike]: `%${q}%` } },
        { first_name: { [Op.iLike]: `%${q}%` } },
        { last_name: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const hasEnrollmentFilter = Boolean(explicitYear || classId || sectionId);

    const enrollmentWhere = { tenant_id: tenantId };
    if (yearForEnrollment) {
      enrollmentWhere.academic_year_id = yearForEnrollment;
    }
    if (classId) {
      enrollmentWhere.class_id = classId;
    }
    if (sectionId) {
      enrollmentWhere.section_id = sectionId;
    }

    let listRows;
    let count;

    if (hasEnrollmentFilter) {
      enrollmentWhere.status = 'active';
      if (!yearForEnrollment && (classId || sectionId)) {
        return res.status(400).json({ message: 'Set an active academic year or pass academic_year_id' });
      }
      /**
       * Query from StudentEnrollment with Student include. Do not use findAndCountAll with
       * distinct/col — Sequelize 6 + PostgreSQL emits invalid SQL (missing FROM-clause for
       * "Student->Student" or "StudentEnrollment->StudentEnrollment").
       */
      const [enrollmentRows, enrollmentTotal] = await Promise.all([
        StudentEnrollment.findAll({
          where: enrollmentWhere,
          limit: pageSize,
          offset,
          include: [
            {
              model: Student,
              as: 'student',
              where: studentWhere,
              required: true,
              attributes: { exclude: ['photo_base64'] },
            },
            { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
            { model: Section, as: 'section', attributes: ['id', 'name'] },
            { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] },
          ],
          order: [[{ model: Student, as: 'student' }, 'admission_no', 'ASC']],
        }),
        StudentEnrollment.count({
          where: enrollmentWhere,
          include: [
            {
              model: Student,
              as: 'student',
              where: studentWhere,
              required: true,
            },
          ],
        }),
      ]);
      count = enrollmentTotal;
      listRows = enrollmentRows.map((row) => {
        const ePlain = row.get({ plain: true });
        const p = ePlain.student;
        return listRowFromStudentAndEnrollmentPlain(p, ePlain);
      });
    } else {
      const result = await Student.findAndCountAll({
        where: studentWhere,
        attributes: { exclude: ['photo_base64'] },
        order: [['admission_no', 'ASC']],
        limit: pageSize,
        offset,
      });
      const rows = result.rows;
      count = result.count;

      /** For unfiltered list: attach active-year enrollment without a heavy join (avoids slow/hanging queries). */
      const enrollmentByStudentId = new Map();
      if (activeYear && rows.length) {
        const ids = rows.map((r) => r.id);
        const enrollRows = await StudentEnrollment.findAll({
          where: {
            tenant_id: tenantId,
            academic_year_id: activeYear.id,
            student_id: { [Op.in]: ids },
            status: 'active',
          },
          include: [
            { model: SchoolClass, as: 'schoolClass', attributes: ['id', 'name'] },
            { model: Section, as: 'section', attributes: ['id', 'name'] },
            { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] },
          ],
        });
        for (const e of enrollRows) {
          enrollmentByStudentId.set(e.student_id, e.get({ plain: true }));
        }
      }

      listRows = rows.map((s) => {
        const p = s.get({ plain: true });
        const ePlain = activeYear ? enrollmentByStudentId.get(p.id) || null : null;
        return listRowFromStudentAndEnrollmentPlain(p, ePlain);
      });
    }

    res.json({
      data: listRows,
      total: count,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
    });
  } catch (err) {
    req.log?.error({ err }, 'students.list failed');
    res.status(500).json({ message: 'Internal server error' });
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
    req.log?.error({ err }, 'students.getById failed');
    res.status(500).json({ message: 'Internal server error' });
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
      'full_name',
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
      'room_type',
      'status',
    ];
    const patch = {};
    for (const k of updatable) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        patch[k] = body[k];
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'admission_no')) {
      const newAdm = String(body.admission_no != null ? body.admission_no : '').trim();
      if (!newAdm) {
        await t.rollback();
        return res.status(400).json({ message: 'admission_no cannot be empty' });
      }
      if (newAdm !== student.admission_no) {
        const dup = await Student.findOne({
          where: {
            tenant_id: tenantId,
            admission_no: newAdm,
            id: { [Op.ne]: student.id },
          },
        });
        if (dup) {
          await t.rollback();
          return res.status(409).json({ message: 'Admission number already in use' });
        }
        patch.admission_no = newAdm;
      }
    }
    if (patch.email && !EMAIL_RE.test(String(patch.email).trim())) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (patch.email) patch.email = String(patch.email).trim().toLowerCase();
    if (patch.blood_group && !BLOOD_GROUPS.has(String(patch.blood_group).trim())) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid blood_group' });
    }

    if (Object.prototype.hasOwnProperty.call(body, 'full_name')) {
      const hasExplicitFirst = Object.prototype.hasOwnProperty.call(body, 'first_name');
      const hasExplicitLast = Object.prototype.hasOwnProperty.call(body, 'last_name');
      if (!hasExplicitFirst && !hasExplicitLast) {
        const fullStr = patch.full_name != null ? String(patch.full_name).trim() : '';
        if (fullStr) {
          const sp = splitFullName(fullStr);
          patch.first_name = sp.first_name;
          patch.last_name = sp.last_name;
        } else {
          patch.first_name = null;
          patch.last_name = null;
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'first_name') || Object.prototype.hasOwnProperty.call(body, 'last_name')) {
      const fnNext = Object.prototype.hasOwnProperty.call(body, 'first_name')
        ? body.first_name != null && String(body.first_name).trim() !== ''
          ? String(body.first_name).trim()
          : null
        : student.first_name;
      const lnNext = Object.prototype.hasOwnProperty.call(body, 'last_name')
        ? body.last_name != null && String(body.last_name).trim() !== ''
          ? String(body.last_name).trim()
          : null
        : student.last_name;
      patch.first_name = fnNext;
      patch.last_name = lnNext;
      patch.full_name = [fnNext, lnNext].filter(Boolean).join(' ').trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'remove_photo') && body.remove_photo === true) {
      patch.photo_base64 = null;
      patch.photo_mime = null;
      patch.photo_url = null;
    } else if (Object.prototype.hasOwnProperty.call(body, 'photo_base64')) {
      const raw = body.photo_base64;
      if (raw == null || String(raw).trim() === '') {
        patch.photo_base64 = null;
        patch.photo_mime = null;
        patch.photo_url = null;
      } else {
        const pf = await photoPayloadFromInput(raw);
        if (!pf || !pf.photo_base64) {
          await t.rollback();
          return res.status(400).json({ message: 'Invalid or unsupported photo image' });
        }
        patch.photo_base64 = pf.photo_base64;
        patch.photo_mime = pf.photo_mime;
        patch.photo_url = null;
      }
    }

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
          mother_phone: body.guardian.mother_phone,
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
        },
        { transaction: t }
      );
    }

    if (body.login_user && typeof body.login_user === 'object') {
      const loginPatch = body.login_user;
      const u = await User.findOne({
        where: { student_id: student.id, tenant_id: tenantId },
        transaction: t,
      });
      if (u) {
        if (loginPatch.status === 'active' || loginPatch.status === 'inactive') {
          await u.update({ status: loginPatch.status }, { transaction: t });
        }
        if (loginPatch.password && String(loginPatch.password).length >= 6) {
          const passHash = await bcrypt.hash(String(loginPatch.password), 10);
          await u.update({ password: passHash, password_changed_at: new Date() }, { transaction: t });
          await invalidateUserSessions(u.id, tenantId, t);
        }
      }
    }

    if (body.enrollment && typeof body.enrollment === 'object') {
      const e = body.enrollment;
      const ayId = e.academic_year_id != null ? parseInt(String(e.academic_year_id), 10) : NaN;
      const cId = e.class_id != null ? parseInt(String(e.class_id), 10) : NaN;
      const secId = e.section_id != null ? parseInt(String(e.section_id), 10) : NaN;
      if (!ayId || !cId || !secId || Number.isNaN(ayId) || Number.isNaN(cId) || Number.isNaN(secId)) {
        await t.rollback();
        return res.status(400).json({
          message: 'enrollment must include academic_year_id, class_id, section_id',
        });
      }
      const clsRow = await SchoolClass.findOne({
        where: { id: cId, tenant_id: tenantId },
        transaction: t,
      });
      if (!clsRow) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid class for enrollment' });
      }
      const catCheck = validateEnrollmentCategory(clsRow.name, e.category);
      if (!catCheck.ok) {
        await t.rollback();
        return res.status(400).json({ message: catCheck.message });
      }
      await assertEnrollmentRefs(tenantId, ayId, cId, secId);
      const existingEn = await StudentEnrollment.findOne({
        where: {
          tenant_id: tenantId,
          student_id: student.id,
          academic_year_id: ayId,
        },
        transaction: t,
      });
      await assertRollUnique(
        tenantId,
        ayId,
        cId,
        secId,
        e.roll_number,
        existingEn ? existingEn.id : null
      );
      const rollVal =
        e.roll_number != null && e.roll_number !== '' ? Number(e.roll_number) : null;
      const enPayload = {
        class_id: cId,
        section_id: secId,
        roll_number: Number.isNaN(rollVal) ? null : rollVal,
        category: e.category || null,
      };
      if (existingEn) {
        await existingEn.update(enPayload, { transaction: t });
      } else {
        await StudentEnrollment.create(
          {
            tenant_id: tenantId,
            student_id: student.id,
            academic_year_id: ayId,
            class_id: cId,
            section_id: secId,
            roll_number: enPayload.roll_number,
            category: enPayload.category,
            promotion_type: 'initial',
            status: 'active',
          },
          { transaction: t }
        );
      }
    }

    await t.commit();
    await recordAudit({
      tenantId,
      actorUserId: req.user?.userId || null,
      entityType: 'student',
      entityId: student.id,
      action: 'update',
      after: { student_id: student.id },
    });
    const full = await exports.loadStudentDetail(tenantId, student.id);
    res.json(full);
  } catch (err) {
    await t.rollback();
    req.log?.error({ err }, 'students.update failed');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const student = await Student.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
      transaction: t,
    });
    if (!student) {
      await t.rollback();
      return res.status(404).json({ message: 'Student not found' });
    }
    await deleteStudentAggregate({ tenantId, studentId: student.id, student, transaction: t });
    await t.commit();
    await recordAudit({
      tenantId,
      actorUserId: req.user?.userId || null,
      entityType: 'student',
      entityId: student.id,
      action: 'delete',
      before: { student_id: student.id, admission_no: student.admission_no },
    });
    res.status(204).send();
  } catch (err) {
    await t.rollback();
    req.log?.error({ err }, 'students.remove failed');
    res.status(500).json({ message: 'Internal server error' });
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
    req.log?.error({ err }, 'students.listEnrollments failed');
    res.status(500).json({ message: 'Internal server error' });
  }
};

function parseRollMap(body) {
  const rolls = body.rolls;
  const map = new Map();
  if (Array.isArray(rolls)) {
    for (const r of rolls) {
      if (r && r.student_id) {
        map.set(String(r.student_id), r.roll_number);
      }
    }
  }
  return map;
}

exports.promote = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const body = req.body || {};
    const studentIds = body.student_ids;
    const fromYearId = parseBodyInt(body.from_academic_year_id);
    const fromClassId = parseBodyInt(body.from_class_id);
    let toYearId =
      body.to_academic_year_id != null
        ? parseBodyInt(body.to_academic_year_id)
        : body.academic_year_id != null
          ? parseBodyInt(body.academic_year_id)
          : null;
    let toClassId =
      body.to_class_id != null
        ? parseBodyInt(body.to_class_id)
        : body.new_class_id != null
          ? parseBodyInt(body.new_class_id)
          : null;
    let toSectionId =
      body.to_section_id != null
        ? parseBodyInt(body.to_section_id)
        : body.new_section_id != null
          ? parseBodyInt(body.new_section_id)
          : null;
    const kind = body.kind === 'repeat' ? 'repeat' : 'promote';
    const rollMap = parseRollMap(body);
    const legacyRoll = body.roll_number;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'student_ids array is required' });
    }

    if (!toYearId || !toClassId || !toSectionId) {
      await t.rollback();
      return res.status(400).json({
        message: 'to_academic_year_id, to_class_id, to_section_id are required',
      });
    }

    let effectiveFromYearId = fromYearId;
    if (!effectiveFromYearId) {
      const y = await getActiveAcademicYear(tenantId);
      effectiveFromYearId = y ? y.id : null;
    }
    if (!effectiveFromYearId) {
      await t.rollback();
      return res.status(400).json({ message: 'from_academic_year_id or an active academic year is required' });
    }

    try {
      await assertEnrollmentRefs(tenantId, toYearId, toClassId, toSectionId);
    } catch (refErr) {
      await t.rollback();
      if (refErr.code === 'BAD_YEAR') {
        return res.status(400).json({ message: 'Invalid target academic year' });
      }
      if (refErr.code === 'BAD_CLASS') {
        return res.status(400).json({ message: 'Invalid target class' });
      }
      if (refErr.code === 'BAD_SECTION') {
        return res.status(400).json({ message: 'Invalid target section for the selected class' });
      }
      throw refErr;
    }

    const toClassRow = await SchoolClass.findOne({
      where: { id: toClassId, tenant_id: tenantId },
      transaction: t,
    });
    if (!toClassRow) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid target class' });
    }

    const createdBy = req.user && req.user.userId ? req.user.userId : null;

    const created = [];
    const updated = [];

    for (const sid of studentIds) {
      const student = await Student.findOne({
        where: { id: sid, tenant_id: tenantId },
        transaction: t,
      });
      if (!student) {
        await t.rollback();
        return res.status(404).json({ message: `Student not found: ${sid}` });
      }

      const sourceWhere = {
        tenant_id: tenantId,
        student_id: sid,
        academic_year_id: effectiveFromYearId,
        status: 'active',
      };
      if (fromClassId) {
        sourceWhere.class_id = fromClassId;
      }
      const sourceEnroll = await StudentEnrollment.findOne({
        where: sourceWhere,
        transaction: t,
      });
      if (!sourceEnroll) {
        await t.rollback();
        return res.status(400).json({
          message: `No active enrollment in source year/class for student ${sid}`,
        });
      }

      const rollForStudent =
        rollMap.has(String(sid)) ? rollMap.get(String(sid)) : legacyRoll;

      if (kind === 'repeat') {
        if (toYearId !== sourceEnroll.academic_year_id) {
          await t.rollback();
          return res.status(400).json({
            message: 'Repeat requires target academic year to match the source enrollment year',
          });
        }
        if (toClassId !== sourceEnroll.class_id) {
          await t.rollback();
          return res.status(400).json({
            message: 'Repeat promotion requires target class to match source class',
          });
        }

        await assertRollUnique(
          tenantId,
          toYearId,
          toClassId,
          toSectionId,
          rollForStudent,
          sourceEnroll.id
        );

        await sourceEnroll.update(
          {
            section_id: toSectionId,
            roll_number:
              rollForStudent != null && rollForStudent !== '' ? Number(rollForStudent) : null,
            promotion_type: 'repeated',
          },
          { transaction: t }
        );
        await sourceEnroll.reload({ transaction: t });

        await StudentPromotion.create(
          {
            tenant_id: tenantId,
            student_id: sid,
            from_academic_year_id: sourceEnroll.academic_year_id,
            to_academic_year_id: toYearId,
            from_class_id: sourceEnroll.class_id,
            to_class_id: toClassId,
            from_section_id: sourceEnroll.section_id,
            to_section_id: toSectionId,
            kind,
            created_by_user_id: createdBy,
          },
          { transaction: t }
        );
        updated.push(sourceEnroll);
      } else {
        const nextYear = await getNextAcademicYearAfter(
          tenantId,
          sourceEnroll.academic_year_id,
          t
        );
        if (!nextYear) {
          await t.rollback();
          return res.status(400).json({
            message:
              'No next academic year after the source session. Create the next academic year before promoting.',
          });
        }
        if (toYearId !== nextYear.id) {
          await t.rollback();
          return res.status(400).json({
            message: `Promotion is only allowed to the next academic year (${nextYear.name || nextYear.id}).`,
          });
        }

        const existing = await StudentEnrollment.findOne({
          where: {
            tenant_id: tenantId,
            student_id: sid,
            academic_year_id: toYearId,
          },
          transaction: t,
        });
        if (existing) {
          await t.rollback();
          return res.status(409).json({
            message: `Student ${sid} already has enrollment for target academic year`,
          });
        }

        await assertRollUnique(tenantId, toYearId, toClassId, toSectionId, rollForStudent, null);

        const row = await StudentEnrollment.create(
          {
            tenant_id: tenantId,
            student_id: sid,
            academic_year_id: toYearId,
            class_id: toClassId,
            section_id: toSectionId,
            roll_number:
              rollForStudent != null && rollForStudent !== '' ? Number(rollForStudent) : null,
            category: null,
            promotion_type: 'promoted',
            status: 'active',
          },
          { transaction: t }
        );
        created.push(row);

        await StudentPromotion.create(
          {
            tenant_id: tenantId,
            student_id: sid,
            from_academic_year_id: sourceEnroll.academic_year_id,
            to_academic_year_id: toYearId,
            from_class_id: sourceEnroll.class_id,
            to_class_id: toClassId,
            from_section_id: sourceEnroll.section_id,
            to_section_id: toSectionId,
            kind,
            created_by_user_id: createdBy,
          },
          { transaction: t }
        );

        if (toYearId > sourceEnroll.academic_year_id) {
          await sourceEnroll.update({ status: 'inactive' }, { transaction: t });
        }
      }
    }

    await t.commit();
    await recordAudit({
      tenantId,
      actorUserId: req.user?.userId || null,
      entityType: 'student_enrollment',
      entityId: String(toYearId),
      action: 'promote',
      metadata: { created: created.length, updated: updated.length, student_ids: studentIds },
    });
    res.status(201).json({
      created: created.length,
      updated: updated.length,
      enrollments: [
        ...created.map((r) => r.get({ plain: true })),
        ...updated.map((r) => r.get({ plain: true })),
      ],
    });
  } catch (err) {
    await t.rollback();
    if (err.code === 'ROLL_TAKEN') {
      return res.status(409).json({ message: 'Roll number already taken for this class/section/year' });
    }
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Enrollment conflict' });
    }
    req.log?.error({ err }, 'students.promote failed');
    res.status(500).json({ message: 'Internal server error' });
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
    req.log?.error({ err }, 'students.getLoginDetails failed');
    res.status(500).json({ message: 'Internal server error' });
  }
};

