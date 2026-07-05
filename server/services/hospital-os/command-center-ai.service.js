/**
 * Hospital OS — command center AI recommendations
 */
import { getCommandCenter } from '../analytics.service.js';
import { syncHospitalTwin } from './hospital-twin-simulator.service.js';

export async function getAIRecommendations(organizationId) {
  const [snapshot, twin] = await Promise.all([
    getCommandCenter(organizationId),
    syncHospitalTwin(organizationId).catch(() => ({ state: {} })),
  ]);

  const beds = snapshot?.beds || {};
  const total = Number(beds.total) || 1;
  const occupied = Number(beds.occupied) || 0;
  const occupancyPct = Math.round((occupied / total) * 100);
  const criticalAlerts = Number(snapshot?.criticalAlerts?.count) || 0;
  const pendingDischarges = Number(snapshot?.pendingDischarges?.count) || 0;
  const otDelayed = Number(snapshot?.otToday?.delayed) || 0;
  const icuActive = Number(snapshot?.icuCensus?.active) || 0;

  const recommendations = [];

  if (occupancyPct >= 90) {
    recommendations.push({
      id: 'bed-pressure',
      severity: 'critical',
      title: 'Bed occupancy critical',
      message: `${occupancyPct}% beds occupied. Consider overflow protocol and elective admission hold.`,
      suggestedActions: ['Open overflow ward', 'Expedite discharge readiness reviews', 'Notify bed management'],
      tier: 'T1',
      metric: { occupancyPct, available: beds.available },
    });
  } else if (occupancyPct >= 80) {
    recommendations.push({
      id: 'bed-watch',
      severity: 'warning',
      title: 'Bed capacity elevated',
      message: `${occupancyPct}% occupancy — monitor admissions in next 4 hours.`,
      suggestedActions: ['Review pending discharges'],
      tier: 'T0',
      metric: { occupancyPct },
    });
  }

  if (criticalAlerts > 0) {
    recommendations.push({
      id: 'critical-alerts',
      severity: 'critical',
      title: `${criticalAlerts} unacknowledged critical alert(s)`,
      message: 'Review vitals and lab critical values immediately.',
      suggestedActions: ['Open HMIS alerts queue', 'Assign nurse responder'],
      tier: 'T1',
      metric: { criticalAlerts },
    });
  }

  if (pendingDischarges >= 5) {
    recommendations.push({
      id: 'discharge-throughput',
      severity: 'info',
      title: 'Discharge throughput opportunity',
      message: `${pendingDischarges} patients may be ready for discharge.`,
      suggestedActions: ['Run discharge huddle', 'Prioritize pharmacy/billing clearance'],
      tier: 'T0',
      metric: { pendingDischarges },
    });
  }

  if (otDelayed > 0) {
    recommendations.push({
      id: 'ot-delay',
      severity: 'warning',
      title: 'OT schedule slippage',
      message: `${otDelayed} case(s) delayed >15 min today.`,
      suggestedActions: ['Review OT command center', 'Notify anaesthesia team'],
      tier: 'T1',
      metric: { otDelayed },
    });
  }

  if (icuActive >= 8) {
    recommendations.push({
      id: 'icu-load',
      severity: 'warning',
      title: 'ICU census elevated',
      message: `${icuActive} active ICU admissions. Monitor ventilator capacity.`,
      suggestedActions: ['ICU bed huddle', 'Review step-down candidates'],
      tier: 'T1',
      metric: { icuActive },
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'stable',
      severity: 'success',
      title: 'Operations stable',
      message: 'No immediate escalations detected from live snapshot.',
      suggestedActions: ['Continue routine monitoring'],
      tier: 'T0',
    });
  }

  return {
    snapshot,
    twinState: twin.state,
    recommendations,
    generatedAt: new Date().toISOString(),
    disclaimer: 'Recommendations are assistive. Authorized staff must approve operational changes.',
  };
}

export default { getAIRecommendations };
