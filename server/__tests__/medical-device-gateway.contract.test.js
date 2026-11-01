import { describe, expect, it } from '@jest/globals';
import { DeviceGatewayError, payloadHash, stableStringify, validateCanonicalEvent } from '../services/medical-device-gateway.service.js';

const baseEvent = () => ({
  schemaVersion: 'device-event/v1',
  eventId: 'b396ac5c-2518-4a4a-87b7-dcc740ab3913',
  eventType: 'measurement',
  gatewayId: 12,
  device: { registryId: 42 },
  association: { state: 'confirmed', patientId: 99, bindingId: 77 },
  observedAt: '2026-11-01T10:15:30.000Z',
  measurements: [{
    code: { system: 'http://loinc.org', value: '8867-4', display: 'Heart rate' },
    value: 78,
    unit: 'beats/min',
    ucum: '/min',
    quality: 'validated',
  }],
});

describe('medical device gateway canonical event contract', () => {
  it('accepts a provenance-ready, explicitly bound measurement', () => {
    expect(validateCanonicalEvent(baseEvent())).toMatchObject({ eventType: 'measurement', observedAt: '2026-11-01T10:15:30.000Z' });
  });

  it('does not allow a claimed confirmed association without patient and binding IDs', () => {
    const event = baseEvent();
    event.association = { state: 'confirmed' };
    expect(() => validateCanonicalEvent(event)).toThrow(DeviceGatewayError);
  });

  it('rejects invalid or non-finite clinical measurements before persistence', () => {
    const event = baseEvent();
    event.measurements[0].value = Infinity;
    expect(() => validateCanonicalEvent(event)).toThrow('Measurement value must be finite');
  });

  it('uses deterministic payload hashes regardless of object key order', () => {
    const left = { b: 2, a: { z: true, y: [2, 1] } };
    const right = { a: { y: [2, 1], z: true }, b: 2 };
    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(payloadHash(left)).toBe(payloadHash(right));
  });
});
