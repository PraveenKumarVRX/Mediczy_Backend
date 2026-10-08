import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));

const svc = await import('../services/wayfinding.service.js');

const floors = [
  { floor_number: 0, floor_name: 'Ground Floor', departments: [
    { id: 'pharmacy', name: 'Pharmacy', aliases: ['medicine', 'chemist'], directions: ['Turn right after reception.'], landmark: 'green signboard' },
    { id: 'emergency', name: 'Emergency', aliases: ['er', 'casualty'] },
  ] },
  { floor_number: 2, floor_name: 'Second Floor', departments: [
    { id: 'cardiology', name: 'Cardiology', aliases: ['heart'] },
  ] },
];

beforeEach(() => query.mockReset());

describe('findDestination', () => {
  it('matches names, aliases and phrases', () => {
    expect(svc.findDestination(floors, 'pharmacy').dept.id).toBe('pharmacy');
    expect(svc.findDestination(floors, 'where can I buy medicine').dept.id).toBe('pharmacy');
    expect(svc.findDestination(floors, 'I need the heart doctor').dept.id).toBe('cardiology');
  });
  it('returns null for unknown places', () => {
    expect(svc.findDestination(floors, 'swimming pool')).toBeNull();
    expect(svc.findDestination(floors, '')).toBeNull();
  });
});

describe('buildDirections', () => {
  it('uses configured directions and landmark, with no floor change on the ground floor', () => {
    const steps = svc.buildDirections(svc.findDestination(floors, 'pharmacy'));
    expect(steps).toEqual(['Turn right after reception.', 'Look for: green signboard.']);
  });
  it('adds the floor hop above ground and falls back to signage without invented turns', () => {
    const steps = svc.buildDirections(svc.findDestination(floors, 'cardiology'));
    expect(steps).toEqual(['Take the lift or stairs to Second Floor.', 'Follow the signs for Cardiology.']);
  });
});

describe('answerQuery', () => {
  it('says to ask at reception when the hospital has no map (and is not marked AI-assisted)', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] });
    const r = await svc.answerQuery({ organizationId: 3, query: 'cardiology' });
    expect(r).toMatchObject({ configured: false, matched: false, aiAssisted: false, zone: 'lobby' });
    expect(r.direction).toMatch(/reception/i);
  });

  it('scopes the lookup to the organization and returns configured steps', async () => {
    query.mockResolvedValueOnce({ rows: floors }).mockResolvedValue({ rows: [] });
    const r = await svc.answerQuery({ organizationId: 3, query: 'pharmacy please' });
    expect(query.mock.calls[0][1]).toEqual([3]);
    expect(r).toMatchObject({ configured: true, matched: true, destination: 'Pharmacy' });
    expect(r.steps[0]).toBe('Turn right after reception.');
  });

  it('reports a miss honestly', async () => {
    query.mockResolvedValueOnce({ rows: floors }).mockResolvedValue({ rows: [] });
    const r = await svc.answerQuery({ organizationId: 3, query: 'swimming pool' });
    expect(r).toMatchObject({ configured: true, matched: false });
    expect(r.direction).toMatch(/could not find/i);
  });

  it('treats a missing table as "no maps configured"', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' })).mockResolvedValue({ rows: [] });
    const r = await svc.answerQuery({ organizationId: 3, query: 'pharmacy' });
    expect(r.configured).toBe(false);
  });
});

describe('validateFloor', () => {
  it('rejects bad floor numbers and nameless departments', () => {
    expect(svc.validateFloor({ floorNumber: 'x' }).error).toBeTruthy();
    expect(svc.validateFloor({ floorNumber: 1, departments: [{ name: '' }] }).error).toBeTruthy();
  });
  it('normalizes departments', () => {
    const { value } = svc.validateFloor({ floorNumber: 1, departments: [{ name: ' Lab ', aliases: ['blood test', ''], directions: ['Go left'] }] });
    expect(value.departments[0]).toMatchObject({ id: 'Lab', name: 'Lab', aliases: ['blood test'], directions: ['Go left'] });
  });
});
