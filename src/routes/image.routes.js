const express = require('express');
const { serveImage } = require('../controllers/image.controller');

const router = express.Router();

// GET /image/folder/filename.jpg - stream file from S3 (no auth; public read)
// Uses regex so path can contain slashes (e.g. logo/123_abc.jpg)
router.get(/^\/image\/(.+)$/, serveImage);

module.exports = router;
