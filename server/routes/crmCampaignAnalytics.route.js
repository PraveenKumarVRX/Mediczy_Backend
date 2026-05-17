import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import sharedPool from '../db/pgPool.js';

const router = express.Router();
router.use(authCRM);

router.get('/:id', async (req, res) => {
  const [overview, timeline, links, domains, recipients] = await Promise.all([
    sharedPool.query(`
      SELECT
        COUNT(*)::int AS recipients,
        COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked'))::int AS sent,
        COUNT(*) FILTER (WHERE status='delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE status='bounced')::int AS bounced,
        COUNT(*) FILTER (WHERE status='complained')::int AS complained,
        COUNT(*) FILTER (WHERE status='unsubscribed')::int AS unsubscribed,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS unique_opens,
        COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS unique_clicks
      FROM crm_marketing_campaign_recipients
      WHERE campaign_id=$1
    `, [req.params.id]),
    sharedPool.query(`
      SELECT DATE_TRUNC('hour', event_at) AS bucket, event_type, COUNT(*)::int AS count
      FROM crm_marketing_events
      WHERE campaign_id=$1
      GROUP BY DATE_TRUNC('hour', event_at), event_type
      ORDER BY bucket ASC
    `, [req.params.id]),
    sharedPool.query(`
      SELECT metadata->>'url' AS url, COUNT(*)::int AS clicks
      FROM crm_marketing_events
      WHERE campaign_id=$1 AND event_type='click'
      GROUP BY metadata->>'url'
      ORDER BY clicks DESC
      LIMIT 20
    `, [req.params.id]),
    sharedPool.query(`
      SELECT LOWER(SPLIT_PART(email,'@',2)) AS domain, COUNT(*)::int AS count
      FROM crm_marketing_campaign_recipients
      WHERE campaign_id=$1
      GROUP BY LOWER(SPLIT_PART(email,'@',2))
      ORDER BY count DESC
      LIMIT 20
    `, [req.params.id]),
    sharedPool.query(`
      SELECT email,status,sent_at,opened_at,clicked_at,last_error
      FROM crm_marketing_campaign_recipients
      WHERE campaign_id=$1
      ORDER BY id DESC
      LIMIT 200
    `, [req.params.id]),
  ]);
  const o = overview.rows[0];
  const rate = (n, d) => d ? Number(((Number(n) / Number(d)) * 100).toFixed(2)) : 0;
  res.json({
    success: true,
    data: {
      overview: {
        ...o,
        delivery_rate: rate(o.delivered, o.sent),
        open_rate: rate(o.unique_opens, o.delivered || o.sent),
        click_rate: rate(o.unique_clicks, o.delivered || o.sent),
        bounce_rate: rate(o.bounced, o.sent),
        unsubscribe_rate: rate(o.unsubscribed, o.sent),
      },
      timeline: timeline.rows,
      links: links.rows,
      domains: domains.rows,
      recipients: recipients.rows,
    },
  });
});

export default router;
