const path = require('path');
const { Op } = require('sequelize');
const Expense = require('./expense.model');
const User = require('../users/user.model');

const EXPENSE_TYPES = new Set([
  'Salary',
  'Rent',
  'Electricity',
  'Water',
  'Internet',
  'Supplies',
  'Maintenance',
  'Transport',
  'Miscellaneous',
]);
const STATUSES = new Set(['Paid', 'Due', 'Other']);
const SORT_FIELDS = {
  expense_date: 'expense_date',
  amount: 'amount',
  expense_type: 'expense_type',
  status: 'status',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

function uploadsDiskPath(relativeUrl) {
  if (!relativeUrl || typeof relativeUrl !== 'string') return null;
  const rel = relativeUrl.replace(/^\/+/, '').replace(/^uploads\/?/, '');
  return path.join(__dirname, '../../../uploads', rel);
}

function safeUnlinkUpload(relativeUrl) {
  const disk = uploadsDiskPath(relativeUrl);
  if (!disk) return;
  try {
    if (fs.existsSync(disk)) fs.unlinkSync(disk);
  } catch (e) {
    console.error('safeUnlinkUpload:', e);
  }
}

function isExpenseAttachmentUrl(tenantId, url) {
  if (!url || typeof url !== 'string') return false;
  const expected = `/uploads/expenses/${tenantId}/`;
  return url.startsWith(expected) || url.startsWith(`uploads/expenses/${tenantId}/`);
}

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
        { name: { [Op.iLike]: pattern } },
        { description: { [Op.iLike]: pattern } },
      ];
    }
    const st = req.query.status != null ? String(req.query.status).trim() : '';
    if (st && STATUSES.has(st)) {
      where.status = st;
    }
    const et = req.query.expense_type != null ? String(req.query.expense_type).trim() : '';
    if (et && EXPENSE_TYPES.has(et)) {
      where.expense_type = et;
    }

    const sortByRaw = req.query.sort_by != null ? String(req.query.sort_by).trim() : '';
    const sortCol = SORT_FIELDS[sortByRaw] || 'expense_date';
    const sortDirRaw = req.query.sort_order != null ? String(req.query.sort_order).trim().toLowerCase() : '';
    const sortDir = sortDirRaw === 'asc' ? 'ASC' : 'DESC';

    const { count, rows } = await Expense.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortCol, sortDir]],
    });

    res.status(200).json({
      data: rows.map((r) => r.get({ plain: true })),
      total: count,
      page,
      limit,
    });
  } catch (err) {
    console.error('expense list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await Expense.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
      include: [
        {
          model: User,
          as: 'createdBy',
          attributes: { exclude: ['password'] },
          required: false,
        },
      ],
    });
    if (!row) {
      return res.status(404).json({ message: 'Not found' });
    }
    res.status(200).json(row.get({ plain: true }));
  } catch (err) {
    console.error('expense getOne error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { name, description, amount, expense_date, expense_type, status } = req.body;

    if (!name || String(name).trim() === '') {
      return res.status(400).json({ message: 'name is required' });
    }
    if (amount == null || amount === '') {
      return res.status(400).json({ message: 'amount is required' });
    }
    if (!expense_date || String(expense_date).trim() === '') {
      return res.status(400).json({ message: 'expense_date is required' });
    }
    if (!expense_type || !EXPENSE_TYPES.has(String(expense_type))) {
      return res.status(400).json({ message: 'Valid expense_type is required' });
    }
    if (!status || !STATUSES.has(String(status))) {
      return res.status(400).json({ message: 'Valid status is required' });
    }

    const amt = Number(amount);
    if (Number.isNaN(amt) || amt <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }

    const desc =
      description != null && String(description).trim() !== '' ? String(description).trim() : null;

    const record = await Expense.create({
      tenant_id: tenantId,
      name: String(name).trim(),
      description: desc,
      amount: amt,
      expense_date: String(expense_date).trim().slice(0, 10),
      expense_type: String(expense_type),
      status: String(status),
      attachment_url: null,
      created_by_user_id: req.user?.userId || null,
    });

    res.status(201).json({
      message: 'Expense created successfully',
      data: record.get({ plain: true }),
    });
  } catch (err) {
    console.error('expense create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await Expense.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) {
      return res.status(404).json({ message: 'Not found' });
    }

    const { name, description, amount, expense_date, expense_type, status } = req.body;
    const patch = {};

    if (name != null) {
      if (String(name).trim() === '') {
        return res.status(400).json({ message: 'name cannot be empty' });
      }
      patch.name = String(name).trim();
    }
    if (description !== undefined) {
      patch.description =
        description != null && String(description).trim() !== '' ? String(description).trim() : null;
    }
    if (amount != null && amount !== '') {
      const amt = Number(amount);
      if (Number.isNaN(amt) || amt <= 0) {
        return res.status(400).json({ message: 'amount must be a positive number' });
      }
      patch.amount = amt;
    }
    if (expense_date != null) {
      patch.expense_date = String(expense_date).trim().slice(0, 10);
    }
    if (expense_type != null) {
      if (!EXPENSE_TYPES.has(String(expense_type))) {
        return res.status(400).json({ message: 'Invalid expense_type' });
      }
      patch.expense_type = String(expense_type);
    }
    if (status != null) {
      if (!STATUSES.has(String(status))) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      patch.status = String(status);
    }

    await row.update(patch);
    const fresh = await Expense.findOne({
      where: { id: row.id, tenant_id: tenantId },
      include: [
        {
          model: User,
          as: 'createdBy',
          attributes: { exclude: ['password'] },
          required: false,
        },
      ],
    });
    res.status(200).json(fresh.get({ plain: true }));
  } catch (err) {
    console.error('expense update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await Expense.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) {
      return res.status(404).json({ message: 'Not found' });
    }
    const url = row.attachment_url;
    if (url && isExpenseAttachmentUrl(tenantId, url)) {
      safeUnlinkUpload(url);
    }
    await row.destroy();
    res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('expense remove error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.uploadReceipt = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Receipt image file is required' });
    }
    const row = await Expense.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) {
      safeUnlinkUpload(path.posix.join('/uploads/expenses', String(tenantId), req.file.filename));
      return res.status(404).json({ message: 'Not found' });
    }

    const relativePath = path.posix.join('/uploads/expenses', String(tenantId), req.file.filename);
    const prev = row.attachment_url;
    if (prev && isExpenseAttachmentUrl(tenantId, prev)) {
      safeUnlinkUpload(prev);
    }
    await row.update({ attachment_url: relativePath });
    const fresh = await Expense.findOne({
      where: { id: row.id, tenant_id: tenantId },
    });
    res.status(200).json({
      message: 'Receipt uploaded',
      data: fresh.get({ plain: true }),
    });
  } catch (err) {
    console.error('expense uploadReceipt error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteReceipt = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await Expense.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) {
      return res.status(404).json({ message: 'Not found' });
    }
    const url = row.attachment_url;
    if (url && isExpenseAttachmentUrl(tenantId, url)) {
      safeUnlinkUpload(url);
    }
    await row.update({ attachment_url: null });
    const fresh = await Expense.findOne({
      where: { id: row.id, tenant_id: tenantId },
    });
    res.status(200).json({
      message: 'Receipt removed',
      data: fresh.get({ plain: true }),
    });
  } catch (err) {
    console.error('expense deleteReceipt error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
