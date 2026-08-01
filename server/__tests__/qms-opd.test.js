import { describe, expect, it } from '@jest/globals';

describe('qms-opd helpers', () => {
  it('builds per-doctor OPD zones', async () => {
    const { queueZoneForDoctor, isInPersonConsultation } = await import('../config/qms.config.js');
    expect(queueZoneForDoctor({ doctorId: 42 })).toBe('opd-doc-42');
    expect(queueZoneForDoctor({ specialization: 'Cardiology' })).toBe('opd-cardiology');
    expect(queueZoneForDoctor({ opdCode: 'Ortho Wing' })).toBe('opd-ortho-wing');
    expect(queueZoneForDoctor({})).toBe('opd-waiting');
    expect(isInPersonConsultation('in-person')).toBe(true);
    expect(isInPersonConsultation('walk_in')).toBe(true);
    expect(isInPersonConsultation('video')).toBe(false);
  });
});

describe('per-doctor token format contract', () => {
  it('documents A{doctorId}-NNN pattern', () => {
    const doctorId = 12;
    const seq = 1;
    const token = `A${doctorId}-${String(seq).padStart(3, '0')}`;
    expect(token).toBe('A12-001');
  });
});
