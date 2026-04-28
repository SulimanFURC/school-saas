const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const SchoolClass = require('./class.model');
const Section = require('./section.model');
const AcademicYear = require('./academicYear.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const Teacher = require('../teachers/teacher.model');

const TEACHER_PUBLIC_ATTRS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'designation',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function parseId(raw) {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalize a list of section inputs into [{ id?: number, name: string }] with trimmed unique names. */
function normalizeSectionInput(rawSections) {
  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    return { ok: false, message: 'At least one section is required' };
  }
  const seenNames = new Set();
  const out = [];
  for (const item of rawSections) {
    if (item == null) continue;
    let name;
    let id;
    if (typeof item === 'string') {
      name = item;
    } else if (typeof item === 'object') {
      name = item.name;
      if (item.id != null) {
        id = parseId(item.id);
        if (!id) {
          return { ok: false, message: 'Invalid section id' };
        }
      }
    } else {
      return { ok: false, message: 'Invalid section entry' };
    }
    const trimmed = name != null ? String(name).trim() : '';
    if (!trimmed) {
      return { ok: false, message: 'Section name cannot be empty' };
    }
    const key = trimmed.toLowerCase();
    if (seenNames.has(key)) {
      return { ok: false, message: `Duplicate section name: ${trimmed}` };
    }
    seenNames.add(key);
    out.push(id ? { id, name: trimmed } : { name: trimmed });
  }
  if (out.length === 0) {
    return { ok: false, message: 'At least one section is required' };
  }
  return { ok: true, sections: out };
}

async function loadClassWithRelations(tenantId, classId, transaction) {
  return SchoolClass.findOne({
    where: { id: classId, tenant_id: tenantId },
    include: [
      { model: Section, as: 'sections', required: false },
      { model: Teacher, as: 'classTeacher', required: false, attributes: TEACHER_PUBLIC_ATTRS },
    ],
    order: [[{ model: Section, as: 'sections' }, 'name', 'ASC']],
    transaction,
  });
}

exports.listClasses = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const includeSections =
      String(req.query.include || '').includes('sections') || req.query.include === 'sections';
    const include = [
      { model: Teacher, as: 'classTeacher', required: false, attributes: TEACHER_PUBLIC_ATTRS },
    ];
    if (includeSections) {
      include.push({ model: Section, as: 'sections', required: false });
    }
    const rows = await SchoolClass.findAll({
      where: { tenant_id: tenantId },
      include,
      order: [['name', 'ASC']],
    });
    res.status(200).json(rows);
  } catch (err) {
    console.error('classes.listClasses error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getClass = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const cls = await loadClassWithRelations(tenantId, id);
    if (!cls) {
      return res.status(404).json({ message: 'Class not found' });
    }
    res.status(200).json(cls);
  } catch (err) {
    console.error('classes.getClass error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createClass = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const body = req.body || {};

    const name = body.name != null ? String(body.name).trim() : '';
    if (!name) {
      await t.rollback();
      return res.status(400).json({ message: 'Class name is required' });
    }

    const classTeacherId = body.class_teacher_id != null ? String(body.class_teacher_id).trim() : '';
    if (!classTeacherId) {
      await t.rollback();
      return res.status(400).json({ message: 'A class teacher is required' });
    }
    if (!isUuid(classTeacherId)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid class teacher id' });
    }

    const sectionInput = normalizeSectionInput(body.sections);
    if (!sectionInput.ok) {
      await t.rollback();
      return res.status(400).json({ message: sectionInput.message });
    }

    // Disallow sending section ids on create.
    if (sectionInput.sections.some((s) => s.id != null)) {
      await t.rollback();
      return res.status(400).json({ message: 'Sections must not include ids on create' });
    }

    const teacher = await Teacher.findOne({
      where: { id: classTeacherId, tenant_id: tenantId },
      transaction: t,
    });
    if (!teacher) {
      await t.rollback();
      return res.status(404).json({ message: 'Class teacher not found' });
    }

    const teacherAlreadyAssigned = await SchoolClass.findOne({
      where: { tenant_id: tenantId, class_teacher_id: classTeacherId },
      transaction: t,
    });
    if (teacherAlreadyAssigned) {
      await t.rollback();
      return res.status(409).json({
        message: 'This teacher is already assigned as class teacher for another class',
      });
    }

    const created = await SchoolClass.create(
      {
        tenant_id: tenantId,
        name,
        class_teacher_id: classTeacherId,
        is_active: body.is_active !== false,
      },
      { transaction: t }
    );

    for (const s of sectionInput.sections) {
      await Section.create(
        {
          tenant_id: tenantId,
          class_id: created.id,
          name: s.name,
        },
        { transaction: t }
      );
    }

    await t.commit();

    const full = await loadClassWithRelations(tenantId, created.id);
    res.status(201).json(full);
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    if (err.name === 'SequelizeUniqueConstraintError') {
      const fields = err.fields || {};
      if (fields.name || fields.tenant_id) {
        return res.status(409).json({ message: 'A class with this name already exists' });
      }
      if (fields.class_teacher_id) {
        return res.status(409).json({
          message: 'This teacher is already assigned as class teacher for another class',
        });
      }
      return res.status(409).json({ message: 'Constraint violation' });
    }
    console.error('classes.createClass error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateClass = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = parseId(req.params.id);
    if (!id) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const cls = await SchoolClass.findOne({
      where: { id, tenant_id: tenantId },
      transaction: t,
    });
    if (!cls) {
      await t.rollback();
      return res.status(404).json({ message: 'Class not found' });
    }

    const body = req.body || {};
    const patch = {};

    if (body.name !== undefined) {
      const trimmed = body.name != null ? String(body.name).trim() : '';
      if (!trimmed) {
        await t.rollback();
        return res.status(400).json({ message: 'Class name cannot be empty' });
      }
      patch.name = trimmed;
    }

    if (body.class_teacher_id !== undefined) {
      const newTeacherId = body.class_teacher_id != null ? String(body.class_teacher_id).trim() : '';
      if (!newTeacherId) {
        await t.rollback();
        return res.status(400).json({ message: 'A class teacher is required' });
      }
      if (!isUuid(newTeacherId)) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid class teacher id' });
      }
      if (newTeacherId !== cls.class_teacher_id) {
        const teacher = await Teacher.findOne({
          where: { id: newTeacherId, tenant_id: tenantId },
          transaction: t,
        });
        if (!teacher) {
          await t.rollback();
          return res.status(404).json({ message: 'Class teacher not found' });
        }
        const otherAssignment = await SchoolClass.findOne({
          where: {
            tenant_id: tenantId,
            class_teacher_id: newTeacherId,
            id: { [Op.ne]: id },
          },
          transaction: t,
        });
        if (otherAssignment) {
          await t.rollback();
          return res.status(409).json({
            message: 'This teacher is already assigned as class teacher for another class',
          });
        }
        patch.class_teacher_id = newTeacherId;
      }
    }

    if (body.is_active !== undefined) {
      patch.is_active = Boolean(body.is_active);
    }

    if (Object.keys(patch).length > 0) {
      await cls.update(patch, { transaction: t });
    }

    if (body.sections !== undefined) {
      const norm = normalizeSectionInput(body.sections);
      if (!norm.ok) {
        await t.rollback();
        return res.status(400).json({ message: norm.message });
      }

      const existing = await Section.findAll({
        where: { tenant_id: tenantId, class_id: id },
        transaction: t,
      });
      const existingById = new Map(existing.map((s) => [s.id, s]));
      const desiredIds = new Set();
      for (const s of norm.sections) {
        if (s.id != null) desiredIds.add(s.id);
      }

      // Validate referenced section ids belong to this class.
      for (const s of norm.sections) {
        if (s.id != null && !existingById.has(s.id)) {
          await t.rollback();
          return res.status(400).json({ message: `Unknown section id: ${s.id}` });
        }
      }

      const toDelete = existing.filter((s) => !desiredIds.has(s.id));

      // Cannot remove a section that has active enrollments.
      if (toDelete.length > 0) {
        const blocked = await StudentEnrollment.count({
          where: {
            tenant_id: tenantId,
            section_id: { [Op.in]: toDelete.map((s) => s.id) },
            status: 'active',
          },
          transaction: t,
        });
        if (blocked > 0) {
          await t.rollback();
          return res.status(409).json({
            message:
              'Cannot remove a section that has active enrollments. Move or withdraw students first.',
          });
        }
      }

      // Apply deletions, updates, creations.
      for (const sec of toDelete) {
        await sec.destroy({ transaction: t });
      }
      for (const desired of norm.sections) {
        if (desired.id != null) {
          const current = existingById.get(desired.id);
          if (current && current.name !== desired.name) {
            await current.update({ name: desired.name }, { transaction: t });
          }
        } else {
          await Section.create(
            {
              tenant_id: tenantId,
              class_id: id,
              name: desired.name,
            },
            { transaction: t }
          );
        }
      }
    }

    await t.commit();

    const full = await loadClassWithRelations(tenantId, id);
    res.status(200).json(full);
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    if (err.name === 'SequelizeUniqueConstraintError') {
      const fields = err.fields || {};
      if (fields.class_teacher_id) {
        return res.status(409).json({
          message: 'This teacher is already assigned as class teacher for another class',
        });
      }
      if (fields.name) {
        return res.status(409).json({ message: 'A class with this name already exists' });
      }
      return res.status(409).json({ message: 'Constraint violation' });
    }
    console.error('classes.updateClass error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteClass = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = parseId(req.params.id);
    if (!id) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const cls = await SchoolClass.findOne({
      where: { id, tenant_id: tenantId },
      transaction: t,
    });
    if (!cls) {
      await t.rollback();
      return res.status(404).json({ message: 'Class not found' });
    }
    const enrollCount = await StudentEnrollment.count({
      where: { tenant_id: tenantId, class_id: id, status: 'active' },
      transaction: t,
    });
    if (enrollCount > 0) {
      await t.rollback();
      return res.status(409).json({
        message: 'Cannot delete class: students are enrolled. Deactivate the class instead.',
      });
    }
    await Section.destroy({
      where: { tenant_id: tenantId, class_id: id },
      transaction: t,
    });
    await cls.destroy({ transaction: t });
    await t.commit();
    res.status(204).send();
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error('classes.deleteClass error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listSections = async (req, res) => {
  try {
    const classId = parseId(req.query.class_id);
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
    res.status(200).json(rows);
  } catch (err) {
    console.error('classes.listSections error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createSection = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const classId = parseId(req.body && req.body.class_id);
    const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
    if (!classId || !name) {
      return res.status(400).json({ message: 'class_id and name are required' });
    }
    const cls = await SchoolClass.findOne({
      where: { id: classId, tenant_id: tenantId },
    });
    if (!cls) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const row = await Section.create({
      tenant_id: tenantId,
      class_id: classId,
      name,
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Section already exists for this class' });
    }
    console.error('classes.createSection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const tenantId = req.tenant.id;
    const sec = await Section.findOne({ where: { id, tenant_id: tenantId } });
    if (!sec) {
      return res.status(404).json({ message: 'Section not found' });
    }
    const name = req.body && req.body.name != null ? String(req.body.name).trim() : '';
    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }
    await sec.update({ name });
    res.status(200).json(sec);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Section name already exists for this class' });
    }
    console.error('classes.updateSection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteSection = async (req, res) => {
  try {
    const id = parseId(req.params.id);
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
      where: { tenant_id: tenantId, section_id: id, status: 'active' },
    });
    if (enrollCount > 0) {
      return res.status(409).json({
        message: 'Cannot delete section: students are enrolled in this section',
      });
    }
    await sec.destroy();
    res.status(204).send();
  } catch (err) {
    console.error('classes.deleteSection error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.listAcademicYears = async (req, res) => {
  try {
    const rows = await AcademicYear.findAll({
      where: { tenant_id: req.tenant.id },
      order: [['name', 'ASC']],
    });
    res.status(200).json(rows);
  } catch (err) {
    console.error('classes.listAcademicYears error:', err);
    res.status(500).json({ message: 'Internal server error' });
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
    res.status(200).json(row);
  } catch (err) {
    console.error('classes.getCurrentAcademicYear error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createAcademicYear = async (req, res) => {
  try {
    const { name, is_active: isActive } = req.body || {};
    const row = await AcademicYear.create({
      tenant_id: req.tenant.id,
      name: name != null ? String(name).trim() : null,
      is_active: isActive !== false,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('classes.createAcademicYear error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.setActiveAcademicYear = async (req, res) => {
  try {
    const id = parseId(req.params.id);
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
    res.status(200).json(await AcademicYear.findOne({ where: { id, tenant_id: tenantId } }));
  } catch (err) {
    console.error('classes.setActiveAcademicYear error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
