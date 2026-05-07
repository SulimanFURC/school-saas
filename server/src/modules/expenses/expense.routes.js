const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
const { requirePermission } = require('../../core/middleware/permission.middleware');
const controller = require('./expense.controller');

const router = express.Router();

const uploadsRoot = path.join(__dirname, '../../../uploads');

const mimeToExt = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = req.tenant.id;
    const dir = path.join(uploadsRoot, 'expenses', String(tenantId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = mimeToExt[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
    const base = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${base}${ext}`);
  },
});

const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
    }
    cb(null, true);
  },
});

function multerReceiptErrorHandler(err, req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Receipt file must be 2MB or smaller' });
    }
    return res.status(400).json({ message: err.message || 'Upload failed' });
  }
  if (err && err.message) {
    return res.status(400).json({ message: err.message });
  }
  return next(err);
}

router.use(authMiddleware);
router.use(checkFeature('expenses'));

router.get('/', requirePermission('expenses.read'), asyncHandler(controller.list));
router.post('/', requirePermission('expenses.create'), asyncHandler(controller.create));
router.post(
  '/:id/receipt',
  requirePermission('expenses.update'),
  (req, res, next) => {
    receiptUpload.single('receipt')(req, res, (err) => {
      if (err) return multerReceiptErrorHandler(err, req, res, next);
      next();
    });
  },
  asyncHandler(controller.uploadReceipt)
);
router.delete('/:id/receipt', requirePermission('expenses.update'), asyncHandler(controller.deleteReceipt));
router.get('/:id', requirePermission('expenses.read'), asyncHandler(controller.getOne));
router.put('/:id', requirePermission('expenses.update'), asyncHandler(controller.update));
router.delete('/:id', requirePermission('expenses.delete'), asyncHandler(controller.remove));

module.exports = router;
