import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { buildAppSpec } from '../openapi/index.js';
import { mobileRouters } from '../openapi/mobile-route-manifest.js';
import { operationsFromSource, compareOperations, validateAgainst, checkResponse } from '../openapi/contract.js';
const spec = buildAppSpec();
describe('mobile API inventory', () => {
  it.each(mobileRouters)('$file has no undocumented or obsolete operation', ({ file, mount, operations }) => {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    const declared = operations.map(({ method, path }) => ({ method, path }));
    expect(compareOperations(declared, operationsFromSource(source, mount))).toEqual({ documentedNotServed: [], servedNotDocumented: [] });
    for (const { method, path } of declared) expect(spec.paths[path]?.[method]).toBeDefined();
  });
  it('combines the auth routers without dropping the exchange operation', () => {
    for (const path of ['/api/auth/login','/api/auth/send-otp','/api/auth/verify-otp','/api/auth/refresh','/api/auth/logout','/api/auth/oauth/exchange']) expect(spec.paths[path].post).toBeDefined();
  });
  it('documents every operation with path parameters, security and success/errors', () => {
    for (const { operations } of mobileRouters) for (const { method, path, public: isPublic } of operations) {
      const operation = spec.paths[path][method];
      expect(operation.responses[401]).toBeDefined();
      expect(spec.components.responses.AppRateLimited.headers['Retry-After']).toBeDefined();
      expect(operation.responses[429].$ref).toBe('#/components/responses/AppRateLimited');
      if (isPublic) expect(operation.security).toEqual([]);
      for (const [,name] of path.matchAll(/\{([^}]+)\}/g)) expect(operation.parameters).toContainEqual(expect.objectContaining({ name, in: 'path', required: true }));
    }
  });
  it('requires the history ID independently of the appointment ID', () => {
    const response = { success: true, labTestId: 77, data: { id: 77, testType: 'other', appointmentDate: '2026-12-01T00:00:00.000Z', status: 'pending_confirmation' }, appointment: { id: 12 }, payment: { required: false, orderId: null, amount: 0, currency: 'INR' } };
    expect(checkResponse(spec, 'post', '/api/labs/book', 201, response).errors).toEqual([]);
    delete response.labTestId;
    expect(checkResponse(spec, 'post', '/api/labs/book', 201, response).errors.join()).toContain('labTestId');
  });
  it('catches missing lab history and membership keys', () => {
    expect(checkResponse(spec, 'get', '/api/lab-tests', 200, { success: true }).errors.join()).toContain('data');
    expect(validateAgainst(spec, { $ref: '#/components/schemas/AppMembershipCurrent' }, {}).length).toBe(5);
  });
});
