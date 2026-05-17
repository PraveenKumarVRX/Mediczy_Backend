import nodemailer from 'nodemailer';
import sharedPool from '../db/pgPool.js';

export const renderCampaignText = (input, vars = {}) =>
  String(input || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');

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

export async function snapshotCampaignRecipients(campaignId) {
  await sharedPool.query(`DELETE FROM crm_marketing_campaign_recipients WHERE campaign_id=$1`, [campaignId]);
  const { rows } = await sharedPool.query(`
    INSERT INTO crm_marketing_campaign_recipients (campaign_id,email,personalization)
    SELECT DISTINCT $1, m.email,
      jsonb_build_object(
        'first_name', COALESCE(m.first_name,''),
        'last_name', COALESCE(m.last_name,''),
        'company', COALESCE(m.company,''),
        'city', COALESCE(m.city,''),
        'state', COALESCE(m.state,'')
      )
    FROM crm_marketing_campaign_lists cl
    JOIN crm_marketing_list_members m ON m.list_id=cl.list_id
    LEFT JOIN crm_marketing_suppressions s ON LOWER(s.email)=LOWER(m.email)
    WHERE cl.campaign_id=$1 AND cl.mode='include' AND m.status='subscribed' AND s.id IS NULL
    ON CONFLICT (campaign_id,email) DO NOTHING
    RETURNING *
  `, [campaignId]);
  return rows;
}

export async function sendCampaignRecipient(recipientId, publicBaseUrl = '') {
  const { rows } = await sharedPool.query(`
    SELECT r.*, c.subject, c.html_content, c.text_content,
           s.name AS sender_name, s.email AS sender_email, COALESCE(s.reply_to,s.email) AS reply_to
    FROM crm_marketing_campaign_recipients r
    JOIN crm_marketing_campaigns c ON c.id=r.campaign_id
    LEFT JOIN crm_marketing_senders s ON s.id=c.sender_id
    WHERE r.id=$1
  `, [recipientId]);
  const recipient = rows[0];
  if (!recipient || !['pending', 'queued', 'failed'].includes(recipient.status)) return { skipped: true };

  const smtp = await getCampaignSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port || 587),
    secure: Number(smtp.port) === 465,
    auth: { user: smtp.username, pass: smtp.password },
  });

  const token = Buffer.from(`${recipient.campaign_id}:${recipient.id}`).toString('base64url');
  const base = publicBaseUrl || process.env.BASE_URL || 'http://localhost:8000';
  const unsubscribeUrl = `${base}/api/crm/campaigns/public/unsubscribe/${token}`;
  const openUrl = `${base}/api/crm/campaigns/public/open/${token}`;
  const renderedHtml = renderCampaignText(recipient.html_content, recipient.personalization).replace(/href="(https?:\/\/[^"]+)"/g, (_m, url) => `href="${base}/api/crm/campaigns/public/click/${token}?url=${encodeURIComponent(url)}"`);
  const html = `${renderedHtml}
    <p style="font-size:12px;color:#64748b">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}">unsubscribe</a>.</p>
    <img src="${openUrl}" width="1" height="1" alt="" style="display:none" />`;

  await sharedPool.query(`UPDATE crm_marketing_campaign_recipients SET status='queued',updated_at=NOW() WHERE id=$1`, [recipient.id]);
  const info = await transporter.sendMail({
    from: `"${recipient.sender_name || smtp.from_name || 'Mediqzy'}" <${recipient.sender_email || smtp.from_email || smtp.username}>`,
    replyTo: recipient.reply_to || recipient.sender_email || smtp.from_email,
    to: recipient.email,
    subject: renderCampaignText(recipient.subject, recipient.personalization),
    html,
    text: `${renderCampaignText(recipient.text_content, recipient.personalization)}\n\nUnsubscribe: ${unsubscribeUrl}`,
  });
  await sharedPool.query(`
    UPDATE crm_marketing_campaign_recipients
    SET status='sent',provider_message_id=$1,sent_at=NOW(),updated_at=NOW()
    WHERE id=$2
  `, [info.messageId || null, recipient.id]);
  await sharedPool.query(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type) VALUES ($1,$2,'sent')`, [recipient.campaign_id, recipient.id]);
  return { sent: true };
}
