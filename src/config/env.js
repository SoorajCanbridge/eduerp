const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  // AWS S3 Configuration
  awsRegion: process.env.AWS_REGION || 'ap-south-2',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  awsS3BucketName: process.env.AWS_S3_BUCKET_NAME || ''
};

if (!env.mongoUri) {
  console.warn('Warning: MONGODB_URI is not set. Database connection will fail.');
}

if (!env.jwtSecret) {
  console.warn('Warning: JWT_SECRET is not set. Token generation will fail.');
}

if (!env.awsS3BucketName) {
  console.warn('Warning: AWS_S3_BUCKET_NAME is not set. File uploads will fail.');
}

if (!env.awsAccessKeyId || !env.awsSecretAccessKey) {
  console.warn('Warning: AWS credentials are not set. S3 operations will fail.');
}

module.exports = env;

