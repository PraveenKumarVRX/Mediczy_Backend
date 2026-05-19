import nodemailer from 'nodemailer';
import sharedPool from '../db/pgPool.js';

// ─── Template rendering ───────────────────────────────────────────────────────

export const renderCampaignText = (input, vars = {}) =>
  String(input || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');

// Apply UTM parameters to every tracked link in HTML
function applyUtmToHtml(html, campaign) {
  const { utm_source, utm_medium, utm_campaign, utm_content } = campaign;
  if (!utm_source && !utm_campaign) return html;
  const utmParts = [
    utm_source   ? `utm_source=${encodeURIComponent(utm_source)}`   : '',
    utm_medium   ? `utm_medium=${encodeURIComponent(utm_medium)}`   : '',
    utm_campaign ? `utm_campaign=${encodeURIComponent(utm_campaign)}` : '',
    utm_content  ? `utm_content=${encodeURIComponent(utm_content)}`  : '',
  ].filter(Boolean).join('&');

  return html.replace(/href="(https?:\/\/[^"]+)"/g, (_match, url) => {
    const sep = url.includes('?') ? '&' : '?';
    return `href="${url}${sep}${utmParts}"`;
  });
}

// Wrap every link with click tracking; append open pixel + unsubscribe footer
function addTracking(html, token, base, unsubUrl) {
  const tracked = html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, url) =>
    `href="${base}/api/crm/campaigns/public/click/${token}?url=${encodeURIComponent(url)}"`
  );
  return `${tracked}
<p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;font-family:sans-serif">
  You received this email because you're subscribed to our list.
  <a href="${unsubUrl}" style="color:#94a3b8">Unsubscribe</a>
</p>
<img src="${base}/api/crm/campaigns/public/open/${token}" width="1" height="1" alt="" style="display:none" />`;
}

// ─── SMTP config ─────────────────────────────────────────────────────────────

export async function getCampaignSmtpConfig() {
  const { rows } = await sharedPool.query(`
    SELECT host, port, username, password, "fromEmail" AS from_email, "fromName" AS from_name
    FROM email_configs
    WHERE "isActive" = true
    ORDER BY "isDefault" DESC, id ASC
    LIMIT 1
  `);
  const config = rows[0];
  if (!config?.host || !config?.username || !config?.password) {
    throw new Error('No active SMTP configuration found');
  }
  return config;
}

// ─── Snapshot recipients ──────────────────────────────────────────────────────

export async function snapshotCampaignRecipients(campaignId) {
  await sharedPool.query(`DELETE FROM crm_marketing_campaign_recipients WHERE campaign_id=$1`, [campaignId]);
  const { rows } = await sharedPool.query(`
    INSERT INTO crm_marketing_campaign_recipients (campaign_id, email, personalization)
    SELECT DISTINCT $1, m.email,
      jsonb_build_object(
        'first_name', COALESCE(m.first_name, ''),
        'last_name',  COALESCE(m.last_name, ''),
        'company',    COALESCE(m.company, ''),
        'city',       COALESCE(m.city, ''),
        'state',      COALESCE(m.state, '')
      )
    FROM crm_marketing_campaign_lists cl
    JOIN crm_marketing_list_members m ON m.list_id = cl.list_id
    LEFT JOIN crm_marketing_suppressions s ON LOWER(s.email) = LOWER(m.email)
    WHERE cl.campaign_id = $1
      AND cl.mode = 'include'
      AND m.status = 'subscribed'
      AND s.id IS NULL
    ON CONFLICT (campaign_id, email) DO NOTHING
    RETURNING *
  `, [campaignId]);

  // update recipient_count on campaign
  await sharedPool.query(
    `UPDATE crm_marketing_campaigns SET recipient_count=$1 WHERE id=$2`,
    [rows.length, campaignId],
  ).catch(() => {});

  return rows;
}

// ─── Send one recipient ───────────────────────────────────────────────────────

export async function sendCampaignRecipient(recipientId, publicBaseUrl = '') {
  const { rows } = await sharedPool.query(`
    SELECT r.*,
           c.subject, c.html_content, c.text_content,
           c.ab_test_enabled, c.ab_test_subject_b, c.ab_test_split,
           c.utm_source, c.utm_medium, c.utm_campaign, c.utm_content,
           c.reply_to_address,
           s.name AS sender_name, s.email AS sender_email,
           COALESCE(s.reply_to, s.email) AS sender_reply_to
    FROM crm_marketing_campaign_recipients r
    JOIN crm_marketing_campaigns c ON c.id = r.campaign_id
    LEFT JOIN crm_marketing_senders s ON s.id = c.sender_id
    WHERE r.id = $1
  `, [recipientId]);

  const recipient = rows[0];
  if (!recipient || !['pending', 'queued', 'failed'].includes(recipient.status)) {
    return { skipped: true };
  }

  const smtp = await getCampaignSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port || 587),
    secure: Number(smtp.port) === 465,
    auth: { user: smtp.username, pass: smtp.password },
    pool: true,
    maxConnections: 5,
  });

  const vars = recipient.personalization || {};
  const base = publicBaseUrl || process.env.BASE_URL || 'http://localhost:8000';
  const token = Buffer.from(`${recipient.campaign_id}:${recipient.id}`).toString('base64url');
  const unsubscribeUrl = `${base}/api/crm/campaigns/public/unsubscribe/${token}`;

  // A/B test: decide which subject to use based on recipient index and split %
  let subject = renderCampaignText(recipient.subject, vars);
  if (recipient.ab_test_enabled && recipient.ab_test_subject_b) {
    // Use recipient.id mod 100 to determine variant bucket
    const bucket = recipient.id % 100;
    if (bucket >= (recipient.ab_test_split ?? 50)) {
      subject = renderCampaignText(recipient.ab_test_subject_b, vars);
    }
  }

  // Build HTML: render vars → apply UTM → add click/open tracking
  const renderedHtml = renderCampaignText(recipient.html_content, vars);
  const utmHtml = applyUtmToHtml(renderedHtml, {
    utm_source:   recipient.utm_source,
    utm_medium:   recipient.utm_medium,
    utm_campaign: recipient.utm_campaign,
    utm_content:  recipient.utm_content,
  });
  const html = addTracking(utmHtml, token, base, unsubscribeUrl);
  const text = `${renderCampaignText(recipient.text_content, vars)}\n\nUnsubscribe: ${unsubscribeUrl}`;

  const fromName  = recipient.sender_name  || smtp.from_name  || 'Mediqzy';
  const fromEmail = recipient.sender_email || smtp.from_email || smtp.username;
  const replyTo   = recipient.reply_to_address || recipient.sender_reply_to || fromEmail;

  await sharedPool.query(
    `UPDATE crm_marketing_campaign_recipients SET status='queued', updated_at=NOW() WHERE id=$1`,
    [recipient.id],
  );

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    replyTo,
    to: recipient.email,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@mediqzy.com?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  await sharedPool.query(`
    UPDATE crm_marketing_campaign_recipients
    SET status='sent', provider_message_id=$1, sent_at=NOW(), updated_at=NOW()
    WHERE id=$2
  `, [info.messageId || null, recipient.id]);

  await sharedPool.query(
    `INSERT INTO crm_marketing_events (campaign_id, recipient_id, event_type) VALUES ($1, $2, 'sent')`,
    [recipient.campaign_id, recipient.id],
  );

  return { sent: true, messageId: info.messageId };
}

// ─── Bounce classifier ────────────────────────────────────────────────────────

export function classifyBounce(providerEvent) {
  const code   = String(providerEvent.bounce_code || providerEvent.smtp_code || '');
  const reason = String(providerEvent.bounce_reason || providerEvent.reason || '').toLowerCase();

  // Hard bounce: permanent delivery failure
  if (code.startsWith('5') || reason.includes('user unknown') || reason.includes('no such user') ||
      reason.includes('invalid') || reason.includes('does not exist') || reason.includes('mailbox not found')) {
    return 'hard';
  }
  // Soft bounce: temporary (mailbox full, server unavailable)
  if (code.startsWith('4') || reason.includes('mailbox full') || reason.includes('over quota') ||
      reason.includes('temporarily') || reason.includes('try again')) {
    return 'soft';
  }
  return 'unknown';
}
