import pool from '../db/pgPool.js';
import { metricUnavailable } from './metric-integrity.service.js';

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

/** Explainable additive Holt-Winters forecast with a conservative seasonal period. */
export function holtWintersForecast(history = [], { horizonDays = 30, seasonLength = 7, alpha = 0.35, beta = 0.15, gamma = 0.20 } = {}) {
  const points = history.map((point) => ({ date: point.date || point.day, quantity: finite(point.quantity ?? point.value) }))
    .filter((point) => point.quantity !== null && point.date && !Number.isNaN(new Date(point.date).getTime()))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (points.length < Math.max(2, seasonLength * 2)) {
    return { ...metricUnavailable(`At least ${Math.max(2, seasonLength * 2)} dated observations are required`, 'pharmacy_stock_history'), forecast: [], metrics: { observations: points.length } };
  }
  const season = Math.max(2, Math.min(seasonLength, Math.floor(points.length / 2)));
  const values = points.map((point) => point.quantity);
  let level = values[0];
  let trend = (values[season] - values[0]) / season;
  const seasonal = values.slice(0, season).map((value) => value - level);
  const fitted = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const seasonIndex = index % season;
    const previousLevel = level;
    const previousSeason = seasonal[seasonIndex] || 0;
    level = alpha * (value - previousSeason) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    seasonal[seasonIndex] = gamma * (value - level) + (1 - gamma) * previousSeason;
    fitted.push(Math.max(0, level + trend + seasonal[seasonIndex]));
  }
  const residuals = values.map((value, index) => value - fitted[index]).slice(season);
  const mae = residuals.length ? residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length : null;
  const lastDate = new Date(points[points.length - 1].date);
  const forecast = Array.from({ length: Math.max(1, Math.min(90, Number(horizonDays) || 30)) }, (_, offset) => {
    const day = new Date(lastDate);
    day.setUTCDate(day.getUTCDate() + offset + 1);
    const predicted = Math.max(0, level + (offset + 1) * trend + (seasonal[(values.length + offset) % season] || 0));
    const margin = mae === null ? 0 : 1.96 * mae;
    return { date: day.toISOString().slice(0, 10), quantity: Number(predicted.toFixed(2)), lower: Number(Math.max(0, predicted - margin).toFixed(2)), upper: Number((predicted + margin).toFixed(2)) };
  });
  return { value: forecast.reduce((sum, point) => sum + point.quantity, 0), available: true, unavailable: false, forecast, metrics: { observations: points.length, seasonLength: season, mae: mae === null ? null : Number(mae.toFixed(3)) } };
}

export async function createPharmacyForecast({ itemId, history, horizonDays = 30, seasonLength = 7, actorId = null, tenantUid = 'legacy' } = {}) {
  const result = holtWintersForecast(history, { horizonDays, seasonLength });
  try {
    await pool.query(`
      INSERT INTO pharmacy_demand_forecasts (tenant_uid, item_id, horizon_days, input_window, forecast, metrics, unavailable, reason)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
    `, [tenantUid, String(itemId || ''), Number(horizonDays), JSON.stringify(history || []), JSON.stringify(result.forecast || []), JSON.stringify({ ...(result.metrics || {}), actorId }), Boolean(result.unavailable), result.reason || null]);
  } catch (error) {
    console.error('[PharmacyForecast] audit insert failed:', error.message);
  }
  return { itemId, horizonDays: Number(horizonDays), ...result };
}

export default { holtWintersForecast, createPharmacyForecast };
