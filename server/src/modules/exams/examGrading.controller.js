const sequelize = require('../../config/db');
const Exam = require('./exam.model');
const ExamClass = require('./examClass.model');
const ExamGradingConfig = require('./examGradingConfig.model');
const GradingScheme = require('./gradingScheme.model');
const GradingBand = require('./gradingBand.model');
const StudentEnrollment = require('../students/studentEnrollment.model');
const notificationService = require('../notifications/notification.service');
const resultsService = require('./examResults.service');
const { GRADING_MODES } = require('./exam.constants');
const { isUuid } = require('./exam.helpers');

exports.getConfig = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid exam id' });
    const cfg = await ExamGradingConfig.findOne({
      where: { tenant_id: tenantId, exam_id: examId },
    });
    if (!cfg) {
      return res.status(200).json({ data: null });
    }
    const scheme = await GradingScheme.findOne({
      where: { id: cfg.grading_scheme_id, tenant_id: tenantId },
    });
    const bands = scheme
      ? await GradingBand.findAll({
          where: { tenant_id: tenantId, grading_scheme_id: scheme.id },
          order: [['min_percent', 'ASC']],
        })
      : [];
    res.status(200).json({
      data: {
        grading_scheme_id: cfg.grading_scheme_id,
        grading_mode: cfg.grading_mode,
        scheme: scheme
          ? {
              id: scheme.id,
              name: scheme.name,
              description: scheme.description,
              has_grade_points: !!scheme.has_grade_points,
              archived_at: scheme.archived_at,
            }
          : null,
        bands: bands.map((b) => ({
          id: b.id,
          grade_label: b.grade_label,
          min_percent: Number(b.min_percent),
          max_percent: Number(b.max_percent),
          grade_point: b.grade_point == null ? null : Number(b.grade_point),
          remarks: b.remarks,
          is_failing: !!b.is_failing,
        })),
      },
    });
  } catch (err) {
    console.error('examGrading.getConfig error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.setConfig = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    if (!isUuid(examId)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid exam id' });
    }
    const exam = await Exam.findOne({
      where: { id: examId, tenant_id: tenantId },
      transaction: t,
    });
    if (!exam) {
      await t.rollback();
      return res.status(404).json({ message: 'Exam not found' });
    }
    if (exam.status === 'archived' || exam.status === 'published') {
      await t.rollback();
      return res.status(409).json({
        message: `Grading cannot be changed once exam is ${exam.status}`,
      });
    }
    const body = req.body || {};
    const schemeId = body.grading_scheme_id;
    if (!isUuid(schemeId)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid grading_scheme_id' });
    }
    const scheme = await GradingScheme.findOne({
      where: { id: schemeId, tenant_id: tenantId },
      transaction: t,
    });
    if (!scheme || scheme.archived_at) {
      await t.rollback();
      return res.status(404).json({ message: 'Grading scheme not found' });
    }
    const mode = body.grading_mode || 'per_subject';
    if (!GRADING_MODES.includes(mode)) {
      await t.rollback();
      return res.status(400).json({
        message: `Invalid grading_mode. Allowed: ${GRADING_MODES.join(', ')}`,
      });
    }

    const existing = await ExamGradingConfig.findOne({
      where: { tenant_id: tenantId, exam_id: examId },
      transaction: t,
    });
    if (existing) {
      await existing.update(
        { grading_scheme_id: schemeId, grading_mode: mode },
        { transaction: t }
      );
    } else {
      await ExamGradingConfig.create(
        {
          tenant_id: tenantId,
          exam_id: examId,
          grading_scheme_id: schemeId,
          grading_mode: mode,
        },
        { transaction: t }
      );
    }

    await t.commit();
    res.status(200).json({ message: 'Grading configured' });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    console.error('examGrading.setConfig error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.distribution = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid exam id' });
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    const dist = await resultsService.buildGradeDistribution(tenantId, exam);
    res.status(200).json({ data: dist });
  } catch (err) {
    console.error('examGrading.distribution error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.publish = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const examId = req.params.id;
    if (!isUuid(examId)) return res.status(400).json({ message: 'Invalid exam id' });
    const exam = await Exam.findOne({ where: { id: examId, tenant_id: tenantId } });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status === 'archived') {
      return res.status(409).json({ message: 'Cannot publish an archived exam' });
    }
    if (exam.status === 'published') {
      return res.status(200).json({ message: 'Already published' });
    }
    if (exam.status !== 'result_pending' && exam.status !== 'ongoing') {
      return res.status(409).json({
        message: `Exam must be ongoing or result_pending to publish (current: ${exam.status})`,
      });
    }
    const cfg = await ExamGradingConfig.findOne({
      where: { tenant_id: tenantId, exam_id: examId },
    });
    if (!cfg) {
      return res.status(409).json({
        message: 'Configure a grading scheme before publishing',
      });
    }

    await exam.update({ status: 'published', published_at: new Date() });

    notifyResultsPublished(tenantId, exam).catch((err) =>
      console.error('examGrading.notifyPublished error:', err)
    );

    res.status(200).json({ message: 'Results published', data: { id: exam.id, published_at: exam.published_at } });
  } catch (err) {
    console.error('examGrading.publish error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

async function notifyResultsPublished(tenantId, exam) {
  const examClasses = await ExamClass.findAll({
    where: { tenant_id: tenantId, exam_id: exam.id },
    attributes: ['class_id'],
  });
  const classIds = examClasses.map((c) => c.class_id);
  if (classIds.length === 0) return;

  const enrollments = await StudentEnrollment.findAll({
    where: {
      tenant_id: tenantId,
      academic_year_id: exam.academic_year_id,
      class_id: classIds,
      status: 'active',
    },
    attributes: ['student_id'],
  });
  const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
  if (studentIds.length === 0) return;

  const userIds = await notificationService.findStudentUserIds(tenantId, studentIds);
  if (userIds.length === 0) return;

  await notificationService.notifyUsers(tenantId, userIds, {
    title: `Results published: ${exam.title}`,
    body: 'Your results are now available. Open the Exams page to view your result card.',
    data: { exam_id: exam.id, kind: 'results.published' },
  });
}
