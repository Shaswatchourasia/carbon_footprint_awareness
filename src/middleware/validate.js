const {
  TRANSPORT_KG_PER_KM,
  FLIGHT_KG_PER_KM,
  FOOD_KG_PER_MEAL,
  SHOPPING_KG_PER_100_SPEND,
  WASTE_KG_PER_KG,
} = require('../data/emissionFactors');

const TRANSPORT_MODES = Object.keys(TRANSPORT_KG_PER_KM);
const FLIGHT_TYPES = Object.keys(FLIGHT_KG_PER_KM);
const DIET_TYPES = Object.keys(FOOD_KG_PER_MEAL);
const SHOPPING_TYPES = Object.keys(SHOPPING_KG_PER_100_SPEND);
const WASTE_TYPES = Object.keys(WASTE_KG_PER_KG);
const ENERGY_SOURCES = ['grid', 'renewable'];
const ACTIVITY_CATEGORIES = ['transport', 'flight', 'food', 'energy', 'shopping', 'waste'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Validates a user profile payload (used for both create and update).
 * Returns an array of human-readable error strings; empty array = valid.
 */
function validateProfile(body, { partial = false } = {}) {
  const errors = [];
  const required = (key) => !partial || body[key] !== undefined;

  if (required('name') && !isNonEmptyString(body.name)) {
    errors.push('"name" is required and must be a non-empty string.');
  }
  if (required('countryCode') && !isNonEmptyString(body.countryCode)) {
    errors.push('"countryCode" is required (e.g. "IN", "US", "GB").');
  }
  if (required('dietType') && !DIET_TYPES.includes(body.dietType)) {
    errors.push(`"dietType" must be one of: ${DIET_TYPES.join(', ')}.`);
  }
  if (required('primaryTransport') && !TRANSPORT_MODES.includes(body.primaryTransport)) {
    errors.push(`"primaryTransport" must be one of: ${TRANSPORT_MODES.join(', ')}.`);
  }
  if (required('householdSize') && !(Number.isInteger(body.householdSize) && body.householdSize >= 1)) {
    errors.push('"householdSize" must be an integer >= 1.');
  }
  if (required('homeEnergySource') && !ENERGY_SOURCES.includes(body.homeEnergySource)) {
    errors.push(`"homeEnergySource" must be one of: ${ENERGY_SOURCES.join(', ')}.`);
  }
  if (body.commuteKmPerWeek !== undefined && !isPositiveNumber(body.commuteKmPerWeek)) {
    errors.push('"commuteKmPerWeek" must be a number >= 0.');
  }
  if (body.monthlyKwh !== undefined && !isPositiveNumber(body.monthlyKwh)) {
    errors.push('"monthlyKwh" must be a number >= 0.');
  }
  if (body.flightsShortHaulPerYear !== undefined && !isPositiveNumber(body.flightsShortHaulPerYear)) {
    errors.push('"flightsShortHaulPerYear" must be a number >= 0.');
  }
  if (body.flightsLongHaulPerYear !== undefined && !isPositiveNumber(body.flightsLongHaulPerYear)) {
    errors.push('"flightsLongHaulPerYear" must be a number >= 0.');
  }

  return errors;
}

/**
 * Validates a logged-activity payload. The valid `type` values depend on
 * `category`, so this checks both together.
 */
function validateActivity(body) {
  const errors = [];

  if (!ACTIVITY_CATEGORIES.includes(body.category)) {
    errors.push(`"category" must be one of: ${ACTIVITY_CATEGORIES.join(', ')}.`);
    return errors; // can't validate `type` without a valid category
  }

  const typeByCategory = {
    transport: TRANSPORT_MODES,
    flight: FLIGHT_TYPES,
    food: DIET_TYPES,
    shopping: SHOPPING_TYPES,
    waste: WASTE_TYPES,
  };

  if (body.category !== 'energy') {
    const allowedTypes = typeByCategory[body.category];
    if (!allowedTypes.includes(body.type)) {
      errors.push(`For category "${body.category}", "type" must be one of: ${allowedTypes.join(', ')}.`);
    }
  }

  if (!isPositiveNumber(body.quantity) || body.quantity <= 0) {
    errors.push('"quantity" is required and must be a positive number.');
  }

  if (body.category === 'energy' && body.meta && body.meta.renewable !== undefined) {
    if (typeof body.meta.renewable !== 'boolean') {
      errors.push('"meta.renewable" must be a boolean when provided.');
    }
  }

  return errors;
}

function validateSimulateRequest(body) {
  const errors = [];
  const ALLOWED_FIELDS = [
    'primaryTransport',
    'dietType',
    'homeEnergySource',
    'commuteKmPerWeek',
    'monthlyKwh',
    'flightsShortHaulPerYear',
    'flightsLongHaulPerYear',
  ];
  if (!ALLOWED_FIELDS.includes(body.field)) {
    errors.push(`"field" must be one of: ${ALLOWED_FIELDS.join(', ')}.`);
  }
  if (body.value === undefined || body.value === null || body.value === '') {
    errors.push('"value" is required.');
  }
  return errors;
}

/**
 * Express middleware factory: runs the given validator against req.body and
 * returns a 400 with structured errors if anything fails.
 */
function validateBody(validatorFn, options) {
  return (req, res, next) => {
    const errors = validatorFn(req.body || {}, options);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'ValidationError', details: errors });
    }
    next();
  };
}

module.exports = {
  validateProfile,
  validateActivity,
  validateSimulateRequest,
  validateBody,
};
