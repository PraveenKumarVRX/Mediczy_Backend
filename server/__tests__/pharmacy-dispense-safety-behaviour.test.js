/**
 * BEHAVIOURAL test of the pharmacy-dispense safety gate: the real Express router + the real gate middleware, with only the
 * data edge mocked. The route-coverage test proves a gate is PRESENT in the chain; this proves it RUNS and refuses.
 *
 * Also pins two fail-open holes found while writing it:
 *  - the pharmacy route carries only a medicineId; if it cannot be resolved to a name the gate used to pass vacuously;
 *  - if resolving the name THREW, the gate skipped itself (even on an issuing path in enforce mode).
 */
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

let mode = 'enforce';
const logRows = [];
const poolQuery = jest.fn(async (sql, params) => {
  if (/FROM clinical_safety_settings WHERE organization_id/.test(sql) && /SELECT mode/.test(sql)) return { rows: [{ mode }] };
  if (/INSERT INTO prescription_safety_log/.test(sql)) { logRows.push({ outcome: params[5], source: params[3] }); return { rows: [] }; }
  return { rows: [], rowCount: 0 };
});
const poolMock = { query: poolQuery, connect: jest.fn(async () => ({ query: poolQuery, release: jest.fn() })) };
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: poolMock, pool: poolMock }));

let allergies = [{ allergen_name: 'amoxicillin', allergen_type: 'drug', severity: 'severe', status: 'active' }];
jest.unstable_mockModule('../services/allergy.service.js', () => ({
  getAllergyStatus: jest.fn(async () => ({ status: allergies.length ? 'has_allergies' : 'none_known', allergies })),
}));
const realClass = await import('../services/drug-class.service.js');
jest.unstable_mockModule('../services/drug-class.service.js', () => ({ ...realClass, loadApprovedClasses: jest.fn(async () => []) }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { postgresSequelize } = await import('../db/postgres-sequelize.js');
postgresSequelize.query = jest.fn(async () => []);
const { default: PharmacyInventory } = await import('../models/postgres/pharmacyInventory.model.postgres.js');
const { default: router } = await import('../routes/hospital/practice.route.js');
const app = express(); app.use(express.json()); app.use('/api/hospital/practice', router);

// The gate caches each hospital's mode for 30s, so tests that need a different mode use a different hospital id.
const staff = (role = 'doctor', org = 11) => `Bearer ${jwt.sign({ id: 42, role, userType: 'hospital', tenant_id: org, organization_id: org }, JWT_CONFIG.SECRET, { expiresIn: '5m' })}`;
const URL = '/api/hospital/practice/pharmacy/prescriptions';
const body = (extra = {}) => ({ patientId: 5, doctorId: 42, medicineId: 77, dosage: '500 mg', frequency: 'tid', duration: '5 days', quantity: 15, ...extra });
const gateStopped = (res) => res.status === 409 || res.status === 503;

beforeEach(() => {
  mode = 'enforce'; logRows.length = 0; poolQuery.mockClear();
  allergies = [{ allergen_name: 'amoxicillin', allergen_type: 'drug', severity: 'severe', status: 'active' }];
  jest.spyOn(PharmacyInventory, 'findOne').mockResolvedValue({ medicineName: 'Amoxicillin 500mg Capsule' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe('pharmacy dispensing is refused for a recorded allergy (the bypass this closes)', () => {
  it('enforce mode: a patient allergic to amoxicillin cannot be dispensed Amoxicillin — 409 SAFETY_BLOCK before the handler', async () => {
    const res = await request(app).post(URL).set('authorization', staff()).send(body());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SAFETY_BLOCK');
    expect(res.body.blockers.length).toBeGreaterThan(0);
    expect(logRows.some((r) => r.outcome === 'blocked' && r.source === 'hospital.practice.pharmacy-dispense')).toBe(true);
  });

  it('the medicineId is resolved to a NAME, inside the caller\'s hospital, before checking (a nameless check would pass vacuously)', async () => {
    await request(app).post(URL).set('authorization', staff()).send(body());
    expect(PharmacyInventory.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 77, organizationId: 11 } }));
  });

  it('a different, safe medicine is NOT blocked (the gate is not just refusing everything)', async () => {
    PharmacyInventory.findOne.mockResolvedValue({ medicineName: 'Paracetamol 500mg Tablet' });
    const res = await request(app).post(URL).set('authorization', staff()).send(body());
    expect(gateStopped(res)).toBe(false);
  });

  it('shadow mode logs but never blocks', async () => {
    mode = 'shadow';
    const res = await request(app).post(URL).set('authorization', staff('doctor', 12)).send(body());
    expect(gateStopped(res)).toBe(false);
    expect(res.headers['x-safety-mode']).toBe('shadow');
  });

  it('a clinician\'s documented override (reason + every blocker acknowledged) lets it through and is logged as overridden', async () => {
    const blocked = await request(app).post(URL).set('authorization', staff()).send(body());
    const codes = blocked.body.overrideRequires.acknowledgedCodes;
    const res = await request(app).post(URL).set('authorization', staff('doctor')).send(body({ safetyOverride: { reason: 'Tolerated previously; consultant reviewed', acknowledgedCodes: codes } }));
    expect(gateStopped(res)).toBe(false);
    expect(logRows.some((r) => r.outcome === 'overridden')).toBe(true);
  });

  it('a non-clinical role cannot override, even with a reason and acknowledgements', async () => {
    const codes = (await request(app).post(URL).set('authorization', staff()).send(body())).body.overrideRequires.acknowledgedCodes;
    const res = await request(app).post(URL).set('authorization', staff('billing')).send(body({ safetyOverride: { reason: 'please let it through', acknowledgedCodes: codes } }));
    expect(res.status).toBe(409);
  });
});

describe('the gate fails CLOSED when it cannot tell what is being dispensed', () => {
  it('an unresolvable medicine (no inventory row) is a DRUG_UNRESOLVED blocker, not a vacuous pass', async () => {
    PharmacyInventory.findOne.mockResolvedValue(null);
    const res = await request(app).post(URL).set('authorization', staff()).send(body());
    expect(res.status).toBe(409);
    expect(res.body.blockers.map((b) => b.code)).toContain('DRUG_UNRESOLVED');
  });

  it('an inventory row with blank names is treated the same', async () => {
    PharmacyInventory.findOne.mockResolvedValue({ medicineName: '', name: null, genericName: null });
    expect((await request(app).post(URL).set('authorization', staff()).send(body())).status).toBe(409);
  });

  it('if RESOLVING the name throws, an issuing path in enforce mode is refused with 503 (the gate no longer skips itself)', async () => {
    PharmacyInventory.findOne.mockRejectedValue(new Error('db blip'));
    const res = await request(app).post(URL).set('authorization', staff()).send(body());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SAFETY_UNAVAILABLE');
    expect(logRows.some((r) => r.outcome === 'error')).toBe(true);
  });

  it('…but in shadow mode the same failure does not stop the work (and says so in a header)', async () => {
    mode = 'shadow';
    PharmacyInventory.findOne.mockRejectedValue(new Error('db blip'));
    const res = await request(app).post(URL).set('authorization', staff('doctor', 13)).send(body());
    expect(gateStopped(res)).toBe(false);
    expect(res.headers['x-safety-check']).toBe('unavailable');
  });
});

describe('the read path is untouched', () => {
  it('GET /pharmacy/prescriptions is not gated', async () => {
    const res = await request(app).get(URL).set('authorization', staff());
    expect(gateStopped(res)).toBe(false);
  });
});
