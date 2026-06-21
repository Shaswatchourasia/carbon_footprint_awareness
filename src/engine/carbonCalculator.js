const {
  TRANSPORT_KG_PER_KM,
  FLIGHT_KG_PER_KM,
  FOOD_KG_PER_MEAL,
  ENERGY_GRID_KG_PER_KWH,
  SHOPPING_KG_PER_100_SPEND,
  WASTE_KG_PER_KG,
  RENEWABLE_KG_PER_KWH,
} = require('../data/emissionFactors');

// Documented assumptions (see README > Assumptions) used to translate a
// once-a-year event into a monthly figure for blending with daily activity.
const ASSUMED_AVG_SHORT_HAUL_KM = 800;
const ASSUMED_AVG_LONG_HAUL_KM = 6000;
const ASSUMED_MEALS_PER_DAY = 3;
const DAYS_PER_MONTH = 30;
const WEEKS_PER_MONTH = 4.33;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the CO2e (kg) for a single logged activity.
 * Returns 0 (rather than throwing) for unrecognized inputs so a malformed
 * single log entry never crashes a request - callers should still validate
 * input shape via middleware before reaching here.
 */
function computeActivityCO2e(activity) {
  if (!activity || typeof activity !== 'object') return 0;
  const { category, type, quantity, meta = {} } = activity;
  const qty = Number(quantity) || 0;
  if (qty <= 0) return 0;

  switch (category) {
    case 'transport': {
      const factor = TRANSPORT_KG_PER_KM[type];
      return factor === undefined ? 0 : round2(factor * qty);
    }
    case 'flight': {
      const factor = FLIGHT_KG_PER_KM[type];
      return factor === undefined ? 0 : round2(factor * qty);
    }
    case 'food': {
      const factor = FOOD_KG_PER_MEAL[type];
      return factor === undefined ? 0 : round2(factor * qty);
    }
    case 'energy': {
      const factor = meta.renewable
        ? RENEWABLE_KG_PER_KWH
        : ENERGY_GRID_KG_PER_KWH[meta.countryCode] || ENERGY_GRID_KG_PER_KWH.default;
      return round2(factor * qty);
    }
    case 'shopping': {
      const factor = SHOPPING_KG_PER_100_SPEND[type];
      return factor === undefined ? 0 : round2((factor / 100) * qty);
    }
    case 'waste': {
      const factor = WASTE_KG_PER_KG[type];
      return factor === undefined ? 0 : round2(factor * qty);
    }
    default:
      return 0;
  }
}

/**
 * Estimates a recurring MONTHLY footprint (kg CO2e), broken down by
 * category, purely from the user's onboarding profile. This is what powers
 * the dashboard on day one, before any activity has been logged.
 */
function computeProfileBaselineMonthly(profile) {
  const transportFactor = TRANSPORT_KG_PER_KM[profile.primaryTransport] ?? TRANSPORT_KG_PER_KM.petrol_car;
  const transport = round2((Number(profile.commuteKmPerWeek) || 0) * WEEKS_PER_MONTH * transportFactor);

  const dietFactor = FOOD_KG_PER_MEAL[profile.dietType] ?? FOOD_KG_PER_MEAL.omnivore;
  const food = round2(ASSUMED_MEALS_PER_DAY * DAYS_PER_MONTH * dietFactor);

  const householdSize = Math.max(1, Number(profile.householdSize) || 1);
  const energyFactor =
    profile.homeEnergySource === 'renewable'
      ? RENEWABLE_KG_PER_KWH
      : ENERGY_GRID_KG_PER_KWH[profile.countryCode] || ENERGY_GRID_KG_PER_KWH.default;
  const energy = round2(((Number(profile.monthlyKwh) || 0) * energyFactor) / householdSize);

  const shortHaulPerYear = Number(profile.flightsShortHaulPerYear) || 0;
  const longHaulPerYear = Number(profile.flightsLongHaulPerYear) || 0;
  const flightAnnual =
    shortHaulPerYear * ASSUMED_AVG_SHORT_HAUL_KM * FLIGHT_KG_PER_KM.short_haul +
    longHaulPerYear * ASSUMED_AVG_LONG_HAUL_KM * FLIGHT_KG_PER_KM.long_haul;
  const flight = round2(flightAnnual / 12);

  return { transport, food, energy, flight, shopping: 0, waste: 0 };
}

/**
 * Sums logged activities by category within the last `windowDays` days.
 */
function aggregateLoggedByCategory(activities, windowDays = 30) {
  const cutoff = Date.now() - windowDays * MS_PER_DAY;
  const totals = { transport: 0, food: 0, energy: 0, flight: 0, shopping: 0, waste: 0 };

  for (const activity of activities) {
    const loggedAt = new Date(activity.loggedAt).getTime();
    if (Number.isNaN(loggedAt) || loggedAt < cutoff) continue;
    const category = activity.category;
    if (!(category in totals)) continue;
    totals[category] += Number(activity.co2eKg) || 0;
  }

  for (const key of Object.keys(totals)) totals[key] = round2(totals[key]);
  return totals;
}

/**
 * The hybrid estimate that powers the rest of the app: for any category
 * where the user has *actually logged* activity in the last 30 days, trust
 * the logged data (it's real and current). For categories with no recent
 * logs, fall back to the profile baseline so the assistant is never blind
 * about a category just because the user hasn't logged it yet.
 *
 * Returns { perCategoryMonthlyKg, totalMonthlyKg, sources }.
 */
function getMonthlyEstimate(profile, activities, windowDays = 30) {
  const baseline = computeProfileBaselineMonthly(profile);
  const logged = aggregateLoggedByCategory(activities, windowDays);

  const perCategoryMonthlyKg = {};
  const sources = {};

  for (const category of Object.keys(baseline)) {
    const hasRecentLogs = activities.some(
      (a) => a.category === category && Date.now() - new Date(a.loggedAt).getTime() <= windowDays * MS_PER_DAY
    );
    if (hasRecentLogs) {
      perCategoryMonthlyKg[category] = logged[category];
      sources[category] = 'logged';
    } else {
      perCategoryMonthlyKg[category] = baseline[category];
      sources[category] = 'baseline';
    }
  }

  const totalMonthlyKg = round2(Object.values(perCategoryMonthlyKg).reduce((a, b) => a + b, 0));
  return { perCategoryMonthlyKg, totalMonthlyKg, sources };
}

function monthlyKgToAnnualTonnes(monthlyKg) {
  return round2((monthlyKg * 12) / 1000);
}

/**
 * Sums logged CO2e for activities whose `loggedAt` falls between
 * `startDaysAgo` and `endDaysAgo` (both measured backwards from now, so
 * startDaysAgo > endDaysAgo for a window in the past, e.g. (60, 30) means
 * "from 60 days ago up to 30 days ago").
 */
function aggregateTotalInRange(activities, startDaysAgo, endDaysAgo) {
  const from = Date.now() - startDaysAgo * MS_PER_DAY;
  const to = Date.now() - endDaysAgo * MS_PER_DAY;
  let total = 0;
  let count = 0;
  for (const activity of activities) {
    const loggedAt = new Date(activity.loggedAt).getTime();
    if (Number.isNaN(loggedAt)) continue;
    if (loggedAt >= from && loggedAt <= to) {
      total += Number(activity.co2eKg) || 0;
      count += 1;
    }
  }
  return { totalKg: round2(total), entryCount: count };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  computeActivityCO2e,
  computeProfileBaselineMonthly,
  aggregateLoggedByCategory,
  aggregateTotalInRange,
  getMonthlyEstimate,
  monthlyKgToAnnualTonnes,
  round2,
  // exported for tests / transparency
  ASSUMED_AVG_SHORT_HAUL_KM,
  ASSUMED_AVG_LONG_HAUL_KM,
  ASSUMED_MEALS_PER_DAY,
};
