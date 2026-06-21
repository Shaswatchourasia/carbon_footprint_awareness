const express = require('express');
const store = require('../data/store');
const { generateId } = require('../utils/idGen');
const { computeActivityCO2e } = require('../engine/carbonCalculator');
const { validateBody, validateActivity } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router({ mergeParams: true });

router.post(
  '/:userId/activities',
  validateBody(validateActivity),
  asyncHandler(async (req, res) => {
    const user = store.getUser(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'No profile with that id.' });
    }

    const { category, type, quantity, unit, meta } = req.body;
    const co2eKg = computeActivityCO2e({
      category,
      type,
      quantity,
      meta: { ...meta, countryCode: user.countryCode },
    });

    const activity = {
      id: generateId('act'),
      userId: user.id,
      category,
      type: type || null,
      quantity,
      unit: unit || null,
      meta: meta || {},
      co2eKg,
      loggedAt: req.body.loggedAt || new Date().toISOString(),
    };

    store.addActivity(user.id, activity);
    res.status(201).json(activity);
  })
);

router.get(
  '/:userId/activities',
  asyncHandler(async (req, res) => {
    const user = store.getUser(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'No profile with that id.' });
    }
    const activities = store
      .getActivities(user.id)
      .slice()
      .sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
    res.json(activities);
  })
);

module.exports = router;
