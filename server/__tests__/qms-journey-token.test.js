process.env.NODE_ENV = 'test';
process.env.HOSPITAL_DEFAULT_ORG_ID = '7';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn();
const poolConnect = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({
  default: {
    query: (...args) => poolQuery(...args),
    connect: (...args) => poolConnect(...args),
  },
}));

jest.unstable_mockModule('../services/display-sse-broker.service.js', () => ({
  pushQueueEvent: jest.fn(),
  pushToZone: jest.fn(),
}));

jest.unstable_mockModule('../services/queue-notify.service.js', () => ({
  notifyQueueCheckIn: jest.fn().mockResolvedValue(undefined),
  notifyTokenCalled: jest.fn().mockResolvedValue(undefined),
  refreshPositionNotifications: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../migrations/20260617-hospital-queue-os.migration.js', () => ({
  up: async () => {},
}));
jest.unstable_mockModule('../migrations/20260801-qms-hardening.migration.js', () => ({
  up: async () => {},
}));
jest.unstable_mockModule('../migrations/20260807-qms-journey-token.migration.js', () => ({
  up: async () => {},
}));

const {
  nextJourneyToken,
  transferToDepartment,
  findJourneyByToken,
  JOURNEY_DEPARTMENTS,
} = await import('../services/hospital-queue.service.js');

function mockClient(seq = 1) {
  return {
    query: jest.fn(async (sql) => {
      if (String(sql).includes('BEGIN') || String(sql).includes('COMMIT') || String(sql).includes('ROLLBACK')) {
        return { rows: [] };
      }
      if (String(sql).includes('hospital_queue_journey_sequences')) {
        return { rows: [{ last_seq: seq }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
}

describe('QMS journey token', () => {
  beforeEach(() => {
    poolQuery.mockReset();
    poolConnect.mockReset();
  });

  it('exposes journey departments', () => {
    expect(JOURNEY_DEPARTMENTS).toEqual(
      expect.arrayContaining(['opd', 'lab', 'radiology', 'pharmacy']),
    );
  });

  it('mints T-### journey tokens', async () => {
    const client = mockClient(14);
    poolConnect.mockResolvedValue(client);
    const token = await nextJourneyToken(7);
    expect(token).toBe('T-014');
  });

  it('findJourneyByToken returns active stop + history', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          organization_id: 7,
          department: 'opd',
          token_number: 'T-003',
          journey_token: 'T-003',
          journey_id: '11111111-1111-1111-1111-111111111111',
          step_order: 1,
          status: 'completed',
          patient_name: 'Riya',
          queue_zone: 'opd-waiting',
          metadata: {},
        },
        {
          id: 2,
          organization_id: 7,
          department: 'lab',
          token_number: 'T-003',
          journey_token: 'T-003',
          journey_id: '11111111-1111-1111-1111-111111111111',
          step_order: 2,
          status: 'waiting',
          patient_name: 'Riya',
          queue_zone: 'lab-waiting',
          metadata: {},
        },
      ],
    });

    const journey = await findJourneyByToken(7, 't-003');
    expect(journey.journeyToken).toBe('T-003');
    expect(journey.currentDepartment).toBe('lab');
    expect(journey.active.department).toBe('lab');
    expect(journey.steps).toHaveLength(2);
  });

  it('transferToDepartment reuses the same public token', async () => {
    const client = mockClient(1);
    poolConnect.mockResolvedValue(client);

    const opdRow = {
      id: 10,
      organization_id: 7,
      department: 'opd',
      token_number: 'T-021',
      journey_token: 'T-021',
      journey_id: '22222222-2222-2222-2222-222222222222',
      step_order: 1,
      status: 'serving',
      patient_name: 'Asha',
      patient_id: 55,
      queue_zone: 'opd-waiting',
      metadata: { notifyPhone: '9884089921' },
    };
    const labRow = {
      id: 11,
      organization_id: 7,
      department: 'lab',
      token_number: 'T-021',
      journey_token: 'T-021',
      journey_id: '22222222-2222-2222-2222-222222222222',
      step_order: 2,
      status: 'waiting',
      patient_name: 'Asha',
      patient_id: 55,
      queue_zone: 'lab-waiting',
      parent_entry_id: 10,
      metadata: {},
    };

    poolQuery.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM hospital_queue_entries WHERE id =') && s.includes('organization_id')) {
        return { rows: [{ ...opdRow }] };
      }
      if (s.includes("status IN ('waiting','called','serving')") && s.includes('journey_id')) {
        return { rows: [] };
      }
      if (s.includes("SET status = 'completed'")) {
        return { rows: [{ ...opdRow, status: 'completed' }] };
      }
      if (s.includes('SET next_department')) {
        return { rows: [] };
      }
      if (s.includes('INSERT INTO hospital_queue_entries')) {
        return { rows: [labRow] };
      }
      // board / wait estimates / counters
      return { rows: [{ c: 0, avg_minutes: 10, counter_id: 'C1' }] };
    });

    const result = await transferToDepartment(10, 7, 'lab');
    expect(result.to.tokenNumber).toBe('T-021');
    expect(result.to.department).toBe('lab');
    expect(result.from.status).toBe('completed');
    expect(result.to.stepOrder).toBe(2);
  });
});
