const express = require('express');
const store = require('../data/store');
const { generateId } = require('../utils/idGen');
const { validateBody, validateProfile } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const DEFAULT_PROFILE_FIELDS = {
  commuteKmPerWeek: 0,
  monthlyKwh: 0,
  flightsShortHaulPerYear: 0,
  flightsLongHaulPerYear: 0,
  homeEnergySource: 'grid',
};

router.post(
  '/',
  validateBody(validateProfile),
  asyncHandler(async (req, res) => {
    const id = generateId('user');
    const profile = {
      id,
      ...DEFAULT_PROFILE_FIELDS,
      ...req.body,
      createdAt: new Date().toISOString(),
    };
    store.createUser(profile);
    res.status(201).json(profile);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = store.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'No profile with that id.' });
    }
    res.json(user);
  })
);

router.put(
  '/:id',
  validateBody(validateProfile, { partial: true }),
  asyncHandler(async (req, res) => {
    const updated = store.updateUser(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'NotFound', message: 'No profile with that id.' });
    }
    res.json(updated);
  })
);

module.exports = router;
