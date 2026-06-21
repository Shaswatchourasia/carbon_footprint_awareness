const express = require('express');
const store = require('../data/store');
const { generateInsights, simulateChange } = require('../engine/insightEngine');
const { narrateInsights } = require('../engine/narrativeAssistant');
const { validateBody, validateSimulateRequest } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router({ mergeParams: true });

function loadUserOr404(req, res) {
  const user = store.getUser(req.params.userId);
  if (!user) {
    res.status(404).json({ error: 'NotFound', message: 'No profile with that id.' });
    return null;
  }
  return user;
}

router.get(
  '/:userId/summary',
  asyncHandler(async (req, res) => {
    const user = loadUserOr404(req, res);
    if (!user) return;
    const activities = store.getActivities(user.id);
    const insights = generateInsights(user, activities);
    res.json({ totals: insights.totals, topCategory: insights.topCategory, trend: insights.trend });
  })
);

router.get(
  '/:userId/insights',
  asyncHandler(async (req, res) => {
    const user = loadUserOr404(req, res);
    if (!user) return;
    const activities = store.getActivities(user.id);
    const insights = generateInsights(user, activities);

    const wantsNarrative = req.query.narrate !== 'false';
    const narrative = wantsNarrative ? await narrateInsights(user, insights) : null;

    res.json({ ...insights, narrative });
  })
);

router.post(
  '/:userId/simulate',
  validateBody(validateSimulateRequest),
  asyncHandler(async (req, res) => {
    const user = loadUserOr404(req, res);
    if (!user) return;
    const result = simulateChange(user, req.body);
    res.json(result);
  })
);

module.exports = router;
