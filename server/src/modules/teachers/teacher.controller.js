const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const sequelize = require('../../config/db');
const Teacher = require('./teacher.model');
const User = require('../users/user.model');
const { invalidateUserSessions } = require('../auth/session.service');
const { recordAudit } = require('../audit/audit.service');
const { createTeacherLogin, syncTeacherLogin } = require('./teacher.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = new Set(['male', 'female', 'other']);

function isUuid(s) {
  if (!s || typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function sanitizeTeacherJson(plain) {
  if (!plain || typeof plain !== 'object') return plain;
  const hasB64 = plain.photo_base64 != null && String(plain.photo_base64).trim().length > 0;
  plain.has_photo = !!hasB64;
  return plain;
}

function teacherListRow(tPlain, loginPlain) {
  return {
    id: tPlain.id,
    first_name: tPlain.first_name,
    last_name: tPlain.last_name,
    email: tPlain.email,
    designation: tPlain.designation,
    joining_date: tPlain.joining_date,
    mobile_number: tPlain.mobile_number,
    has_photo: !!(tPlain.photo_base64 && String(tPlain.photo_base64).trim()),
    has_cv: !!(tPlain.cv_file_url && String(tPlain.cv_file_url).trim()),
    login: loginPlain
      ? { username: loginPlain.username, status: loginPlain.status, email: loginPlain.email }
      : null,
  };
}

async function optimizeTeacherPhoto(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function photoPayloadFromInput(photoBase64Raw) {
  if (photoBase64Raw == null || typeof photoBase64Raw !== 'string') {
    return { photo_base64: null, photo_mime: null };
  }
  const raw = String(photoBase64Raw).trim();
  if (!raw) return { photo_base64: null, photo_mime: null };
  const b64 = raw.replace(/^data:image\/\w+;base64,/, '').trim();
  if (!b64) return { photo_base64: null, photo_mime: null };
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  if (!buf.length) return null;
  try {
    const jpegBuf = await optimizeTeacherPhoto(buf);
    return {
      photo_base64: jpegBuf.toString('base64'),
      photo_mime: 'image/jpeg',
    };
  } catch {
    return null;
  }
}

async function generateUniqueTeacherUsername(tenantId, subdomain, teacherId) {
  const sub = String(subdomain || 'school')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '') || 'school';
  const idPart = String(teacherId).replace(/-/g, '').slice(0, 10);
  const base = `${sub}-t-${idPart}`.slice(0, 80);
  let username = base.toLowerCase();
  let n = 2;
  for (;;) {
    const existing = await User.findOne({ where: { tenant_id: tenantId, username } });
    if (!existing) return username;
    username = `${base}-${n}`.toLowerCase().slice(0, 100);
    n += 1;
  }
}

function randomPassword(len = 14) {
  return crypto.randomBytes(18).toString('base64url').slice(0, len);
}

function uploadsDiskPath(relativeUrl) {
  if (!relativeUrl || typeof relativeUrl !== 'string') return null;
  const rel = relativeUrl.replace(/^\/+/, '').replace(/^uploads\/?/, '');
  return path.join(__dirname, '../../../uploads', rel);
}

async function safeUnlinkUpload(relativeUrl) {
  const disk = uploadsDiskPath(relativeUrl);
  if (!disk) return;
  try {
    if (fs.existsSync(disk)) fs.unlinkSync(disk);
  } catch (e) {
    console.error('safeUnlinkUpload:', e);
  }
}

async function resolveUserEmailForTeacher(tenantId, teacherEmail, excludeUserId) {
  const norm = String(teacherEmail).trim().toLowerCase();
  if (!norm || !EMAIL_RE.test(norm)) return null;
  const where = { tenant_id: tenantId, email: norm };
  if (excludeUserId) {
    where.id = { [Op.ne]: excludeUserId };
  }
  const taken = await User.findOne({ where });
  return taken ? null : norm;
}

exports.loadTeacherDetail = async (tenantId, teacherId, options = {}) => {
  const { includePhoto = true } = options;
  const attrs = includePhoto ? undefined : { exclude: ['photo_base64'] };
  const teacher = await Teacher.findOne({
    where: { id: teacherId, tenant_id: tenantId },
    attributes: attrs,
    include: [
      {
        model: User,
        as: 'login_user',
        required: false,
        attributes: ['id', 'username', 'email', 'status'],
      },
    ],
  });
  if (!teacher) return null;
  const plain = teacher.get({ plain: true });
  sanitizeTeacherJson(plain);
  return plain;
};

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;
    const q = req.query.q != null ? String(req.query.q).trim() : '';
    const sortBy = req.query.sort_by != null ? String(req.query.sort_by).trim() : '';
    const sortOrderRaw = req.query.sort_order != null ? String(req.query.sort_order).trim().toLowerCase() : '';
    const sortOrder = sortOrderRaw === 'desc' ? 'DESC' : 'ASC';

    const where = { tenant_id: tenantId };
    if (q) {
      where[Op.or] = [
        { first_name: { [Op.iLike]: `%${q}%` } },
        { last_name: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
        { designation: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const teacherSortMap = {
      first_name: ['first_name'],
      last_name: ['last_name'],
      email: ['email'],
      designation: ['designation'],
      joining_date: ['joining_date'],
    };

    const loginSortMap = {
      username: ['username'],
      status: ['status'],
    };

    const order = [];
    if (Object.prototype.hasOwnProperty.call(teacherSortMap, sortBy)) {
      order.push([...(teacherSortMap[sortBy]), sortOrder]);
    } else if (Object.prototype.hasOwnProperty.call(loginSortMap, sortBy)) {
      order.push([{ model: User, as: 'login_user' }, ...(loginSortMap[sortBy]), sortOrder]);
    }
    order.push(['last_name', 'ASC'], ['first_name', 'ASC']);

    const { count, rows } = await Teacher.findAndCountAll({
      where,
      attributes: { exclude: ['photo_base64'] },
      include: [
        {
          model: User,
          as: 'login_user',
          required: false,
          attributes: ['id', 'username', 'email', 'status'],
        },
      ],
      order,
      limit: pageSize,
      offset,
    });

    const data = rows.map((r) => {
      const p = r.get({ plain: true });
      return teacherListRow(p, p.login_user || null);
    });

    res.status(200).json({
      data,
      total: count,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
    });
  } catch (err) {
    req.log?.error({ err }, 'teachers.list error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const subdomain = req.tenant.subdomain;
    const body = req.body || {};

    const first_name = body.first_name != null ? String(body.first_name).trim() : '';
    const last_name = body.last_name != null ? String(body.last_name).trim() : '';
    const email = body.email != null ? String(body.email).trim().toLowerCase() : '';

    if (!first_name || !last_name) {
      await t.rollback();
      return res.status(400).json({ message: 'first_name and last_name are required' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      await t.rollback();
      return res.status(400).json({ message: 'A valid email is required' });
    }

    const dup = await Teacher.findOne({
      where: { tenant_id: tenantId, email },
      transaction: t,
    });
    if (dup) {
      await t.rollback();
      return res.status(409).json({ message: 'A teacher with this email already exists for this school' });
    }

    const genderRaw = body.gender != null ? String(body.gender).trim().toLowerCase() : '';
    const gender = GENDERS.has(genderRaw) ? genderRaw : null;

    let photoPatch = { photo_base64: null, photo_mime: null };
    if (body.photo_base64 != null && String(body.photo_base64).trim() !== '') {
      const pf = await photoPayloadFromInput(body.photo_base64);
      if (!pf || !pf.photo_base64) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid profile photo image' });
      }
      photoPatch = pf;
    }

    const account_status =
      body.account_status === 'inactive' || body.account_status === 'active'
        ? body.account_status
        : 'active';

    const teacher = await Teacher.create(
      {
        tenant_id: tenantId,
        first_name,
        last_name,
        email,
        mobile_number: body.mobile_number != null ? String(body.mobile_number).trim() : null,
        address: body.address != null ? String(body.address).trim() : null,
        joining_date: body.joining_date != null && String(body.joining_date).trim() !== '' ? String(body.joining_date).trim() : null,
        designation: body.designation != null ? String(body.designation).trim() : null,
        dob: body.dob != null && String(body.dob).trim() !== '' ? String(body.dob).trim() : null,
        gender,
        qualification: body.qualification != null ? String(body.qualification).trim() : null,
        experience: body.experience != null ? String(body.experience).trim() : null,
        photo_base64: photoPatch.photo_base64,
        photo_mime: photoPatch.photo_mime,
        cv_file_name: body.cv_file_name != null ? String(body.cv_file_name).trim() : null,
        cv_file_url: body.cv_file_url != null ? String(body.cv_file_url).trim() : null,
      },
      { transaction: t }
    );

    const username = await generateUniqueTeacherUsername(tenantId, subdomain, teacher.id);
    const plaintextPassword =
      body.login_password != null && String(body.login_password).length >= 6
        ? String(body.login_password)
        : randomPassword();
    const hash = await bcrypt.hash(plaintextPassword, 10);
    const displayName = `${first_name} ${last_name}`.trim();
    const userEmail = await resolveUserEmailForTeacher(tenantId, email);

    await createTeacherLogin({
      tenantId,
      teacherId: teacher.id,
      displayName,
      username,
      passwordHash: hash,
      accountStatus: account_status,
      email: userEmail,
      transaction: t,
    });

    await t.commit();
    await recordAudit({
      tenantId,
      actorUserId: req.user?.userId || null,
      entityType: 'teacher',
      entityId: teacher.id,
      action: 'create',
      after: { teacher_id: teacher.id, email: teacher.email },
    });

    const full = await exports.loadTeacherDetail(tenantId, teacher.id, { includePhoto: true });
    res.status(201).json({
      teacher: full,
      login: {
        username,
        password: plaintextPassword,
        user_status: account_status,
      },
    });
  } catch (err) {
    await t.rollback();
    req.log?.error({ err }, 'teachers.create error');
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Email or username conflict' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      return res.status(400).json({ message: 'Invalid teacher id' });
    }
    const full = await exports.loadTeacherDetail(tenantId, id, { includePhoto: true });
    if (!full) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    res.status(200).json(full);
  } catch (err) {
    req.log?.error({ err }, 'teachers.getById error');
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
      return res.status(400).json({ message: 'Invalid teacher id' });
    }

    const teacher = await Teacher.findOne({
      where: { id, tenant_id: tenantId },
      transaction: t,
    });
    if (!teacher) {
      await t.rollback();
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const body = req.body || {};
    const patch = {};

    if (body.first_name != null) patch.first_name = String(body.first_name).trim();
    if (body.last_name != null) patch.last_name = String(body.last_name).trim();
    if (body.email != null) {
      const em = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(em)) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid email' });
      }
      const dup = await Teacher.findOne({
        where: {
          tenant_id: tenantId,
          email: em,
          id: { [Op.ne]: id },
        },
        transaction: t,
      });
      if (dup) {
        await t.rollback();
        return res.status(409).json({ message: 'Another teacher already uses this email' });
      }
      patch.email = em;
    }
    if (body.mobile_number !== undefined) {
      patch.mobile_number =
        body.mobile_number != null && String(body.mobile_number).trim() !== ''
          ? String(body.mobile_number).trim()
          : null;
    }
    if (body.address !== undefined) {
      patch.address =
        body.address != null && String(body.address).trim() !== '' ? String(body.address).trim() : null;
    }
    if (body.joining_date !== undefined) {
      patch.joining_date =
        body.joining_date != null && String(body.joining_date).trim() !== ''
          ? String(body.joining_date).trim()
          : null;
    }
    if (body.designation !== undefined) {
      patch.designation =
        body.designation != null && String(body.designation).trim() !== ''
          ? String(body.designation).trim()
          : null;
    }
    if (body.dob !== undefined) {
      patch.dob =
        body.dob != null && String(body.dob).trim() !== '' ? String(body.dob).trim() : null;
    }
    if (body.gender !== undefined) {
      const g = body.gender != null ? String(body.gender).trim().toLowerCase() : '';
      patch.gender = GENDERS.has(g) ? g : null;
    }
    if (body.qualification !== undefined) {
      patch.qualification =
        body.qualification != null && String(body.qualification).trim() !== ''
          ? String(body.qualification).trim()
          : null;
    }
    if (body.experience !== undefined) {
      patch.experience =
        body.experience != null && String(body.experience).trim() !== ''
          ? String(body.experience).trim()
          : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'photo_base64')) {
      const raw = body.photo_base64;
      if (raw == null || String(raw).trim() === '') {
        patch.photo_base64 = null;
        patch.photo_mime = null;
      } else {
        const pf = await photoPayloadFromInput(raw);
        if (!pf || !pf.photo_base64) {
          await t.rollback();
          return res.status(400).json({ message: 'Invalid profile photo image' });
        }
        patch.photo_base64 = pf.photo_base64;
        patch.photo_mime = pf.photo_mime;
      }
    }

    if (body.cv_file_name !== undefined) patch.cv_file_name = body.cv_file_name ? String(body.cv_file_name).trim() : null;
    if (body.cv_file_url !== undefined) patch.cv_file_url = body.cv_file_url ? String(body.cv_file_url).trim() : null;

    await teacher.update(patch, { transaction: t });

    const loginUser = await User.findOne({
      where: { teacher_id: id, tenant_id: tenantId },
      transaction: t,
    });
    if (loginUser) {
      await teacher.reload({ transaction: t });
      await syncTeacherLogin({
        tenantId,
        teacherId: id,
        loginUserId: loginUser.id,
        accountStatus: body.account_status,
        firstName: patch.first_name != null ? patch.first_name : teacher.first_name,
        lastName: patch.last_name != null ? patch.last_name : teacher.last_name,
        email: await resolveUserEmailForTeacher(tenantId, teacher.email, loginUser.id),
        transaction: t,
      });
    }

    await t.commit();
    await recordAudit({
      tenantId,
      actorUserId: req.user?.userId || null,
      entityType: 'teacher',
      entityId: id,
      action: 'update',
      after: { teacher_id: id },
    });
    const full = await exports.loadTeacherDetail(tenantId, id, { includePhoto: true });
    res.status(200).json({ message: 'Teacher updated', data: full });
  } catch (err) {
    await t.rollback();
    req.log?.error({ err }, 'teachers.update error');
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Email or username conflict' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid teacher id' });
    }
    const teacher = await Teacher.findOne({
      where: { id, tenant_id: tenantId },
      transaction: t,
    });
    if (!teacher) {
      await t.rollback();
      return res.status(404).json({ message: 'Teacher not found' });
    }
    const plain = teacher.get({ plain: true });
    if (plain.cv_file_url) {
      await safeUnlinkUpload(plain.cv_file_url);
    }
    await User.destroy({ where: { teacher_id: id, tenant_id: tenantId }, transaction: t });
    await teacher.destroy({ transaction: t });
    await t.commit();
    await recordAudit({
      tenantId,
      actorUserId: req.user?.userId || null,
      entityType: 'teacher',
      entityId: id,
      action: 'delete',
      before: { teacher_id: id, email: plain.email },
    });
    res.status(204).send();
  } catch (err) {
    await t.rollback();
    req.log?.error({ err }, 'teachers.remove error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getLoginDetails = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      return res.status(400).json({ message: 'Invalid teacher id' });
    }
    const full = await exports.loadTeacherDetail(tenantId, id, { includePhoto: false });
    if (!full) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    const u = full.login_user;
    res.status(200).json({
      username: u ? u.username : null,
      status: u ? u.status : null,
      has_account: !!u,
    });
  } catch (err) {
    req.log?.error({ err }, 'teachers.getLoginDetails error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      return res.status(400).json({ message: 'Invalid teacher id' });
    }
    const loginUser = await User.findOne({
      where: { teacher_id: id, tenant_id: tenantId, role: 'teacher' },
    });
    if (!loginUser) {
      return res.status(404).json({ message: 'Teacher login account not found' });
    }
    const plaintextPassword = randomPassword(14);
    const hash = await bcrypt.hash(plaintextPassword, 10);
    await sequelize.transaction(async (trx) => {
      await loginUser.update({ password: hash, password_changed_at: new Date() }, { transaction: trx });
      await invalidateUserSessions(loginUser.id, tenantId, trx);
    });
    await recordAudit({
      tenantId,
      actorUserId: req.user?.userId || null,
      entityType: 'teacher_login',
      entityId: id,
      action: 'password_reset',
      metadata: { user_id: loginUser.id },
    });
    res.status(200).json({
      message: 'Password reset',
      username: loginUser.username,
      password: plaintextPassword,
    });
  } catch (err) {
    req.log?.error({ err }, 'teachers.resetPassword error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.uploadCv = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const id = req.params.id;
    if (!isUuid(id)) {
      return res.status(400).json({ message: 'Invalid teacher id' });
    }
    const teacher = await Teacher.findOne({ where: { id, tenant_id: tenantId } });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'CV file is required' });
    }
    const relativePath = path.posix.join('uploads/teachers', String(tenantId), req.file.filename);
    const prev = teacher.get('cv_file_url');
    if (prev) {
      await safeUnlinkUpload(prev);
    }
    await teacher.update({
      cv_file_name: req.file.originalname,
      cv_file_url: relativePath,
    });
    res.status(200).json({
      message: 'CV uploaded',
      cv_file_name: req.file.originalname,
      cv_file_url: relativePath,
    });
  } catch (err) {
    req.log?.error({ err }, 'teachers.uploadCv error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const userId = req.user.userId;
    const loginUser = await User.findOne({
      where: { id: userId, tenant_id: tenantId, role: 'teacher' },
    });
    if (!loginUser || !loginUser.teacher_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const full = await exports.loadTeacherDetail(tenantId, loginUser.teacher_id, { includePhoto: true });
    if (!full) {
      return res.status(404).json({ message: 'Teacher profile not found' });
    }
    res.status(200).json(full);
  } catch (err) {
    req.log?.error({ err }, 'teachers.getMe error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const userId = req.user.userId;
    const loginUser = await User.findOne({
      where: { id: userId, tenant_id: tenantId, role: 'teacher' },
    });
    if (!loginUser || !loginUser.teacher_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const teacherId = loginUser.teacher_id;
    const teacher = await Teacher.findOne({ where: { id: teacherId, tenant_id: tenantId } });
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const body = req.body || {};
    const patch = {};

    if (body.first_name != null) patch.first_name = String(body.first_name).trim();
    if (body.last_name != null) patch.last_name = String(body.last_name).trim();
    if (body.mobile_number !== undefined) {
      patch.mobile_number =
        body.mobile_number != null && String(body.mobile_number).trim() !== ''
          ? String(body.mobile_number).trim()
          : null;
    }
    if (body.address !== undefined) {
      patch.address =
        body.address != null && String(body.address).trim() !== '' ? String(body.address).trim() : null;
    }
    if (body.qualification !== undefined) {
      patch.qualification =
        body.qualification != null && String(body.qualification).trim() !== ''
          ? String(body.qualification).trim()
          : null;
    }
    if (body.experience !== undefined) {
      patch.experience =
        body.experience != null && String(body.experience).trim() !== ''
          ? String(body.experience).trim()
          : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'photo_base64')) {
      const raw = body.photo_base64;
      if (raw == null || String(raw).trim() === '') {
        patch.photo_base64 = null;
        patch.photo_mime = null;
      } else {
        const pf = await photoPayloadFromInput(raw);
        if (!pf || !pf.photo_base64) {
          return res.status(400).json({ message: 'Invalid profile photo image' });
        }
        patch.photo_base64 = pf.photo_base64;
        patch.photo_mime = pf.photo_mime;
      }
    }

    if (patch.first_name === '' || patch.last_name === '') {
      return res.status(400).json({ message: 'first_name and last_name cannot be empty' });
    }

    await teacher.update(patch);

    if (patch.first_name != null || patch.last_name != null) {
      const fn = patch.first_name != null ? patch.first_name : teacher.first_name;
      const ln = patch.last_name != null ? patch.last_name : teacher.last_name;
      await loginUser.update({ name: `${fn} ${ln}`.trim() });
    }

    const full = await exports.loadTeacherDetail(tenantId, teacherId, { includePhoto: true });
    res.status(200).json({ message: 'Profile updated', data: full });
  } catch (err) {
    req.log?.error({ err }, 'teachers.updateMe error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.changeMyPassword = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const userId = req.user.userId;

    const currentPassword =
      req.body && req.body.current_password != null ? String(req.body.current_password) : '';
    const newPassword =
      req.body && req.body.new_password != null ? String(req.body.new_password) : '';

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'current_password and new_password are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    if (currentPassword === newPassword) {
      return res.status(409).json({ message: 'New password must be different from current password' });
    }

    const loginUser = await User.findOne({
      where: { id: userId, tenant_id: tenantId, role: 'teacher' },
    });
    if (!loginUser) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const ok = await bcrypt.compare(currentPassword, loginUser.password);
    if (!ok) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await sequelize.transaction(async (trx) => {
      await loginUser.update(
        { password: hash, password_changed_at: new Date() },
        { transaction: trx }
      );
      await invalidateUserSessions(loginUser.id, tenantId, trx);
    });

    res.status(200).json({ message: 'Password updated' });
  } catch (err) {
    req.log?.error({ err }, 'teachers.changeMyPassword error');
    res.status(500).json({ message: 'Internal server error' });
  }
};
