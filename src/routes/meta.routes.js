const express = require('express');
const emissionFactors = require('../data/emissionFactors');
const benchmarks = require('../data/benchmarks');

const router = express.Router();

router.get('/emission-factors', (req, res) => {
  res.json({
    transport: emissionFactors.TRANSPORT_KG_PER_KM,
    flight: emissionFactors.FLIGHT_KG_PER_KM,
    food: emissionFactors.FOOD_KG_PER_MEAL,
    shopping: emissionFactors.SHOPPING_KG_PER_100_SPEND,
    waste: emissionFactors.WASTE_KG_PER_KG,
    countryCodes: emissionFactors.listCountryCodes(),
  });
});

router.get('/benchmarks', (req, res) => {
  res.json(benchmarks.ANNUAL_PER_CAPITA_TONNES);
});

module.exports = router;
