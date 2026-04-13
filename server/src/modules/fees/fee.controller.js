const { Op, QueryTypes } = require('sequelize');
const FeeCollection = require('./feeCollection.model');
const Student = require('../students/student.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const AcademicYear = require('../classes/academicYear.model');
const SchoolClass = require('../classes/class.model');
const Section = require('../classes/section.model');
const User = require('../users/user.model');

const FEE_TYPES = new Set([
  'Tuition',
  'Annual',
  'Library',
  'Transport',
  'Exam',
  'Miscellaneous',
]);
const PAYMENT_METHODS = new Set([
  'Cash',
  'Credit Card',
  'Debit Card',
  'Cheque',
  'Bank Transfer',
  'Online',
]);
const STATUSES = new Set(['Paid', 'Pending', 'Unpaid']);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

async function getActiveAcademicYear(tenantId) {
  return AcademicYear.findOne({
    where: { tenant_id: tenantId, is_active: true },
    order: [['id', 'DESC']],
  });
}

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

function displayNameFromStudent(s) {
  const plain = s.get ? s.get({ plain: true }) : s;
  if (plain.full_name && String(plain.full_name).trim()) {
    return String(plain.full_name).trim();
  }
  return [plain.first_name, plain.last_name].filter(Boolean).join(' ').trim();
}

function classNameFromEnrollment(ePlain) {
  if (!ePlain) return null;
  const cls = ePlain.schoolClass;
  const sec = ePlain.section;
  if (cls && sec) return `${cls.name} - ${sec.name}`;
  return cls ? cls.name : null;
}

/**
 * Next invoice for INV-{calendarYear}-{6-digit-seq} per tenant.
 * Uses max existing numeric suffix (not row count) so deletes / gaps do not reuse numbers.
 * Concurrent creates can still collide; callers should retry on SequelizeUniqueConstraintError.
 */
async function generateInvoiceNumber(tenantId) {
  const calendarYear = new Date().getFullYear();
  const likePattern = `INV-${calendarYear}-%`;
  const rows = await FeeCollection.sequelize.query(
    `SELECT COALESCE(MAX((SUBSTRING(invoice_number FROM '[0-9]+$'))::INTEGER), 0) AS max_seq
     FROM fee_collections
     WHERE tenant_id = :tenantId
       AND invoice_number LIKE :likePattern
       AND invoice_number ~ '^INV-[0-9]{4}-[0-9]+$'`,
    {
      replacements: { tenantId, likePattern },
      type: QueryTypes.SELECT,
    }
  );
  const maxSeq = Number(rows[0]?.max_seq ?? 0);
  const next = maxSeq + 1;
  if (next > 999999) {
    throw new Error('Invoice sequence overflow for calendar year');
  }
  return `INV-${calendarYear}-${String(next).padStart(6, '0')}`;
}

exports.create = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const {
      student_id,
      fee_type,
      amount,
      collection_date,
      payment_method,
      status,
      payment_reference_number,
      notes,
    } = req.body;

    if (!student_id || !fee_type || amount == null || amount === '' || !collection_date || !payment_method || !status) {
      return res.status(400).json({
        message:
          'student_id, fee_type, amount, collection_date, payment_method, and status are required',
      });
    }
    if (!isUuid(String(student_id))) {
      return res.status(400).json({ message: 'Invalid student_id' });
    }
    if (!FEE_TYPES.has(String(fee_type))) {
      return res.status(400).json({ message: 'Invalid fee_type' });
    }
    if (!PAYMENT_METHODS.has(String(payment_method))) {
      return res.status(400).json({ message: 'Invalid payment_method' });
    }
    if (!STATUSES.has(String(status))) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const amt = Number(amount);
    if (Number.isNaN(amt) || amt < 1) {
      return res.status(400).json({ message: 'amount must be a number at least 1' });
    }

    const student = await Student.findOne({
      where: { id: student_id, tenant_id: tenantId },
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const activeYear = await getActiveAcademicYear(tenantId);
    const enrollments = await StudentEnrollment.findAll({
      where: { tenant_id: tenantId, student_id: student.id },
      include: [
        { model: AcademicYear, as: 'academicYear' },
        { model: SchoolClass, as: 'schoolClass' },
        { model: Section, as: 'section' },
      ],
    });
    const plainEnrolls = enrollments.map((e) => e.get({ plain: true }));
    const cePlain = resolveCurrentEnrollment(activeYear, plainEnrolls);
    if (!cePlain) {
      return res.status(400).json({
        message: 'No active enrollment found for this student; cannot record fee',
      });
    }

    const student_name = displayNameFromStudent(student) || student.admission_no;
    const class_name = classNameFromEnrollment(cePlain);
    const roll_number = cePlain.roll_number != null ? cePlain.roll_number : null;

    const buildCreatePayload = (invoice_number) => ({
      tenant_id: tenantId,
      student_id: student.id,
      invoice_number,
      registration_no: student.admission_no,
      student_name,
      class_name,
      roll_number,
      fee_type: String(fee_type),
      amount: amt,
      collection_date: String(collection_date).trim(),
      payment_method: String(payment_method),
      status: String(status),
      payment_reference_number:
        payment_reference_number != null && String(payment_reference_number).trim() !== ''
          ? String(payment_reference_number).trim()
          : null,
      notes: notes != null && String(notes).trim() !== '' ? String(notes).trim() : null,
      collected_by_user_id: req.user.userId,
    });

    const maxInvoiceAttempts = 15;
    let feeRecord;
    let invoice_number;
    for (let attempt = 0; attempt < maxInvoiceAttempts; attempt++) {
      invoice_number = await generateInvoiceNumber(tenantId);
      try {
        feeRecord = await FeeCollection.create(buildCreatePayload(invoice_number));
        break;
      } catch (createErr) {
        const isInvoiceDup =
          createErr.name === 'SequelizeUniqueConstraintError' &&
          createErr.fields &&
          Object.prototype.hasOwnProperty.call(createErr.fields, 'invoice_number');
        if (isInvoiceDup && attempt < maxInvoiceAttempts - 1) {
          continue;
        }
        throw createErr;
      }
    }

    if (!feeRecord) {
      return res.status(409).json({
        message: 'Could not allocate a unique invoice number; please try again',
      });
    }

    res.status(201).json({
      message: 'Fee collected successfully',
      data: feeRecord.get({ plain: true }),
      invoice_number,
    });
  } catch (err) {
    console.error('fee create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = { tenant_id: tenantId };
    const search = req.query.search != null ? String(req.query.search).trim() : '';
    if (search) {
      const pattern = `%${search}%`;
      where[Op.or] = [
        { invoice_number: { [Op.iLike]: pattern } },
        { student_name: { [Op.iLike]: pattern } },
        { registration_no: { [Op.iLike]: pattern } },
      ];
    }
    const st = req.query.status != null ? String(req.query.status).trim() : '';
    if (st && STATUSES.has(st)) {
      where.status = st;
    }
    const ft = req.query.fee_type != null ? String(req.query.fee_type).trim() : '';
    if (ft && FEE_TYPES.has(ft)) {
      where.fee_type = ft;
    }

    const { count, rows } = await FeeCollection.findAndCountAll({
      where,
      limit,
      offset,
      order: [['collection_date', 'DESC']],
    });

    res.status(200).json({
      data: rows.map((r) => r.get({ plain: true })),
      total: count,
      page,
      limit,
    });
  } catch (err) {
    console.error('fee list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await FeeCollection.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
      include: [
        {
          model: User,
          as: 'collectedBy',
          attributes: { exclude: ['password'] },
        },
      ],
    });
    if (!row) {
      return res.status(404).json({ message: 'Not found' });
    }
    res.status(200).json(row.get({ plain: true }));
  } catch (err) {
    console.error('fee getOne error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getByStudent = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { studentId } = req.params;
    if (!isUuid(studentId)) {
      return res.status(400).json({ message: 'Invalid studentId' });
    }
    const student = await Student.findOne({
      where: { id: studentId, tenant_id: tenantId },
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    const rows = await FeeCollection.findAll({
      where: { tenant_id: tenantId, student_id: studentId },
      // Latest = most recently created row for this student (not collection_date).
      order: [
        ['created_at', 'DESC'],
        ['id', 'DESC'],
      ],
    });
    const data = rows.map((r, i) => {
      const plain = r.get({ plain: true });
      return { ...plain, is_latest: i === 0 };
    });
    res.status(200).json(data);
  } catch (err) {
    console.error('fee getByStudent error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await FeeCollection.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) {
      return res.status(404).json({ message: 'Not found' });
    }

    const {
      fee_type,
      amount,
      collection_date,
      payment_method,
      status,
      payment_reference_number,
      notes,
    } = req.body;

    const patch = {};
    if (fee_type != null) {
      if (!FEE_TYPES.has(String(fee_type))) {
        return res.status(400).json({ message: 'Invalid fee_type' });
      }
      patch.fee_type = String(fee_type);
    }
    if (amount != null && amount !== '') {
      const amt = Number(amount);
      if (Number.isNaN(amt) || amt < 1) {
        return res.status(400).json({ message: 'amount must be a number at least 1' });
      }
      patch.amount = amt;
    }
    if (collection_date != null) {
      patch.collection_date = String(collection_date).trim();
    }
    if (payment_method != null) {
      if (!PAYMENT_METHODS.has(String(payment_method))) {
        return res.status(400).json({ message: 'Invalid payment_method' });
      }
      patch.payment_method = String(payment_method);
    }
    if (status != null) {
      if (!STATUSES.has(String(status))) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      patch.status = String(status);
    }
    if (payment_reference_number !== undefined) {
      patch.payment_reference_number =
        payment_reference_number != null && String(payment_reference_number).trim() !== ''
          ? String(payment_reference_number).trim()
          : null;
    }
    if (notes !== undefined) {
      patch.notes = notes != null && String(notes).trim() !== '' ? String(notes).trim() : null;
    }

    await row.update(patch);
    const fresh = await FeeCollection.findOne({
      where: { id: row.id, tenant_id: tenantId },
    });
    res.status(200).json(fresh.get({ plain: true }));
  } catch (err) {
    console.error('fee update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await FeeCollection.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) {
      return res.status(404).json({ message: 'Not found' });
    }
    await row.destroy();
    res.status(200).json({ message: 'Fee record deleted successfully' });
  } catch (err) {
    console.error('fee remove error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
