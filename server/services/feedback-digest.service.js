/**
 * Feedback Digest Service
 * ========================
 * Generates and sends a weekly summary email to the medical director
 * covering: AI quality trends, SLA performance, open governance proposals,
 * A/B experiment status, and cohort parity alerts.
 *
 * Sent: Monday 08:00 IST (02:30 UTC Sunday night)
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { tick, tickError, tickStart, beginJob } from '../utils/cronRegistry.js';

const FROM_EMAIL   = process.env.SES_FROM_EMAIL || process.env.EMAIL_FROM || 'hello@mysmarthealth.in';
const DIRECTOR_EMAIL = process.env.MEDICAL_DIRECTOR_EMAIL || process.env.ADMIN_EMAIL;

// ─── Email renderer ───────────────────────────────────────────────────────────

function renderDigestHtml({ weekOf, componentScores, slaSummary, pendingProposals, breaches, parityAlerts, experiments }) {
  const scoreRows = componentScores.map(r =>
    `<tr>
      <td style="padding:6px 12px">${r.ai_component}</td>
      <td style="padding:6px 12px;text-align:center">${Number(r.score_7d).toFixed(1)}</td>
      <td style="padding:6px 12px;text-align:center">${Number(r.score_30d).toFixed(1)}</td>
      <td style="padding:6px 12px;text-align:center;color:${r.trend==='degrading'?'#ef4444':r.trend==='improving'?'#22c55e':'#64748b'}">${r.trend}</td>
      <td style="padding:6px 12px;text-align:center">${r.signal_count_7d}</td>
    </tr>`
  ).join('');

  const slaRows = slaSummary.map(r =>
    `<tr>
      <td style="padding:6px 12px">${r.severity}</td>
      <td style="padding:6px 12px;text-align:center">${r.total}</td>
      <td style="padding:6px 12px;text-align:center;color:${parseInt(r.breached_count)>0?'#ef4444':'#22c55e'}">${r.breached_count}</td>
      <td style="padding:6px 12px;text-align:center">${r.avg_resolution_min ?? '—'} min</td>
    </tr>`
  ).join('');

  const proposalsList = pendingProposals.length
    ? pendingProposals.map(p => `<li>${p.component_name}: ${p.change_description?.substring(0,100)}...</li>`).join('')
    : '<li style="color:#64748b">No pending proposals</li>';

  const parityList = parityAlerts.length
    ? parityAlerts.map(a => `<li>⚠️ ${a.dimension}=${a.value}: score ${a.score} (${a.delta > 0 ? '+' : ''}${a.delta} vs global)</li>`).join('')
    : '<li style="color:#22c55e">No parity alerts — AI performing equitably</li>';

  const expList = experiments.length
    ? experiments.map(e => `<li><strong>${e.name}</strong>: ${e.status}, variant_n=${e.variant_n || 0}, control_n=${e.control_n || 0}</li>`).join('')
    : '<li style="color:#64748b">No active experiments</li>';

  return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:24px;color:#1e293b">
  <div style="background:#1a73e8;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:20px">🏥 My SmartHealth AI Quality Weekly Digest</h1>
    <p style="margin:4px 0 0;opacity:0.8;font-size:14px">Week of ${weekOf}</p>
  </div>

  <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 8px 8px">

    <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px">AI Component Quality Scores</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left">Component</th>
          <th style="padding:8px 12px">7-Day</th>
          <th style="padding:8px 12px">30-Day</th>
          <th style="padding:8px 12px">Trend</th>
          <th style="padding:8px 12px">Signals</th>
        </tr>
      </thead>
      <tbody>${scoreRows || '<tr><td colspan="5" style="padding:12px;color:#64748b">No data yet</td></tr>'}</tbody>
    </table>

    <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px">SLA Performance</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left">Severity</th>
          <th style="padding:8px 12px">Total</th>
          <th style="padding:8px 12px">Breached</th>
          <th style="padding:8px 12px">Avg Resolution</th>
        </tr>
      </thead>
      <tbody>${slaRows || '<tr><td colspan="4" style="padding:12px;color:#64748b">No SLA data</td></tr>'}</tbody>
    </table>
    ${breaches > 0 ? `<p style="color:#ef4444;font-size:13px">⚠️ ${breaches} unresolved SLA breach(es) require attention.</p>` : ''}

    <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px">Pending Governance Proposals (Require Your Review)</h2>
    <ul style="font-size:13px;line-height:1.8">${proposalsList}</ul>

    <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px">Demographic Parity Alerts</h2>
    <ul style="font-size:13px;line-height:1.8">${parityList}</ul>

    <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px">A/B Experiments</h2>
    <ul style="font-size:13px;line-height:1.8">${expList}</ul>

  </div>

  <p style="font-size:11px;color:#94a3b8;margin-top:16px">
    My SmartHealth · Automated AI Governance Digest · mediqzy.com<br>
    To update notification preferences, contact info@mysmarthealth.in
  </p>
</body>
</html>`.trim();
}

// ─── SES sender ───────────────────────────────────────────────────────────────

async function sendDigestEmail(html, weekOf) {
  if (!DIRECTOR_EMAIL) {
    console.warn('[FeedbackDigest] No MEDICAL_DIRECTOR_EMAIL configured — skipping send');
    return false;
  }
  try {
    const { SESv2Client, SendEmailCommand } = await import('../integrations/ses.js');
    const client = new SESv2Client({ region: process.env.AWS_REGION || 'ap-south-1' });
    await client.send(new SendEmailCommand({
      FromEmailAddress: FROM_EMAIL,
      Destination: { ToAddresses: [DIRECTOR_EMAIL] },
      Content: {
        Simple: {
          Subject: { Data: `My SmartHealth AI Quality Digest — Week of ${weekOf}`, Charset: 'UTF-8' },
          Body:    { Html:  { Data: html, Charset: 'UTF-8' } },
        },
      },
    }));
    return true;
  } catch (err) {
    console.error('[FeedbackDigest] SES error:', err.message);
    return false;
  }
}

// ─── Service class ────────────────────────────────────────────────────────────

class FeedbackDigestService {
  constructor() {
    this.isRunning = false;
    this.cronJob   = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Monday 02:30 UTC = Monday 08:00 IST
    this.cronJob = cron.schedule('30 2 * * 1', () => {
      this.sendWeeklyDigest().catch(e =>
        console.error('[FeedbackDigest] Digest send error:', e.message)
      );
    }, { timezone: 'UTC' });

    console.log('✅ FeedbackDigest started (weekly Monday 08:00 IST)');
  }

  stop() {
    if (this.cronJob) { this.cronJob.stop(); this.isRunning = false; }
  }

  async sendWeeklyDigest() {
    if (!(await beginJob('feedback_digest'))) return { skipped: true };

    try {
      const weekOf = new Date().toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      });

      const [componentScores, slaSummary, pendingProposals, breachCount, experiments] = await Promise.all([
        pool.query(`
          SELECT ai_component, score_7d, score_30d, signal_count_7d, trend
          FROM   ai_component_quality_scores
          ORDER  BY score_7d ASC
        `).then(r => r.rows).catch(() => []),

        pool.query(`
          SELECT severity,
                 COUNT(*)                                            AS total,
                 COUNT(*) FILTER (WHERE breached=TRUE)              AS breached_count,
                 AVG(EXTRACT(EPOCH FROM (COALESCE(resolution_met_at,NOW()) - created_at))/60)::NUMERIC(8,1) AS avg_resolution_min
          FROM ticket_sla
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY severity ORDER BY severity
        `).then(r => r.rows).catch(() => []),

        pool.query(`
          SELECT model_component AS component_name, change_description, proposed_by, created_at
          FROM   ai_model_change_log
          WHERE  status = 'pending'
          ORDER  BY created_at ASC
          LIMIT  10
        `).then(r => r.rows).catch(() => []),

        pool.query(`
          SELECT COUNT(*) AS n FROM ticket_sla
          WHERE breached=TRUE AND resolution_met_at IS NULL
        `).then(r => parseInt(r.rows[0]?.n ?? 0)).catch(() => 0),

        pool.query(`
          SELECT e.*,
            (SELECT COUNT(*) FROM ai_experiment_assignments WHERE experiment_id=e.id AND arm='variant') AS variant_n,
            (SELECT COUNT(*) FROM ai_experiment_assignments WHERE experiment_id=e.id AND arm='control') AS control_n
          FROM ai_experiments e
          WHERE e.status IN ('running','paused')
          LIMIT 5
        `).then(r => r.rows).catch(() => []),
      ]);

      // Cohort parity alerts
      let parityAlerts = [];
      try {
        const { default: cohortService } = await import('./feedback-cohort-analysis.service.js');
        const cohort = await cohortService.getCohortBreakdown({ days: 7 });
        parityAlerts = cohort.parity_alerts ?? [];
      } catch { /* ignore */ }

      const html = renderDigestHtml({
        weekOf, componentScores, slaSummary, pendingProposals,
        breaches: breachCount, parityAlerts, experiments,
      });

      const sent = await sendDigestEmail(html, weekOf);
      tick('feedback_digest', { sent, weekOf, components: componentScores.length });
      console.log(`📧 [FeedbackDigest] Weekly digest ${sent ? 'sent' : 'skipped (no email config)'} for week of ${weekOf}`);
      return sent;
    } catch (err) {
      tickError('feedback_digest', err.message);
      console.error('[FeedbackDigest] Error:', err.message);
      return false;
    }
  }
}

const feedbackDigestService = new FeedbackDigestService();
export default feedbackDigestService;
