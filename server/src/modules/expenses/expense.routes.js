const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { asyncHandler } = require('../../core/http/async-handler');
const authMiddleware = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/authorize.middleware');
const checkFeature = require('../../core/middleware/feature.middleware');
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
router.use(authorize('admin', 'super_admin'));

router.get('/', asyncHandler(controller.list));
router.post('/', asyncHandler(controller.create));
router.post(
  '/:id/receipt',
  (req, res, next) => {
    receiptUpload.single('receipt')(req, res, (err) => {
      if (err) return multerReceiptErrorHandler(err, req, res, next);
      next();
    });
  },
  asyncHandler(controller.uploadReceipt)
);
router.delete('/:id/receipt', asyncHandler(controller.deleteReceipt));
router.get('/:id', asyncHandler(controller.getOne));
router.put('/:id', asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));

module.exports = router;
