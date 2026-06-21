/**
 * Centralized environment configuration.
 *
 * Every place in the codebase that needs an env var reads it from here
 * instead of touching `process.env` directly. That gives us one place to:
 *   - apply safe defaults so the app boots in a fresh clone with zero setup
 *   - avoid ever leaking secrets into logs or error messages
 */
try {
  // Optional: only present after `npm install`. We guard this because
  // env.js is imported very early (even by lightweight scripts/tests), and
  // a missing dependency here should never be a hard crash.
  require('dotenv').config();
} catch {
  // No-op: falls through to relying on whatever is already in process.env.
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Optional AI narration layer. The app is fully functional without it -
  // see src/engine/narrativeAssistant.js for the fallback behaviour.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',

  isProduction() {
    return this.NODE_ENV === 'production';
  },

  hasAiNarration() {
    return Boolean(this.ANTHROPIC_API_KEY);
  },
};

module.exports = env;
