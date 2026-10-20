import express from 'express';
import request from 'supertest';
import ringFencing from '../middleware/ringFencing.js';

const app = express();
app.use(ringFencing);
// This sentinel represents arrival at the route's own refresh-token validator.
app.post('/api/team/refresh-token', (_req, res) => res.sendStatus(204));
app.use((_req, res) => res.sendStatus(404));

describe('mobile refresh alias crosses the global fence', () => {
  it('allows the exact POST route to reach refresh-token authentication without an access token', async () => {
    expect((await request(app).post('/api/team/refresh-token')).status).toBe(204);
  });

  it.each([
    ['get', '/api/team/refresh-token'],
    ['post', '/api/team/refresh-token/admin'],
    ['post', '/api/team/refresh-token-extra'],
    ['get', '/api/field/my/day-plan'],
  ])('preserves access-token requirements for %s %s', async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('NO_TOKEN');
  });
});
