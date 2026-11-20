/**
 * Diet sync (owner decision 2026-11-20): goals and food log saved to the account (FORCED RLS),
 * food search over the catalogue. Catalogue nutrients are always computed by the server.
 */
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const rls = [];
const queries = [];
let respond = () => ({ rows: [], rowCount: 0 });
const client = { query: jest.fn(async (sql, params) => { queries.push({ sql, params }); return respond(sql, params); }) };
const poolQuery = jest.fn(async () => ({ rows: [] }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: poolQuery } }));
jest.unstable_mockModule('../middleware/rls-context.middleware.js', () => ({
  withRlsTransaction: async (_p, ctx, fn) => { rls.push(ctx); return fn(client); },
}));
const diet = await import('../services/diet-sync.service.js');

const TODAY = '2026-11-20';
const FOOD = { id: 7, name: 'Hot tea (Garam Chai)', serving_unit: 'cup', serving_kcal: '24.2', serving_carb_g: '3.9', serving_protein_g: '0.6', serving_fat_g: '0.8', serving_fibre_g: '0' };
beforeEach(() => { rls.length = 0; queries.length = 0; respond = () => ({ rows: [], rowCount: 0 }); poolQuery.mockClear(); });

describe('validation', () => {
  test('goals stay in sensible ranges and use the known option lists', () => {
    expect(() => diet.validateGoals({ targetKcal: 300 })).toThrow('800 to 6000');
    expect(() => diet.validateGoals({ goal: 'bulk' })).toThrow('goal');
    expect(() => diet.validateGoals({})).toThrow('Nothing');
    expect(diet.validateGoals({ targetKcal: 1800, goal: 'weight_loss', dietaryPreference: 'vegetarian' })).toEqual({ targetKcal: 1800, goal: 'weight_loss', dietaryPreference: 'vegetarian' });
  });
  test('a custom food needs a name and kcal; a catalogue food needs only foodId', () => {
    const base = { date: TODAY, meal: 'breakfast' };
    expect(() => diet.validateEntry({ ...base }, { today: TODAY })).toThrow('name');
    expect(() => diet.validateEntry({ ...base, name: 'Idli' }, { today: TODAY })).toThrow('kcal');
    expect(diet.validateEntry({ ...base, name: 'Idli', kcal: 58 }, { today: TODAY })).toMatchObject({ name: 'Idli', kcal: 58 });
    expect(diet.validateEntry({ ...base, foodId: 7, servings: 2 }, { today: TODAY })).toEqual({ date: TODAY, meal: 'breakfast', foodId: 7, servings: 2 });
  });
  test('dates, meals and servings are checked', () => {
    // One day of lead for phones east of India; two days ahead is refused.
    expect(diet.validateEntry({ date: '2026-11-21', meal: 'lunch', name: 'x', kcal: 1 }, { today: TODAY })).toMatchObject({ date: '2026-11-21' });
    expect(() => diet.validateEntry({ date: '2026-11-22', meal: 'lunch', name: 'x', kcal: 1 }, { today: TODAY })).toThrow('future');
    expect(() => diet.validateEntry({ date: TODAY, meal: 'brunch', name: 'x', kcal: 1 }, { today: TODAY })).toThrow('meal');
    expect(() => diet.validateEntry({ date: TODAY, meal: 'lunch', foodId: 7, servings: 0 }, { today: TODAY })).toThrow('servings');
  });
});

test('day totals add up by meal and show what is left against the goals', () => {
  const entries = [{ meal: 'breakfast', kcal: 300, proteinG: 10, carbG: 50, fatG: 8 }, { meal: 'lunch', kcal: 650.5, proteinG: 25, carbG: 80, fatG: 20 }];
  const t = diet.dayTotals(entries, { targetKcal: 1800, proteinG: 90, carbsG: 220, fatG: 60 });
  expect(t.totals).toMatchObject({ kcal: 950.5, proteinG: 35, carbG: 130, fatG: 28 });
  expect(t.byMeal).toMatchObject({ breakfast: 300, lunch: 650.5, dinner: 0 });
  expect(t.remaining).toEqual({ kcal: 849.5, proteinG: 55, carbsG: 90, fatG: 32 });
  expect(diet.dayTotals(entries, null).remaining).toBeNull();
});

describe('data access', () => {
  test('a catalogue entry gets the server-computed nutrients, never the client numbers', async () => {
    respond = (sql) => (sql.includes('FROM food_items') ? { rows: [FOOD] } : { rows: [{ id: 1, log_date: TODAY, meal: 'breakfast', food_item_id: 7, name: FOOD.name, servings: '2', kcal: '48.4', source: 'catalogue' }] });
    await diet.addEntry(41, { date: diet.todayIST(), meal: 'breakfast', foodId: 7, servings: 2, kcal: 9999, name: 'ignored' });
    const insert = queries.find((q) => q.sql.includes('INSERT INTO food_log_entries'));
    expect(insert.params[4]).toBe('Hot tea (Garam Chai)');
    expect(insert.params[7]).toBeCloseTo(48.4);
    expect(insert.params[12]).toBe('catalogue');
  });

  test('every read and write runs in the member\'s RLS context and filters by their id', async () => {
    respond = (sql) => (sql.startsWith('SELECT * FROM food_log_entries') ? { rows: [{ id: 3, user_id: 41, log_date: TODAY, meal: 'lunch', name: 'Dal', servings: 1, kcal: 200, source: 'custom' }] }
      : sql.startsWith('UPDATE') || sql.startsWith('INSERT') ? { rows: [{ id: 3, log_date: TODAY, meal: 'lunch', name: 'Dal', servings: 1, kcal: 200, source: 'custom' }] } : { rows: [], rowCount: 1 });
    await diet.getGoals(41);
    await diet.saveGoals(41, { targetKcal: 1800 });
    await diet.getDay(41, TODAY);
    await diet.addEntry(41, { date: diet.todayIST(), meal: 'lunch', name: 'Dal', kcal: 200 });
    await diet.updateEntry(41, 3, { kcal: 220 });
    await diet.deleteEntry(41, 3);
    await diet.summary(41, '2026-11-01', TODAY);
    await diet.clearAll(41);
    expect(rls.every((c) => c.userId === 41)).toBe(true);
    expect(rls.length).toBe(8);
    for (const { sql, params } of queries.filter((q) => /diet_goals|food_log_entries/.test(q.sql))) {
      expect(sql).toMatch(/user_id = \$1|VALUES \(\$1/);
      expect(params[0]).toBe(41);
    }
  });

  test('another member\'s entry is a 404, and the summary range is bounded', async () => {
    respond = () => ({ rows: [], rowCount: 0 });
    await expect(diet.updateEntry(41, 999, { kcal: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(diet.deleteEntry(41, 999)).rejects.toMatchObject({ status: 404 });
    await expect(diet.summary(41, '2026-01-01', TODAY)).rejects.toMatchObject({ status: 400 });
  });

  test('food search needs 2 characters and escapes LIKE wildcards', async () => {
    await expect(diet.searchFoods('a')).rejects.toMatchObject({ status: 400 });
    await diet.searchFoods('50%_off');
    const [, params] = poolQuery.mock.calls.at(-1);
    expect(params[0]).toBe('%50\\%\\_off%');
    expect(params[2]).toBe(20);
  });
});

describe('offline sync by date', () => {
  test('replacing a day deletes that date and inserts the app copy, so a resend is repeatable', async () => {
    respond = (sql) => (sql.includes('FROM food_items') ? { rows: [FOOD] } : { rows: [], rowCount: 0 });
    const day = { entries: [{ meal: 'breakfast', foodId: 7, servings: 1 }, { meal: 'lunch', name: 'Rajma chawal', kcal: 450 }], waterMl: 1500 };
    await diet.replaceDay(41, '2026-11-19', day);
    const first = queries.map((q) => q.sql.split('\n')[0].trim().slice(0, 40));
    queries.length = 0;
    await diet.replaceDay(41, '2026-11-19', day);
    expect(queries.map((q) => q.sql.split('\n')[0].trim().slice(0, 40))).toEqual(first);
    const del = queries.find((q) => q.sql.startsWith('DELETE FROM food_log_entries'));
    expect(del.params).toEqual([41, '2026-11-19']);
    expect(queries.filter((q) => q.sql.includes('INSERT INTO food_log_entries'))).toHaveLength(2);
    expect(queries.find((q) => q.sql.includes('INSERT INTO diet_days')).params).toEqual([41, '2026-11-19', 1500]);
  });
  test('bad entries name their position; water is bounded; future dates are refused', async () => {
    await expect(diet.replaceDay(41, '2026-11-19', { entries: [{ meal: 'lunch', name: 'x', kcal: 1 }, { meal: 'brunch', name: 'y', kcal: 1 }] })).rejects.toThrow('entries[1]');
    await expect(diet.replaceDay(41, '2026-11-19', { entries: 'nope' })).rejects.toThrow('list');
    await expect(diet.setWater(41, '2026-11-19', 30000)).rejects.toThrow('20000');
    await expect(diet.setWater(41, '2999-01-01', 500)).rejects.toThrow('future');
  });
  test('the day view carries water; clearing removes water too', async () => {
    respond = (sql) => (sql.includes('FROM diet_days') ? { rows: [{ water_ml: 1750, updated_at: 'x' }] } : { rows: [], rowCount: 0 });
    expect((await diet.getDay(41, TODAY)).waterMl).toBe(1750);
    queries.length = 0;
    await diet.clearAll(41);
    expect(queries.some((q) => q.sql.startsWith('DELETE FROM diet_days'))).toBe(true);
  });
});

describe('storage, privacy and wiring', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  test('goals and the food log are FORCED RLS with uid twins and go with the account', () => {
    const m = read('../migrations/20261120000600-diet-sync.migration.js');
    expect(m).toContain('FORCE ROW LEVEL SECURITY');
    expect(m).toContain("current_setting('app.current_user_id', true)");
    expect(m).toContain("attach_uid_reference('food_log_entries', 'user_id', 'user_uid', 'users')");
    expect(m).toContain("attach_uid_reference('diet_goals', 'user_id', 'user_uid', 'users')");
    expect(m).toContain("attach_uid_reference('diet_days', 'user_id', 'user_uid', 'users')");
    expect(m.match(/REFERENCES users\(id\) ON DELETE CASCADE/g)).toHaveLength(3);
  });
  test('DPDP export includes the diet data and erasure deletes it', () => {
    const s = read('../services/data-export.service.js');
    expect(s).toContain('FROM food_log_entries WHERE user_id = $1 ORDER BY');
    expect(s).toContain('DELETE FROM food_log_entries       WHERE user_id = $1');
    expect(s).toContain('DELETE FROM diet_goals             WHERE user_id = $1');
  });
  test('mounted under /api/diet ahead of the plan generator', () => {
    const app = read('../app.js');
    expect(app.indexOf('app.use("/api/diet", dietSyncRouter)')).toBeGreaterThan(0);
    expect(app.indexOf('app.use("/api/diet", dietSyncRouter)')).toBeLessThan(app.indexOf('app.use("/api/diet", dietRouter)'));
  });
});

describe('re-sent days from the app', () => {
  test('an entry carrying its old server id (and other reply fields) is accepted, the id ignored', () => {
    const resent = { id: 812, date: '2026-11-19', meal: 'lunch', foodId: null, name: 'Dal rice', servings: 1, servingUnit: null, kcal: 450, carbG: null, proteinG: 12, fatG: null, fibreG: null, source: 'custom', updatedAt: '2026-11-19T08:00:00Z' };
    const out = diet.validateEntry({ ...resent, date: '2026-11-19' }, { today: TODAY });
    expect(out).toMatchObject({ name: 'Dal rice', kcal: 450, proteinG: 12, source: 'custom' });
    expect(out).not.toHaveProperty('id');
  });
});
