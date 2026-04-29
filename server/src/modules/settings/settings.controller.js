const bcrypt = require('bcrypt');
const User = require('../users/user.model');
const Tenant = require('../tenant/tenant.model');
const AcademicYear = require('../classes/academicYear.model');
const PlatformSetting = require('./platformSetting.model');
const UserNotificationPreference = require('./userNotificationPreference.model');

const PLATFORM_KEYS = {
  NAME: 'platform_name',
  SUPPORT_EMAIL: 'support_email',
  MAX_TENANTS: 'max_tenants_allowed',
};

async function upsertPlatformSetting(key, value) {
  const [row] = await PlatformSetting.findOrCreate({
    where: { setting_key: key },
    defaults: { setting_value: value != null ? String(value) : '' },
  });
  const next = value != null ? String(value) : '';
  if (row.setting_value !== next) {
    row.setting_value = next;
    await row.save();
  }
}

async function getPlatformSettingMap() {
  const rows = await PlatformSetting.findAll({
    attributes: ['setting_key', 'setting_value'],
  });
  const m = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    platform_name: m.get(PLATFORM_KEYS.NAME) ?? 'School SaaS',
    support_email: m.get(PLATFORM_KEYS.SUPPORT_EMAIL) ?? '',
    max_tenants_allowed: parseInt(m.get(PLATFORM_KEYS.MAX_TENANTS) ?? '100', 10) || 100,
  };
}

exports.platformSettingsGet = async (req, res) => {
  try {
    const data = await getPlatformSettingMap();
    res.status(200).json({ data });
  } catch (err) {
    console.error('platformSettingsGet error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.platformSettingsPut = async (req, res) => {
  try {
    const { platform_name, support_email, max_tenants_allowed } = req.body;
    if (
      platform_name != null &&
      typeof platform_name !== 'string' &&
      typeof platform_name !== 'number'
    ) {
      return res.status(400).json({ message: 'Invalid platform_name' });
    }
    if (support_email != null && typeof support_email !== 'string') {
      return res.status(400).json({ message: 'Invalid support_email' });
    }
    let maxRaw = max_tenants_allowed;
    if (maxRaw !== undefined && maxRaw !== null && maxRaw !== '') {
      const n = parseInt(maxRaw, 10);
      if (!Number.isFinite(n) || n < 1) {
        return res.status(400).json({ message: 'max_tenants_allowed must be a positive integer' });
      }
      await upsertPlatformSetting(PLATFORM_KEYS.MAX_TENANTS, String(n));
    }
    if (platform_name != null) {
      await upsertPlatformSetting(PLATFORM_KEYS.NAME, String(platform_name).trim());
    }
    if (support_email != null) {
      await upsertPlatformSetting(PLATFORM_KEYS.SUPPORT_EMAIL, String(support_email).trim());
    }

    const data = await getPlatformSettingMap();
    res.status(200).json({ message: 'Settings updated', data });
  } catch (err) {
    console.error('platformSettingsPut error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getSchoolProfile = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.tenant.id, {
      attributes: ['id', 'name', 'contact_email', 'phone', 'address', 'subdomain'],
    });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    res.status(200).json({
      data: {
        name: tenant.name,
        contact_email: tenant.contact_email,
        phone: tenant.phone,
        address: tenant.address,
        subdomain: tenant.subdomain,
      },
    });
  } catch (err) {
    console.error('getSchoolProfile error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateSchoolProfile = async (req, res) => {
  try {
    const { name, contact_email, phone, address } = req.body;
    if (!name || typeof name !== 'string' || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    const tenant = await Tenant.findOne({ where: { id: req.tenant.id } });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    await tenant.update({
      name: String(name).trim(),
      contact_email:
        contact_email != null && contact_email !== ''
          ? String(contact_email).trim().toLowerCase()
          : null,
      phone: phone != null && phone !== '' ? String(phone).trim() : null,
      address: address != null && address !== '' ? String(address).trim() : null,
    });
    res.status(200).json({
      message: 'School profile updated',
      data: {
        name: tenant.name,
        contact_email: tenant.contact_email,
        phone: tenant.phone,
        address: tenant.address,
      },
    });
  } catch (err) {
    console.error('updateSchoolProfile error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getAcademicYearSetting = async (req, res) => {
  try {
    const row = await AcademicYear.findOne({
      where: { tenant_id: req.tenant.id, is_active: true },
      attributes: ['id', 'name', 'is_active'],
    });
    if (!row) {
      return res.status(404).json({ message: 'No active academic year' });
    }
    res.status(200).json({
      data: {
        id: row.id,
        name: row.name,
        is_active: row.is_active,
      },
    });
  } catch (err) {
    console.error('getAcademicYearSetting error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ message: 'currentPassword is required' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'newPassword must be at least 6 characters' });
    }

    const user = await User.findOne({
      where: { id: req.user.userId, tenant_id: req.tenant.id },
      attributes: ['id', 'password'],
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hash });

    res.status(200).json({ message: 'Password updated' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const [pref] = await UserNotificationPreference.findOrCreate({
      where: {
        tenant_id: req.tenant.id,
        user_id: req.user.userId,
      },
      defaults: {
        email_notifications: false,
        sms_notifications: false,
        in_app_notifications: true,
      },
    });
    res.status(200).json({
      data: {
        email_notifications: pref.email_notifications,
        sms_notifications: pref.sms_notifications,
        in_app_notifications: pref.in_app_notifications,
      },
    });
  } catch (err) {
    console.error('getNotificationPreferences error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const { email_notifications, sms_notifications, in_app_notifications } = req.body;
    if (
      typeof email_notifications !== 'boolean' ||
      typeof sms_notifications !== 'boolean' ||
      typeof in_app_notifications !== 'boolean'
    ) {
      return res.status(400).json({ message: 'All preference fields must be booleans' });
    }

    const [pref] = await UserNotificationPreference.findOrCreate({
      where: {
        tenant_id: req.tenant.id,
        user_id: req.user.userId,
      },
      defaults: {
        email_notifications,
        sms_notifications,
        in_app_notifications,
      },
    });

    await pref.update({
      email_notifications,
      sms_notifications,
      in_app_notifications,
    });

    res.status(200).json({
      message: 'Preferences updated',
      data: {
        email_notifications: pref.email_notifications,
        sms_notifications: pref.sms_notifications,
        in_app_notifications: pref.in_app_notifications,
      },
    });
  } catch (err) {
    console.error('updateNotificationPreferences error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
