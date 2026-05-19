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
  // Schema migrations — add new columns idempotently
  await sharedPool.query(`
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS reply_to_address VARCHAR(255);
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100) NOT NULL DEFAULT 'email';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS utm_content VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS ab_test_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS ab_test_subject_b TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS ab_test_split INTEGER NOT NULL DEFAULT 50;
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS send_timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata';
    ALTER TABLE crm_marketing_campaigns ADD COLUMN IF NOT EXISTS recipient_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE crm_marketing_suppressions ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE crm_marketing_list_members ADD COLUMN IF NOT EXISTS bounce_type VARCHAR(20);
    ALTER TABLE crm_marketing_list_members ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMPTZ;
  `).catch(e => console.warn('[CRMCampaigns] migration warn:', e.message));
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

// ─── Duplicate campaign ───────────────────────────────────────────────────────
router.post('/campaigns/:id/duplicate', authCRM, async (req, res) => {
  try {
    const src = (await sharedPool.query(`SELECT * FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id])).rows[0];
    if (!src) return res.status(404).json({ error: 'Not found' });
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_marketing_campaigns
         (name,subject,preheader,template_id,sender_id,html_content,text_content,description,tags,
          utm_source,utm_medium,utm_campaign,utm_content,reply_to_address,
          ab_test_enabled,ab_test_subject_b,ab_test_split,send_timezone,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        `Copy of ${src.name}`, src.subject, src.preheader, src.template_id, src.sender_id,
        src.html_content, src.text_content, src.description, src.tags,
        src.utm_source, src.utm_medium, src.utm_campaign, src.utm_content, src.reply_to_address,
        src.ab_test_enabled, src.ab_test_subject_b, src.ab_test_split, src.send_timezone,
        req.crmUser.id,
      ],
    );
    const newId = rows[0].id;
    // copy list associations
    await sharedPool.query(
      `INSERT INTO crm_marketing_campaign_lists (campaign_id,list_id,mode)
       SELECT $1,list_id,mode FROM crm_marketing_campaign_lists WHERE campaign_id=$2`,
      [newId, req.params.id],
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Test send ────────────────────────────────────────────────────────────────
router.post('/campaigns/:id/test-send', authCRM, async (req, res) => {
  try {
    const { emails } = req.body; // string | string[]
    const recipients = (Array.isArray(emails) ? emails : [emails]).filter(e => emailRegex.test(e));
    if (!recipients.length) return res.status(400).json({ error: 'At least one valid email required' });

    const campaign = (await sharedPool.query(`
      SELECT c.*,s.name AS sender_name,s.email AS sender_email,COALESCE(s.reply_to,s.email) AS reply_to
      FROM crm_marketing_campaigns c
      LEFT JOIN crm_marketing_senders s ON s.id=c.sender_id
      WHERE c.id=$1`, [req.params.id])).rows[0];
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const smtp = await getSmtpConfig();
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: Number(smtp.port || 587), secure: Number(smtp.port) === 465,
      auth: { user: smtp.username, pass: smtp.password },
    });

    const sampleVars = { first_name: 'Test', last_name: 'Recipient', company: 'Your Company', city: '', state: '' };
    const html = `<div style="border:2px solid #f59e0b;padding:8px;font-size:11px;font-family:sans-serif;background:#fef3c7;margin-bottom:16px">⚠️ <strong>TEST SEND</strong> — This is a preview copy of your campaign.</div>${renderText(campaign.html_content, sampleVars)}`;
    const subject = `[TEST] ${renderText(campaign.subject, sampleVars)}`;

    const sent = [];
    for (const to of recipients) {
      await transporter.sendMail({
        from: `"${campaign.sender_name || smtp.from_name || 'Mediqzy'}" <${campaign.sender_email || smtp.from_email || smtp.username}>`,
        replyTo: campaign.reply_to_address || campaign.reply_to || campaign.sender_email,
        to, subject,
        html,
        text: `[TEST SEND]\n\n${renderText(campaign.text_content, sampleVars)}`,
      });
      sent.push(to);
    }
    res.json({ success: true, data: { sent } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Pause / Resume / Abort ────────────────────────────────────────────────────
router.post('/campaigns/:id/pause', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `UPDATE crm_marketing_campaigns SET status='paused',updated_at=NOW() WHERE id=$1 AND status IN ('sending','queued','scheduled') RETURNING id,status`,
      [req.params.id],
    );
    if (!rows.length) return res.status(400).json({ error: 'Campaign cannot be paused in its current state' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns/:id/resume', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `UPDATE crm_marketing_campaigns SET status='queued',updated_at=NOW() WHERE id=$1 AND status='paused' RETURNING id,status`,
      [req.params.id],
    );
    if (!rows.length) return res.status(400).json({ error: 'Campaign is not paused' });
    // re-queue pending recipients
    const recipients = (await sharedPool.query(
      `SELECT id FROM crm_marketing_campaign_recipients WHERE campaign_id=$1 AND status IN ('pending','queued')`,
      [req.params.id],
    )).rows;
    const base = process.env.BASE_URL || 'http://localhost:8000';
    for (const r of recipients) {
      await campaignQueue.add('send-recipient', { recipientId: r.id, publicBaseUrl: base }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    }
    res.json({ success: true, data: { status: 'queued', requeued: recipients.length } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns/:id/abort', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `UPDATE crm_marketing_campaigns SET status='cancelled',updated_at=NOW() WHERE id=$1 AND status IN ('queued','scheduled','paused') RETURNING id,status`,
      [req.params.id],
    );
    if (!rows.length) return res.status(400).json({ error: 'Campaign cannot be cancelled in its current state' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE campaign
router.delete('/campaigns/:id', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`SELECT status FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (['sending','queued'].includes(rows[0].status)) return res.status(400).json({ error: 'Cannot delete an active campaign' });
    await sharedPool.query(`DELETE FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── HTML Preview ─────────────────────────────────────────────────────────────
router.get('/campaigns/:id/preview-html', authCRM, async (req, res) => {
  try {
    const campaign = (await sharedPool.query(`SELECT html_content,subject,preheader FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id])).rows[0];
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    const vars = { first_name: 'Preview', last_name: 'User', company: 'Your Company', city: 'Mumbai', state: 'Maharashtra' };
    res.json({ success: true, data: { html: renderText(campaign.html_content, vars), subject: renderText(campaign.subject, vars) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Recipients list ──────────────────────────────────────────────────────────
router.get('/campaigns/:id/recipients', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const statusFilter = status ? `AND status=$3` : '';
    const params = status ? [req.params.id, parseInt(limit), status, offset] : [req.params.id, parseInt(limit), offset];
    const countParam = status ? [req.params.id, status] : [req.params.id];
    const countSql = `SELECT COUNT(*)::int FROM crm_marketing_campaign_recipients WHERE campaign_id=$1${status ? ' AND status=$2' : ''}`;
    const [data, total] = await Promise.all([
      sharedPool.query(
        `SELECT id,email,status,personalization,sent_at,opened_at,clicked_at,last_error,provider_message_id FROM crm_marketing_campaign_recipients WHERE campaign_id=$1 ${statusFilter} ORDER BY created_at DESC LIMIT $2 OFFSET ${status ? '$4' : '$3'}`,
        params,
      ),
      sharedPool.query(countSql, countParam),
    ]);
    res.json({ success: true, data: data.rows, total: total.rows[0].count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Suppression management ───────────────────────────────────────────────────
router.get('/suppressions', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 50, reason, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const wheres = []; const params = [];
    if (reason) { params.push(reason); wheres.push(`reason=$${params.length}`); }
    if (search) { params.push(`%${search}%`); wheres.push(`email ILIKE $${params.length}`); }
    const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
    params.push(parseInt(limit)); const limitIdx = params.length;
    params.push(offset); const offsetIdx = params.length;
    const [data, total] = await Promise.all([
      sharedPool.query(`SELECT id,email,reason,notes,source_campaign_id,created_at FROM crm_marketing_suppressions ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params),
      sharedPool.query(`SELECT COUNT(*)::int FROM crm_marketing_suppressions ${where}`, params.slice(0, -2)),
    ]);
    res.json({ success: true, data: data.rows, total: total.rows[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/suppressions', authCRM, async (req, res) => {
  try {
    const { email, reason = 'manual', notes } = req.body;
    if (!email || !emailRegex.test(email)) return res.status(400).json({ error: 'Valid email required' });
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_marketing_suppressions (email,reason,notes) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET reason=$2,notes=$3,created_at=NOW() RETURNING *`,
      [email.toLowerCase(), reason, notes ?? null],
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/suppressions/:email', authCRM, async (req, res) => {
  try {
    await sharedPool.query(`DELETE FROM crm_marketing_suppressions WHERE email=LOWER($1)`, [req.params.email]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk import suppressions
router.post('/suppressions/import', authCRM, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    let added = 0, skipped = 0;
    for (const row of rows) {
      const email = (row.email || row.Email || row.EMAIL || '').toString().trim().toLowerCase();
      if (!emailRegex.test(email)) { skipped++; continue; }
      await sharedPool.query(
        `INSERT INTO crm_marketing_suppressions (email,reason,notes) VALUES ($1,'imported','Bulk import') ON CONFLICT (email) DO NOTHING`,
        [email],
      );
      added++;
    }
    res.json({ success: true, data: { added, skipped } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── List members CRUD ────────────────────────────────────────────────────────
router.put('/list-members/:memberId', authCRM, async (req, res) => {
  try {
    const { first_name, last_name, company, city, state, status } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_marketing_list_members SET first_name=COALESCE($1,first_name),last_name=COALESCE($2,last_name),company=COALESCE($3,company),city=COALESCE($4,city),state=COALESCE($5,state),status=COALESCE($6,status),updated_at=NOW() WHERE id=$7 RETURNING *`,
      [first_name, last_name, company, city, state, status, req.params.memberId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Member not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/list-members/:memberId', authCRM, async (req, res) => {
  try {
    await sharedPool.query(`DELETE FROM crm_marketing_list_members WHERE id=$1`, [req.params.memberId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Template CRUD additions ──────────────────────────────────────────────────
router.put('/templates/:id', authCRM, async (req, res) => {
  try {
    const { name, subject, preheader, html_content, text_content, category, variables } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_marketing_templates SET name=COALESCE($1,name),subject=COALESCE($2,subject),preheader=COALESCE($3,preheader),html_content=COALESCE($4,html_content),text_content=COALESCE($5,text_content),category=COALESCE($6,category),variables=COALESCE($7::jsonb,variables),updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, subject, preheader, html_content, text_content, category, variables ? JSON.stringify(variables) : null, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/templates/:id', authCRM, async (req, res) => {
  try {
    await sharedPool.query(`DELETE FROM crm_marketing_templates WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update list
router.put('/lists/:id', authCRM, async (req, res) => {
  try {
    const { name, description } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_marketing_lists SET name=COALESCE($1,name),description=COALESCE($2,description),updated_at=NOW() WHERE id=$3 RETURNING *`,
      [name, description, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'List not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/lists/:id', authCRM, async (req, res) => {
  try {
    await sharedPool.query(`DELETE FROM crm_marketing_lists WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
