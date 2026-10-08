import { describe, expect, it } from 'vitest';
import { formatDepartments, parseDepartments } from './wayfinding.service';

describe('wayfinding department text format', () => {
  it('parses name, aliases, steps and landmark', () => {
    expect(parseDepartments('Pharmacy | medicine, chemist | Turn right; Walk 10 m | green signboard\n\nLab')).toEqual([
      { id: 'Pharmacy', name: 'Pharmacy', aliases: ['medicine', 'chemist'], directions: ['Turn right', 'Walk 10 m'], landmark: 'green signboard' },
      { id: 'Lab', name: 'Lab', aliases: [], directions: [], landmark: undefined },
    ]);
  });

  it('round-trips', () => {
    const text = 'Pharmacy | medicine, chemist | Turn right; Walk 10 m | green signboard\nLab';
    expect(formatDepartments(parseDepartments(text))).toBe(text);
  });

  it('parses and round-trips floor-map placement, capacity and zone', () => {
    const text = 'Emergency | casualty, er | Straight ahead | red doors | 12,68 | 10 | er\nPharmacy |  |  |  | 80,70';
    const parsed = parseDepartments(text);
    expect(parsed[0]).toMatchObject({ name: 'Emergency', x: 12, y: 68, capacity: 10, zone: 'er', landmark: 'red doors' });
    expect(parsed[1]).toMatchObject({ name: 'Pharmacy', x: 80, y: 70 });
    expect(parsed[1].capacity).toBeUndefined();
    expect(formatDepartments(parsed)).toBe('Emergency | casualty, er | Straight ahead | red doors | 12,68 | 10 | er\nPharmacy |  |  |  | 80,70');
    expect(parseDepartments(formatDepartments(parsed))).toEqual(parsed);
  });
});
