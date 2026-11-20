/**
 * Women's health: opt-in setting, period log and cycle estimates for the member app.
 *
 * Estimates use the member's own logged periods (calendar arithmetic, no model): the average
 * gap between logged period starts, ovulation 14 days before the next expected period and a
 * fertile window from 5 days before to 1 day after it. With fewer than two logged periods the
 * member's own cycle-length setting is used. Estimates are paused while pregnant or breastfeeding.
 *
 * Signs are fixed, guideline thresholds on what the member logged (period over 7 days, very
 * heavy flow, cycles under 21 or over 35 days, cycle length varying by more than 9 days, a
 * period 7+ days late). They return a code and a referral suggestion, never a diagnosis; the
 * wording the app shows needs clinical review. General wellness, not SaMD (CLAUDE.md table).
 *
 * Both tables are FORCED RLS, so every query runs in withRlsTransaction for the member.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

export const STATUSES = ['NONE', 'MENSTRUATION', 'OVULATION', 'PREGNANCY', 'LACTATION'];
export const FLOWS = ['light', 'medium', 'heavy', 'very_heavy'];
export const SYMPTOMS = [
  'cramps', 'headache', 'bloating', 'acne', 'back_pain', 'breast_tenderness', 'fatigue',
  'mood_changes', 'nausea', 'spotting', 'food_cravings', 'insomnia',
];
export const DEFAULTS = { enabled: false, cycleLengthDays: 28, periodLengthDays: 5, status: 'NONE' };
const HISTORY_LIMIT = 24;
const DAY = 86400000;

export class WomensHealthError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// ---- dates (calendar days, UTC midnight, so no time zone can shift a day) -------------
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const parseDate = (value) => {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value !== 'string' || !ISO.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
};
export const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / DAY);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Today's calendar date in India, where the members are. */
export const todayIST = (now = new Date()) => parseDate(new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10));

// ---- shapes ------------------------------------------------------------------------------
const settingsOut = (row) => (row ? {
  enabled: row.enabled,
  cycleLengthDays: row.cycle_length_days,
  periodLengthDays: row.period_length_days,
  status: row.status,
  updatedAt: row.updated_at,
} : null);

const cycleOut = (row) => {
  const start = parseDate(row.period_start);
  const end = row.period_end ? parseDate(row.period_end) : null;
  return {
    id: Number(row.id),
    periodStart: iso(start),
    periodEnd: iso(end),
    periodLengthDays: end ? daysBetween(start, end) + 1 : null,
    flow: row.flow,
    symptoms: row.symptoms || [],
    notes: row.notes,
    updatedAt: row.updated_at,
  };
};

// ---- estimates and signs (pure) ----------------------------------------------------------
/**
 * @param {{cycleLengthDays:number, periodLengthDays:number, status:string}} settings
 * @param {Array<{periodStart:string, periodEnd:string|null, periodLengthDays:number|null, flow:string|null}>} cycles newest first
 */
export function buildEstimates(settings, cycles, today = todayIST()) {
  const starts = cycles.map((c) => parseDate(c.periodStart)).sort((a, b) => a - b);
  // Gaps of 15-60 days are cycles; a longer gap is most likely a period that was not logged.
  const gaps = [];
  for (let i = 1; i < starts.length; i += 1) {
    const gap = daysBetween(starts[i - 1], starts[i]);
    if (gap >= 15 && gap <= 60) gaps.push(gap);
  }
  const recentGaps = gaps.slice(-6);
  const lengths = cycles.map((c) => c.periodLengthDays).filter(Boolean).slice(0, 6);

  const cycleLengthDays = recentGaps.length ? Math.round(mean(recentGaps)) : settings.cycleLengthDays;
  const periodLengthDays = lengths.length ? Math.round(mean(lengths)) : settings.periodLengthDays;
  const basedOn = recentGaps.length ? 'logged_cycles' : 'settings';
  const lastStart = starts.at(-1) || null;
  const paused = settings.status === 'PREGNANCY' || settings.status === 'LACTATION';

  const result = {
    basedOn,
    cyclesUsed: recentGaps.length,
    cycleLengthDays,
    periodLengthDays,
    lastPeriodStart: iso(lastStart),
    cycleDay: null,
    expectedPeriodStart: null,
    daysLate: 0,
    upcoming: [],
    paused,
  };
  if (!lastStart || paused) return result;

  const sinceStart = daysBetween(lastStart, today);
  if (sinceStart >= 0 && sinceStart < 90) result.cycleDay = sinceStart + 1;

  const expected = addDays(lastStart, cycleLengthDays);
  result.expectedPeriodStart = iso(expected);
  result.daysLate = Math.max(0, daysBetween(expected, today));

  // Next three periods that have not already ended.
  let next = expected;
  while (daysBetween(addDays(next, periodLengthDays - 1), today) > 0) next = addDays(next, cycleLengthDays);
  for (let i = 0; i < 3; i += 1) {
    const start = addDays(next, i * cycleLengthDays);
    const ovulation = addDays(start, -14);
    result.upcoming.push({
      periodStart: iso(start),
      periodEnd: iso(addDays(start, periodLengthDays - 1)),
      ovulationDay: iso(ovulation),
      fertileWindowStart: iso(addDays(ovulation, -5)),
      fertileWindowEnd: iso(addDays(ovulation, 1)),
    });
  }
  return result;
}

const SIGN = (code, message) => ({ code, message, suggestion: 'consult_gynaecologist' });

/** Signs worth raising with a gynaecologist, from what the member logged. */
export function buildSigns(settings, cycles, estimates) {
  const signs = [];
  const recent = cycles.slice(0, 3);
  if (recent.some((c) => c.periodLengthDays > 7)) signs.push(SIGN('PERIOD_OVER_7_DAYS', 'A recent period lasted more than 7 days.'));
  if (recent.some((c) => c.flow === 'very_heavy')) signs.push(SIGN('VERY_HEAVY_FLOW', 'A recent period was logged as very heavy.'));

  const starts = cycles.map((c) => parseDate(c.periodStart)).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < starts.length; i += 1) {
    const gap = daysBetween(starts[i - 1], starts[i]);
    if (gap >= 15 && gap <= 60) gaps.push(gap);
  }
  const recentGaps = gaps.slice(-6);
  if (recentGaps.length >= 2) {
    const avg = mean(recentGaps);
    if (avg < 21) signs.push(SIGN('CYCLE_UNDER_21_DAYS', 'Your cycles average under 21 days.'));
    if (avg > 35) signs.push(SIGN('CYCLE_OVER_35_DAYS', 'Your cycles average over 35 days.'));
  }
  if (recentGaps.length >= 3 && Math.max(...recentGaps) - Math.min(...recentGaps) > 9) {
    signs.push(SIGN('CYCLE_LENGTH_VARIES', 'Your cycle length varies by more than 9 days.'));
  }
  if (!estimates.paused && estimates.daysLate >= 7) {
    signs.push(SIGN('PERIOD_LATE', `Your period is ${estimates.daysLate} days later than expected.`));
  }
  return signs;
}

// ---- validation --------------------------------------------------------------------------
const bad = (message) => new WomensHealthError(400, 'invalid_request', message);

export function validateSettings(body = {}) {
  const out = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') throw bad('enabled must be true or false');
    out.enabled = body.enabled;
  }
  for (const [key, min, max] of [['cycleLengthDays', 15, 60], ['periodLengthDays', 1, 15]]) {
    if (body[key] === undefined) continue;
    if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max) throw bad(`${key} must be a whole number from ${min} to ${max}`);
    out[key] = body[key];
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw bad(`status must be one of ${STATUSES.join(', ')}`);
    out.status = body.status;
  }
  if (!Object.keys(out).length) throw bad('Nothing to save');
  return out;
}

export function validateCycle(body = {}, { partial = false, today = todayIST() } = {}) {
  const out = {};
  if (body.periodStart !== undefined || !partial) {
    const start = parseDate(body.periodStart);
    if (!start) throw bad('periodStart must be a date (YYYY-MM-DD)');
    if (start > today) throw bad('periodStart cannot be in the future');
    out.periodStart = iso(start);
  }
  if (body.periodEnd !== undefined) {
    if (body.periodEnd === null) out.periodEnd = null;
    else {
      const end = parseDate(body.periodEnd);
      if (!end) throw bad('periodEnd must be a date (YYYY-MM-DD) or null');
      if (end > addDays(today, 1)) throw bad('periodEnd cannot be in the future');
      out.periodEnd = iso(end);
    }
  }
  if (out.periodStart && out.periodEnd) {
    const length = daysBetween(parseDate(out.periodStart), parseDate(out.periodEnd));
    if (length < 0) throw bad('periodEnd cannot be before periodStart');
    if (length > 30) throw bad('A period cannot be logged as longer than 31 days');
  }
  if (body.flow !== undefined) {
    if (body.flow !== null && !FLOWS.includes(body.flow)) throw bad(`flow must be one of ${FLOWS.join(', ')}`);
    out.flow = body.flow;
  }
  if (body.symptoms !== undefined) {
    if (!Array.isArray(body.symptoms) || body.symptoms.some((s) => !SYMPTOMS.includes(s))) {
      throw bad(`symptoms must be a list from ${SYMPTOMS.join(', ')}`);
    }
    out.symptoms = [...new Set(body.symptoms)];
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 500)) throw bad('notes must be text of up to 500 characters');
    out.notes = body.notes === null ? null : body.notes.trim() || null;
  }
  if (partial && !Object.keys(out).length) throw bad('Nothing to save');
  return out;
}

// ---- data access -------------------------------------------------------------------------
const asMember = (userId, fn) => withRlsTransaction(pool, { userId }, fn);

async function readState(client, userId) {
  const [{ rows: [settings] }, { rows: cycles }] = await Promise.all([
    client.query('SELECT * FROM womens_health_settings WHERE user_id = $1', [userId]),
    client.query(`SELECT id, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end,
                         flow, symptoms, notes, updated_at
                    FROM menstrual_cycle_logs WHERE user_id = $1 ORDER BY period_start DESC LIMIT ${HISTORY_LIMIT}`, [userId]),
  ]);
  return { settings, cycles: cycles.map(cycleOut) };
}

/** Everything the screen needs in one call. */
export async function getOverview(userId, { gender } = {}) {
  const { settings, cycles } = await asMember(userId, (client) => readState(client, userId));
  const effective = settingsOut(settings) || { ...DEFAULTS, updatedAt: null };
  const estimates = buildEstimates(effective, cycles);
  return {
    settings: effective,
    // Never stored for the member: a hint for the first visit only. Gender on file is
    // unreliable (bulk uploads default it), so the app should still let anyone turn this on.
    suggestEnable: !settings && String(gender || '').toLowerCase() === 'female',
    cycles,
    estimates,
    signs: buildSigns(effective, cycles, estimates),
    options: { statuses: STATUSES, flows: FLOWS, symptoms: SYMPTOMS },
  };
}

export async function saveSettings(userId, body) {
  const patch = validateSettings(body);
  return asMember(userId, async (client) => {
    const { rows: [row] } = await client.query(`
      INSERT INTO womens_health_settings (user_id, enabled, cycle_length_days, period_length_days, status)
      VALUES ($1, COALESCE($2, false), COALESCE($3, 28), COALESCE($4, 5), COALESCE($5, 'NONE'))
      ON CONFLICT (user_id) DO UPDATE SET
        enabled            = COALESCE($2, womens_health_settings.enabled),
        cycle_length_days  = COALESCE($3, womens_health_settings.cycle_length_days),
        period_length_days = COALESCE($4, womens_health_settings.period_length_days),
        status             = COALESCE($5, womens_health_settings.status),
        updated_at         = now()
      RETURNING *`,
    [userId, patch.enabled ?? null, patch.cycleLengthDays ?? null, patch.periodLengthDays ?? null, patch.status ?? null]);
    return settingsOut(row);
  });
}

const duplicateStart = (error) => {
  if (error?.code === '23505') throw new WomensHealthError(409, 'duplicate_period', 'A period starting on that date is already logged');
  throw error;
};

export async function addCycle(userId, body) {
  const c = validateCycle(body);
  return asMember(userId, async (client) => {
    const { rows: [row] } = await client.query(`
      INSERT INTO menstrual_cycle_logs (user_id, period_start, period_end, flow, symptoms, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, flow, symptoms, notes, updated_at`,
    [userId, c.periodStart, c.periodEnd ?? null, c.flow ?? null, c.symptoms ?? [], c.notes ?? null]).catch(duplicateStart);
    return cycleOut(row);
  });
}

export async function updateCycle(userId, cycleId, body) {
  const c = validateCycle(body, { partial: true });
  const columns = { periodStart: 'period_start', periodEnd: 'period_end', flow: 'flow', symptoms: 'symptoms', notes: 'notes' };
  const sets = [];
  const values = [userId, cycleId];
  for (const [key, column] of Object.entries(columns)) {
    if (c[key] === undefined) continue;
    values.push(c[key]);
    sets.push(`${column} = $${values.length}`);
  }
  return asMember(userId, async (client) => {
    const { rows: [row] } = await client.query(`
      UPDATE menstrual_cycle_logs SET ${sets.join(', ')}, updated_at = now()
       WHERE user_id = $1 AND id = $2
      RETURNING id, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, flow, symptoms, notes, updated_at`,
    values).catch((error) => {
      if (error?.code === '23514') throw bad('periodEnd cannot be before periodStart or more than 30 days after it');
      return duplicateStart(error);
    });
    if (!row) throw new WomensHealthError(404, 'not_found', 'Period not found');
    return cycleOut(row);
  });
}

export async function deleteCycle(userId, cycleId) {
  return asMember(userId, async (client) => {
    const { rowCount } = await client.query('DELETE FROM menstrual_cycle_logs WHERE user_id = $1 AND id = $2', [userId, cycleId]);
    if (!rowCount) throw new WomensHealthError(404, 'not_found', 'Period not found');
  });
}

/** "Clear cycle data": removes the period log and the settings. */
export async function clearAll(userId) {
  return asMember(userId, async (client) => {
    const { rowCount } = await client.query('DELETE FROM menstrual_cycle_logs WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM womens_health_settings WHERE user_id = $1', [userId]);
    return { periodsDeleted: rowCount };
  });
}
