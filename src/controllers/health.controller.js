const env = require('../config/env');

const getHealth = (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    uptime: process.uptime(),
    environment: env.nodeEnv,
    timestamp: new Date().toISOString()
  });
};

module.exports = { getHealth };

