import express from 'express';
import { marketingRecordReference } from '../services/crm/validation.js';
import multer from 'multer';
import XLSX from '../utils/excel-compat.js';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { authCRM } from '../middleware/crm.middleware.js';
import sharedPool from '../db/pgPool.js';
import { createRedisConnection } from '../config/redis-connection.js';
import { getS3Client, getUploadsBucket, buildPublicFileUrl } from '../services/s3-presign.service.js';
import { snapshotCampaignRecipients, sendCampaignRecipient } from '../services/crm-campaign-dispatcher.service.js';

import { schemaVerifier, guardedQuery } from '../utils/schema-guard.js';
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const emailRegex = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/i;
const campaignQueue = new Queue('crm-campaign-queue', { connection: createRedisConnection() });

const SCHEMA_TABLES = ['crm_marketing_senders', 'crm_marketing_lists', 'crm_marketing_list_members', 'crm_marketing_imports', 'crm_marketing_templates', 'crm_marketing_campaigns', 'crm_marketing_campaign_lists', 'crm_marketing_campaign_recipients', 'crm_marketing_suppressions', 'crm_marketing_events'];

// Owned by the migration and only verified here: creating these on demand
// would let a skipped migration look healthy on tables without its indexes
// and constraints, and would let a request hold an ACCESS EXCLUSIVE lock.
const ensureTables = schemaVerifier({
  sequelize: sharedPool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015003800-crm-campaigns-governance before using CRM campaigns',
});

ensureTables().catch((err) => console.error('[crm-campaigns] schema check failed:', err.message, err.details || ''));

const guardedSharedPool = guardedQuery(sharedPool, 'Apply migration 20261015003800-crm-campaigns-governance before using CRM campaigns');

// Reported at startup so an unmigrated environment shows in the log, not
// only when the first request fails. Boot is not blocked.

async function getSmtpConfig() {
  const { rows } = await guardedSharedPool(`
    SELECT host, port, username, password, "fromEmail" AS from_email, "fromName" AS from_name
    FROM email_configs WHERE "isActive" = true
    ORDER BY "isDefault" DESC, id ASC LIMIT 1
  `);
  if (!rows[0]?.host || !rows[0]?.username || !rows[0]?.password) throw new Error('No active SMTP configuration found');
  return rows[0];
}
const renderText = (input, vars = {}) => String(input || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');

async function snapshotRecipients(campaignId) {
  await guardedSharedPool(`DELETE FROM crm_marketing_campaign_recipients WHERE campaign_id=$1`, [campaignId]);
  const { rows } = await guardedSharedPool(`
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
  const campaign = (await guardedSharedPool(`
    SELECT c.*, s.name AS sender_name, s.email AS sender_email, COALESCE(s.reply_to,s.email) AS reply_to
    FROM crm_marketing_campaigns c LEFT JOIN crm_marketing_senders s ON s.id=c.sender_id WHERE c.id=$1
  `, [campaignId])).rows[0];
  if (!campaign) return;
  const smtp = await getSmtpConfig();
  const transporter = nodemailer.createTransport({ host: smtp.host, port: Number(smtp.port || 587), secure: Number(smtp.port) === 465, auth: { user: smtp.username, pass: smtp.password } });
  const { rows } = await guardedSharedPool(`SELECT * FROM crm_marketing_campaign_recipients WHERE campaign_id=$1 AND status IN ('pending','queued') ORDER BY id`, [campaignId]);
  await guardedSharedPool(`UPDATE crm_marketing_campaigns SET status='sending',updated_at=NOW() WHERE id=$1`, [campaignId]);
  for (const recipient of rows) {
    try {
      await guardedSharedPool(`UPDATE crm_marketing_campaign_recipients SET status='queued',updated_at=NOW() WHERE id=$1`, [recipient.id]);
      const info = await transporter.sendMail({
        from: `"${campaign.sender_name || smtp.from_name || 'Mediqzy'}" <${campaign.sender_email || smtp.from_email || smtp.username}>`,
        replyTo: campaign.reply_to || campaign.sender_email || smtp.from_email,
        to: recipient.email,
        subject: renderText(campaign.subject, recipient.personalization),
        html: renderText(campaign.html_content, recipient.personalization),
        text: renderText(campaign.text_content, recipient.personalization),
      });
      await guardedSharedPool(`UPDATE crm_marketing_campaign_recipients SET status='sent',provider_message_id=$1,sent_at=NOW(),updated_at=NOW() WHERE id=$2`, [info.messageId || null, recipient.id]);
    } catch (error) {
      await guardedSharedPool(`UPDATE crm_marketing_campaign_recipients SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2`, [error.message, recipient.id]);
    }
  }
  await guardedSharedPool(`UPDATE crm_marketing_campaigns SET status='sent',sent_at=NOW(),updated_at=NOW() WHERE id=$1`, [campaignId]);
}

const decodeToken = (token) => { const [campaignId, recipientId] = Buffer.from(token, "base64url").toString("utf8").split(":"); return { campaignId, recipientId }; };
router.get("/public/open/:token", async (req, res) => {
  try { const { campaignId, recipientId } = decodeToken(req.params.token); await guardedSharedPool(`UPDATE crm_marketing_campaign_recipients SET opened_at=COALESCE(opened_at,NOW()),updated_at=NOW() WHERE id=$1 AND campaign_id=$2`, [recipientId,campaignId]); await guardedSharedPool(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type,metadata) VALUES ($1,$2,'open',$3)`, [campaignId,recipientId,JSON.stringify({ ip:req.ip, userAgent:req.get("user-agent") })]); } catch (_) {}
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  res.writeHead(200, { "Content-Type": "image/png", "Content-Length": pixel.length, "Cache-Control": "no-store" }); res.end(pixel);
});
router.get("/public/unsubscribe/:token", async (req, res) => {
  try { const { campaignId, recipientId } = decodeToken(req.params.token); const recipient = (await guardedSharedPool(`SELECT email FROM crm_marketing_campaign_recipients WHERE id=$1 AND campaign_id=$2`, [recipientId,campaignId])).rows[0]; if (recipient) { await guardedSharedPool(`INSERT INTO crm_marketing_suppressions (email,reason,source_campaign_id) VALUES ($1,'unsubscribe',$2) ON CONFLICT (email) DO NOTHING`, [recipient.email,campaignId]); await guardedSharedPool(`UPDATE crm_marketing_campaign_recipients SET status='unsubscribed',updated_at=NOW() WHERE id=$1`, [recipientId]); await guardedSharedPool(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type) VALUES ($1,$2,'unsubscribe')`, [campaignId,recipientId]); } } catch (_) {}
  res.type("html").send("<h1>Unsubscribed</h1><p>You have been removed from future marketing emails.</p>");
router.get("/public/click/:token", async (req, res) => {
  const { url } = req.query;
  try { const { campaignId, recipientId } = decodeToken(req.params.token); await guardedSharedPool(`UPDATE crm_marketing_campaign_recipients SET clicked_at=COALESCE(clicked_at,NOW()),updated_at=NOW() WHERE id=$1 AND campaign_id=$2`, [recipientId,campaignId]); await guardedSharedPool(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type,metadata) VALUES ($1,$2,'click',$3)`, [campaignId,recipientId,JSON.stringify({ url, ip:req.ip, userAgent:req.get("user-agent") })]); } catch (_) {}
  if (url) return res.redirect(String(url));
  res.status(400).send("Missing url");
});
});

router.use(authCRM);

// Legacy marketing records have actor ownership. Fail closed for nested routes
// before importing recipients, previewing content, mutating, or dispatching.
router.use(async (req, res, next) => {
  try {
    let reference;
    try { reference = marketingRecordReference(req.path); } catch { return res.status(404).json({ success:false, message:'Marketing record not found' }); }
    if (reference) {
      const tables = { lists: 'crm_marketing_lists', templates: 'crm_marketing_templates', campaigns: 'crm_marketing_campaigns' };
      const result = reference.kind === 'list-members'
        ? await guardedSharedPool(`SELECT m.id FROM crm_marketing_list_members m JOIN crm_marketing_lists l ON l.id=m.list_id WHERE m.id=$1 AND l.created_by=$2`, [reference.id, req.crmUser.id])
        : await guardedSharedPool(`SELECT id FROM ${tables[reference.kind]} WHERE id=$1 AND created_by=$2`, [reference.id, req.crmUser.id]);
      if (!result.rows.length) return res.status(404).json({ success: false, message: 'Marketing record not found' });
    }
    if (req.body?.sender_id) {
      const result = await guardedSharedPool(`SELECT id FROM crm_marketing_senders WHERE id=$1 AND created_by=$2`, [req.body.sender_id, req.crmUser.id]);
      if (!result.rows.length) return res.status(404).json({ success:false, message:'Sender not found' });
    }
    if (req.body?.list_ids?.length) {
      const result = await guardedSharedPool(`SELECT id FROM crm_marketing_lists WHERE id=ANY($1::bigint[]) AND created_by=$2`, [req.body.list_ids, req.crmUser.id]);
      if (new Set(result.rows.map(r => String(r.id))).size !== new Set(req.body.list_ids.map(String)).size) return res.status(404).json({ success:false, message:'List not found' });
    }
    next();
  } catch (error) { next(error); }
});


router.get('/senders', async (req, res) => {
  res.json({ success: true, data: (await guardedSharedPool(`SELECT * FROM crm_marketing_senders WHERE created_by=$1 ORDER BY is_default DESC,created_at DESC`, [req.crmUser.id])).rows });
});
router.post('/senders', async (req, res) => {
  const { name, email, reply_to, provider='smtp', is_verified=true, is_default=false } = req.body;
  if (!name || !email) return res.status(400).json({ success: false, message: 'name and email are required' });
  if (is_default) await guardedSharedPool(`UPDATE crm_marketing_senders SET is_default=false WHERE created_by=$1`, [req.crmUser.id]);
  const { rows } = await guardedSharedPool(`INSERT INTO crm_marketing_senders (name,email,reply_to,provider,is_verified,is_default,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name,email,reply_to||null,provider,!!is_verified,!!is_default,req.crmUser.id]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/lists', async (req, res) => {
  const { rows } = await guardedSharedPool(`SELECT l.*,COUNT(m.id)::int AS member_count FROM crm_marketing_lists l LEFT JOIN crm_marketing_list_members m ON m.list_id=l.id WHERE l.created_by=$1 GROUP BY l.id ORDER BY l.created_at DESC`, [req.crmUser.id]);
  res.json({ success: true, data: rows });
});
router.post('/lists', async (req, res) => {
  const { name, description, source='manual' } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });
  const { rows } = await guardedSharedPool(`INSERT INTO crm_marketing_lists (name,description,source,created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [name,description||null,source,req.crmUser.id]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.get('/lists/:id', async (req, res) => {
  const [list, members, imports] = await Promise.all([
    guardedSharedPool(`SELECT * FROM crm_marketing_lists WHERE id=$1`, [req.params.id]),
    guardedSharedPool(`SELECT * FROM crm_marketing_list_members WHERE list_id=$1 ORDER BY created_at DESC LIMIT 500`, [req.params.id]),
    guardedSharedPool(`SELECT * FROM crm_marketing_imports WHERE list_id=$1 ORDER BY created_at DESC`, [req.params.id]),
  ]);
  if (!list.rows.length) return res.status(404).json({ success: false, message: 'List not found' });
  res.json({ success: true, data: { ...list.rows[0], members: members.rows, imports: imports.rows } });
});
router.post('/lists/:id/import', upload.single('file'), async (req, res) => {
  if (!req.crmUser.tenantUid) return res.status(400).json({ success:false,message:'Organization context is required' });
  if (!req.file) return res.status(400).json({ success: false, message: 'file is required' });
  let rows;
  try {
    const fileType = /\.csv$/i.test(req.file.originalname) || req.file.mimetype === 'text/csv' ? 'csv' : 'xlsx';
    const workbook = await XLSX.read(req.file.buffer, { type: 'buffer', fileType });
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
  } catch {
    return res.status(400).json({ success: false, message: 'Upload a valid CSV or XLSX file' });
  }
  let valid=0, duplicate=0; const errors=[];
  const bucket = getUploadsBucket();
  let s3Key = null;
  let s3Url = null;
  if (bucket) {
    s3Key = "marketing-imports/list-" + req.params.id + "/" + Date.now() + "_" + crypto.randomBytes(4).toString("hex") + "_" + req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    await getS3Client().send(new PutObjectCommand({ Bucket: bucket, Key: s3Key, Body: req.file.buffer, ContentType: req.file.mimetype || "application/octet-stream" }));
    s3Url = buildPublicFileUrl(s3Key);
  }
  const importId = (await guardedSharedPool(`INSERT INTO crm_marketing_imports (list_id,filename,total_rows,s3_key,s3_url,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [req.params.id,req.file.originalname,rows.length,s3Key,s3Url,req.crmUser.id])).rows[0].id;
  for (let i=0;i<rows.length;i++) {
    const r = rows[i]; const email = String(r.EMAIL || r.email || r.Email || '').trim().toLowerCase();
    if (!emailRegex.test(email)) { errors.push({ row:i+2,email,error:'Invalid email' }); continue; }
    const inserted = await guardedSharedPool(`INSERT INTO crm_marketing_list_members (list_id,email,first_name,last_name,company,city,state,source,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,'import',$8) ON CONFLICT (list_id,email) DO NOTHING RETURNING id`, [req.params.id,email,r.FIRST_NAME||r.first_name||null,r.LAST_NAME||r.last_name||null,r.COMPANY||r.company||r.HOSPITAL_NAME||null,r.CITY||r.city||null,r.STATE||r.state||null,JSON.stringify(r)]);
    const created = inserted.rows.length > 0;
    if (!created) {
      const existing = await guardedSharedPool(`SELECT id FROM crm_marketing_list_members WHERE list_id=$1 AND LOWER(email)=$2 LIMIT 1`, [req.params.id,email]);
      inserted.rows = existing.rows;
    }
    if (inserted.rows.length) {
      const name = [r.FIRST_NAME || r.first_name, r.LAST_NAME || r.last_name].filter(Boolean).join(' ') || email;
      let contact = await guardedSharedPool(`SELECT id FROM crm_contacts WHERE tenant_uid=$1 AND LOWER(email)=$2 ORDER BY id LIMIT 1`, [req.crmUser.tenantUid, email]);
      if (!contact.rows.length) contact = await guardedSharedPool(`INSERT INTO crm_contacts (name,email,company,created_by,tenant_uid) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [name, email, r.COMPANY || r.company || null, req.crmUser.id, req.crmUser.tenantUid]);
      await guardedSharedPool(`UPDATE crm_marketing_list_members SET contact_id=$1 WHERE id=$2`, [contact.rows[0].id, inserted.rows[0].id]);
      if (created) valid++; else duplicate++;
    } else duplicate++;
  }
  await guardedSharedPool(`UPDATE crm_marketing_imports SET status='completed',valid_rows=$1,invalid_rows=$2,duplicate_rows=$3,error_report=$4,completed_at=NOW() WHERE id=$5`, [valid,errors.length,duplicate,JSON.stringify(errors),importId]);
  res.status(201).json({ success: true, data: { importId,totalRows:rows.length,validRows:valid,invalidRows:errors.length,duplicateRows:duplicate,errors } });
});

router.get('/templates', async (req, res) => res.json({ success:true, data:(await guardedSharedPool(`SELECT * FROM crm_marketing_templates WHERE created_by=$1 ORDER BY created_at DESC`, [req.crmUser.id])).rows }));
router.post('/templates', async (req, res) => {
  const { name, subject='', preheader='', html_content='', text_content='', category='general', variables=[] } = req.body;
  if (!name) return res.status(400).json({ success:false, message:'name is required' });
  const { rows } = await guardedSharedPool(`INSERT INTO crm_marketing_templates (name,subject,preheader,html_content,text_content,category,variables,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [name,subject,preheader,html_content,text_content,category,JSON.stringify(variables),req.crmUser.id]);
  res.status(201).json({ success:true, data:rows[0] });
});

router.get('/campaigns', async (req, res) => {
  const { rows } = await guardedSharedPool(`SELECT c.*,s.name AS sender_name,s.email AS sender_email,COUNT(r.id)::int AS recipient_count,COUNT(r.id) FILTER (WHERE r.status='sent')::int AS sent_count,COUNT(r.id) FILTER (WHERE r.status='failed')::int AS failed_count FROM crm_marketing_campaigns c LEFT JOIN crm_marketing_senders s ON s.id=c.sender_id LEFT JOIN crm_marketing_campaign_recipients r ON r.campaign_id=c.id WHERE c.created_by=$1 GROUP BY c.id,s.id ORDER BY c.created_at DESC`, [req.crmUser.id]);
  res.json({ success:true, data:rows });
});
router.post('/campaigns', async (req,res) => {
  const { name, subject='', preheader='', sender_id, html_content='', text_content='', list_ids=[] } = req.body;
  if (!name) return res.status(400).json({ success:false, message:'name is required' });
  const { rows } = await guardedSharedPool(`INSERT INTO crm_marketing_campaigns (name,subject,preheader,sender_id,html_content,text_content,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name,subject,preheader,sender_id||null,html_content,text_content,req.crmUser.id]);
  for (const listId of list_ids) await guardedSharedPool(`INSERT INTO crm_marketing_campaign_lists (campaign_id,list_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [rows[0].id,listId]);
  res.status(201).json({ success:true, data:rows[0] });
});
router.get('/campaigns/:id', async (req,res) => {
  const [campaign, lists, recipients] = await Promise.all([
    guardedSharedPool(`SELECT * FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id]),
    guardedSharedPool(`SELECT list_id FROM crm_marketing_campaign_lists WHERE campaign_id=$1`, [req.params.id]),
    guardedSharedPool(`SELECT COUNT(*)::int AS total FROM crm_marketing_campaign_recipients WHERE campaign_id=$1`, [req.params.id]),
  ]);
  if (!campaign.rows.length) return res.status(404).json({ success:false, message:'Campaign not found' });
  res.json({ success:true, data:{ ...campaign.rows[0], list_ids:lists.rows.map((r)=>r.list_id), recipient_count:recipients.rows[0].total } });
});
router.put('/campaigns/:id', async (req,res) => {
  const { name, subject, preheader, sender_id, html_content, text_content, list_ids } = req.body;
  const { rows } = await guardedSharedPool(`UPDATE crm_marketing_campaigns SET name=COALESCE($1,name),subject=COALESCE($2,subject),preheader=COALESCE($3,preheader),sender_id=COALESCE($4,sender_id),html_content=COALESCE($5,html_content),text_content=COALESCE($6,text_content),updated_at=NOW() WHERE id=$7 AND status IN ('draft','scheduled') RETURNING *`, [name,subject,preheader,sender_id,html_content,text_content,req.params.id]);
  if (!rows.length) return res.status(404).json({ success:false, message:'Campaign not found or locked' });
  if (Array.isArray(list_ids)) { await guardedSharedPool(`DELETE FROM crm_marketing_campaign_lists WHERE campaign_id=$1`, [req.params.id]); for (const listId of list_ids) await guardedSharedPool(`INSERT INTO crm_marketing_campaign_lists (campaign_id,list_id) VALUES ($1,$2)`, [req.params.id,listId]); }
  res.json({ success:true, data:rows[0] });
});
router.post('/campaigns/:id/audience-preview', async (req,res) => res.json({ success:true, data:{ recipient_count:(await snapshotCampaignRecipients(req.params.id)).length } }));

async function queueRecipientsInBatches(recipients, initialDelay = 0) {
  const dailyLimit = Number(process.env.CRM_CAMPAIGN_DAILY_LIMIT || 1000);
  const batchSize = Number(process.env.CRM_CAMPAIGN_BATCH_SIZE || 50);
  const batchIntervalMs = Number(process.env.CRM_CAMPAIGN_BATCH_INTERVAL_MINUTES || 15) * 60 * 1000;
  const sentToday = Number((await guardedSharedPool(`SELECT COUNT(*)::int AS count FROM crm_marketing_campaign_recipients WHERE sent_at >= DATE_TRUNC('day', NOW())`)).rows[0].count || 0);
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
  await guardedSharedPool(`UPDATE crm_marketing_campaigns SET status='queued',updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json({ success:true, data:{ queued:recipients.length } });
});

router.post('/campaigns/:id/schedule', async (req,res) => {
  const { scheduled_at } = req.body;
  if (!scheduled_at) return res.status(400).json({ success:false, message:'scheduled_at is required' });
  const recipients = await snapshotCampaignRecipients(req.params.id);
  const delay = Math.max(0, new Date(scheduled_at).getTime() - Date.now());
  const queued = await queueRecipientsInBatches(recipients, delay);
  if (!queued) return res.status(400).json({ success:false, message:'Daily marketing email limit reached' });
  await guardedSharedPool(`UPDATE crm_marketing_campaigns SET status='scheduled',scheduled_at=$1,updated_at=NOW() WHERE id=$2`, [scheduled_at, req.params.id]);
  res.json({ success:true, data:{ scheduled_at, queued:recipients.length } });
});

router.get('/campaigns/:id/events', async (req,res) => {
  const { rows } = await guardedSharedPool(`SELECT event_type,COUNT(*)::int AS count FROM crm_marketing_events WHERE campaign_id=$1 GROUP BY event_type ORDER BY event_type`, [req.params.id]);
  res.json({ success:true, data:rows });
});
router.post('/webhooks/provider', express.json(), async (req,res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  for (const event of events) {
    const messageId = event.messageId || event.message_id || event["message-id"];
    if (!messageId) continue;
    const recipient = (await guardedSharedPool(`SELECT id,campaign_id FROM crm_marketing_campaign_recipients WHERE provider_message_id=$1`, [messageId])).rows[0];
    if (!recipient) continue;
    const type = String(event.event || event.type || "").toLowerCase();
    const mapped = type.includes("bounce") ? "bounced" : type.includes("complaint") ? "complained" : type.includes("deliver") ? "delivered" : null;
    if (!mapped) continue;
    await guardedSharedPool(`UPDATE crm_marketing_campaign_recipients SET status=$1,updated_at=NOW() WHERE id=$2`, [mapped,recipient.id]);
    await guardedSharedPool(`INSERT INTO crm_marketing_events (campaign_id,recipient_id,event_type,metadata) VALUES ($1,$2,$3,$4)`, [recipient.campaign_id,recipient.id,mapped,JSON.stringify(event)]);
    if (mapped === "bounced" || mapped === "complained") { const email = event.email || event.recipient; if (email) await guardedSharedPool(`INSERT INTO crm_marketing_suppressions (email,reason,source_campaign_id) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`, [email,mapped,recipient.campaign_id]); }
  }
  res.json({ success:true });
});
router.get('/campaigns/:id/summary', async (req,res) => {
  const { rows } = await guardedSharedPool(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE status='sent')::int AS sent,COUNT(*) FILTER (WHERE status='failed')::int AS failed,COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened,COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int AS clicked FROM crm_marketing_campaign_recipients WHERE campaign_id=$1`, [req.params.id]);
  res.json({ success:true, data:rows[0] });
});

// ─── Duplicate campaign ───────────────────────────────────────────────────────
router.post('/campaigns/:id/duplicate', authCRM, async (req, res) => {
  try {
    const src = (await guardedSharedPool(`SELECT * FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id])).rows[0];
    if (!src) return res.status(404).json({ error: 'Not found' });
    const { rows } = await guardedSharedPool(
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
    await guardedSharedPool(
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

    const campaign = (await guardedSharedPool(`
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
    const { rows } = await guardedSharedPool(
      `UPDATE crm_marketing_campaigns SET status='paused',updated_at=NOW() WHERE id=$1 AND status IN ('sending','queued','scheduled') RETURNING id,status`,
      [req.params.id],
    );
    if (!rows.length) return res.status(400).json({ error: 'Campaign cannot be paused in its current state' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns/:id/resume', authCRM, async (req, res) => {
  try {
    const { rows } = await guardedSharedPool(
      `UPDATE crm_marketing_campaigns SET status='queued',updated_at=NOW() WHERE id=$1 AND status='paused' RETURNING id,status`,
      [req.params.id],
    );
    if (!rows.length) return res.status(400).json({ error: 'Campaign is not paused' });
    // re-queue pending recipients
    const recipients = (await guardedSharedPool(
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
    const { rows } = await guardedSharedPool(
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
    const { rows } = await guardedSharedPool(`SELECT status FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (['sending','queued'].includes(rows[0].status)) return res.status(400).json({ error: 'Cannot delete an active campaign' });
    await guardedSharedPool(`DELETE FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── HTML Preview ─────────────────────────────────────────────────────────────
router.get('/campaigns/:id/preview-html', authCRM, async (req, res) => {
  try {
    const campaign = (await guardedSharedPool(`SELECT html_content,subject,preheader FROM crm_marketing_campaigns WHERE id=$1`, [req.params.id])).rows[0];
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
      guardedSharedPool(
        `SELECT id,email,status,personalization,sent_at,opened_at,clicked_at,last_error,provider_message_id FROM crm_marketing_campaign_recipients WHERE campaign_id=$1 ${statusFilter} ORDER BY created_at DESC LIMIT $2 OFFSET ${status ? '$4' : '$3'}`,
        params,
      ),
      guardedSharedPool(countSql, countParam),
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
      guardedSharedPool(`SELECT id,email,reason,notes,source_campaign_id,created_at FROM crm_marketing_suppressions ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params),
      guardedSharedPool(`SELECT COUNT(*)::int FROM crm_marketing_suppressions ${where}`, params.slice(0, -2)),
    ]);
    res.json({ success: true, data: data.rows, total: total.rows[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/suppressions', authCRM, async (req, res) => {
  try {
    const { email, reason = 'manual', notes } = req.body;
    if (!email || !emailRegex.test(email)) return res.status(400).json({ error: 'Valid email required' });
    const { rows } = await guardedSharedPool(
      `INSERT INTO crm_marketing_suppressions (email,reason,notes) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET reason=$2,notes=$3,created_at=NOW() RETURNING *`,
      [email.toLowerCase(), reason, notes ?? null],
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/suppressions/:email', authCRM, async (req, res) => {
  try {
    await guardedSharedPool(`DELETE FROM crm_marketing_suppressions WHERE email=LOWER($1)`, [req.params.email]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk import suppressions
router.post('/suppressions/import', authCRM, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const wb = await XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    let added = 0, skipped = 0;
    for (const row of rows) {
      const email = (row.email || row.Email || row.EMAIL || '').toString().trim().toLowerCase();
      if (!emailRegex.test(email)) { skipped++; continue; }
      await guardedSharedPool(
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
    const { rows } = await guardedSharedPool(
      `UPDATE crm_marketing_list_members SET first_name=COALESCE($1,first_name),last_name=COALESCE($2,last_name),company=COALESCE($3,company),city=COALESCE($4,city),state=COALESCE($5,state),status=COALESCE($6,status),updated_at=NOW() WHERE id=$7 RETURNING *`,
      [first_name, last_name, company, city, state, status, req.params.memberId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Member not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/list-members/:memberId', authCRM, async (req, res) => {
  try {
    await guardedSharedPool(`DELETE FROM crm_marketing_list_members WHERE id=$1`, [req.params.memberId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Template CRUD additions ──────────────────────────────────────────────────
router.put('/templates/:id', authCRM, async (req, res) => {
  try {
    const { name, subject, preheader, html_content, text_content, category, variables } = req.body;
    const { rows } = await guardedSharedPool(
      `UPDATE crm_marketing_templates SET name=COALESCE($1,name),subject=COALESCE($2,subject),preheader=COALESCE($3,preheader),html_content=COALESCE($4,html_content),text_content=COALESCE($5,text_content),category=COALESCE($6,category),variables=COALESCE($7::jsonb,variables),updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, subject, preheader, html_content, text_content, category, variables ? JSON.stringify(variables) : null, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/templates/:id', authCRM, async (req, res) => {
  try {
    await guardedSharedPool(`DELETE FROM crm_marketing_templates WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update list
router.put('/lists/:id', authCRM, async (req, res) => {
  try {
    const { name, description } = req.body;
    const { rows } = await guardedSharedPool(
      `UPDATE crm_marketing_lists SET name=COALESCE($1,name),description=COALESCE($2,description),updated_at=NOW() WHERE id=$3 RETURNING *`,
      [name, description, req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'List not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/lists/:id', authCRM, async (req, res) => {
  try {
    await guardedSharedPool(`DELETE FROM crm_marketing_lists WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
