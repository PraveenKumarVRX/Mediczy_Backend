/**
 * Hospital OS — predictive ED forecast (heuristic Wave 1; ML Wave 3)
 */
import pool from '../../db/pgPool.js';

export async function forecastED({ organizationId, hoursAhead = 8 }) {
  const now = new Date();
  const forecasts = [];

  let historicalHourly = [];
  try {
    const { rows } = await pool.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS arrivals
       FROM er_visits
       WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY 1 ORDER BY 1`,
      [organizationId]
    );
    historicalHourly = rows;
  } catch {
    historicalHourly = [];
  }

  const avgByHour = Object.fromEntries(historicalHourly.map((r) => [r.hour, r.arrivals]));
  const overallAvg = historicalHourly.length
    ? historicalHourly.reduce((s, r) => s + r.arrivals, 0) / historicalHourly.length
    : 4;

  for (let h = 0; h < hoursAhead; h++) {
    const slot = new Date(now.getTime() + h * 3600000);
    const hour = slot.getHours();
    const base = avgByHour[hour] ? avgByHour[hour] / 30 : overallAvg / 24;
    const predictedArrivals = Math.max(1, Math.round(base * (1 + (hour >= 8 && hour <= 22 ? 0.25 : -0.1))));

    forecasts.push({
      hourOffset: h,
      at: slot.toISOString(),
      predictedArrivals,
      predictedAcuityMix: { esi1_2: Math.ceil(predictedArrivals * 0.15), esi3: Math.ceil(predictedArrivals * 0.45), esi4_5: Math.ceil(predictedArrivals * 0.4) },
      bedDemand: Math.ceil(predictedArrivals * 0.35),
      imagingLoad: Math.ceil(predictedArrivals * 0.2),
      bloodProductRisk: predictedArrivals >= 8 ? 'elevated' : 'normal',
      specialists: predictedArrivals >= 6 ? ['emergency_medicine', 'ortho', 'general_surgery'] : ['emergency_medicine'],
    });
  }

  const peak = forecasts.reduce((a, b) => (a.predictedArrivals > b.predictedArrivals ? a : b));

  return {
    organizationId,
    hoursAhead,
    forecasts,
    peakWindow: peak,
    recommendations: [
      peak.predictedArrivals >= 8
        ? { action: 'Pre-alert triage nurse + physician', priority: 'high' }
        : { action: 'Standard staffing adequate', priority: 'low' },
      { action: 'Reserve 2 ED observation beds', priority: 'medium' },
    ],
    model: 'heuristic_historical_v1',
    disclaimer: 'Forecast assistive only. Staffing decisions require human authorization.',
  };
}

export default { forecastED };
