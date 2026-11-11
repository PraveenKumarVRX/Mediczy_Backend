/**
 * CRM Email Inbox — backend routes
 * Mounts at: /api/crm/emails  (via authCRM middleware already applied by app.js)
 *
 * Tables (auto-created on first boot):
 *   crm_email_settings  — SMTP/IMAP config per CRM user
 *   crm_email_inbox     — stored emails per CRM user
 *   crm_email_templates — email templates per CRM user
 */

import express from 'express';
import nodemailer from 'nodemailer';
import multer from 'multer';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { authCRM } from '../middleware/crm.middleware.js';
import sharedPool from '../db/pgPool.js';

import { schemaVerifier, guardedQuery } from '../utils/schema-guard.js';
const router = express.Router();

// ─── Multer for attachments ───────────────────────────────────────────────────
const attachUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10 } });

// ─── Schema: owned by the migration, verified here ───────────────────────────
const SCHEMA_TABLES = ['crm_email_settings', 'crm_email_inbox', 'crm_email_templates'];

const ensureCrmEmailSchema = schemaVerifier({
  pool: sharedPool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015003900-crm-extensions-governance before using CRM email',
});

const guardedPool = guardedQuery(sharedPool, 'Apply migration 20261015003900-crm-extensions-governance before using CRM email');


// ─── SMTP helper ─────────────────────────────────────────────────────────────
async function getSmtpConfig(crmUserId) {
  const { rows } = await guardedPool(
    `SELECT * FROM crm_email_settings WHERE crm_user_id = $1 AND is_active = true ORDER BY is_default DESC, id ASC LIMIT 1`,
    [crmUserId]
  );
  if (!rows.length) throw new Error('No active email configuration found. Please add SMTP settings first.');
  const s = rows[0];
  if (!s.smtp_username || !s.smtp_password) throw new Error('SMTP credentials not configured. Please update email settings.');
  return s;
}

async function createTransporter(settings) {
  return nodemailer.createTransport({
    host:   settings.smtp_host,
    port:   settings.smtp_port || 587,
    secure: settings.smtp_secure,
    auth:   { user: settings.smtp_username, pass: settings.smtp_password },
  });
}

// ─── IMAP sync ───────────────────────────────────────────────────────────────
async function syncImap(settings, daysBack = 30) {
  const imapConfig = {
    user:     settings.imap_username || settings.smtp_username,
    password: settings.imap_password || settings.smtp_password,
    host:     settings.imap_host || 'imap.gmail.com',
    port:     settings.imap_port || 993,
    tls:      settings.imap_secure !== false,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 15000,
    authTimeout: 15000,
  };

  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    let saved = 0;

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) { imap.end(); return reject(err); }

        const since = new Date();
        since.setDate(since.getDate() - daysBack);
        const sinceStr = since.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

        imap.search([['SINCE', sinceStr]], async (searchErr, uids) => {
          if (searchErr || !uids || uids.length === 0) { imap.end(); return resolve({ newEmails: 0 }); }

          const fetch = imap.fetch(uids.slice(-200), { bodies: '', struct: true });
          const emailPromises = [];

          fetch.on('message', (msg) => {
            let rawBuf = '';
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => { rawBuf += chunk.toString('utf8'); });
            });
            msg.once('end', () => {
              emailPromises.push(
                simpleParser(rawBuf).then(async (parsed) => {
                  try {
                    const msgId = parsed.messageId || `${Date.now()}-${Math.random()}`;
                    const fromAddr = parsed.from?.value?.[0]?.address || '';
                    const fromName = parsed.from?.value?.[0]?.name || '';
                    const toAddrs  = (parsed.to?.value || []).map(a => a.address).filter(Boolean);
                    const ccAddrs  = (parsed.cc?.value || []).map(a => a.address).filter(Boolean);
                    const receivedAt = parsed.date || new Date();

                    await guardedPool(
                      `INSERT INTO crm_email_inbox
                         (crm_user_id, settings_id, message_id, folder, from_addr, from_name,
                          to_addrs, cc_addrs, subject, body_text, body_html, received_at)
                       VALUES ($1,$2,$3,'inbox',$4,$5,$6,$7,$8,$9,$10,$11)
                       ON CONFLICT (crm_user_id, message_id) DO NOTHING`,
                      [
                        settings.crm_user_id, settings.id, msgId, fromAddr, fromName,
                        toAddrs, ccAddrs,
                        parsed.subject || '(no subject)',
                        parsed.text?.slice(0, 50000) || null,
                        parsed.html?.slice(0, 200000) || null,
                        receivedAt,
                      ]
                    );
                    saved++;
                  } catch (_) { /* skip duplicates/errors */ }
                }).catch(() => {})
              );
            });
          });

          fetch.once('error', (fetchErr) => { imap.end(); reject(fetchErr); });
          fetch.once('end', async () => {
            await Promise.all(emailPromises);
            await guardedPool(
              `UPDATE crm_email_settings SET last_synced_at = NOW() WHERE id = $1`,
              [settings.id]
            );
            imap.end();
            resolve({ newEmails: saved });
          });
        });
      });
    });

    imap.once('error', (err) => reject(err));
    imap.connect();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS ROUTES
// ═════════════════════════════════════════════════════════════════════════════

/** GET /api/crm/emails/settings */
router.get('/settings', authCRM, async (req, res) => {
  try {
    const { rows } = await guardedPool(
      `SELECT id, display_name, email, provider, smtp_host, smtp_port, smtp_secure,
              smtp_username, imap_host, imap_port, imap_secure, imap_username,
              is_default, is_active, last_synced_at, created_at
       FROM crm_email_settings WHERE crm_user_id = $1 ORDER BY is_default DESC, id ASC`,
      [req.crmUser.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** POST /api/crm/emails/settings */
router.post('/settings', authCRM, async (req, res) => {
  try {
    const {
      display_name, email, provider = 'custom',
      smtp_host, smtp_port = 587, smtp_secure = false,
      smtp_username, smtp_password,
      imap_host, imap_port = 993, imap_secure = true,
      imap_username, imap_password,
      is_default = false,
    } = req.body;

    if (!email) return res.status(400).json({ success: false, message: 'Email address is required' });

    if (is_default) {
      await guardedPool(
        `UPDATE crm_email_settings SET is_default = false WHERE crm_user_id = $1`,
        [req.crmUser.id]
      );
    }

    const { rows } = await guardedPool(
      `INSERT INTO crm_email_settings
         (crm_user_id, display_name, email, provider,
          smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password,
          imap_host, imap_port, imap_secure, imap_username, imap_password, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, display_name, email, provider, smtp_host, smtp_port, smtp_secure,
                 smtp_username, imap_host, imap_port, imap_secure, imap_username,
                 is_default, is_active, created_at`,
      [req.crmUser.id, display_name || null, email, provider,
       smtp_host || null, smtp_port, smtp_secure,
       smtp_username || email, smtp_password || null,
       imap_host || null, imap_port, imap_secure,
       imap_username || smtp_username || email, imap_password || smtp_password || null,
       is_default]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** PUT /api/crm/emails/settings/:id */
router.put('/settings/:id', authCRM, async (req, res) => {
  try {
    const { rows: existing } = await guardedPool(
      `SELECT id FROM crm_email_settings WHERE id = $1 AND crm_user_id = $2`,
      [req.params.id, req.crmUser.id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Settings not found' });

    const {
      display_name, email, provider,
      smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password,
      imap_host, imap_port, imap_secure, imap_username, imap_password,
      is_default, is_active,
    } = req.body;

    if (is_default) {
      await guardedPool(
        `UPDATE crm_email_settings SET is_default = false WHERE crm_user_id = $1 AND id != $2`,
        [req.crmUser.id, req.params.id]
      );
    }

    const { rows } = await guardedPool(
      `UPDATE crm_email_settings SET
        display_name  = COALESCE($1, display_name),
        email         = COALESCE($2, email),
        provider      = COALESCE($3, provider),
        smtp_host     = COALESCE($4, smtp_host),
        smtp_port     = COALESCE($5, smtp_port),
        smtp_secure   = COALESCE($6, smtp_secure),
        smtp_username = COALESCE($7, smtp_username),
        smtp_password = COALESCE($8::TEXT, smtp_password),
        imap_host     = COALESCE($9, imap_host),
        imap_port     = COALESCE($10, imap_port),
        imap_secure   = COALESCE($11, imap_secure),
        imap_username = COALESCE($12, imap_username),
        imap_password = COALESCE($13::TEXT, imap_password),
        is_default    = COALESCE($14, is_default),
        is_active     = COALESCE($15, is_active),
        updated_at    = NOW()
       WHERE id = $16 AND crm_user_id = $17
       RETURNING id, display_name, email, provider, smtp_host, smtp_port, smtp_secure,
                 smtp_username, imap_host, imap_port, imap_secure, imap_username,
                 is_default, is_active, last_synced_at, created_at`,
      [display_name, email, provider,
       smtp_host, smtp_port != null ? smtp_port : null, smtp_secure != null ? smtp_secure : null,
       smtp_username, smtp_password || null,
       imap_host, imap_port != null ? imap_port : null, imap_secure != null ? imap_secure : null,
       imap_username, imap_password || null,
       is_default != null ? is_default : null,
       is_active != null ? is_active : null,
       req.params.id, req.crmUser.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** DELETE /api/crm/emails/settings/:id */
router.delete('/settings/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await guardedPool(
      `DELETE FROM crm_email_settings WHERE id = $1 AND crm_user_id = $2`,
      [req.params.id, req.crmUser.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Settings not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** POST /api/crm/emails/settings/:id/test — test SMTP connection */
router.post('/settings/:id/test', authCRM, async (req, res) => {
  try {
    const { rows } = await guardedPool(
      `SELECT * FROM crm_email_settings WHERE id = $1 AND crm_user_id = $2`,
      [req.params.id, req.crmUser.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Settings not found' });
    const s = rows[0];
    if (!s.smtp_host || !s.smtp_username || !s.smtp_password) {
      return res.status(400).json({ success: false, message: 'SMTP credentials incomplete' });
    }
    const transporter = await createTransporter(s);
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection successful ✓' });
  } catch (e) {
    res.status(400).json({ success: false, message: `SMTP test failed: ${e.message}` });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// INBOX ROUTES
// ═════════════════════════════════════════════════════════════════════════════

/** GET /api/crm/emails/inbox */
router.get('/inbox', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 20, folder = 'inbox', unread_only, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [req.crmUser.id];
    const conditions = [`crm_user_id = $1`];

    if (folder && folder !== 'all') { params.push(folder); conditions.push(`folder = $${params.length}`); }
    if (unread_only === 'true') conditions.push(`is_read = false`);
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(subject ILIKE $${params.length} OR from_addr ILIKE $${params.length} OR from_name ILIKE $${params.length})`);
    }

    const where = conditions.join(' AND ');
    const [{ rows: emails }, { rows: countRows }] = await Promise.all([
      guardedPool(
        `SELECT id, message_id, folder, from_addr, from_name, to_addrs, subject,
                LEFT(body_text, 200) AS body_preview, body_html IS NOT NULL AS has_html,
                is_read, is_starred, received_at
         FROM crm_email_inbox WHERE ${where}
         ORDER BY received_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      guardedPool(`SELECT COUNT(*) FROM crm_email_inbox WHERE ${where}`, params),
    ]);

    res.json({ success: true, data: { emails, total: parseInt(countRows[0].count), page: parseInt(page) } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** GET /api/crm/emails/stats */
router.get('/stats', authCRM, async (req, res) => {
  try {
    const uid = req.crmUser.id;
    const [{ rows: totals }, { rows: unread }] = await Promise.all([
      guardedPool(`SELECT COUNT(*) AS total FROM crm_email_inbox WHERE crm_user_id = $1`, [uid]),
      guardedPool(`SELECT COUNT(*) AS unread FROM crm_email_inbox WHERE crm_user_id = $1 AND is_read = false`, [uid]),
    ]);
    res.json({ success: true, data: { total: parseInt(totals[0].total), unread: parseInt(unread[0].unread) } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATES  (defined before /:id catch-all to prevent route collision)
// ═════════════════════════════════════════════════════════════════════════════

router.get('/templates', authCRM, async (req, res) => {
  try {
    const { rows } = await guardedPool(
      `SELECT * FROM crm_email_templates WHERE crm_user_id = $1 ORDER BY created_at DESC`,
      [req.crmUser.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/templates', authCRM, async (req, res) => {
  try {
    const { name, subject, body, category = 'general' } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Template name required' });
    const { rows } = await guardedPool(
      `INSERT INTO crm_email_templates (crm_user_id, name, subject, body, category)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.crmUser.id, name, subject || null, body || null, category]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/templates/:id', authCRM, async (req, res) => {
  try {
    const { name, subject, body, category } = req.body;
    const { rows } = await guardedPool(
      `UPDATE crm_email_templates SET
         name = COALESCE($1, name), subject = COALESCE($2, subject),
         body = COALESCE($3, body), category = COALESCE($4, category), updated_at = NOW()
       WHERE id = $5 AND crm_user_id = $6 RETURNING *`,
      [name, subject, body, category, req.params.id, req.crmUser.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/templates/:id', authCRM, async (req, res) => {
  try {
    await guardedPool(
      `DELETE FROM crm_email_templates WHERE id = $1 AND crm_user_id = $2`,
      [req.params.id, req.crmUser.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATES  (defined before /:id catch-all to prevent route collision)
// ═════════════════════════════════════════════════════════════════════════════

router.get('/templates', authCRM, async (req, res) => {
  try {
    const { rows } = await guardedPool(
      `SELECT * FROM crm_email_templates WHERE crm_user_id = $1 ORDER BY created_at DESC`,
      [req.crmUser.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/templates', authCRM, async (req, res) => {
  try {
    const { name, subject, body, category = 'general' } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Template name required' });
    const { rows } = await guardedPool(
      `INSERT INTO crm_email_templates (crm_user_id, name, subject, body, category)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.crmUser.id, name, subject || null, body || null, category]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/templates/:id', authCRM, async (req, res) => {
  try {
    const { name, subject, body, category } = req.body;
    const { rows } = await guardedPool(
      `UPDATE crm_email_templates SET
         name = COALESCE($1, name), subject = COALESCE($2, subject),
         body = COALESCE($3, body), category = COALESCE($4, category), updated_at = NOW()
       WHERE id = $5 AND crm_user_id = $6 RETURNING *`,
      [name, subject, body, category, req.params.id, req.crmUser.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/templates/:id', authCRM, async (req, res) => {
  try {
    await guardedPool(
      `DELETE FROM crm_email_templates WHERE id = $1 AND crm_user_id = $2`,
      [req.params.id, req.crmUser.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** GET /api/crm/emails/:id — full email detail */
router.get('/:id', authCRM, async (req, res) => {
  try {
    const { rows } = await guardedPool(
      `SELECT * FROM crm_email_inbox WHERE id = $1 AND crm_user_id = $2`,
      [req.params.id, req.crmUser.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Email not found' });
    // Mark as read
    if (!rows[0].is_read) {
      await guardedPool(`UPDATE crm_email_inbox SET is_read = true WHERE id = $1`, [req.params.id]);
      rows[0].is_read = true;
    }
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** PUT /api/crm/emails/:id/mark-read */
router.put('/:id/mark-read', authCRM, async (req, res) => {
  try {
    await guardedPool(
      `UPDATE crm_email_inbox SET is_read = true WHERE id = $1 AND crm_user_id = $2`,
      [req.params.id, req.crmUser.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** PUT /api/crm/emails/:id/toggle-star */
router.put('/:id/toggle-star', authCRM, async (req, res) => {
  try {
    const { rows } = await guardedPool(
      `UPDATE crm_email_inbox SET is_starred = NOT is_starred WHERE id = $1 AND crm_user_id = $2 RETURNING is_starred`,
      [req.params.id, req.crmUser.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Email not found' });
    res.json({ success: true, data: { isStarred: rows[0].is_starred } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** DELETE /api/crm/emails/:id */
router.delete('/:id', authCRM, async (req, res) => {
  try {
    await guardedPool(
      `DELETE FROM crm_email_inbox WHERE id = $1 AND crm_user_id = $2`,
      [req.params.id, req.crmUser.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SEND + SYNC
// ═════════════════════════════════════════════════════════════════════════════

/** POST /api/crm/emails/send */
router.post('/send', authCRM, attachUpload.array('attachments', 10), async (req, res) => {
  try {
    const { to, cc, bcc, subject, html_content, text_content } = req.body;
    if (!to || !subject) return res.status(400).json({ success: false, message: 'to and subject are required' });

    const settings = await getSmtpConfig(req.crmUser.id);
    const transporter = await createTransporter(settings);

    const attachments = (req.files || []).map(f => ({
      filename: f.originalname, content: f.buffer, contentType: f.mimetype,
    }));

    const info = await transporter.sendMail({
      from:    `"${settings.display_name || 'Mediqzy CRM'}" <${settings.smtp_username}>`,
      to, cc: cc || undefined, bcc: bcc || undefined, subject,
      html:    html_content || (text_content ? `<pre>${text_content}</pre>` : ''),
      text:    text_content || '',
      attachments,
    });

    // Save to sent folder
    await guardedPool(
      `INSERT INTO crm_email_inbox
         (crm_user_id, settings_id, message_id, folder, from_addr, from_name, to_addrs,
          subject, body_text, body_html, is_read, received_at)
       VALUES ($1,$2,$3,'sent',$4,$5,$6,$7,$8,$9,true,NOW())`,
      [req.crmUser.id, settings.id, info.messageId || `sent-${Date.now()}`,
       settings.smtp_username, settings.display_name || '',
       typeof to === 'string' ? to.split(',').map(s => s.trim()) : [to],
       subject, text_content || null, html_content || null]
    );

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (e) {
    console.error('[CRMEmail] send error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

/** POST /api/crm/emails/sync */
router.post('/sync', authCRM, async (req, res) => {
  try {
    const { days_back = 30 } = req.body;
    const { rows } = await guardedPool(
      `SELECT * FROM crm_email_settings WHERE crm_user_id = $1 AND is_active = true ORDER BY is_default DESC LIMIT 1`,
      [req.crmUser.id]
    );
    if (!rows.length) return res.status(400).json({ success: false, message: 'No email configuration found. Please add SMTP/IMAP settings first.' });

    const settings = rows[0];
    if (!settings.imap_host) return res.status(400).json({ success: false, message: 'IMAP host not configured. Please add IMAP settings to enable sync.' });

    const result = await syncImap(settings, Math.min(parseInt(days_back), 180));
    res.json({ success: true, data: result, message: `Synced ${result.newEmails} new emails` });
  } catch (e) {
    console.error('[CRMEmail] sync error:', e.message);
    const msg = e.message?.toLowerCase() || '';
    if (msg.includes('imap') && msg.includes('disabled')) {
      return res.status(400).json({ success: false, code: 'IMAP_DISABLED', message: 'IMAP is disabled on this mailbox. Please enable it in your mail provider settings.' });
    }
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
