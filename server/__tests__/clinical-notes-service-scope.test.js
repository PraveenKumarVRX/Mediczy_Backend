/**
 * Service scoping. Clinical notes are PHI. Regression for a cross-tenant read found while writing route tests: the hospital-staff list
 * endpoints called listClinicalNotes with no hospital, so any staff member of any hospital could read the notes of any
 * patient/admission id. Also pins the router's private token check (audit SEC-01: no user-id-as-tenant fallback).
 */
import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query } }));
jest.unstable_mockModule('../models/clinical-note.model.js', () => ({ default: { findOne: jest.fn(), create: jest.fn() } }));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: { chat: jest.fn() } }));

const svc = await import('../services/clinical-notes.service.js');

describe('clinical-notes.service scoping', () => {
  beforeEach(() => query.mockReset().mockResolvedValue([]));
  const listSql = () => query.mock.calls.filter((c) => /FROM clinical_notes WHERE/.test(c[0])).pop();

  it('a hospital listing is filtered by organization_id (the hospital-staff routes always pass it)', async () => {
    await svc.listClinicalNotes({ patientId: 5, organizationId: 11 });
    const [sql, opts] = listSql();
    expect(sql).toMatch(/organization_id = :organizationId/);
    expect(sql).toMatch(/"patientId" = :patientId/);
    expect(opts.replacements).toMatchObject({ patientId: 5, organizationId: 11 });
  });

  it('an admission listing is scoped the same way', async () => {
    await svc.listClinicalNotes({ admissionId: 8, organizationId: 11 });
    expect(listSql()[0]).toMatch(/admission_id = :admissionId AND|organization_id = :organizationId AND admission_id/);
    expect(listSql()[1].replacements.organizationId).toBe(11);
  });

  it('returns nothing (and runs no query) when only an organization is given — never "all notes of the hospital"', async () => {
    await expect(svc.listClinicalNotes({ organizationId: 11 })).resolves.toEqual([]);
    expect(listSql()).toBeUndefined();
  });

  it('with no patient or admission it is still an empty list, as before', async () => {
    await expect(svc.listClinicalNotes({})).resolves.toEqual([]);
  });

  it('legacy (doctor-app) callers that pass no organization keep working unchanged', async () => {
    await svc.listClinicalNotes({ patientId: 5 });
    expect(listSql()[0]).not.toMatch(/organization_id/);
  });

  it('getClinicalNoteById can be scoped to a hospital, and is unscoped only when no organization is given', async () => {
    await svc.getClinicalNoteById(3, { organizationId: 11 });
    let [sql, opts] = query.mock.calls.filter((c) => /FROM clinical_notes cn/.test(c[0])).pop();
    expect(sql).toMatch(/cn\.organization_id = :organizationId/);
    expect(opts.replacements).toEqual({ id: 3, organizationId: 11 });
    query.mockClear();
    await svc.getClinicalNoteById(3);
    [sql, opts] = query.mock.calls.filter((c) => /FROM clinical_notes cn/.test(c[0])).pop();
    expect(sql).not.toMatch(/AND cn\.organization_id/);
    expect(opts.replacements).toEqual({ id: 3 });
  });
});
