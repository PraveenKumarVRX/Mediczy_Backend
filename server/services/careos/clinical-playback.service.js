/**
 * CareOS — Clinical Playback (replay deterioration narrative)
 */
import { getClinicalTimeline } from './clinical-timeline.service.js';
import { listCoordinatorAlerts } from './clinical-coordinator.service.js';

export async function buildClinicalPlayback(patientId, organizationId, hours = 48) {
  const since = new Date(Date.now() - hours * 3600000);
  const events = await getClinicalTimeline(patientId, { organizationId, limit: 500 });
  const filtered = events
    .filter((e) => new Date(e.event_at) >= since)
    .sort((a, b) => new Date(a.event_at) - new Date(b.event_at));

  const chapters = filtered.map((e) => ({
    at: e.event_at,
    type: e.event_type,
    title: e.title,
    detail: e.body,
    severity: e.severity,
    actor: e.actor_name || e.actor_type,
  }));

  const alerts = await listCoordinatorAlerts(patientId, organizationId);

  let narrative = 'Stable period';
  if (chapters.some((c) => c.severity === 'critical')) narrative = 'Critical deterioration detected in window';
  else if (chapters.length > 5) narrative = 'Multiple clinical events — review sequence';

  return {
    patientId,
    windowHours: hours,
    chapters,
    aiWarnings: alerts.filter((a) => new Date(a.created_at) >= since),
    summary: narrative,
    replayLabel: `Last ${hours} hours clinical playback`,
  };
}

export default { buildClinicalPlayback };
