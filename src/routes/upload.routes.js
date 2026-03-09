const express = require('express');
const { uploadSingle, uploadMultiple, deleteFile } = require('../controllers/upload.controller');
const { uploadSingle: uploadSingleMiddleware, uploadMultiple: uploadMultipleMiddleware } = require('../middleware/upload');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

router.use(auth);

// Upload single file
router.post(
  '/single',
  requirePermission('settings', 'edit'),
  uploadSingleMiddleware('file'),
  uploadSingle
);

// Upload multiple files
router.post(
  '/multiple',
  requirePermission('settings', 'edit'),
  uploadMultipleMiddleware('files', 10),
  uploadMultiple
);

// Delete file: use ?path=students%2Ffile.jpg or DELETE /upload/students%2Ffile.jpg
router.delete('/', requirePermission('settings', 'edit'), deleteFile);
router.delete('/:fileName', requirePermission('settings', 'edit'), deleteFile);

module.exports = router;
