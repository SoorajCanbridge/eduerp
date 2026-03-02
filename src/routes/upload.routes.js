const express = require('express');
const { uploadSingle, uploadMultiple, deleteFile } = require('../controllers/upload.controller');
const { uploadSingle: uploadSingleMiddleware, uploadMultiple: uploadMultipleMiddleware } = require('../middleware/upload');

const router = express.Router();

// Upload single file
router.post('/single', uploadSingleMiddleware('file'), uploadSingle);

// Upload multiple files
router.post('/multiple', uploadMultipleMiddleware('files', 10), uploadMultiple);

// Delete file: use ?path=students%2Ffile.jpg or DELETE /upload/students%2Ffile.jpg
router.delete('/', deleteFile);
router.delete('/:fileName', deleteFile);

module.exports = router;
