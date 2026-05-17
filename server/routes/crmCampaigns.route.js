import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { authCRM } from '../middleware/crm.middleware.js';
import sharedPool from '../db/pgPool.js';
import { createRedisConnection } from '../config/redis-connection.js';
import { getS3Client, getUploadsBucket, buildPublicFileUrl } from '../services/s3-presign.service.js';
import { snapshotCampaignRecipients, sendCampaignRecipient } from '../services/crm-campaign-dispatcher.service.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const campaignQueue = new Queue('crm-campaign-queue', { connection: createRedisConnection() });

async function ensureTables() {
  await sharedPool.query(`
    CREATE TABLE IF NOT EXISTS crm_marketing_senders (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      reply_to VARCHAR(255),
      provider VARCHAR(50) NOT NULL DEFAULT 'smtp',
      provider_sender_id VARCHAR(255),
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_lists (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      source VARCHAR(50) NOT NULL DEFAULT 'manual',
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_list_members (
      id BIGSERIAL PRIMARY KEY,
      list_id BIGINT NOT NULL REFERENCES crm_marketing_lists(id) ON DELETE CASCADE,
      contact_id BIGINT,
      lead_id BIGINT,
      email VARCHAR(255) NOT NULL,
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      company VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      status VARCHAR(30) NOT NULL DEFAULT 'subscribed',
      source VARCHAR(50) NOT NULL DEFAULT 'manual',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(list_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_mlm_list ON crm_marketing_list_members(list_id);
    CREATE TABLE IF NOT EXISTS crm_marketing_imports (
      id BIGSERIAL PRIMARY KEY,
      list_id BIGINT NOT NULL REFERENCES crm_marketing_lists(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'processing',
      total_rows INTEGER NOT NULL DEFAULT 0,
      valid_rows INTEGER NOT NULL DEFAULT 0,
      invalid_rows INTEGER NOT NULL DEFAULT 0,
      duplicate_rows INTEGER NOT NULL DEFAULT 0,
      error_report JSONB NOT NULL DEFAULT '[]'::jsonb,
      s3_key TEXT,
      s3_url TEXT,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_templates (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      preheader TEXT NOT NULL DEFAULT '',
      html_content TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      category VARCHAR(100) NOT NULL DEFAULT 'general',
      variables JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_campaigns (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      preheader TEXT NOT NULL DEFAULT '',
      template_id BIGINT REFERENCES crm_marketing_templates(id) ON DELETE SET NULL,
      sender_id BIGINT REFERENCES crm_marketing_senders(id) ON DELETE SET NULL,
      html_content TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_campaign_lists (
      campaign_id BIGINT NOT NULL REFERENCES crm_marketing_campaigns(id) ON DELETE CASCADE,
      list_id BIGINT NOT NULL REFERENCES crm_marketing_lists(id) ON DELETE CASCADE,
      mode VARCHAR(20) NOT NULL DEFAULT 'include',
      PRIMARY KEY(campaign_id, list_id, mode)
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_campaign_recipients (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES crm_marketing_campaigns(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      personalization JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      provider_message_id TEXT,
      last_error TEXT,
      sent_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      clicked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(campaign_id, email)
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_suppressions (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      reason VARCHAR(50) NOT NULL,
      source_campaign_id BIGINT REFERENCES crm_marketing_campaigns(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_marketing_events (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES crm_marketing_campaigns(id) ON DELETE CASCADE,
      recipient_id BIGINT REFERENCES crm_marketing_campaign_recipients(id) ON DELETE CASCADE,
      event_type VARCHAR(30) NOT NULL,
      event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      provider VARCHAR(50) NOT NULL DEFAULT 'internal',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
}
ensureTables().catch((e) => console.warn('[CRMCampaigns] DDL warn:', e.message));

async function getSmtpConfig() {
  const { rows } = await sharedPool.query(`
    SELECT host, port, username, password, "fromEmail" AS from_email, "fromName" AS from_name
    FROM email_configs WHERE "isActive" = true
    ORDER BY "isDefault" DESC, id ASC LIMIT 1
  `);
  if (!rows[0]?.host || !rows[0]?.username || !rows[0]?.password) throw new Error('No active SMTP configuration found');
  return rows[0];
}
const renderText = (input, vars = {}) => String(input || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');

async function snapshotRecipients(campaignId) {
  await sharedPool.query(`DELETE FROM crm_marketing_campaign_recipients WHERE campaign_id=$1`, [campaignId]);
  const { rows } = await sharedPool.query(`
    INSERT INTO crm_marketing_campaign_recipients (campaign_id,email,personalization)
    SELECT DISTINCT $1, m.email,
      jsonb_build_object('first_name',COALESCE(m.first_name,''),'last_name',COALESCE(m.last_name,''),'company',COALESCE(m.company,''),'city',COALESCE(m.city,''),'state',COALESCE(m.state,''))
    FROM crm_marketing_campaign_lists cl
    JOIN crm_marketing_list_members m ON m.list_id=cl.list_id
    LEFT JOIN crm_marketing_suppressions s ON LOWER(s.email)=LOWER(m.email)
    WHERE cl.campaign_id=$1 AND cl.mode='include' AND m.status='subscribed' AND s.id IS NULL
    ON CONFLICT (campaign_id,email) DO NOTHING RETURNING *
  `, [campaignId]);
  return rows;
}

async function sendCampaign(campaignId) {
  const campaign = (await sharedPool.query(`
    SELECT c.*, s.name AS sender_name, s.email AS sender_email, COALESCE(s.reply_to,s.email) AS reply_to
    FROM crm_marketing_campaigns c LEFT JOIN crm_marketing_senders s ON s.id=c.sender_id WHERE c.id=$1
  `, [campaignId])).rows[0];
  if (!campaign) return;
  const smtp = await getSmtpConfig();
  const transporter = nodemailer.createTransport({ host: smtp.host, port: Number(smtp.port || 587), secure: Number(smtp.port) === 465, auth: { user: smtp.username, pass: smtp.password } });
  const { rows } = await sharedPool.query(`SELECT * FROM crm_marketing_campaign_recipients WHERE campaign_id=$1 AND status IN ('pending','queued') ORDER BY id`, [campaignId]);
  await sharedPool.query(`UPDATE crm_marketing_campaigns SET status='sending',updated_at=NOW() WHERE id=$1`, [campaignId]);
  for (const recipient of rows) {
    try {
      await sharedPool.query(`UPDATE crm_marketing_campaign_recipients SET status='queued',updated_at=NOW() WHERE id=$1`, [recipient.id]);
      const info = await transporter.sendMail({
        from: `"${campaign.sender_name || smtp.from_name || 'Mediqzy'}" <${campaign.sender_email || smtp.from_email || smtp.username}>`,
        replyTo: campaign.reply_to || campaign.sender_email || smtp.from_email,
        to: recipient.email,
        subject: renderText(campaign.subject, recipient.personalization),
        html: renderText(campaign.html_content, recipient.personalization),
        text: renderText(campaign.text_content, recipient.personalization),
      });
      await sharedPool.query(`UPDATE crm_marketing_campaign_recipients SET status='sent',provider_message_id=$1,sent_at=NOW(),updated_at=NOW() WHERE id=$2`, [info.messageId || null, recipient.id]);
    } catch (error) {
      await sharedPool.query(`UPDATE crm_marketing_campaign_recipients SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2`, [error.message, recipient.id]);
    }
  }
  await sharedPool.query(`UPDATE crm_marketing_campaigns SET status='sent',sent_at=NOW(),updated_at=NOW() WHERE id=$1`, [campaignId]);
}

const decodeToken = (token) => { const [campaignId, recipientId] = Buffer.from(token, "base64url").toString("utf8").split(":"); return { campaignId, recipientId }; };
router.get("/public/open/:token", async (req, res) => {
  try { const { campaignId, recipientId } = decodeToken(req.params.token); await sharedPool.query(`UPDATE crm_marketing_campaign_recipients SET opened_at=COALESCE(opened_at,NOW()),updated_at=NOW() WHERE id=$1 AND campaign_id=$2`, [recipientId,campaignId]); await sharedPool.query(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type,metadata) VALUES ($1,$2,'open',$3)`, [campaignId,recipientId,JSON.stringify({ ip:req.ip, userAgent:req.get("user-agent") })]); } catch (_) {}
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  res.writeHead(200, { "Content-Type": "image/png", "Content-Length": pixel.length, "Cache-Control": "no-store" }); res.end(pixel);
});
router.get("/public/unsubscribe/:token", async (req, res) => {
  try { const { campaignId, recipientId } = decodeToken(req.params.token); const recipient = (await sharedPool.query(`SELECT email FROM crm_marketing_campaign_recipients WHERE id=$1 AND campaign_id=$2`, [recipientId,campaignId])).rows[0]; if (recipient) { await sharedPool.query(`INSERT INTO crm_marketing_suppressions (email,reason,source_campaign_id) VALUES ($1,'unsubscribe',$2) ON CONFLICT (email) DO NOTHING`, [recipient.email,campaignId]); await sharedPool.query(`UPDATE crm_marketing_campaign_recipients SET status='unsubscribed',updated_at=NOW() WHERE id=$1`, [recipientId]); await sharedPool.query(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type) VALUES ($1,$2,'unsubscribe')`, [campaignId,recipientId]); } } catch (_) {}
  res.type("html").send("<h1>Unsubscribed</h1><p>You have been removed from future marketing emails.</p>");
router.get("/public/click/:token", async (req, res) => {
  const { url } = req.query;
  try { const { campaignId, recipientId } = decodeToken(req.params.token); await sharedPool.query(`UPDATE crm_marketing_campaign_recipients SET clicked_at=COALESCE(clicked_at,NOW()),updated_at=NOW() WHERE id=$1 AND campaign_id=$2`, [recipientId,campaignId]); await sharedPool.query(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type,metadata) VALUES ($1,$2,'click',$3)`, [campaignId,recipientId,JSON.stringify({ url, ip:req.ip, userAgent:req.get("user-agent") })]); } catch (_) {}
  if (url) return res.redirect(String(url));
  res.status(400).send("Missing url");
});
});

router.use(authCRM);

router.get('/senders', async (_req, res) => {
  res.json({ success: true, data: (await sharedPool.query(`SELECT * FROM crm_marketing_senders ORDER BY is_default DESC,created_at DESC`)).rows });
});
router.post('/senders', async (req, res) => {
  const { name, email, reply_to, provider='smtp', is_verified=true, is_default=false } = req.body;
  if (!name || !email) return res.status(400).json({ success: false, message: 'name and email are required' });
  if (is_default) await sharedPool.query(`UPDATE crm_marketing_senders SET is_default=false`);
  const { rows } = await sharedPool.query(`INSERT INTO crm_marketing_senders (name,email,reply_to,provider,is_verified,is_default,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name,email,reply_to||null,provider,!!is_verified,!!is_default,req.crmUser.id]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/lists', async (_req, res) => {
  const { rows } = await sharedPool.query(`SELECT l.*,COUNT(m.id)::int AS member_count FROM crm_marketing_lists l LEFT JOIN crm_marketing_list_members m ON m.list_id=l.id GROUP BY l.id ORDER BY l.created_at DESC`);
  res.json({ success: true, data: rows });
});
router.post('/lists', async (req, res) => {
  const { name, description, source='manual' } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });
  const { rows } = await sharedPool.query(`INSERT INTO crm_marketing_lists (name,description,source,created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [name,description||null,source,req.crmUser.id]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.get('/lists/:id', async (req, res) => {
  const [list, members, imports] = await Promise.all([
    sharedPool.query(`SELECT * FROM crm_marketing_lists WHERE id=$1`, [req.params.id]),
    sharedPool.query(`SELECT * FROM crm_marketing_list_members WHERE list_id=$1 ORDER BY created_at DESC LIMIT 500`, [req.params.id]),
    sharedPool.query(`SELECT * FROM crm_marketing_imports WHERE list_id=$1 ORDER BY created_at DESC`, [req.params.id]),
  ]);
  if (!list.rows.length) return res.status(404).json({ success: false, message: 'List not found' });
  res.json({ success: true, data: { ...list.rows[0], members: members.rows, imports: imports.rows } });
});
router.post('/lists/:id/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'file is required' });
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
  let valid=0, duplicate=0; const errors=[];
  const bucket = getUploadsBucket();
  let s3Key = null;
  let s3Url = null;
  if (bucket) {
    s3Key = "marketing-imports/list-" + req.params.id + "/" + Date.now() + "_" + crypto.randomBytes(4).toString("hex") + "_" + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    await getS3Client().send(new PutObjectCommand({ Bucket: bucket, Key: s3Key, Body: req.file.buffer, ContentType: req.file.mimetype || "application/octet-stream" }));
    s3Url = buildPublicFileUrl(s3Key);
  }
  const importId = (await sharedPool.query(`INSERT INTO crm_marketing_imports (list_id,filename,total_rows,s3_key,s3_url,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [req.params.id,req.file.originalname,rows.length,s3Key,s3Url,req.crmUser.id])).rows[0].id;
  for (let i=0;i<rows.length;i++) {
    const r = rows[i]; const email = String(r.EMAIL || r.email || r.Email || '').trim().toLowerCase();
    if (!emailRegex.test(email)) { errors.push({ row:i+2,email,error:'Invalid email' }); continue; }
    const inserted = await sharedPool.query(`INSERT INTO crm_marketing_list_members (list_id,email,first_name,last_name,company,city,state,source,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,'import',$8) ON CONFLICT (list_id,email) DO NOTHING RETURNING id`, [req.params.id,email,r.FIRST_NAME||r.first_name||null,r.LAST_NAME||r.last_name||null,r.COMPANY||r.company||r.HOSPITAL_NAME||null,r.CITY||r.city||null,r.STATE||r.state||null,JSON.stringify(r)]);
    if (inserted.rows.length) valid++; else duplicate++;
  }
  await sharedPool.query(`UPDATE crm_marketing_imports SET status='completed',valid_rows=$1,invalid_rows=$2,duplicate_rows=$3,error_report=$4,completed_at=NOW() WHERE id=$5`, [valid,errors.length,duplicate,JSON.stringify(errors),importId]);
  res.status(201).json({ success: true, data: { importId,totalRows:rows.length,validRows:valid,invalidRows:errors.length,duplicateRows:duplicate,errors } });
});

router.get('/templates', async (_req, res) => res.json({ success:true, data:(await sharedPool.query(`SELECT * FROM crm_marketing_templates ORDER BY created_at DESC`)).rows }));
router.post('/templates', async (req, res) => {
  const { name, subject='', preheader='', html_content='', text_content='', category='general', variables=[] } = req.body;
  if (!name) return res.status(400).json({ success:false, message:'name is required' });
  const { rows } = await sharedPool.query(`INSERT INTO crm_marketing_templates (name,subject,preheader,html_content,text_content,category,variables,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [name,subject,preheader,html_content,text_content,category,JSON.stringify(variables),req.crmUser.id]);
  res.status(201).json({ success:true, data:rows[0] });
});

router.get('/campaigns', async (_req, res) => {
  const { rows } = await sharedPool.query(`SELECT c.*,s.name AS sender_name,s.email AS sender_email,COUNT(r.id)::int AS recipient_count,COUNT(r.id) FILTER (WHERE r.status='sent')::int AS sent_count,COUNT(r.id) FILTER (WHERE r.status='failed')::int AS failed_count FROM crm_marketing_campaigns c LEFT JOIN crm_marketing_senders s ON s.id=c.sender_id LEFT JOIN crm_marketing_campaign_recipients r ON r.campaign_id=c.id GROUP BY c.id,s.id ORDER BY c.created_at DESC`);
  res.json({ success:true, data:rows });
});
router.post('/campaigns', async (req,res) => {
  const { name, subject='', preheader='', sender_id, html_content='', text_content='', list_ids=[] } = req.body;
  if (!name) return res.status(400).json({ success:false, message:'name is required' });
  const { rows } = await sharedPool.query(`INSERT INTO crm_marketing_campaigns (name,subject,preheader,sender_id,html_content,text_content,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name,subject,preheader,sender_id||null,html_content,text_content,req.crmUser.id]);
  for (const listId of list_ids) await sharedPool.query(`INSERT INTO crm_marketing_campaign_lists (campaign_id,list_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [rows[0].id,listId]);
  res.status(201).json({ success:true, data:rows[0] });
});
router.get('/campaigns/:id', async (req,res) => {
  const [campaign, lists, recipients] = await Promise.all([
    sharedPool.query(`SELECT * FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id]),
    sharedPool.query(`SELECT list_id FROM crm_marketing_campaign_lists WHERE campaign_id=$1`, [req.params.id]),
    sharedPool.query(`SELECT COUNT(*)::int AS total FROM crm_marketing_campaign_recipients WHERE campaign_id=$1`, [req.params.id]),
  ]);
  if (!campaign.rows.length) return res.status(404).json({ success:false, message:'Campaign not found' });
  res.json({ success:true, data:{ ...campaign.rows[0], list_ids:lists.rows.map((r)=>r.list_id), recipient_count:recipients.rows[0].total } });
});
router.put('/campaigns/:id', async (req,res) => {
  const { name, subject, preheader, sender_id, html_content, text_content, list_ids } = req.body;
  const { rows } = await sharedPool.query(`UPDATE crm_marketing_campaigns SET name=COALESCE($1,name),subject=COALESCE($2,subject),preheader=COALESCE($3,preheader),sender_id=COALESCE($4,sender_id),html_content=COALESCE($5,html_content),text_content=COALESCE($6,text_content),updated_at=NOW() WHERE id=$7 AND status IN ('draft','scheduled') RETURNING *`, [name,subject,preheader,sender_id,html_content,text_content,req.params.id]);
  if (!rows.length) return res.status(404).json({ success:false, message:'Campaign not found or locked' });
  if (Array.isArray(list_ids)) { await sharedPool.query(`DELETE FROM crm_marketing_campaign_lists WHERE campaign_id=$1`, [req.params.id]); for (const listId of list_ids) await sharedPool.query(`INSERT INTO crm_marketing_campaign_lists (campaign_id,list_id) VALUES ($1,$2)`, [req.params.id,listId]); }
  res.json({ success:true, data:rows[0] });
});
router.post('/campaigns/:id/audience-preview', async (req,res) => res.json({ success:true, data:{ recipient_count:(await snapshotCampaignRecipients(req.params.id)).length } }));

async function queueRecipientsInBatches(recipients, initialDelay = 0) {
  const dailyLimit = Number(process.env.CRM_CAMPAIGN_DAILY_LIMIT || 1000);
  const batchSize = Number(process.env.CRM_CAMPAIGN_BATCH_SIZE || 50);
  const batchIntervalMs = Number(process.env.CRM_CAMPAIGN_BATCH_INTERVAL_MINUTES || 15) * 60 * 1000;
  const sentToday = Number((await sharedPool.query(`SELECT COUNT(*)::int AS count FROM crm_marketing_campaign_recipients WHERE sent_at >= DATE_TRUNC('day', NOW())`)).rows[0].count || 0);
  const available = Math.max(0, dailyLimit - sentToday);
  if (recipients.length > available) return false;
  await Promise.all(recipients.map((recipient, index) => {
    const batchIndex = Math.floor(index / batchSize);
    return campaignQueue.add('send-recipient', { recipientId: recipient.id, publicBaseUrl: process.env.BASE_URL }, { delay: initialDelay + (batchIndex * batchIntervalMs), attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  }));
  return true;
}

router.post('/campaigns/:id/send-now', async (req,res) => {
  const recipients = await snapshotCampaignRecipients(req.params.id);
  if (!recipients.length) return res.status(400).json({ success:false, message:'Campaign has no sendable recipients' });
  const queued = await queueRecipientsInBatches(recipients, 0);
  if (!queued) return res.status(400).json({ success:false, message:'Daily marketing email limit reached' });
  await sharedPool.query(`UPDATE crm_marketing_campaigns SET status='queued',updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json({ success:true, data:{ queued:recipients.length } });
});

router.post('/campaigns/:id/schedule', async (req,res) => {
  const { scheduled_at } = req.body;
  if (!scheduled_at) return res.status(400).json({ success:false, message:'scheduled_at is required' });
  const recipients = await snapshotCampaignRecipients(req.params.id);
  const delay = Math.max(0, new Date(scheduled_at).getTime() - Date.now());
  const queued = await queueRecipientsInBatches(recipients, delay);
  if (!queued) return res.status(400).json({ success:false, message:'Daily marketing email limit reached' });
  await sharedPool.query(`UPDATE crm_marketing_campaigns SET status='scheduled',scheduled_at=$1,updated_at=NOW() WHERE id=$2`, [scheduled_at, req.params.id]);
  res.json({ success:true, data:{ scheduled_at, queued:recipients.length } });
});

router.get('/campaigns/:id/events', async (req,res) => {
  const { rows } = await sharedPool.query(`SELECT event_type,COUNT(*)::int AS count FROM crm_marketing_events WHERE campaign_id=$1 GROUP BY event_type ORDER BY event_type`, [req.params.id]);
  res.json({ success:true, data:rows });
});
router.post('/webhooks/provider', express.json(), async (req,res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  for (const event of events) {
    const messageId = event.messageId || event.message_id || event["message-id"];
    if (!messageId) continue;
    const recipient = (await sharedPool.query(`SELECT id,campaign_id FROM crm_marketing_campaign_recipients WHERE provider_message_id=$1`, [messageId])).rows[0];
    if (!recipient) continue;
    const type = String(event.event || event.type || "").toLowerCase();
    const mapped = type.includes("bounce") ? "bounced" : type.includes("complaint") ? "complained" : type.includes("deliver") ? "delivered" : null;
    if (!mapped) continue;
    await sharedPool.query(`UPDATE crm_marketing_campaign_recipients SET status=$1,updated_at=NOW() WHERE id=$2`, [mapped,recipient.id]);
    await sharedPool.query(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type,metadata) VALUES ($1,$2,$3,$4)`, [recipient.campaign_id,recipient.id,mapped,JSON.stringify(event)]);
    if (mapped === "bounced" || mapped === "complained") { const email = event.email || event.recipient; if (email) await sharedPool.query(`INSERT INTO crm_marketing_suppressions (email,reason,source_campaign_id) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`, [email,mapped,recipient.campaign_id]); }
  }
  res.json({ success:true });
});
router.get('/campaigns/:id/summary', async (req,res) => {
  const { rows } = await sharedPool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE status='sent')::int AS sent,COUNT(*) FILTER (WHERE status='failed')::int AS failed,COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked FROM crm_marketing_campaign_recipients WHERE campaign_id=$1`, [req.params.id]);
  res.json({ success:true, data:rows[0] });
});

export default router;
