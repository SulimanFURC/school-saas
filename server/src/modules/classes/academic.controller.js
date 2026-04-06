const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const SchoolClass = require('./class.model');
const Section = require('./section.model');
const AcademicYear = require('./academicYear.model');
const StudentEnrollment = require('../students/studentEnrollment.model');

exports.listClasses = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const includeSections =
      String(req.query.include || '').includes('sections') || req.query.include === 'sections';
    const opts = {
      where: { tenant_id: tenantId },
      order: [
        ['display_order', 'ASC'],
        ['name', 'ASC'],
      ],
    };
    if (includeSections) {
      opts.include = [{ model: Section, as: 'sections', required: false }];
    }
    const rows = await SchoolClass.findAll(opts);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createClass = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, display_order: displayOrder, code, is_active: isActive } = req.body || {};
    if (!name || String(name).trim() === '') {
      await t.rollback();
      return res.status(400).json({ message: 'name is required' });
    }
    const row = await SchoolClass.create(
      {
        tenant_id: req.tenant.id,
        name: String(name).trim(),
        display_order: displayOrder != null ? Number(displayOrder) : null,
        code: code != null && String(code).trim() !== '' ? String(code).trim().toUpperCase() : null,
        is_active: isActive !== false,
      },
      { transaction: t }
    );
    await Section.create(
      {
        tenant_id: req.tenant.id,
        class_id: row.id,
        name: 'A',
      },
      { transaction: t }
    );
    await t.commit();
    const full = await SchoolClass.findByPk(row.id, {
      include: [{ model: Section, as: 'sections', required: false }],
    });
    res.status(201).json(full);
  } catch (err) {
    await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Class name or code already exists' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const id = Number(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const cls = await SchoolClass.findOne({ where: { id, tenant_id: tenantId } });
    if (!cls) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const { name, display_order: displayOrder, code, is_active: isActive } = req.body || {};
    const patch = {};
    if (name != null) patch.name = String(name).trim();
    if (displayOrder !== undefined) {
      patch.display_order = displayOrder != null ? Number(displayOrder) : null;
    }
    if (code !== undefined) {
      patch.code = code != null && String(code).trim() !== '' ? String(code).trim().toUpperCase() : null;
    }
    if (isActive !== undefined) patch.is_active = Boolean(isActive);
    await cls.update(patch);
    res.json(
      await SchoolClass.findByPk(id, {
        include: [{ model: Section, as: 'sections', required: false }],
      })
    );
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Class name or code already exists' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const id = Number(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const cls = await SchoolClass.findOne({ where: { id, tenant_id: tenantId } });
    if (!cls) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const enrollCount = await StudentEnrollment.count({
      where: { tenant_id: tenantId, class_id: id },
    });
    if (enrollCount > 0) {
      return res.status(409).json({
        message: 'Cannot delete class: students are enrolled. Deactivate the class instead.',
      });
    }
    await Section.destroy({ where: { tenant_id: tenantId, class_id: id } });
    await cls.destroy();
    res.status(204).send();
  } catch (err) {
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

exports.updateSection = async (req, res) => {
  try {
    const id = Number(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const sec = await Section.findOne({ where: { id, tenant_id: tenantId } });
    if (!sec) {
      return res.status(404).json({ message: 'Section not found' });
    }
    const { name } = req.body || {};
    if (name == null || String(name).trim() === '') {
      return res.status(400).json({ message: 'name is required' });
    }
    await sec.update({ name: String(name).trim() });
    res.json(sec);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Section name already exists for this class' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSection = async (req, res) => {
  try {
    const id = Number(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const sec = await Section.findOne({ where: { id, tenant_id: tenantId } });
    if (!sec) {
      return res.status(404).json({ message: 'Section not found' });
    }
    const sectionsForClass = await Section.count({
      where: { tenant_id: tenantId, class_id: sec.class_id },
    });
    if (sectionsForClass <= 1) {
      return res.status(409).json({ message: 'Cannot delete the only section of a class' });
    }
    const enrollCount = await StudentEnrollment.count({
      where: { tenant_id: tenantId, section_id: id },
    });
    if (enrollCount > 0) {
      return res.status(409).json({
        message: 'Cannot delete section: students are enrolled in this section',
      });
    }
    await sec.destroy();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listAcademicYears = async (req, res) => {
  try {
    const rows = await AcademicYear.findAll({
      where: { tenant_id: req.tenant.id },
      order: [['name', 'ASC']],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCurrentAcademicYear = async (req, res) => {
  try {
    const row = await AcademicYear.findOne({
      where: { tenant_id: req.tenant.id, is_active: true },
      order: [['id', 'DESC']],
    });
    if (!row) {
      return res.status(404).json({ message: 'No active academic year' });
    }
    res.json(row);
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
