const {
  TRANSPORT_KG_PER_KM,
  FLIGHT_KG_PER_KM,
  FOOD_KG_PER_MEAL,
  ENERGY_GRID_KG_PER_KWH,
  RENEWABLE_KG_PER_KWH,
} = require('../data/emissionFactors');
const { getBenchmark, PARIS_ALIGNED_TARGET_TONNES } = require('../data/benchmarks');
const {
  computeProfileBaselineMonthly,
  getMonthlyEstimate,
  aggregateTotalInRange,
  monthlyKgToAnnualTonnes,
  round2,
  ASSUMED_AVG_SHORT_HAUL_KM,
} = require('./carbonCalculator');

const LABELS = {
  walk: 'walking',
  bike: 'cycling',
  ev: 'an EV',
  public_transit: 'public transit',
  carpool: 'carpooling',
  motorbike: 'a motorbike',
  petrol_car: 'a petrol car',
  diesel_car: 'a diesel car',
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  pescatarian: 'pescatarian',
  omnivore: 'omnivore',
  heavy_meat: 'meat-heavy',
};

function labelFor(key) {
  return LABELS[key] || String(key).replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Per-category rule chains. Each returns zero or more recommendation
// candidates. The key design principle: a rule only fires a suggestion when
// it is actually relevant to *this* user's context, and it never recommends
// something the profile says they already do.
// ---------------------------------------------------------------------------

function transportCandidates(profile) {
  const candidates = [];
  const mode = profile.primaryTransport;
  const kmPerWeek = Number(profile.commuteKmPerWeek) || 0;

  const highCarbonModes = ['petrol_car', 'diesel_car', 'motorbike'];
  if (highCarbonModes.includes(mode) && kmPerWeek > 0) {
    const curFactor = TRANSPORT_KG_PER_KM[mode];
    const transitFactor = TRANSPORT_KG_PER_KM.public_transit;
    // Assumption: roughly 3 of 5 weekly commute trips are realistically
    // switchable to transit or a carpool without a major lifestyle change.
    const switchableAnnualKm = kmPerWeek * 52 * 0.6;
    const savings = round2(switchableAnnualKm * (curFactor - transitFactor));
    if (savings > 5) {
      candidates.push({
        category: 'transport',
        title: 'Swap some weekly drives for transit or a carpool',
        rationale: `You log about ${kmPerWeek} km/week using ${labelFor(mode)}. Moving roughly 3 of 5 weekly trips to public transit or a carpool keeps the same commute distance but on a much lower-carbon mode.`,
        estAnnualSavingsKg: savings,
        difficulty: 'medium',
      });
    }
  } else if (mode === 'carpool' && kmPerWeek > 0) {
    const curFactor = TRANSPORT_KG_PER_KM.carpool;
    const transitFactor = TRANSPORT_KG_PER_KM.public_transit;
    const savings = round2(kmPerWeek * 52 * 0.4 * Math.max(0, curFactor - transitFactor));
    if (savings > 3) {
      candidates.push({
        category: 'transport',
        title: 'Try public transit on days the carpool isn\u2019t convenient',
        rationale: 'You already carpool, which is a solid choice. Pairing it with transit on a couple of days a week trims it further.',
        estAnnualSavingsKg: savings,
        difficulty: 'easy',
      });
    }
  }
  // If the user already walks, bikes, uses transit, or drives an EV, we
  // deliberately do NOT suggest a mode change here - that lever is already
  // pulled. Flight-related suggestions are handled separately below.
  return candidates;
}

function flightCandidates(profile) {
  const candidates = [];
  const shortHaul = Number(profile.flightsShortHaulPerYear) || 0;
  if (shortHaul >= 2) {
    const reduceBy = Math.min(2, shortHaul);
    const savings = round2(reduceBy * ASSUMED_AVG_SHORT_HAUL_KM * FLIGHT_KG_PER_KM.short_haul);
    candidates.push({
      category: 'flight',
      title: `Replace ${reduceBy} short-haul flight${reduceBy > 1 ? 's' : ''} a year with rail or video calls`,
      rationale: `Short-haul flights are disproportionately carbon-intensive per km because so much fuel is burned during takeoff. At ${shortHaul} short-haul trip(s) a year, even swapping a couple for rail or a remote meeting makes a meaningful dent.`,
      estAnnualSavingsKg: savings,
      difficulty: 'medium',
    });
  }
  return candidates;
}

function foodCandidates(profile) {
  const diet = profile.dietType;
  const stepDown = { heavy_meat: 'omnivore', omnivore: 'pescatarian' };

  if (stepDown[diet]) {
    const target = stepDown[diet];
    const currentFactor = FOOD_KG_PER_MEAL[diet];
    const targetFactor = FOOD_KG_PER_MEAL[target];
    // Assumption: swapping 2 meals/week is an easy, sustainable starting habit.
    const mealsPerYear = 2 * 52;
    const savings = round2(mealsPerYear * (currentFactor - targetFactor));
    return [
      {
        category: 'food',
        title: `Swap 2 meat-heavy meals a week for ${labelFor(target)} options`,
        rationale: `Your diet is currently ${labelFor(diet)}. Red meat in particular carries a much higher footprint per meal than poultry, fish, or plant-based options, so this is usually the single highest-leverage food change available.`,
        estAnnualSavingsKg: savings,
        difficulty: 'easy',
      },
    ];
  }

  if (diet === 'pescatarian') {
    const savings = round2(2 * 52 * (FOOD_KG_PER_MEAL.pescatarian - FOOD_KG_PER_MEAL.vegetarian));
    return [
      {
        category: 'food',
        title: 'Try 2 fully plant-based days a week',
        rationale: 'A pescatarian diet is already well below the omnivore average. Adding a couple of plant-based days trims it further without a full diet overhaul.',
        estAnnualSavingsKg: savings,
        difficulty: 'easy',
      },
    ];
  }

  // vegan / vegetarian: diet is already low-impact, so the next lever is waste.
  return [
    {
      category: 'food',
      title: 'Cut food waste with portion planning and leftover storage',
      rationale: `Your diet (${labelFor(diet)}) already has one of the lowest per-meal footprints available, so the next biggest lever isn\u2019t what you eat - it\u2019s what you throw away. Wasted food breaks down into methane in landfill.`,
      estAnnualSavingsKg: 35,
      difficulty: 'easy',
    },
  ];
}

function energyCandidates(profile) {
  const householdSize = Math.max(1, Number(profile.householdSize) || 1);
  const kwh = Number(profile.monthlyKwh) || 0;

  if (profile.homeEnergySource !== 'renewable') {
    const gridFactor = ENERGY_GRID_KG_PER_KWH[profile.countryCode] || ENERGY_GRID_KG_PER_KWH.default;
    const candidates = [];

    // Assumption: efficiency habits (LEDs, smart thermostat, fewer standby
    // loads) realistically cut household electricity use by about 15%.
    const efficiencySavings = round2((kwh * 12 * gridFactor * 0.15) / householdSize);
    if (efficiencySavings > 1) {
      candidates.push({
        category: 'energy',
        title: 'Cut home electricity use ~15% with efficiency habits',
        rationale: 'LED bulbs, a smart thermostat, and unplugging idle electronics typically reduce household electricity use noticeably without any lifestyle sacrifice.',
        estAnnualSavingsKg: efficiencySavings,
        difficulty: 'easy',
      });
    }

    const fullSwitchSavings = round2((kwh * 12 * (gridFactor - RENEWABLE_KG_PER_KWH)) / householdSize);
    if (fullSwitchSavings > efficiencySavings) {
      candidates.push({
        category: 'energy',
        title: 'Check whether a renewable electricity plan or solar is available to you',
        rationale: `Your local grid runs on a relatively carbon-intensive mix. If a green tariff or rooftop solar is available where you live, it is usually the single biggest lever in your whole footprint.`,
        estAnnualSavingsKg: fullSwitchSavings,
        difficulty: 'hard',
      });
    }
    return candidates;
  }

  // Already on renewable energy - the remaining lever is simply using less.
  return [
    {
      category: 'energy',
      title: 'Audit phantom load - unplug idle electronics overnight',
      rationale: 'Your electricity is already low-carbon, so the highest-value habit left is reducing how much you draw in the first place.',
      estAnnualSavingsKg: 12,
      difficulty: 'easy',
    },
  ];
}

function shoppingAndWasteCandidates(perCategoryMonthlyKg) {
  const candidates = [];
  if (perCategoryMonthlyKg.shopping > 1) {
    candidates.push({
      category: 'shopping',
      title: 'Buy one fewer new item this month - repair or buy secondhand instead',
      rationale: 'Manufacturing new goods (especially electronics and fast fashion) carries a large embedded carbon cost before you ever use the product.',
      estAnnualSavingsKg: round2(perCategoryMonthlyKg.shopping * 12 * 0.2),
      difficulty: 'easy',
    });
  }
  if (perCategoryMonthlyKg.waste > 1) {
    candidates.push({
      category: 'waste',
      title: 'Compost food scraps instead of sending them to landfill',
      rationale: 'Organic waste in landfill decomposes anaerobically and produces methane, a far more potent greenhouse gas than CO2.',
      estAnnualSavingsKg: round2(perCategoryMonthlyKg.waste * 12 * 0.6),
      difficulty: 'easy',
    });
  }
  return candidates;
}

/**
 * Picks a final, diverse shortlist from all candidates: one best
 * recommendation per category first (so the user never gets five transport
 * tips and nothing else), then fills any remaining slots by impact.
 */
function pickDiverseTopN(candidates, n = 5) {
  const byCategory = new Map();
  for (const candidate of candidates) {
    const list = byCategory.get(candidate.category) || [];
    list.push(candidate);
    byCategory.set(candidate.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => b.estAnnualSavingsKg - a.estAnnualSavingsKg);
  }

  const firstPass = [...byCategory.values()].map((list) => list[0]).filter(Boolean);
  firstPass.sort((a, b) => b.estAnnualSavingsKg - a.estAnnualSavingsKg);

  const remaining = [...byCategory.values()]
    .flatMap((list) => list.slice(1))
    .sort((a, b) => b.estAnnualSavingsKg - a.estAnnualSavingsKg);

  const shortlist = [...firstPass, ...remaining].slice(0, n);
  return shortlist.map((rec, index) => ({ ...rec, priority: index + 1 }));
}

function detectTrend(activities) {
  const recent = aggregateTotalInRange(activities, 30, 0);
  const previous = aggregateTotalInRange(activities, 60, 30);

  if (recent.entryCount === 0 && previous.entryCount === 0) {
    return {
      direction: 'no-data',
      message: 'Log a few activities to start seeing your personal trend over time.',
    };
  }
  if (previous.entryCount === 0) {
    return {
      direction: 'no-data',
      message: 'Keep logging - once you have a month of history, you\u2019ll see a trend here.',
    };
  }

  const pctChange = previous.totalKg > 0 ? ((recent.totalKg - previous.totalKg) / previous.totalKg) * 100 : 0;

  if (pctChange <= -5) {
    return {
      direction: 'down',
      message: `Nice work - your logged footprint is down ${Math.abs(round2(pctChange))}% versus the prior 30 days.`,
    };
  }
  if (pctChange >= 5) {
    return {
      direction: 'up',
      message: `Heads up - your logged footprint is up ${round2(pctChange)}% versus the prior 30 days. Check the recommendations below for the fastest way back down.`,
    };
  }
  return {
    direction: 'flat',
    message: 'Your logged footprint has been steady over the last 30 days.',
  };
}

/**
 * Main entry point: builds the full insight payload for a user.
 */
function generateInsights(profile, activities) {
  const { perCategoryMonthlyKg, totalMonthlyKg, sources } = getMonthlyEstimate(profile, activities);
  const annualTonnes = monthlyKgToAnnualTonnes(totalMonthlyKg);
  const benchmarkTonnes = getBenchmark(profile.countryCode);
  const vsBenchmarkPct = benchmarkTonnes > 0 ? round2(((annualTonnes - benchmarkTonnes) / benchmarkTonnes) * 100) : 0;

  const topCategory = Object.entries(perCategoryMonthlyKg).sort((a, b) => b[1] - a[1])[0]?.[0] || 'transport';

  const candidates = [
    ...transportCandidates(profile),
    ...flightCandidates(profile),
    ...foodCandidates(profile),
    ...energyCandidates(profile),
    ...shoppingAndWasteCandidates(perCategoryMonthlyKg),
  ];

  const recommendations = pickDiverseTopN(candidates, 5);
  const trend = detectTrend(activities);

  return {
    totals: {
      perCategoryMonthlyKg,
      totalMonthlyKg,
      annualTonnes,
      benchmarkTonnes,
      parisAlignedTargetTonnes: PARIS_ALIGNED_TARGET_TONNES,
      vsBenchmarkPct,
      sources,
    },
    topCategory,
    trend,
    recommendations,
  };
}

/**
 * "What if?" simulator: projects the annual impact of a single hypothetical
 * profile change, reusing the exact same baseline calculator as the rest of
 * the app so the numbers stay internally consistent.
 */
function simulateChange(profile, change) {
  const hypotheticalProfile = { ...profile, [change.field]: change.value };

  const before = computeProfileBaselineMonthly(profile);
  const after = computeProfileBaselineMonthly(hypotheticalProfile);

  const beforeTotal = Object.values(before).reduce((a, b) => a + b, 0);
  const afterTotal = Object.values(after).reduce((a, b) => a + b, 0);

  return {
    field: change.field,
    from: profile[change.field],
    to: change.value,
    currentAnnualTonnes: monthlyKgToAnnualTonnes(beforeTotal),
    projectedAnnualTonnes: monthlyKgToAnnualTonnes(afterTotal),
    annualSavingsKg: round2((beforeTotal - afterTotal) * 12),
    annualSavingsPct: beforeTotal > 0 ? round2(((beforeTotal - afterTotal) / beforeTotal) * 100) : 0,
  };
}

module.exports = {
  generateInsights,
  simulateChange,
  labelFor,
};
