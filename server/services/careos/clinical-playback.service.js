/**
 * CareOS — Clinical Playback (replay deterioration narrative)
 */
import { getClinicalTimeline } from './clinical-timeline.service.js';
import { listCoordinatorAlerts } from './clinical-coordinator.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

function ruleBasedNarrative(chapters) {
  if (chapters.some((c) => c.severity === 'critical')) return 'Critical deterioration detected in window';
  if (chapters.length > 5) return 'Multiple clinical events — review sequence';
  return 'Stable period';
}

async function buildNarrative(chapters, alerts) {
  const fallback = ruleBasedNarrative(chapters);
  if (!chapters.length) return fallback;

  try {
    const llm = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: `Summarize this patient's clinical timeline window in 1-2 sentences for a clinician skimming a playback. Be specific — reference actual events, trends, and timing. Do not invent facts not present in the data.`,
        },
        {
          role: 'user',
          content: `Timeline events (chronological): ${JSON.stringify(chapters)}\nAI coordinator alerts in this window: ${JSON.stringify(alerts)}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 200,
      skipCache: true,
    });
    return (llm.content || '').trim() || fallback;
  } catch (err) {
    console.warn('[clinical-playback] LLM narrative failed, falling back to rule-based:', err.message);
    return fallback;
  }
}

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
  const alertsInWindow = alerts.filter((a) => new Date(a.created_at) >= since);
  const narrative = await buildNarrative(chapters, alertsInWindow);

  return {
    patientId,
    windowHours: hours,
    chapters,
    aiWarnings: alertsInWindow,
    summary: narrative,
    replayLabel: `Last ${hours} hours clinical playback`,
  };
}

export default { buildClinicalPlayback };
