const path = require('path');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const authorize = require('../../core/middleware/authorize.middleware');
const superAdminController = require('./super-admin.controller');
const tenantBrandingController = require('../tenant-branding/tenantBranding.controller');
const settingsController = require('../settings/settings.controller');

const uploadsRoot = path.join(__dirname, '../../uploads');
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsRoot, 'logos');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const id = req.query?.tenantId;
    if (!id) {
      cb(new Error('tenantId query parameter is required'));
      return;
    }
    cb(null, `${id}.png`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.png' || file.mimetype !== 'image/png') {
      return cb(new Error('Only PNG files are allowed'));
    }
    cb(null, true);
  },
});

router.use(authorize('super_admin'));

router.get('/dashboard', superAdminController.superAdminDashboard);
router.get('/platform-settings', settingsController.platformSettingsGet);
router.put('/platform-settings', settingsController.platformSettingsPut);

router.get('/tenants', superAdminController.listTenants);
router.post('/tenants', superAdminController.createTenant);
router.get('/tenants/:tenantId', superAdminController.getTenant);
router.patch('/tenants/:tenantId', superAdminController.updateTenant);
router.get('/tenants/:tenantId/modules', superAdminController.getTenantModules);
router.put('/tenants/:tenantId/modules', superAdminController.updateTenantModules);

router.get('/tenant-branding/:tenantId', tenantBrandingController.getForTenant);
router.post('/tenant-branding', tenantBrandingController.upsertBranding);
router.post(
  '/tenant-branding/upload-logo',
  (req, res, next) => {
    logoUpload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Upload failed' });
      }
      next();
    });
  },
  tenantBrandingController.uploadLogo
);

module.exports = router;
