import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();
const schedule = jest.fn(() => ({ stop: jest.fn() }));
const withCronLease = jest.fn();

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({ postgresSequelize: { query } }));
jest.unstable_mockModule('node-cron', () => ({ default: { schedule } }));
jest.unstable_mockModule('../services/cron-lease.service.js', () => ({ withCronLease }));

const { default: reportBuilderService } = await import('../services/report-builder.service.js');

beforeEach(() => {
  query.mockReset(); schedule.mockClear(); withCronLease.mockReset();
  for (const entry of reportBuilderService.scheduledReports.values()) entry.task.stop();
  reportBuilderService.scheduledReports.clear();
});

describe('durable report schedules', () => {
  it('stores a valid recurring schedule before registering its in-process cron trigger', async () => {
    query.mockResolvedValueOnce([[]]);
    const result = await reportBuilderService.scheduleReport({
      scheduleId: 'SCHED-WEEKLY', name: 'Weekly usage', schedule: '0 8 * * 1',
      reportConfig: { templateId: 'usage_summary' }, recipients: ['reports@example.test'], enabled: true,
    });

    expect(result).toMatchObject({ scheduleId: 'SCHED-WEEKLY', status: 'scheduled' });
    expect(query.mock.calls[0][0]).toContain('INSERT INTO scheduled_reports');
    expect(query.mock.calls[0][1].replacements).toMatchObject({ scheduleId: 'SCHED-WEEKLY', name: 'Weekly usage' });
    expect(schedule).toHaveBeenCalledWith('0 8 * * 1', expect.any(Function));
  });

  it('rehydrates enabled schedules from the database after a restart', async () => {
    query.mockResolvedValueOnce([[{
      schedule_id: 'SCHED-DAILY', name: 'Daily usage', report_config: { templateId: 'usage_summary' },
      cron_schedule: '0 8 * * *', recipients: [], enabled: true, created_at: '2026-11-09T00:00:00.000Z',
    }]]);

    const restored = await reportBuilderService.startScheduledReports();

    expect(restored).toBe(1);
    expect(reportBuilderService.scheduledReports.has('SCHED-DAILY')).toBe(true);
    expect(schedule).toHaveBeenCalledWith('0 8 * * *', expect.any(Function));
  });
});
