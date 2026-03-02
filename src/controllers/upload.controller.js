const { uploadToS3, deleteFromS3, generateFileName } = require('../utils/upload');
const logger = require('../utils/logger');

/**
 * Upload a single file
 */
const uploadSingle = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }

    const folder = req.body.folder || 'uploads';
    const fileName = generateFileName(req.file.originalname, folder);
    const storedPath = await uploadToS3(
      req.file.buffer,
      fileName,
      req.file.mimetype
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const apiPrefix = require('../config/env').apiPrefix;
    const imageUrl = `${baseUrl}${apiPrefix}/image/${storedPath}`;

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        path: storedPath,
        url: imageUrl,
        fileName: fileName,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    logger.error('Upload single file error', { error: error.message });
    next(error);
  }
};

/**
 * Upload multiple files
 */
const uploadMultiple = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided'
      });
    }

    const folder = req.body.folder || 'uploads';
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const apiPrefix = require('../config/env').apiPrefix;

    const uploadPromises = req.files.map(async (file) => {
      const fileName = generateFileName(file.originalname, folder);
      const storedPath = await uploadToS3(file.buffer, fileName, file.mimetype);
      const imageUrl = `${baseUrl}${apiPrefix}/image/${storedPath}`;
      return {
        path: storedPath,
        url: imageUrl,
        fileName: fileName,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    res.status(200).json({
      success: true,
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      data: {
        files: uploadedFiles,
        count: uploadedFiles.length
      }
    });
  } catch (error) {
    logger.error('Upload multiple files error', { error: error.message });
    next(error);
  }
};

/**
 * Delete a file from S3.
 * Path from query: DELETE /upload?path=students%2Ffile.jpg
 * Or from URL: DELETE /upload/students%2Ffile.jpg
 */
const deleteFile = async (req, res, next) => {
  try {
    const pathFromQuery = req.query.path;
    const pathFromParam = req.params.fileName;
    const filePath = typeof pathFromQuery === 'string' && pathFromQuery
      ? pathFromQuery
      : pathFromParam
        ? decodeURIComponent(pathFromParam)
        : '';

    if (!filePath || filePath.includes('..')) {
      return res.status(400).json({
        success: false,
        message: 'Valid path is required (use query ?path=... or path segment)'
      });
    }

    await deleteFromS3(filePath);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
      data: {
        path: filePath
      }
    });
  } catch (error) {
    logger.error('Delete file error', { error: error.message });
    next(error);
  }
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  deleteFile
};
