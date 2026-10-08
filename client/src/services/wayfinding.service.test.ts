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
});
