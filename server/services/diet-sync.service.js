/**
 * Diet sync: the member's diet goals, food log and food search (owner decision 2026-11-20).
 *
 * diet_goals and food_log_entries are FORCED RLS, so every query runs in withRlsTransaction for
 * the member. food_items is the shared catalogue. A catalogue entry's nutrients are always
 * computed here (servings x the catalogue's per-serving values); only custom foods carry the
 * member's own numbers. This is food logging and general wellness guidance, not clinical advice.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

export const MEALS = ['breakfast', 'midMorningSnack', 'lunch', 'eveningSnack', 'dinner', 'other'];
export const GOALS = ['weight_loss', 'maintenance', 'weight_gain', 'muscle_gain', 'general_health'];
export const ACTIVITY = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
export const PREFERENCES = ['vegetarian', 'non_vegetarian', 'eggetarian', 'vegan', 'jain'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 93;

export class DietError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const bad = (message) => new DietError(400, 'invalid_request', message);

const validDate = (v) => typeof v === 'string' && ISO.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const todayIST = (now = new Date()) => new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
/**
 * A day is the phone's own date. Phones east of India can already be on the next calendar date,
 * so "not in the future" allows up to one day after today's date in India (no zone is further ahead).
 */
export const latestDate = (today = todayIST()) => new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round1 = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

// ---- validation -------------------------------------------------------------------------
const intIn = (body, key, min, max, out) => {
  if (body[key] === undefined) return;
  if (body[key] === null) { out[key] = null; return; }
  if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max) throw bad(`${key} must be a whole number from ${min} to ${max}`);
  out[key] = body[key];
};
const oneOf = (body, key, list, out) => {
  if (body[key] === undefined) return;
  if (body[key] !== null && !list.includes(body[key])) throw bad(`${key} must be one of ${list.join(', ')}`);
  out[key] = body[key];
};

export function validateGoals(body = {}) {
  const out = {};
  intIn(body, 'targetKcal', 800, 6000, out);
  intIn(body, 'proteinG', 0, 500, out);
  intIn(body, 'carbsG', 0, 1000, out);
  intIn(body, 'fatG', 0, 400, out);
  intIn(body, 'waterMl', 500, 8000, out);
  oneOf(body, 'goal', GOALS, out);
  oneOf(body, 'activityLevel', ACTIVITY, out);
  oneOf(body, 'dietaryPreference', PREFERENCES, out);
  if (body.cuisineRegion !== undefined) {
    if (body.cuisineRegion !== null && (typeof body.cuisineRegion !== 'string' || body.cuisineRegion.length > 40)) throw bad('cuisineRegion must be text of up to 40 characters');
    out.cuisineRegion = body.cuisineRegion;
  }
  if (!Object.keys(out).length) throw bad('Nothing to save');
  return out;
}

const decimalIn = (body, key, max, out, required = false) => {
  if (body[key] === undefined || body[key] === null) { if (required) throw bad(`${key} is required`); if (body[key] === null) out[key] = null; return; }
  const v = Number(body[key]);
  if (!Number.isFinite(v) || v < 0 || v > max) throw bad(`${key} must be a number from 0 to ${max}`);
  out[key] = Math.round(v * 100) / 100;
};

/** A log entry: a catalogue food (foodId + servings) or a custom food (name + kcal [+ macros]). */
export function validateEntry(body = {}, { partial = false, today = todayIST() } = {}) {
  const out = {};
  if (body.date !== undefined || !partial) {
    if (!validDate(body.date)) throw bad('date must be YYYY-MM-DD');
    if (body.date > latestDate(today)) throw bad('date cannot be in the future');
    out.date = body.date;
  }
  if (body.meal !== undefined || !partial) {
    if (!MEALS.includes(body.meal)) throw bad(`meal must be one of ${MEALS.join(', ')}`);
    out.meal = body.meal;
  }
  if (body.servings !== undefined) {
    const s = Number(body.servings);
    if (!Number.isFinite(s) || s <= 0 || s > 50) throw bad('servings must be more than 0 and at most 50');
    out.servings = Math.round(s * 100) / 100;
  }
  if (body.foodId !== undefined && body.foodId !== null) {
    if (!Number.isSafeInteger(Number(body.foodId)) || Number(body.foodId) <= 0) throw bad('foodId must be a catalogue food id');
    out.foodId = Number(body.foodId);
  }
  if (!out.foodId) {
    if (body.name !== undefined || !partial) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 160) throw bad('name is required for a custom food (up to 160 characters)');
      out.name = body.name.trim();
    }
    decimalIn(body, 'kcal', 10000, out, !partial);
    decimalIn(body, 'carbG', 1000, out);
    decimalIn(body, 'proteinG', 1000, out);
    decimalIn(body, 'fatG', 1000, out);
    decimalIn(body, 'fibreG', 1000, out);
    if (body.servingUnit !== undefined) {
      if (body.servingUnit !== null && (typeof body.servingUnit !== 'string' || body.servingUnit.length > 40)) throw bad('servingUnit must be text of up to 40 characters');
      out.servingUnit = body.servingUnit;
    }
    if (body.source !== undefined) {
      if (!['custom', 'plan'].includes(body.source)) throw bad('source must be custom or plan');
      out.source = body.source;
    }
  }
  if (partial && !Object.keys(out).length) throw bad('Nothing to save');
  return out;
}

// ---- shapes -------------------------------------------------------------------------------
const goalsOut = (r) => (r ? {
  targetKcal: r.target_kcal, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g, waterMl: r.water_ml,
  goal: r.goal, activityLevel: r.activity_level, dietaryPreference: r.dietary_preference, cuisineRegion: r.cuisine_region,
  updatedAt: r.updated_at,
} : null);

const entryOut = (r) => ({
  id: Number(r.id), date: r.log_date, meal: r.meal, foodId: r.food_item_id, name: r.name,
  servings: num(r.servings), servingUnit: r.serving_unit,
  kcal: round1(r.kcal), carbG: round1(r.carb_g), proteinG: round1(r.protein_g), fatG: round1(r.fat_g), fibreG: round1(r.fibre_g),
  source: r.source, updatedAt: r.updated_at,
});

export const foodOut = (r) => ({
  id: r.id, name: r.name, servingUnit: r.serving_unit,
  perServing: { kcal: round1(r.serving_kcal), carbG: round1(r.serving_carb_g), proteinG: round1(r.serving_protein_g), fatG: round1(r.serving_fat_g), fibreG: round1(r.serving_fibre_g), sugarG: round1(r.serving_sugar_g), sodiumMg: round1(r.serving_sodium_mg) },
  per100g: { kcal: round1(r.per100_kcal), carbG: round1(r.per100_carb_g), proteinG: round1(r.per100_protein_g), fatG: round1(r.per100_fat_g) },
  source: r.source, attribution: r.attribution, reviewed: r.reviewed,
});

/** Day totals and what is left against the goals (pure). */
export function dayTotals(entries, goals) {
  const sum = (k) => round1(entries.reduce((s, e) => s + (Number(e[k]) || 0), 0));
  const totals = { kcal: sum('kcal'), carbG: sum('carbG'), proteinG: sum('proteinG'), fatG: sum('fatG'), fibreG: sum('fibreG') };
  const byMeal = Object.fromEntries(MEALS.map((m) => [m, round1(entries.filter((e) => e.meal === m).reduce((s, e) => s + (Number(e.kcal) || 0), 0))]));
  const remaining = goals ? {
    kcal: goals.targetKcal != null ? round1(goals.targetKcal - totals.kcal) : null,
    proteinG: goals.proteinG != null ? round1(goals.proteinG - totals.proteinG) : null,
    carbsG: goals.carbsG != null ? round1(goals.carbsG - totals.carbG) : null,
    fatG: goals.fatG != null ? round1(goals.fatG - totals.fatG) : null,
  } : null;
  return { totals, byMeal, remaining };
}

// ---- data access --------------------------------------------------------------------------
const asMember = (userId, fn) => withRlsTransaction(pool, { userId }, fn);
const ENTRY_COLS = `id, to_char(log_date, 'YYYY-MM-DD') AS log_date, meal, food_item_id, name, servings, serving_unit, kcal, carb_g, protein_g, fat_g, fibre_g, source, updated_at`;

export async function getGoals(userId) {
  return asMember(userId, async (c) => goalsOut((await c.query('SELECT * FROM diet_goals WHERE user_id = $1', [userId])).rows[0]));
}

export async function saveGoals(userId, body) {
  const g = validateGoals(body);
  const cols = { targetKcal: 'target_kcal', proteinG: 'protein_g', carbsG: 'carbs_g', fatG: 'fat_g', waterMl: 'water_ml', goal: 'goal', activityLevel: 'activity_level', dietaryPreference: 'dietary_preference', cuisineRegion: 'cuisine_region' };
  const keys = Object.keys(g);
  const names = keys.map((k) => cols[k]);
  const params = [userId, ...keys.map((k) => g[k])];
  return asMember(userId, async (c) => {
    const { rows: [row] } = await c.query(
      `INSERT INTO diet_goals (user_id, ${names.join(', ')}) VALUES ($1, ${names.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${names.map((n) => `${n} = EXCLUDED.${n}`).join(', ')}, updated_at = now()
       RETURNING *`, params);
    return goalsOut(row);
  });
}

async function catalogueFood(c, foodId) {
  const { rows: [food] } = await c.query('SELECT * FROM food_items WHERE id = $1 AND is_active', [foodId]);
  if (!food) throw new DietError(404, 'food_not_found', 'Food not found in the catalogue');
  return food;
}
const scaled = (food, servings) => ({
  name: food.name, serving_unit: food.serving_unit,
  kcal: (Number(food.serving_kcal) || 0) * servings,
  carb_g: food.serving_carb_g == null ? null : Number(food.serving_carb_g) * servings,
  protein_g: food.serving_protein_g == null ? null : Number(food.serving_protein_g) * servings,
  fat_g: food.serving_fat_g == null ? null : Number(food.serving_fat_g) * servings,
  fibre_g: food.serving_fibre_g == null ? null : Number(food.serving_fibre_g) * servings,
});

export async function getDay(userId, date = todayIST()) {
  if (!validDate(date)) throw bad('date must be YYYY-MM-DD');
  return asMember(userId, async (c) => {
    const [{ rows: entries }, { rows: [g] }, { rows: [day] }] = await Promise.all([
      c.query(`SELECT ${ENTRY_COLS} FROM food_log_entries WHERE user_id = $1 AND log_date = $2 ORDER BY created_at, id`, [userId, date]),
      c.query('SELECT * FROM diet_goals WHERE user_id = $1', [userId]),
      c.query('SELECT water_ml, updated_at FROM diet_days WHERE user_id = $1 AND log_date = $2', [userId, date]),
    ]);
    const list = entries.map(entryOut);
    const goals = goalsOut(g);
    return { date, goals, waterMl: day?.water_ml ?? null, dayUpdatedAt: day?.updated_at ?? null, entries: list, ...dayTotals(list, goals) };
  });
}

export async function addEntry(userId, body) {
  const e = validateEntry(body);
  return asMember(userId, async (c) => {
    const servings = e.servings ?? 1;
    const v = e.foodId
      ? { ...scaled(await catalogueFood(c, e.foodId), servings), food_item_id: e.foodId, source: 'catalogue' }
      : { name: e.name, serving_unit: e.servingUnit ?? null, kcal: e.kcal, carb_g: e.carbG ?? null, protein_g: e.proteinG ?? null, fat_g: e.fatG ?? null, fibre_g: e.fibreG ?? null, food_item_id: null, source: e.source || 'custom' };
    const { rows: [row] } = await c.query(
      `INSERT INTO food_log_entries (user_id, log_date, meal, food_item_id, name, servings, serving_unit, kcal, carb_g, protein_g, fat_g, fibre_g, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${ENTRY_COLS}`,
      [userId, e.date, e.meal, v.food_item_id, v.name, servings, v.serving_unit, v.kcal, v.carb_g, v.protein_g, v.fat_g, v.fibre_g, v.source]);
    return entryOut(row);
  });
}

export async function updateEntry(userId, entryId, body) {
  const e = validateEntry(body, { partial: true });
  return asMember(userId, async (c) => {
    const { rows: [cur] } = await c.query('SELECT * FROM food_log_entries WHERE user_id = $1 AND id = $2', [userId, entryId]);
    if (!cur) throw new DietError(404, 'not_found', 'Entry not found');
    const next = { log_date: e.date ?? cur.log_date, meal: e.meal ?? cur.meal, servings: e.servings ?? Number(cur.servings) };
    const foodId = e.foodId ?? (cur.source === 'catalogue' ? cur.food_item_id : null);
    let v;
    if (foodId) v = { ...scaled(await catalogueFood(c, foodId), next.servings), food_item_id: foodId, source: 'catalogue' };
    else {
      v = {
        name: e.name ?? cur.name, serving_unit: e.servingUnit !== undefined ? e.servingUnit : cur.serving_unit,
        kcal: e.kcal ?? cur.kcal, carb_g: e.carbG !== undefined ? e.carbG : cur.carb_g, protein_g: e.proteinG !== undefined ? e.proteinG : cur.protein_g,
        fat_g: e.fatG !== undefined ? e.fatG : cur.fat_g, fibre_g: e.fibreG !== undefined ? e.fibreG : cur.fibre_g, food_item_id: null, source: e.source || (cur.source === 'catalogue' ? 'custom' : cur.source),
      };
    }
    const { rows: [row] } = await c.query(
      `UPDATE food_log_entries SET log_date = $3, meal = $4, food_item_id = $5, name = $6, servings = $7, serving_unit = $8, kcal = $9,
         carb_g = $10, protein_g = $11, fat_g = $12, fibre_g = $13, source = $14, updated_at = now()
       WHERE user_id = $1 AND id = $2 RETURNING ${ENTRY_COLS}`,
      [userId, entryId, next.log_date, next.meal, v.food_item_id, v.name, next.servings, v.serving_unit, v.kcal, v.carb_g, v.protein_g, v.fat_g, v.fibre_g, v.source]);
    return entryOut(row);
  });
}

const validWater = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (!Number.isInteger(v) || v < 0 || v > 20000) throw bad('waterMl must be a whole number of ml from 0 to 20000');
  return v;
};

async function upsertWater(c, userId, date, waterMl) {
  await c.query(
    `INSERT INTO diet_days (user_id, log_date, water_ml) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, log_date) DO UPDATE SET water_ml = EXCLUDED.water_ml, updated_at = now()`, [userId, date, waterMl]);
}

/** Water for one date (repeatable: the same request twice leaves the same row). */
export async function setWater(userId, date, waterMl) {
  if (!validDate(date)) throw bad('date must be YYYY-MM-DD');
  if (date > latestDate()) throw bad('date cannot be in the future');
  const w = validWater(waterMl);
  if (w === undefined) throw bad('waterMl is required');
  return asMember(userId, async (c) => { await upsertWater(c, userId, date, w); return { date, waterMl: w }; });
}

/**
 * Offline sync: replace one date's whole log with what the app holds (entries and, when sent,
 * water) in one transaction. Repeatable — sending the same day again yields the same day.
 */
export async function replaceDay(userId, date, body = {}) {
  if (!validDate(date)) throw bad('date must be YYYY-MM-DD');
  const today = todayIST();
  if (date > latestDate(today)) throw bad('date cannot be in the future');
  if (!Array.isArray(body.entries)) throw bad('entries must be a list (send [] to clear the day)');
  if (body.entries.length > 100) throw bad('A day can hold at most 100 entries');
  const entries = body.entries.map((e, i) => {
    try { return validateEntry({ ...e, date }, { today }); } catch (error) { throw bad(`entries[${i}]: ${error.message}`); }
  });
  const water = validWater(body.waterMl);
  await asMember(userId, async (c) => {
    const foods = new Map();
    for (const e of entries) if (e.foodId && !foods.has(e.foodId)) foods.set(e.foodId, await catalogueFood(c, e.foodId));
    await c.query('DELETE FROM food_log_entries WHERE user_id = $1 AND log_date = $2', [userId, date]);
    for (const e of entries) {
      const servings = e.servings ?? 1;
      const v = e.foodId
        ? { ...scaled(foods.get(e.foodId), servings), food_item_id: e.foodId, source: 'catalogue' }
        : { name: e.name, serving_unit: e.servingUnit ?? null, kcal: e.kcal, carb_g: e.carbG ?? null, protein_g: e.proteinG ?? null, fat_g: e.fatG ?? null, fibre_g: e.fibreG ?? null, food_item_id: null, source: e.source || 'custom' };
      await c.query(
        `INSERT INTO food_log_entries (user_id, log_date, meal, food_item_id, name, servings, serving_unit, kcal, carb_g, protein_g, fat_g, fibre_g, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [userId, date, e.meal, v.food_item_id, v.name, servings, v.serving_unit, v.kcal, v.carb_g, v.protein_g, v.fat_g, v.fibre_g, v.source]);
    }
    if (water !== undefined) await upsertWater(c, userId, date, water);
    else await c.query(`INSERT INTO diet_days (user_id, log_date) VALUES ($1, $2) ON CONFLICT (user_id, log_date) DO UPDATE SET updated_at = now()`, [userId, date]);
  });
  return getDay(userId, date);
}

export async function deleteEntry(userId, entryId) {
  return asMember(userId, async (c) => {
    const { rowCount } = await c.query('DELETE FROM food_log_entries WHERE user_id = $1 AND id = $2', [userId, entryId]);
    if (!rowCount) throw new DietError(404, 'not_found', 'Entry not found');
  });
}

/** Daily totals over a range (for the weekly/monthly view). */
export async function summary(userId, from, to) {
  if (!validDate(from) || !validDate(to) || to < from) throw bad('from and to must be dates (YYYY-MM-DD), from on or before to');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) throw bad(`A summary covers at most ${MAX_RANGE_DAYS} days`);
  return asMember(userId, async (c) => {
    const [{ rows }, { rows: [g] }, { rows: water }] = await Promise.all([
      c.query(`SELECT to_char(log_date, 'YYYY-MM-DD') AS date, count(*)::int AS entries, sum(kcal) AS kcal, sum(carb_g) AS carb_g, sum(protein_g) AS protein_g, sum(fat_g) AS fat_g
                 FROM food_log_entries WHERE user_id = $1 AND log_date BETWEEN $2 AND $3 GROUP BY log_date ORDER BY log_date`, [userId, from, to]),
      c.query('SELECT target_kcal, water_ml FROM diet_goals WHERE user_id = $1', [userId]),
      c.query(`SELECT to_char(log_date, 'YYYY-MM-DD') AS date, water_ml FROM diet_days WHERE user_id = $1 AND log_date BETWEEN $2 AND $3`, [userId, from, to]),
    ]);
    const waterBy = new Map(water.map((w) => [w.date, w.water_ml]));
    const dates = [...new Set([...rows.map((r) => r.date), ...waterBy.keys()])].sort();
    const byDate = new Map(rows.map((r) => [r.date, r]));
    return {
      from, to, targetKcal: g?.target_kcal ?? null, targetWaterMl: g?.water_ml ?? null,
      days: dates.map((d) => { const r = byDate.get(d); return { date: d, entries: r?.entries ?? 0, kcal: round1(r?.kcal ?? 0), carbG: round1(r?.carb_g ?? 0), proteinG: round1(r?.protein_g ?? 0), fatG: round1(r?.fat_g ?? 0), waterMl: waterBy.get(d) ?? null }; }),
    };
  });
}

/** Clear the food log and goals ("delete my diet data"). */
export async function clearAll(userId) {
  return asMember(userId, async (c) => {
    const { rowCount } = await c.query('DELETE FROM food_log_entries WHERE user_id = $1', [userId]);
    await c.query('DELETE FROM diet_days WHERE user_id = $1', [userId]);
    await c.query('DELETE FROM diet_goals WHERE user_id = $1', [userId]);
    return { entriesDeleted: rowCount };
  });
}

// ---- catalogue ----------------------------------------------------------------------------
export async function searchFoods(q, limit = 20) {
  const term = String(q || '').trim().toLowerCase();
  if (term.length < 2) throw bad('Type at least 2 characters to search');
  if (term.length > 60) throw bad('Search text is too long');
  const n = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const { rows } = await pool.query(
    `SELECT * FROM food_items WHERE is_active AND lower(name) LIKE $1
      ORDER BY (lower(name) LIKE $2) DESC, length(name), name LIMIT $3`,
    [like, `${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`, n]);
  return rows.map(foodOut);
}

export async function getFood(foodId) {
  const { rows: [food] } = await pool.query('SELECT * FROM food_items WHERE id = $1 AND is_active', [foodId]);
  if (!food) throw new DietError(404, 'food_not_found', 'Food not found in the catalogue');
  return foodOut(food);
}
