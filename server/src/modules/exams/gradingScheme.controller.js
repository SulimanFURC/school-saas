const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const GradingScheme = require('./gradingScheme.model');
const GradingBand = require('./gradingBand.model');
const ExamGradingConfig = require('./examGradingConfig.model');
const { isUuid } = require('./exam.helpers');

function shapeBand(plain) {
  return {
    id: plain.id,
    grade_label: plain.grade_label,
    min_percent: Number(plain.min_percent),
    max_percent: Number(plain.max_percent),
    grade_point: plain.grade_point == null ? null : Number(plain.grade_point),
    remarks: plain.remarks,
    is_failing: !!plain.is_failing,
  };
}

function shapeScheme(scheme, bands) {
  if (!scheme) return null;
  const plain = scheme.get ? scheme.get({ plain: true }) : scheme;
  return {
    id: plain.id,
    name: plain.name,
    description: plain.description,
    has_grade_points: !!plain.has_grade_points,
    archived_at: plain.archived_at,
    bands: (bands || []).map((b) => shapeBand(b.get ? b.get({ plain: true }) : b)),
  };
}

function validateBands(rawBands) {
  if (!Array.isArray(rawBands) || rawBands.length === 0) {
    return { ok: false, message: 'bands must contain at least one entry' };
  }
  const cleaned = [];
  for (const raw of rawBands) {
    const label = raw && raw.grade_label != null ? String(raw.grade_label).trim() : '';
    if (!label) return { ok: false, message: 'Each band requires grade_label' };
    if (label.length > 20) return { ok: false, message: 'grade_label too long' };
    const min = Number(raw && raw.min_percent);
    const max = Number(raw && raw.max_percent);
    if (!Number.isFinite(min) || min < 0 || min > 100) {
      return { ok: false, message: 'min_percent must be in [0,100]' };
    }
    if (!Number.isFinite(max) || max < 0 || max > 100) {
      return { ok: false, message: 'max_percent must be in [0,100]' };
    }
    if (min > max) {
      return { ok: false, message: `min_percent (${min}) must be <= max_percent (${max})` };
    }
    let gp = null;
    if (raw.grade_point != null && raw.grade_point !== '') {
      const g = Number(raw.grade_point);
      if (!Number.isFinite(g) || g < 0) {
        return { ok: false, message: 'grade_point must be >= 0' };
      }
      gp = g;
    }
    const remarks = raw && raw.remarks != null ? String(raw.remarks).trim() : null;
    if (remarks && remarks.length > 120) {
      return { ok: false, message: 'remarks too long (max 120)' };
    }
    cleaned.push({
      grade_label: label,
      min_percent: min,
      max_percent: max,
      grade_point: gp,
      remarks: remarks || null,
      is_failing: !!(raw && raw.is_failing),
    });
  }
  cleaned.sort((a, b) => a.min_percent - b.min_percent);
  for (let i = 1; i < cleaned.length; i += 1) {
    if (cleaned[i].min_percent <= cleaned[i - 1].max_percent) {
      return {
        ok: false,
        message: `Band "${cleaned[i].grade_label}" overlaps "${cleaned[i - 1].grade_label}"`,
      };
    }
  }
  return { ok: true, value: cleaned };
}

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const includeArchived = String(req.query.include_archived || '').toLowerCase() === 'true';
    const where = { tenant_id: tenantId };
    if (!includeArchived) where.archived_at = null;
    const schemes = await GradingScheme.findAll({
      where,
      order: [['name', 'ASC']],
    });
    const ids = schemes.map((s) => s.id);
    const bands = ids.length
      ? await GradingBand.findAll({
          where: { tenant_id: tenantId, grading_scheme_id: ids },
          order: [['min_percent', 'ASC']],
        })
      : [];
    const bandsByScheme = new Map();
    for (const b of bands) {
      const arr = bandsByScheme.get(b.grading_scheme_id) || [];
      arr.push(b);
      bandsByScheme.set(b.grading_scheme_id, arr);
    }
    res.status(200).json({
      data: schemes.map((s) => shapeScheme(s, bandsByScheme.get(s.id) || [])),
    });
  } catch (err) {
    console.error('gradingSchemes.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid id' });
    const scheme = await GradingScheme.findOne({ where: { id, tenant_id: tenantId } });
    if (!scheme) return res.status(404).json({ message: 'Not found' });
    const bands = await GradingBand.findAll({
      where: { tenant_id: tenantId, grading_scheme_id: id },
      order: [['min_percent', 'ASC']],
    });
    res.status(200).json({ data: shapeScheme(scheme, bands) });
  } catch (err) {
    console.error('gradingSchemes.getById error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const body = req.body || {};
    const name = body.name != null ? String(body.name).trim() : '';
    if (!name) {
      await t.rollback();
      return res.status(400).json({ message: 'name is required' });
    }
    if (name.length > 120) {
      await t.rollback();
      return res.status(400).json({ message: 'name is too long' });
    }
    const description = body.description != null ? String(body.description).trim() : null;

    const validation = validateBands(body.bands);
    if (!validation.ok) {
      await t.rollback();
      return res.status(400).json({ message: validation.message });
    }
    const bands = validation.value;

    const hasPoints = bands.some((b) => b.grade_point != null);

    let scheme;
    try {
      scheme = await GradingScheme.create(
        {
          tenant_id: tenantId,
          name,
          description,
          has_grade_points: hasPoints,
        },
        { transaction: t }
      );
    } catch (err) {
      if (err && err.name === 'SequelizeUniqueConstraintError') {
        await t.rollback();
        return res.status(409).json({ message: 'A scheme with this name already exists' });
      }
      throw err;
    }

    await GradingBand.bulkCreate(
      bands.map((b) => ({
        tenant_id: tenantId,
        grading_scheme_id: scheme.id,
        ...b,
      })),
      { transaction: t }
    );

    await t.commit();
    const reloadedBands = await GradingBand.findAll({
      where: { tenant_id: tenantId, grading_scheme_id: scheme.id },
      order: [['min_percent', 'ASC']],
    });
    res.status(201).json({
      message: 'Grading scheme created',
      data: shapeScheme(scheme, reloadedBands),
    });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('gradingSchemes.create error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid id' });
    }
    const scheme = await GradingScheme.findOne({
      where: { id, tenant_id: tenantId },
      transaction: t,
    });
    if (!scheme) {
      await t.rollback();
      return res.status(404).json({ message: 'Not found' });
    }
    if (scheme.archived_at) {
      await t.rollback();
      return res.status(409).json({ message: 'Archived schemes cannot be edited' });
    }

    const body = req.body || {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = String(body.name || '').trim();
      if (!name) {
        await t.rollback();
        return res.status(400).json({ message: 'name is required' });
      }
      patch.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      patch.description = body.description != null ? String(body.description).trim() : null;
    }
    if (Object.keys(patch).length > 0) {
      try {
        await scheme.update(patch, { transaction: t });
      } catch (err) {
        if (err && err.name === 'SequelizeUniqueConstraintError') {
          await t.rollback();
          return res.status(409).json({ message: 'A scheme with this name already exists' });
        }
        throw err;
      }
    }

    if (Array.isArray(body.bands)) {
      const validation = validateBands(body.bands);
      if (!validation.ok) {
        await t.rollback();
        return res.status(400).json({ message: validation.message });
      }
      const bands = validation.value;
      const inUse = await ExamGradingConfig.count({
        where: { tenant_id: tenantId, grading_scheme_id: scheme.id },
        transaction: t,
      });
      if (inUse > 0) {
        await t.rollback();
        return res.status(409).json({
          message:
            'Bands cannot be modified because this scheme is bound to one or more exams. Clone the scheme to make changes.',
        });
      }
      await GradingBand.destroy({
        where: { tenant_id: tenantId, grading_scheme_id: scheme.id },
        transaction: t,
      });
      await GradingBand.bulkCreate(
        bands.map((b) => ({
          tenant_id: tenantId,
          grading_scheme_id: scheme.id,
          ...b,
        })),
        { transaction: t }
      );
      await scheme.update(
        { has_grade_points: bands.some((b) => b.grade_point != null) },
        { transaction: t }
      );
    }

    await t.commit();
    const bands = await GradingBand.findAll({
      where: { tenant_id: tenantId, grading_scheme_id: scheme.id },
      order: [['min_percent', 'ASC']],
    });
    res.status(200).json({ message: 'Scheme updated', data: shapeScheme(scheme, bands) });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('gradingSchemes.update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.archive = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid id' });
    const scheme = await GradingScheme.findOne({ where: { id, tenant_id: tenantId } });
    if (!scheme) return res.status(404).json({ message: 'Not found' });
    if (scheme.archived_at) {
      return res.status(200).json({ message: 'Already archived', data: shapeScheme(scheme, []) });
    }
    await scheme.update({ archived_at: new Date() });
    res.status(200).json({ message: 'Scheme archived', data: shapeScheme(scheme, []) });
  } catch (err) {
    console.error('gradingSchemes.archive error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports.shapeScheme = shapeScheme;
module.exports.shapeBand = shapeBand;
