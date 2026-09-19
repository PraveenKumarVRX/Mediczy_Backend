/**
 * Human-reachable alerting — Slack / PagerDuty
 * ================================================
 * Added 2026-09-18 per audit finding: Prometheus alert rules exist, but
 * nothing was wired to actually reach a human. Reads real webhook/key
 * values from environment variables only — never from committed config.
 * Both integrations are no-ops if their env var is unset, so this is safe
 * to import anywhere without requiring setup.
 */

export async function sendCriticalAlert(title, context = {}) {
  const message = `${title}${Object.keys(context).length ? '\n' + JSON.stringify(context, null, 2).slice(0, 1500) : ''}`;

  const tasks = [];

  if (process.env.SLACK_WEBHOOK_URL) {
    tasks.push(
      fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `[Mediczy] ${message}` }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {})
    );
  }

  if (process.env.PAGERDUTY_ROUTING_KEY) {
    tasks.push(
      fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: process.env.PAGERDUTY_ROUTING_KEY,
          event_action: 'trigger',
          payload: { summary: title, source: 'mediczy-server', severity: 'critical', custom_details: context },
        }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {})
    );
  }

  if (tasks.length === 0) return; // no alerting configured — silent no-op, never blocks the caller
  await Promise.allSettled(tasks);
}
