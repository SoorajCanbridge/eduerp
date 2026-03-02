const { getFromS3 } = require('../utils/upload');
const logger = require('../utils/logger');

/**
 * Serve image/file from S3 by path. URL: domain/api/v1/image/folder/filename.jpg
 * Hides the actual AWS URL from the client.
 */
const serveImage = async (req, res, next) => {
  try {
    // path from regex capture group (route: /^\/image\/(.+)$/)
    const key = req.params[0];
    if (!key || key.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid image path' });
    }

    const { Body, ContentType } = await getFromS3(key);
    res.set('Content-Type', ContentType);
    res.set('Cache-Control', 'public, max-age=86400'); // 1 day
    Body.pipe(res);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }
    logger.error('Serve image error', { error: error.message, key: req.params[0] });
    next(error);
  }
};

module.exports = { serveImage };
