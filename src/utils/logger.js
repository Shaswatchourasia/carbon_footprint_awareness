const env = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = env.isProduction() ? LEVELS.info : LEVELS.debug;

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, meta) {
  if (LEVELS[level] > currentLevel) return;
  const line = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;
  const payload = meta ? `${line} ${JSON.stringify(meta)}` : line;
  if (level === 'error') {
    console.error(payload);
  } else {
    console.log(payload);
  }
}

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};
