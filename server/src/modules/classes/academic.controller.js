const { Op } = require('sequelize');
const SchoolClass = require('./class.model');
const Section = require('./section.model');
const AcademicYear = require('./academicYear.model');

exports.listClasses = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const rows = await SchoolClass.findAll({
      where: { tenant_id: tenantId },
      order: [
        ['display_order', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { name, display_order } = req.body;
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ message: 'name is required' });
    }
    const row = await SchoolClass.create({
      tenant_id: req.tenant.id,
      name: String(name).trim(),
      display_order: display_order != null ? Number(display_order) : null,
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Class name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.listSections = async (req, res) => {
  try {
    const classId = req.query.class_id;
    if (!classId) {
      return res.status(400).json({ message: 'class_id query is required' });
    }
    const tenantId = req.tenant.id;
    const cls = await SchoolClass.findOne({
      where: { id: classId, tenant_id: tenantId },
    });
    if (!cls) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const rows = await Section.findAll({
      where: { tenant_id: tenantId, class_id: classId },
      order: [['name', 'ASC']],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSection = async (req, res) => {
  try {
    const { class_id: classId, name } = req.body;
    if (!classId || !name) {
      return res.status(400).json({ message: 'class_id and name are required' });
    }
    const tenantId = req.tenant.id;
    const cls = await SchoolClass.findOne({
      where: { id: classId, tenant_id: tenantId },
    });
    if (!cls) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const row = await Section.create({
      tenant_id: tenantId,
      class_id: classId,
      name: String(name).trim(),
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Section already exists for this class' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.listAcademicYears = async (req, res) => {
  try {
    const rows = await AcademicYear.findAll({
      where: { tenant_id: req.tenant.id },
      order: [['id', 'DESC']],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createAcademicYear = async (req, res) => {
  try {
    const { name, is_active: isActive } = req.body;
    const row = await AcademicYear.create({
      tenant_id: req.tenant.id,
      name: name != null ? String(name).trim() : null,
      is_active: isActive !== false,
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setActiveAcademicYear = async (req, res) => {
  try {
    const id = Number(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const year = await AcademicYear.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!year) {
      return res.status(404).json({ message: 'Academic year not found' });
    }
    await AcademicYear.update(
      { is_active: false },
      { where: { tenant_id: tenantId, id: { [Op.ne]: id } } }
    );
    await year.update({ is_active: true });
    res.json(await AcademicYear.findByPk(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
