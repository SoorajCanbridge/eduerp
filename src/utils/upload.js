const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName, region } = require('../config/s3');
const logger = require('./logger');

/**
 * Upload file to S3 bucket
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name with path (e.g. logo/filename.jpg)
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} - Stored path (folder/filename) for DB; use with /image/:path to serve
 */
const uploadToS3 = async (fileBuffer, fileName, contentType) => {
  try {
    if (!bucketName) {
      throw new Error('AWS S3 bucket name is not configured');
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: 'public-read' // Make file publicly accessible
    });

    await s3Client.send(command);
    logger.info('File uploaded to S3', { fileName });
    return fileName;
  } catch (error) {
    logger.error('S3 upload failed', { error: error.message, fileName });
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Get file stream from S3 (for serving images without exposing AWS URL)
 * @param {string} key - S3 key (folder/filename)
 * @returns {Promise<{ Body: ReadableStream, ContentType: string }>}
 */
const getFromS3 = async (key) => {
  try {
    if (!bucketName) {
      throw new Error('AWS S3 bucket name is not configured');
    }
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    const response = await s3Client.send(command);
    return {
      Body: response.Body,
      ContentType: response.ContentType || 'application/octet-stream'
    };
  } catch (error) {
    logger.error('S3 get failed', { error: error.message, key });
    throw error;
  }
};

/**
 * Delete file from S3 bucket
 * @param {string} fileName - File name with path
 * @returns {Promise<void>}
 */
const deleteFromS3 = async (fileName) => {
  try {
    if (!bucketName) {
      throw new Error('AWS S3 bucket name is not configured');
    }

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileName
    });

    await s3Client.send(command);
    logger.info('File deleted from S3', { fileName });
  } catch (error) {
    logger.error('S3 delete failed', { error: error.message, fileName });
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

/**
 * Generate unique file name with timestamp
 * @param {string} originalName - Original file name
 * @param {string} folder - Folder path (e.g., 'images', 'documents')
 * @returns {string} - Unique file name
 */
const generateFileName = (originalName, folder = 'uploads') => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop();
  const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
  
  return `${folder}/${timestamp}_${randomString}_${sanitizedName}.${extension}`;
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  getFromS3,
  generateFileName
};
