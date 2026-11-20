/**
 * Days a health check-up cannot be booked: every Sunday, and the national and main festival
 * holidays in health_checkup_holidays (owner decision 2026-11-20). Dates are calendar dates
 * ('YYYY-MM-DD', India). Team staff may override for an emergency; members cannot.
 */
import { postgresSequelize } from '../db/postgres-sequelize.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, byDate: new Map() };

export const isSunday = (date) => ISO.test(String(date)) && new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** Active holidays by date. A missing table (before the migration) leaves Sundays still blocked. */
export async function activeHolidays() {
  if (Date.now() - cache.at < CACHE_MS) return cache.byDate;
  try {
    const rows = await postgresSequelize.query(
      `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS date, name, kind, provisional
         FROM health_checkup_holidays WHERE is_active`,
      { type: postgresSequelize.QueryTypes.SELECT }
    );
    cache = { at: Date.now(), byDate: new Map(rows.map((r) => [r.date, r])) };
  } catch (error) {
    console.error('[checkup-calendar] holiday list unavailable:', error.message);
    cache = { at: Date.now(), byDate: new Map() };
  }
  return cache.byDate;
}

export const clearHolidayCache = () => { cache = { at: 0, byDate: new Map() }; };

/** Why a check-up cannot be booked on this date, or null when it can. */
export async function checkupDateBlock(date) {
  if (!ISO.test(String(date))) return null;
  if (isSunday(date)) {
    return { code: 'checkup_closed_sunday', kind: 'sunday', message: 'Health check-ups are not available on Sundays. Please choose another date.' };
  }
  const holiday = (await activeHolidays()).get(date);
  if (holiday) {
    return {
      code: 'checkup_closed_holiday',
      kind: holiday.kind,
      holiday: holiday.name,
      message: `Health check-ups are not available on ${holiday.name}. Please choose another date.`,
    };
  }
  return null;
}

/** Every closed date in [from, to] (at most 366 days), for the app's date picker. */
export async function closedDates(from, to) {
  if (!ISO.test(String(from)) || !ISO.test(String(to)) || to < from) return [];
  const holidays = await activeHolidays();
  const out = [];
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = new Date(`${from}T00:00:00Z`), n = 0; d <= end && n < 366; d.setUTCDate(d.getUTCDate() + 1), n += 1) {
    const date = d.toISOString().slice(0, 10);
    const holiday = holidays.get(date);
    if (holiday) out.push({ date, kind: holiday.kind, name: holiday.name, provisional: holiday.provisional });
    else if (d.getUTCDay() === 0) out.push({ date, kind: 'sunday', name: 'Sunday', provisional: false });
  }
  return out;
}
