const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const connectDatabase = async () => {
  try {
    await mongoose.connect(env.mongoUri);
    logger.info('Connected to MongoDB Atlas', {
      host: mongoose.connection.host,
      dbName: mongoose.connection.name
    });
  } catch (error) {
    logger.error('MongoDB connection failed', { message: error.message });
    throw error;
  }
};

module.exports = connectDatabase;

