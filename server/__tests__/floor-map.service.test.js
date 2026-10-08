import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query } }));
jest.unstable_mockModule('../services/hypergrid-twins.service.js', () => ({ listTwins: jest.fn().mockResolvedValue([]) }));

const { buildNodes, getFloorMap } = await import('../services/floor-map.service.js');
const { validateFloor } = await import('../services/wayfinding.service.js');

const floors = [
  { floor_number: 0, floor_name: 'Ground', departments: [
    { id: 'er', name: 'Emergency', zone: 'er', x: 12, y: 68, capacity: 10 },
    { id: 'opd', name: 'OPD', zone: 'opd', x: 45, y: 55, capacity: 40 },
    { id: 'pharmacy', name: 'Pharmacy', zone: 'pharmacy', x: 80, y: 70 },
    { id: 'lab', name: 'Lab' }, // not placed on the map
  ] },
  { floor_number: 3, floor_name: 'Third', departments: [{ id: 'ot', name: 'Operation Theatre', zone: 'ot', x: 55, y: 18 }] },
];

beforeEach(() => query.mockReset());

describe('buildNodes', () => {
  const occupancy = { queue: { er: 5, opd: 36 }, ot: { active: 4, busy: 3 } };

  it('only shows placed departments and never invents occupancy', () => {
    const nodes = buildNodes({ floors, occupancy });
    expect(nodes.map((n) => n.id)).toEqual(['er', 'opd', 'pharmacy', 'ot']);
    const pharmacy = nodes.find((n) => n.id === 'pharmacy');
    expect(pharmacy).toMatchObject({ occupied: null, utilizationPct: null, status: 'unknown' });
  });

  it('derives utilization from real sources and configured capacity', () => {
    const nodes = Object.fromEntries(buildNodes({ floors, occupancy }).map((n) => [n.id, n]));
    expect(nodes.er).toMatchObject({ occupied: 5, capacity: 10, utilizationPct: 50, status: 'moderate' });
    expect(nodes.opd).toMatchObject({ utilizationPct: 90, status: 'critical' });
    expect(nodes.ot).toMatchObject({ occupied: 3, capacity: 4, utilizationPct: 75, status: 'busy', floor: '3' });
  });

  it('filters by floor label', () => {
    expect(buildNodes({ floors, floor: '3', occupancy }).map((n) => n.id)).toEqual(['ot']);
    expect(buildNodes({ floors, floor: 'G', occupancy }).length).toBe(3);
  });
});

describe('getFloorMap', () => {
  it('returns no nodes when the hospital has not configured any floor', async () => {
    query.mockResolvedValue({ rows: [] });
    const r = await getFloorMap(3, 'all');
    expect(r).toMatchObject({ configured: false, nodes: [], live: false });
  });

  it('scopes every query to the organization and flags live only with real counts', async () => {
    query
      .mockResolvedValueOnce({ rows: floors })                                        // hospital_floor_maps
      .mockResolvedValueOnce({ rows: [{ department: 'er', c: 2 }] })                  // queue
      .mockResolvedValueOnce({ rows: [{ status: 'in_progress' }, { status: 'free' }] }); // ot_rooms
    const r = await getFloorMap(11, 'all');
    for (const call of query.mock.calls) expect(call[1]).toEqual([11]);
    expect(r.live).toBe(true);
    expect(r.nodes.find((n) => n.id === 'er').occupied).toBe(2);
    expect(r.nodes.find((n) => n.id === 'opd').occupied).toBe(0);
    expect(r.nodes.find((n) => n.id === 'ot')).toMatchObject({ occupied: 1, capacity: 2 });
  });

  it('is not live and shows unknown when queue and OT sources are unavailable', async () => {
    query.mockResolvedValueOnce({ rows: floors }).mockRejectedValue(new Error('relation missing'));
    const r = await getFloorMap(11, 'all');
    expect(r.live).toBe(false);
    expect(r.nodes.every((n) => n.status === 'unknown')).toBe(true);
  });
});

describe('validateFloor placement fields', () => {
  it('accepts x,y,capacity,zone and rejects out-of-range values', () => {
    const ok = validateFloor({ floorNumber: 0, departments: [{ name: 'ER', x: 10, y: 60, capacity: 12, zone: 'ER' }] });
    expect(ok.value.departments[0]).toMatchObject({ x: 10, y: 60, capacity: 12, zone: 'er' });
    expect(validateFloor({ floorNumber: 0, departments: [{ name: 'ER', x: 120, y: 5 }] }).error).toMatch(/x must be/);
    expect(validateFloor({ floorNumber: 0, departments: [{ name: 'ER', x: 5 }] }).error).toMatch(/y 0-80/);
    expect(validateFloor({ floorNumber: 0, departments: [{ name: 'ER', capacity: 0 }] }).error).toMatch(/capacity/);
    expect(validateFloor({ floorNumber: 0, departments: [{ name: 'ER', zone: 'moon' }] }).error).toMatch(/zone must be/);
  });
});
