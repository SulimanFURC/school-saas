const { Op } = require('sequelize');
const Subject = require('./subject.model');
const TeacherAcademicAssignment = require('../teachers/teacherAcademicAssignment.model');

function parseId(raw) {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeName(raw) {
  const name = raw != null ? String(raw).trim() : '';
  if (!name) return { ok: false, message: 'Subject name is required' };
  if (name.length > 100) return { ok: false, message: 'Subject name is too long' };
  const key = name.toLowerCase();
  return { ok: true, name, name_key: key };
}

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const q = req.query.q != null ? String(req.query.q).trim() : '';
    const activeOnly =
      String(req.query.activeOnly || '').toLowerCase() === 'true' ||
      String(req.query.active_only || '').toLowerCase() === 'true';

    const where = { tenant_id: tenantId };
    if (activeOnly) where.is_active = true;
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { name_key: { [Op.iLike]: `%${q.toLowerCase()}%` } },
      ];
    }

    const rows = await Subject.findAll({
      where,
      order: [['name', 'ASC']],
    });
    res.status(200).json(rows);
  } catch (err) {
    console.error('subjects.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const norm = normalizeName(req.body && req.body.name);
    if (!norm.ok) {
      return res.status(400).json({ message: norm.message });
    }
    const row = await Subject.create({
      tenant_id: tenantId,
      name: norm.name,
      name_key: norm.name_key,
      is_active: req.body && req.body.is_active === false ? false : true,
    });
    res.status(201).json(row);
  } catch (err) {
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Subject already exists' });
    }
    console.error('subjects.create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await Subject.findOne({ where: { id, tenant_id: tenantId } });
    if (!row) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      const norm = normalizeName(req.body && req.body.name);
      if (!norm.ok) {
        return res.status(400).json({ message: norm.message });
      }
      patch.name = norm.name;
      patch.name_key = norm.name_key;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active')) {
      patch.is_active = Boolean(req.body && req.body.is_active);
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    await row.update(patch);
    res.status(200).json(row);
  } catch (err) {
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Subject already exists' });
    }
    console.error('subjects.update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const row = await Subject.findOne({ where: { id, tenant_id: tenantId } });
    if (!row) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const used = await TeacherAcademicAssignment.count({
      where: { tenant_id: tenantId, subject_id: id },
    });
    if (used > 0) {
      return res.status(409).json({
        message: 'Cannot delete subject: it is used in teaching assignments',
      });
    }

    await row.destroy();
    res.status(204).send();
  } catch (err) {
    console.error('subjects.remove error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

