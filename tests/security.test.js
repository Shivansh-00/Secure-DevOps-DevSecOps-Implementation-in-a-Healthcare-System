process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'a'.repeat(48);
process.env.PHI_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/healthcare-test';

const request = require('supertest');
const app = require('../src/server');

describe('Security headers & health', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('Helmet sets security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  test('Unknown API route returns JSON 404 without stack', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  test('Unknown non-API route returns 404 (no stack leak)', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.text).not.toMatch(/at \w/); // no stack trace
  });

  test('Auth endpoints reject malformed input', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });
    expect([400, 401]).toContain(res.status);
  });

  test('Protected route requires auth', async () => {
    const res = await request(app).get('/api/patients');
    expect(res.status).toBe(401);
  });
});
