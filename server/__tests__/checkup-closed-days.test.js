/**
 * Owner decision 2026-11-20: corporate annual health check-ups cannot be booked on Sundays or on
 * national and main festival holidays. Members cannot override; Team staff can, with a reason.
 */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query, QueryTypes: { SELECT: 'SELECT' } },
}));

const cal = await import('../services/checkup-calendar.service.js');
const { FY_2026_27 } = await import('../migrations/20261120000400-health-checkup-holidays.migration.js');

const HOLIDAYS = [
  { date: '2026-12-25', name: 'Christmas Day', kind: 'festival', provisional: false },
  { date: '2027-01-26', name: 'Republic Day', kind: 'national', provisional: false },
  { date: '2027-03-10', name: 'Id-ul-Fitr', kind: 'festival', provisional: true },
];

beforeEach(() => {
  cal.clearHolidayCache();
  query.mockReset().mockResolvedValue(HOLIDAYS);
});

describe('closed days', () => {
  test('every Sunday is closed', async () => {
    for (const sunday of ['2026-11-22', '2026-11-29', '2027-01-03', '2027-03-28']) {
      expect(cal.isSunday(sunday)).toBe(true);
      expect(await cal.checkupDateBlock(sunday)).toMatchObject({ code: 'checkup_closed_sunday', kind: 'sunday' });
    }
  });

  test('national and festival holidays are closed and named', async () => {
    expect(await cal.checkupDateBlock('2026-12-25')).toMatchObject({ code: 'checkup_closed_holiday', holiday: 'Christmas Day' });
    expect(await cal.checkupDateBlock('2027-01-26')).toMatchObject({ code: 'checkup_closed_holiday', kind: 'national' });
    expect((await cal.checkupDateBlock('2027-01-26')).message).toContain('Republic Day');
  });

  test('an ordinary weekday or Saturday is open', async () => {
    expect(await cal.checkupDateBlock('2026-11-23')).toBeNull(); // Monday
    expect(await cal.checkupDateBlock('2026-11-28')).toBeNull(); // Saturday
  });

  test('without the holiday table, Sundays are still closed and weekdays open', async () => {
    cal.clearHolidayCache();
    query.mockRejectedValue(new Error('relation "health_checkup_holidays" does not exist'));
    expect(await cal.checkupDateBlock('2026-11-22')).toMatchObject({ code: 'checkup_closed_sunday' });
    expect(await cal.checkupDateBlock('2026-12-25')).toBeNull();
  });

  test('the date picker list has every Sunday and holiday in the range, in order', async () => {
    const dates = await cal.closedDates('2026-12-20', '2027-01-31');
    expect(dates.map((d) => d.date)).toEqual(['2026-12-20', '2026-12-25', '2026-12-27', '2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24', '2027-01-26', '2027-01-31']);
    expect(dates.find((d) => d.date === '2026-12-25')).toMatchObject({ kind: 'festival', name: 'Christmas Day' });
    expect(await cal.closedDates('2027-02-01', '2027-01-01')).toEqual([]);
  });
});

describe('seeded holidays for FY 2026-27', () => {
  test('cover the three national holidays and the main festivals, with real dates', () => {
    const names = FY_2026_27.map(([, name]) => name).join(' | ');
    for (const n of ['Independence Day', "Mahatma Gandhi's Birthday", 'Republic Day', 'Diwali', 'Christmas Day', 'Holi', 'Id-ul-Fitr']) expect(names).toContain(n);
    for (const [date] of FY_2026_27) {
      expect(date >= '2026-04-01' && date <= '2027-03-31').toBe(true);
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
    }
    expect(FY_2026_27.filter(([, , kind]) => kind === 'national').map(([d]) => d)).toEqual(['2026-08-15', '2026-10-02', '2027-01-26']);
  });
});

describe('every booking path checks the date', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  test('member slots, booking and rescheduling refuse closed days (no override)', () => {
    const route = read('../routes/health-checkup.route.js');
    expect(route.match(/await checkupDateBlock\(/g)).toHaveLength(3);
    expect(route).toContain('closed:true,code:closedDay.code');
    expect(route).toContain("router.get('/closed-dates', authUser");
    expect(route).not.toContain('overrideReason');
  });
  test('team bookings refuse closed days unless an emergency reason is given, and record it', () => {
    const route = read('../routes/corporate-bookings.route.js');
    expect(route).toContain('if (closedDay && override.length < 10)');
    expect(route).toContain('CLOSED-DAY OVERRIDE');
    expect(route).toContain('${overrideNote}');
  });
});
