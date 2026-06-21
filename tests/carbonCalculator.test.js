const {
  computeActivityCO2e,
  computeProfileBaselineMonthly,
  aggregateLoggedByCategory,
  getMonthlyEstimate,
  monthlyKgToAnnualTonnes,
} = require('../src/engine/carbonCalculator');

describe('computeActivityCO2e', () => {
  test('computes transport emissions as factor * distance', () => {
    expect(computeActivityCO2e({ category: 'transport', type: 'petrol_car', quantity: 20 })).toBeCloseTo(3.8);
  });

  test('zero-emission modes return 0', () => {
    expect(computeActivityCO2e({ category: 'transport', type: 'bike', quantity: 50 })).toBe(0);
  });

  test('computes food emissions per meal', () => {
    expect(computeActivityCO2e({ category: 'food', type: 'vegan', quantity: 1 })).toBeCloseTo(0.5);
    expect(computeActivityCO2e({ category: 'food', type: 'heavy_meat', quantity: 1 })).toBeCloseTo(4.5);
  });

  test('renewable energy uses the renewable factor regardless of country', () => {
    const renewable = computeActivityCO2e({
      category: 'energy', quantity: 100, meta: { renewable: true, countryCode: 'IN' },
    });
    const grid = computeActivityCO2e({
      category: 'energy', quantity: 100, meta: { renewable: false, countryCode: 'IN' },
    });
    expect(renewable).toBeLessThan(grid);
  });

  test('unknown category returns 0 instead of throwing', () => {
    expect(computeActivityCO2e({ category: 'teleportation', type: 'x', quantity: 5 })).toBe(0);
  });

  test('non-positive quantity returns 0', () => {
    expect(computeActivityCO2e({ category: 'transport', type: 'petrol_car', quantity: 0 })).toBe(0);
    expect(computeActivityCO2e({ category: 'transport', type: 'petrol_car', quantity: -5 })).toBe(0);
  });

  test('gracefully handles malformed input', () => {
    expect(computeActivityCO2e(null)).toBe(0);
    expect(computeActivityCO2e(undefined)).toBe(0);
    expect(computeActivityCO2e({})).toBe(0);
  });
});

describe('computeProfileBaselineMonthly', () => {
  const baseProfile = {
    countryCode: 'IN',
    dietType: 'omnivore',
    primaryTransport: 'petrol_car',
    commuteKmPerWeek: 100,
    householdSize: 2,
    homeEnergySource: 'grid',
    monthlyKwh: 300,
    flightsShortHaulPerYear: 0,
    flightsLongHaulPerYear: 0,
  };

  test('a heavier diet and fossil transport yields a higher footprint than a green profile', () => {
    const heavy = computeProfileBaselineMonthly({ ...baseProfile, dietType: 'heavy_meat' });
    const green = computeProfileBaselineMonthly({
      ...baseProfile, dietType: 'vegan', primaryTransport: 'bike', homeEnergySource: 'renewable',
    });
    const heavyTotal = Object.values(heavy).reduce((a, b) => a + b, 0);
    const greenTotal = Object.values(green).reduce((a, b) => a + b, 0);
    expect(heavyTotal).toBeGreaterThan(greenTotal);
  });

  test('energy is allocated per household member', () => {
    const soloHousehold = computeProfileBaselineMonthly({ ...baseProfile, householdSize: 1 });
    const sharedHousehold = computeProfileBaselineMonthly({ ...baseProfile, householdSize: 4 });
    expect(sharedHousehold.energy).toBeLessThan(soloHousehold.energy);
  });

  test('renewable home energy carries a much lower factor than grid', () => {
    const grid = computeProfileBaselineMonthly({ ...baseProfile, homeEnergySource: 'grid' });
    const renewable = computeProfileBaselineMonthly({ ...baseProfile, homeEnergySource: 'renewable' });
    expect(renewable.energy).toBeLessThan(grid.energy);
  });

  test('flights are annualized down to a monthly figure', () => {
    const withFlights = computeProfileBaselineMonthly({ ...baseProfile, flightsShortHaulPerYear: 12 });
    expect(withFlights.flight).toBeGreaterThan(0);
  });
});

describe('aggregateLoggedByCategory', () => {
  test('only counts activities within the time window', () => {
    const now = Date.now();
    const activities = [
      { category: 'transport', co2eKg: 10, loggedAt: new Date(now - 5 * 86400000).toISOString() },
      { category: 'transport', co2eKg: 999, loggedAt: new Date(now - 90 * 86400000).toISOString() },
    ];
    const totals = aggregateLoggedByCategory(activities, 30);
    expect(totals.transport).toBe(10);
  });
});

describe('getMonthlyEstimate', () => {
  const profile = {
    countryCode: 'US', dietType: 'omnivore', primaryTransport: 'petrol_car', commuteKmPerWeek: 80,
    householdSize: 1, homeEnergySource: 'grid', monthlyKwh: 400, flightsShortHaulPerYear: 0, flightsLongHaulPerYear: 0,
  };

  test('falls back to baseline when there is no recent logged activity for a category', () => {
    const { sources } = getMonthlyEstimate(profile, []);
    expect(sources.transport).toBe('baseline');
    expect(sources.food).toBe('baseline');
  });

  test('prefers logged data over baseline for a category with recent entries', () => {
    const recent = new Date().toISOString();
    const activities = [{ category: 'transport', co2eKg: 5, loggedAt: recent }];
    const { sources, perCategoryMonthlyKg } = getMonthlyEstimate(profile, activities);
    expect(sources.transport).toBe('logged');
    expect(perCategoryMonthlyKg.transport).toBe(5);
  });
});

describe('monthlyKgToAnnualTonnes', () => {
  test('converts kg/month to tonnes/year', () => {
    expect(monthlyKgToAnnualTonnes(1000)).toBeCloseTo(12);
  });
});
