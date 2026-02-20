const jwt = require('jsonwebtoken');
const env = require('../config/env');

const buildTokenPayload = (user) => ({
  sub: user.id,
  email: user.email,
  role: user.role
});

const generateToken = (user) =>
  jwt.sign(buildTokenPayload(user), env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  });

module.exports = { generateToken };

