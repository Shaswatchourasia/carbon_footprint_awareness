const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const logger = require('./utils/logger');
const usersRoutes = require('./routes/users.routes');
const activitiesRoutes = require('./routes/activities.routes');
const insightsRoutes = require('./routes/insights.routes');
const metaRoutes = require('./routes/meta.routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  // Security headers. CSP is relaxed only for the same-origin static frontend
  // we ship in /public; the API itself returns JSON only.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
    })
  );

  app.use(cors({ origin: env.CORS_ORIGIN }));

  // Reasonable body size cap - this app never needs large payloads, so this
  // also doubles as a cheap defense against oversized-payload abuse.
  app.use(express.json({ limit: '100kb' }));

  // Basic rate limiting on the API surface to slow down naive abuse. This is
  // intentionally generous for a demo; tune per-deployment in production.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', aiNarrationEnabled: env.hasAiNarration() });
  });

  app.use('/api/users', usersRoutes);
  app.use('/api/users', activitiesRoutes);
  app.use('/api/users', insightsRoutes);
  app.use('/api/meta', metaRoutes);

  // Static frontend (no build step - plain HTML/CSS/JS).
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
logger.debug('Express app initialized', { env: env.NODE_ENV });

module.exports = app;
