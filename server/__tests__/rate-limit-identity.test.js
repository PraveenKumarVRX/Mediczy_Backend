import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { identifyRateLimitAccount, accountOrIpRateLimitKey } from '../middleware/rate-limit-identity.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';

function keyFor(token, cookie = false) {
  const req = { ip: '203.0.113.10', headers: {}, cookies: {} };
  if (token && cookie) req.cookies.msz_access = token;
  else if (token) req.headers.authorization = `Bearer ${token}`;
  identifyRateLimitAccount(req, {}, () => {});
  return accountOrIpRateLimitKey(req);
}

test('verified bearer and cookie tokens use stable distinct account buckets', () => {
  const first = jwt.sign({ id: 1, role: 'user' }, JWT_CONFIG.SECRET, { expiresIn: 60 });
  const second = jwt.sign({ id: 2, role: 'user' }, JWT_CONFIG.SECRET, { expiresIn: 60 });
  expect(keyFor(first)).toBe('account:user:1');
  expect(keyFor(first, true)).toBe('account:user:1');
  expect(keyFor(second)).toBe('account:user:2');
});

test('invalid, expired, refresh and anonymous tokens use the IP budget', () => {
  const expired = jwt.sign({ id: 1, role: 'user' }, JWT_CONFIG.SECRET, { expiresIn: -1 });
  const refresh = jwt.sign({ id: 1, role: 'user', type: 'refresh' }, JWT_CONFIG.SECRET);
  for (const token of [null, 'invalid', expired, refresh]) {
    expect(keyFor(token)).toBe('ip:203.0.113.10');
  }
});

test('accounts on the same network have separate limits; anonymous and auth routes remain IP-limited', async () => {
  const app = express();
  app.use(identifyRateLimitAccount);
  app.use(rateLimit({ windowMs: 60000, max: 1, keyGenerator: accountOrIpRateLimitKey }));
  app.use((_req, res) => res.sendStatus(200));
  const a = jwt.sign({ id: 10, role: 'user' }, JWT_CONFIG.SECRET);
  const b = jwt.sign({ id: 11, role: 'user' }, JWT_CONFIG.SECRET);
  expect((await request(app).get('/api/data').set('Authorization', `Bearer ${a}`)).status).toBe(200);
  expect((await request(app).get('/api/data').set('Authorization', `Bearer ${a}`)).status).toBe(429);
  expect((await request(app).get('/api/data').set('Authorization', `Bearer ${b}`)).status).toBe(200);
  expect((await request(app).post('/api/users/login').set('Authorization', `Bearer ${a}`)).status).toBe(200);
  expect((await request(app).post('/api/users/login').set('Authorization', `Bearer ${b}`)).status).toBe(429);
});
