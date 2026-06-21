const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Point the store at a throwaway test database before requiring the app,
// so tests never touch (or depend on) the developer's real data/db.json.
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test-db.json');
process.env.DB_PATH = TEST_DB_PATH;

beforeAll(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});
afterAll(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

const app = require('../src/app');

const validProfile = {
  name: 'Test User',
  countryCode: 'IN',
  dietType: 'omnivore',
  primaryTransport: 'petrol_car',
  householdSize: 2,
  homeEnergySource: 'grid',
  commuteKmPerWeek: 60,
  monthlyKwh: 250,
};

describe('GET /api/health', () => {
  test('reports ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /api/users', () => {
  test('rejects an invalid profile', async () => {
    const res = await request(app).post('/api/users').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  test('creates a valid profile', async () => {
    const res = await request(app).post('/api/users').send(validProfile);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Test User');
  });
});

describe('Activity logging and insights flow', () => {
  let userId;

  beforeAll(async () => {
    const res = await request(app).post('/api/users').send(validProfile);
    userId = res.body.id;
  });

  test('returns 404 for an unknown user', async () => {
    const res = await request(app).get('/api/users/does-not-exist');
    expect(res.status).toBe(404);
  });

  test('logs a valid activity and computes CO2e server-side', async () => {
    const res = await request(app)
      .post(`/api/users/${userId}/activities`)
      .send({ category: 'transport', type: 'petrol_car', quantity: 20 });
    expect(res.status).toBe(201);
    expect(res.body.co2eKg).toBeCloseTo(3.8);
  });

  test('rejects an activity with a type that does not belong to its category', async () => {
    const res = await request(app)
      .post(`/api/users/${userId}/activities`)
      .send({ category: 'transport', type: 'vegan', quantity: 5 });
    expect(res.status).toBe(400);
  });

  test('returns a summary with totals and a top category', async () => {
    const res = await request(app).get(`/api/users/${userId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.totals.annualTonnes).toBeGreaterThan(0);
    expect(res.body.topCategory).toBeDefined();
  });

  test('returns insights with a narrative and at least one recommendation', async () => {
    const res = await request(app).get(`/api/users/${userId}/insights`);
    expect(res.status).toBe(200);
    expect(typeof res.body.narrative).toBe('string');
    expect(res.body.narrative.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });

  test('skips narration when narrate=false, for a faster response', async () => {
    const res = await request(app).get(`/api/users/${userId}/insights?narrate=false`);
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBeNull();
  });

  test('runs a what-if simulation', async () => {
    const res = await request(app)
      .post(`/api/users/${userId}/simulate`)
      .send({ field: 'primaryTransport', value: 'public_transit' });
    expect(res.status).toBe(200);
    expect(res.body.annualSavingsKg).toBeGreaterThan(0);
  });

  test('rejects a simulation on a disallowed field', async () => {
    const res = await request(app)
      .post(`/api/users/${userId}/simulate`)
      .send({ field: 'name', value: 'hacked' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/meta/emission-factors', () => {
  test('exposes the factor tables the frontend depends on', async () => {
    const res = await request(app).get('/api/meta/emission-factors');
    expect(res.status).toBe(200);
    expect(res.body.transport.petrol_car).toBeGreaterThan(0);
    expect(Array.isArray(res.body.countryCodes)).toBe(true);
  });
});
