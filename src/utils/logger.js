const levels = ['debug', 'info', 'warn', 'error'];

const formatMessage = (level, message, meta) => {
  const timestamp = new Date().toISOString();
  const parts = [`[${timestamp}]`, level.toUpperCase(), '-', message];
  if (meta && Object.keys(meta).length) {
    parts.push(JSON.stringify(meta));
  }
  return parts.join(' ');
};

const logger = levels.reduce((acc, level) => {
  acc[level] = (message, meta) => {
    const formatted = formatMessage(level, message, meta);
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  };
  return acc;
}, {});

module.exports = logger;

