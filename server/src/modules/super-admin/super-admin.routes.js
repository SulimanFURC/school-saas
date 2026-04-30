const path = require('path');
const express = require('express');
const multer = require('multer');
const { asyncSuperAdminHandler } = require('../../core/http/async-handler');
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

router.get('/dashboard', asyncSuperAdminHandler(superAdminController.superAdminDashboard));
router.get('/platform-settings', asyncSuperAdminHandler(settingsController.platformSettingsGet));
router.put('/platform-settings', asyncSuperAdminHandler(settingsController.platformSettingsPut));

router.get('/tenants', asyncSuperAdminHandler(superAdminController.listTenants));
router.post('/tenants', asyncSuperAdminHandler(superAdminController.createTenant));
router.get('/tenants/:tenantId', asyncSuperAdminHandler(superAdminController.getTenant));
router.patch('/tenants/:tenantId', asyncSuperAdminHandler(superAdminController.updateTenant));
router.get('/tenants/:tenantId/modules', asyncSuperAdminHandler(superAdminController.getTenantModules));
router.put('/tenants/:tenantId/modules', asyncSuperAdminHandler(superAdminController.updateTenantModules));

router.get('/tenant-branding/:tenantId', asyncSuperAdminHandler(tenantBrandingController.getForTenant));
router.post('/tenant-branding', asyncSuperAdminHandler(tenantBrandingController.upsertBranding));
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
  asyncSuperAdminHandler(tenantBrandingController.uploadLogo)
);

module.exports = router;
