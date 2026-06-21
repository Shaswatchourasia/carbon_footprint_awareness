const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');

app.listen(env.PORT, () => {
  logger.info(`CarbonPulse listening on http://localhost:${env.PORT}`);
  if (!env.hasAiNarration()) {
    logger.info('ANTHROPIC_API_KEY not set - using the deterministic templated narrator (this is fully supported).');
  }
});
