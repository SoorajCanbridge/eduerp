const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const mountRoutes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const corsOptions =
  allowedOrigins.length === 0
    ? { origin: true, credentials: true } // reflect request origin so credentials work from any origin
    : {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          return callback(new Error('Origin not allowed by CORS'));
        },
        credentials: true
      };

app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the mgcet Express API',
    docs: `${req.protocol}://${req.get('host')}${env.apiPrefix}/health`
  });
});

mountRoutes(app);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

