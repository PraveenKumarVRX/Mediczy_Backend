import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { teamLoginValidation, rejectInvalidTeamLogin } from '../middleware/team-login-validation.js';

describe('team login request validation', () => {
  let app;
  let warn;
  let authenticate;
  beforeEach(() => {
    warn = jest.fn();
    authenticate = jest.fn((req, res) => res.json({ email: req.body.email, passwordUnchanged: req.body.password === ' a ' }));
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
      req.logger = { warn };
      req.requestId = 'test-request';
      next();
    });
    app.post('/login', teamLoginValidation, rejectInvalidTeamLogin, authenticate);
  });

  it.each(['json', 'form'])('accepts %s credentials and normalizes the email before validation', async format => {
    const response = await request(app).post('/login').type(format)
      .send({ email: '  FIELD.TEST@EXAMPLE.COM\t', password: ' a ' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ email: 'field.test@example.com', passwordUnchanged: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 42, ['password-marker'], { secret: 'password-marker' }])('rejects a missing or non-string password without exposing it (%p)', async password => {
    const response = await request(app).post('/login').send({ email: 'field.test@example.com', password });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Password is required');
    expect(response.body.errors).toEqual([{ type: 'field', msg: 'Password is required', path: 'password', location: 'body' }]);
    expect(response.body.requestId).toBe('test-request');
    expect(JSON.stringify(response.body)).not.toContain('password-marker');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('password-marker');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('field.test@example.com');
    expect(authenticate).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, 'invalid-email-marker'])('rejects malformed email values without echoing them (%p)', async email => {
    const response = await request(app).post('/login').send({ email, password: 'password-marker' });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Must be a valid email');
    expect(JSON.stringify(response.body)).not.toContain('invalid-email-marker');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('password-marker');
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('identifies unparsed request bodies without logging their contents', async () => {
    const response = await request(app).post('/login').type('text/plain')
      .send(JSON.stringify({ email: 'field.test@example.com', password: 'password-marker' }));
    expect(response.status).toBe(400);
    expect(warn).toHaveBeenCalledWith('Team login validation failed', {
      requestId: 'test-request', contentType: 'text/plain',
      emailPresent: false, passwordPresent: false, invalidFields: ['email', 'password'],
    });
    expect(authenticate).not.toHaveBeenCalled();
  });
});
