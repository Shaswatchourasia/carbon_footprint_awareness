const { generateInsights, simulateChange } = require('../src/engine/insightEngine');

const driverProfile = {
  countryCode: 'IN',
  dietType: 'heavy_meat',
  primaryTransport: 'petrol_car',
  commuteKmPerWeek: 100,
  householdSize: 2,
  homeEnergySource: 'grid',
  monthlyKwh: 300,
  flightsShortHaulPerYear: 4,
  flightsLongHaulPerYear: 1,
};

const greenProfile = {
  countryCode: 'FR',
  dietType: 'vegan',
  primaryTransport: 'bike',
  commuteKmPerWeek: 40,
  householdSize: 3,
  homeEnergySource: 'renewable',
  monthlyKwh: 250,
  flightsShortHaulPerYear: 0,
  flightsLongHaulPerYear: 0,
};

describe('generateInsights - context awareness', () => {
  test('recommends switching away from a high-carbon commute when relevant', () => {
    const { recommendations } = generateInsights(driverProfile, []);
    const transportRec = recommendations.find((r) => r.category === 'transport');
    expect(transportRec).toBeDefined();
    expect(transportRec.estAnnualSavingsKg).toBeGreaterThan(0);
  });

  test('recommends reducing meat consumption for a heavy-meat diet', () => {
    const { recommendations } = generateInsights(driverProfile, []);
    const foodRec = recommendations.find((r) => r.category === 'food');
    expect(foodRec.title.toLowerCase()).toContain('meat');
  });

  test('never suggests a transport-mode switch for someone who already bikes', () => {
    const { recommendations } = generateInsights(greenProfile, []);
    const transportRec = recommendations.find((r) => r.category === 'transport');
    expect(transportRec).toBeUndefined();
  });

  test('never suggests a diet change for someone already vegan - suggests food waste instead', () => {
    const { recommendations } = generateInsights(greenProfile, []);
    const foodRec = recommendations.find((r) => r.category === 'food');
    expect(foodRec).toBeDefined();
    expect(foodRec.title.toLowerCase()).not.toContain('meat');
    expect(foodRec.title.toLowerCase()).toContain('waste');
  });

  test('caps recommendations at 5 and assigns ascending priority', () => {
    const { recommendations } = generateInsights(driverProfile, []);
    expect(recommendations.length).toBeLessThanOrEqual(5);
    recommendations.forEach((rec, i) => expect(rec.priority).toBe(i + 1));
  });

  test('a high-impact profile shows a higher annual footprint than a low-impact one', () => {
    const driverInsights = generateInsights(driverProfile, []);
    const greenInsights = generateInsights(greenProfile, []);
    expect(driverInsights.totals.annualTonnes).toBeGreaterThan(greenInsights.totals.annualTonnes);
  });
});

describe('generateInsights - trend detection', () => {
  test('reports no-data when there is no activity history', () => {
    const { trend } = generateInsights(driverProfile, []);
    expect(trend.direction).toBe('no-data');
  });

  test('detects an upward trend when recent emissions exceed the prior period', () => {
    const now = Date.now();
    const day = 86400000;
    const activities = [
      { category: 'transport', co2eKg: 50, loggedAt: new Date(now - 5 * day).toISOString() },
      { category: 'transport', co2eKg: 50, loggedAt: new Date(now - 10 * day).toISOString() },
      { category: 'transport', co2eKg: 5, loggedAt: new Date(now - 40 * day).toISOString() },
    ];
    const { trend } = generateInsights(driverProfile, activities);
    expect(trend.direction).toBe('up');
  });
});

describe('simulateChange', () => {
  test('switching a fossil-fuel commuter to public transit projects savings', () => {
    const result = simulateChange(driverProfile, { field: 'primaryTransport', value: 'public_transit' });
    expect(result.annualSavingsKg).toBeGreaterThan(0);
    expect(result.projectedAnnualTonnes).toBeLessThan(result.currentAnnualTonnes);
  });

  test('switching diet from heavy_meat to pescatarian projects a large savings', () => {
    const result = simulateChange(driverProfile, { field: 'dietType', value: 'pescatarian' });
    expect(result.annualSavingsPct).toBeGreaterThan(20);
  });

  test('simulating no real change yields ~zero savings', () => {
    const result = simulateChange(driverProfile, { field: 'primaryTransport', value: 'petrol_car' });
    expect(result.annualSavingsKg).toBe(0);
  });
});
