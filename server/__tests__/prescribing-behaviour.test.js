import { jest } from '@jest/globals';

/**
 * WP-1.2 BEHAVIOURAL test: does the gate actually REFUSE an unsafe prescription?
 *
 * The static route-coverage test proves a gate is PRESENT in a route's middleware chain. It cannot
 * prove the gate RUNS — injecting `async (q,s,n)=>n(),` ahead of it leaves that suite green. This
 * suite closes that hole: real HTTP, a real Express app, a real router. A bypass would have to
 * bypass the middleware itself to pass.
 *
 * REAL here: the app, the router, prescriptionSafetyGate, checkPrescriptionSafety,
 * evaluatePrescriptionSafety, matchAllergy, and the blocker/override decision.
 *
 * Stubbed: only the data it reads — the allergy record, the approved drug classes, the patient's
 * current medicines, and the per-org mode. The clinical scenario is then fixed and readable, and no
 * assertion depends on a seeded database.
 *
 * Scenario: patient 42 is recorded allergic to penicillin. Prescribing amoxicillin must be refused.
 */

// ── Data layer only. Everything above this stays real. ──────────────────────────
const poolQuery = jest.fn(async () => ({ rows: [] }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: poolQuery, connect: jest.fn() } }));

// Models reached through the route call sequelize.define at import time, so the
// stub has to answer it or the module graph cannot be built and the suite fails
// to run before a single prescribing-safety assertion executes.
const stubSequelizeModel = () => ({
  findByPk: jest.fn(async () => null),
  findOne: jest.fn(async () => null),
  findAll: jest.fn(async () => []),
  create: jest.fn(async (v) => v),
  update: jest.fn(async () => [0]),
  destroy: jest.fn(async () => 0),
  count: jest.fn(async () => 0),
  belongsTo: jest.fn(),
  hasMany: jest.fn(),
  hasOne: jest.fn(),
  belongsToMany: jest.fn(),
  addHook: jest.fn(),
  sync: jest.fn(async () => undefined),
  // models attach instance methods, e.g. User.prototype.comparePassword
  prototype: {},
});

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: {
    transaction: async (fn) => fn({ query: async () => [] }),
    query: jest.fn(async () => []),
    define: jest.fn(() => stubSequelizeModel()),
    model: jest.fn(() => stubSequelizeModel()),
    literal: jest.fn((v) => v),
    fn: jest.fn((...a) => a),
    col: jest.fn((v) => v),
    where: jest.fn((...a) => a),
    authenticate: jest.fn(async () => undefined),
  },
}));

const getAllergyStatus = jest.fn();
jest.unstable_mockModule('../services/allergy.service.js', () => ({ getAllergyStatus }));

// The approved-class table is DATA, but normaliseDrugText / resolveGenerics / classesOfGenerics /
// textNamesClass are the real matching logic this suite exists to exercise. So the real module is
// imported and only its loader is replaced — Jest's ESM factory has no importActual.
const realDrugClass = await import('../services/drug-class.service.js');
const loadApprovedClasses = jest.fn();
jest.unstable_mockModule('../services/drug-class.service.js', () => ({
  ...realDrugClass,
  loadApprovedClasses,
}));

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  // x-org lets a test use a distinct org key. getSafetyMode caches per org for 30s, so a test
  // that needs a different mode MUST use a different org or it reads the previous test's cache.
  authUser: (req, _res, next) => { req.user = { id: 7, role: req.headers['x-role'] || 'doctor', organization_id: Number(req.headers['x-org']) || 3 }; next(); },
  authDoctor: (req, _res, next) => {
    req.user = { id: 7, role: req.headers['x-role'] || 'doctor', organization_id: Number(req.headers['x-org']) || 3 };
    if (req.headers['x-role']) req.doctor = undefined; else req.doctor = { id: 7, organization_id: Number(req.headers['x-org']) || 3 };
    next();
  },
  // A route under test imports this too. Omitting it from the factory means the
  // module cannot be linked and the whole suite fails to run, so none of these
  // prescribing-safety assertions were executing.
  requireRole: () => (_req, _res, next) => next(),
  requireRoleOrHospitalAdmin: () => (_req, _res, next) => next(),
  authUserOptional: (req, _res, next) => next(),
}));

const created = [];
const stubModel = (extra = {}) => ({
  findByPk: jest.fn(async () => null),
  findOne: jest.fn(async () => null),
  findAll: jest.fn(async () => []),
  findById: jest.fn(async () => null),
  create: jest.fn(async () => ({})),
  update: jest.fn(async () => ({})),
  destroy: jest.fn(async () => ({})),
  count: jest.fn(async () => 0),
  ...extra,
});
jest.unstable_mockModule('../models/index.js', () => ({
  Prescription: stubModel({ create: jest.fn(async (v) => { const row = { id: 1, ...v }; created.push(row); return row; }) }),
  Appointment: stubModel(),
  User: stubModel({ findByPk: jest.fn(async () => ({ id: 42, firstName: 'Test', lastName: 'Patient', email: 't@example.com' })) }),
  Doctor: stubModel(),
  EHRRecord: stubModel(),
  HealthDiary: stubModel(),
}));
jest.unstable_mockModule('../models/auditLog.model.intelligent.js', () => ({ default: { create: jest.fn(async () => ({})) } }));
// Handed back so the test can seed the stored prescription and assert nothing was written.
const prescriptionRepo = {
  findById: jest.fn(async () => null),
  findAll: jest.fn(async () => []),
  create: jest.fn(async () => ({})),
  update: jest.fn(async () => ({})),
  findByIdForDoctor: jest.fn(async () => null),
  withTransaction: jest.fn(async (_req, fn) => fn({})),
};
jest.unstable_mockModule('../repositories/prescription.repository.js', () => prescriptionRepo);
jest.unstable_mockModule('../repositories/appointment.repository.js', () => ({
  findByIdForDoctor: jest.fn(async () => null),
  withTransaction: jest.fn(async (_req, fn) => fn({})),
}));
// requirePatientAccess is a FACTORY: it takes a patient-id getter and returns middleware.
jest.unstable_mockModule('../services/patient-access.service.js', () => ({
  requirePatientAccess: () => async (_req, _res, next) => next(),
}));
jest.unstable_mockModule('../services/n8n.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/whatsapp-production.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/doctor-signature.service.js', () => ({ getDoctorSignatureDataUri: async () => null }));
jest.unstable_mockModule('../services/doctor-letterhead.service.js', () => ({ resolveDoctorLetterhead: async () => ({}) }));
jest.unstable_mockModule('../services/clinic-branding.service.js', () => ({ getClinicLogoDataUri: async () => null }));
jest.unstable_mockModule('../services/appointment-identity.service.js', () => ({ resolveActor: () => ({}), isOwnedByActor: () => true }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/prescription.route.js');

const app = express();
app.use(express.json());
app.use('/api/prescriptions', router);

// Shape matches the real approved-class rows. Penicillin <-> amoxicillin is the classic pair.
const PENICILLIN = {
  classKey: 'penicillin',
  label: 'Penicillins',
  members: ['amoxicillin', 'ampicillin', 'benzylpenicillin', 'phenoxymethylpenicillin'],
  brandAliases: ['amoxil', 'augmentin', 'penvee'],
  crossReactsWith: [],
};

beforeEach(() => {
  created.length = 0;
  prescriptionRepo.findById.mockReset();
  prescriptionRepo.findById.mockResolvedValue(null);
  prescriptionRepo.update.mockReset();
  poolQuery.mockReset();
  // enforce mode, so the gate is actually allowed to block.
  poolQuery.mockImplementation(async (sql) => {
    if (/FROM clinical_safety_settings/.test(sql)) return { rows: [{ mode: 'enforce' }] };
    return { rows: [] };
  });
  getAllergyStatus.mockReset();
  loadApprovedClasses.mockReset();
  getAllergyStatus.mockResolvedValue({
    status: 'known',
    allergies: [{ id: 1, allergen_name: 'Penicillin', allergen_type: 'drug', is_active: true }],
  });
  loadApprovedClasses.mockResolvedValue([PENICILLIN]);
});

const prescribe = (payload, headers = {}) => request(app).post('/api/prescriptions').set(headers).send(payload);
const AMOX = { name: 'Amoxicillin', dosage: '500 mg' };
// diagnosis is required by the route's own validator, which runs after the gate.
const rx = (medications, extra = {}) => ({ userId: 42, diagnosis: 'Acute sinusitis', medications, ...extra });

describe('WP-1.2 behavioural: an unsafe prescription is actually refused', () => {
  // The gate distinguishes DRAFT paths (create/update/from-appointment: evaluate, log, never block)
  // from ISSUING paths (issue / status-issued / emar order / practice: these can be blocked). The
  // question that matters clinically is "can an unsafe prescription actually reach a patient", so
  // the refusal assertions run against POST /:id/issue — the moment a draft becomes a real order.
  const issue = (meds, payload = {}, headers = {}) => request(app)
    .post('/api/prescriptions/1/issue').set(headers).send(payload);

  const storePrescription = (meds) => {
    prescriptionRepo.findById.mockResolvedValue({ id: 1, patientId: 42, medications: JSON.stringify(meds), status: 'draft' });
  };

  it('REFUSES to issue amoxicillin for a patient recorded allergic to penicillin', async () => {
    storePrescription([AMOX]);
    const res = await issue([AMOX]);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SAFETY_BLOCK');
    expect(res.body.blockers.length).toBeGreaterThan(0);
    // The response must say WHY, not merely that it failed.
    expect(JSON.stringify(res.body.blockers)).toMatch(/penicillin/i);
    // And the prescription must not have been issued.
    expect(prescriptionRepo.update).not.toHaveBeenCalled();
  });

  it('ALLOWS issuing an unrelated drug for the same patient', async () => {
    const safe = [{ name: 'Paracetamol', dosage: '500 mg' }];
    storePrescription(safe);
    const res = await issue(safe);
    expect(res.status).not.toBe(409);
  });

  it('a DRAFT with blockers is saved but not blocked — it is a working document', async () => {
    const res = await prescribe(rx([AMOX]));
    expect(res.status).toBe(201);
    expect(Number(res.headers['x-safety-blockers'])).toBeGreaterThan(0);
    expect(res.headers['x-safety-mode']).toBe('enforce');
  });

  it('an override with a real reason, full acknowledgement and a clinical role is accepted', async () => {
    storePrescription([AMOX]);
    const first = await issue([AMOX]);
    const codes = first.body.overrideRequires?.acknowledgedCodes || [];
    expect(codes.length).toBeGreaterThan(0);

    const res = await issue([AMOX], {
      safetyOverride: { reason: 'culture-proven allergy record is false; reviewed by medical director', acknowledgedCodes: codes },
    });
    expect(res.status).not.toBe(409);
  });

  it('refuses an override whose reason is too short', async () => {
    storePrescription([AMOX]);
    const first = await issue([AMOX]);
    const codes = first.body.overrideRequires?.acknowledgedCodes || [];
    const res = await issue([AMOX], { safetyOverride: { reason: 'because', acknowledgedCodes: codes } });
    expect(res.status).toBe(409);
    expect(prescriptionRepo.update).not.toHaveBeenCalled();
  });

  it('refuses an override that does not acknowledge every blocker', async () => {
    storePrescription([AMOX]);
    const res = await issue([AMOX], {
      safetyOverride: { reason: 'a perfectly good long enough reason for the override', acknowledgedCodes: [] },
    });
    expect(res.status).toBe(409);
  });

  it('refuses an override from a NON-clinical role', async () => {
    storePrescription([AMOX]);
    const first = await issue([AMOX]);
    const codes = first.body.overrideRequires?.acknowledgedCodes || [];
    const res = await issue([AMOX], {
      safetyOverride: { reason: 'receptionist wants this through, reason is long enough', acknowledgedCodes: codes },
    }, { 'x-role': 'receptionist' });
    // authDoctor refuses a non-doctor at 403 before the gate is even reached; the gate would give
    // 409. Either is a refusal — what must not happen is the prescription being issued.
    expect([403, 409]).toContain(res.status);
    expect(prescriptionRepo.update).not.toHaveBeenCalled();
  });

  it('shadow mode computes the blocker but still does not block an issue', async () => {
    poolQuery.mockImplementation(async (sql) => {
      // Org 999 is used here only so the 30s per-org mode cache does not return the 'enforce'
      // entry the earlier tests wrote. Shadow is the shipped default for every tenant today.
      if (/FROM clinical_safety_settings/.test(sql)) return { rows: [{ mode: 'shadow' }] };
      return { rows: [] };
    });
    storePrescription([AMOX]);
    const res = await request(app).post('/api/prescriptions/1/issue').set('x-org', '999').send({});
    expect(res.status).not.toBe(409);
    expect(res.headers['x-safety-mode']).toBe('shadow');
    expect(Number(res.headers['x-safety-shadow-blockers'])).toBeGreaterThan(0);
  });

  it('an UNKNOWN allergy status is not treated as safe', async () => {
    getAllergyStatus.mockResolvedValue({ status: 'unknown', allergies: [] });
    storePrescription([AMOX]);
    const res = await issue([AMOX]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SAFETY_ACK_REQUIRED');
  });
});
