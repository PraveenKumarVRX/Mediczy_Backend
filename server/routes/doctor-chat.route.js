/**
 * Doctor Chat Route
 * Handles real-time messaging between:
 *   - Doctor ↔ Patient   (conversationId: patient_{patientId}_doctor_{doctorId})
 *   - Doctor ↔ Nurse     (conversationId: nurse_{nurseId}_doctor_{doctorId})
 *   - Doctor ↔ Doctor    (conversationId: doctor_{otherDocId}_doctor_{myDocId})
 *   - Doctor ↔ Assistant (conversationId: assistant_{assistantId}_doctor_{doctorId})
 *   - Doctor ↔ Team      (conversationId: team_{teamId}_doctor_{doctorId})
 */

import express from 'express';
import multer from 'multer';
import pool from '../db/pgPool.js';
import { authUser } from '../middleware/auth.middleware.js';
import { s3Storage, s3PresignedUrl } from '../utils/s3-storage.js';
import { translateClinical } from '../services/hospital-os/translator.service.js';

let chatTranslationColumnReady = false;
async function ensureChatTranslationColumn() {
  if (chatTranslationColumnReady) return;
  await pool.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS translated_content JSONB`);
  chatTranslationColumnReady = true;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm',
]);

const chatUpload = multer({
  storage: s3Storage('chat'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

const router = express.Router();

// ── Auth guard: doctor only ────────────────────────────────────────────────
const requireDoctor = (req, res, next) => {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const isDoctor = u.userType === 'doctor' || u.role === 'doctor' || u.doctorId;
  if (!isDoctor) return res.status(403).json({ error: 'Doctor access required' });
  next();
};

const getDoctorId = (req) => parseInt(req.user?.id || req.user?.doctorId, 10);

// ── GET /api/doctor/chat/contacts/patients ─────────────────────────────────
// Lists patients who have had an appointment with this doctor
router.get('/contacts/patients', authUser, requireDoctor, async (req, res) => {
  const doctorId = getDoctorId(req);
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT
        p.id,
        u."firstName" || ' ' || u."lastName" AS name,
        NULL AS avatar,
        u.email,
        u."phoneNumber" AS phone,
        (
          SELECT content FROM chat_messages
          WHERE "conversationId" = 'patient_' || p.id || '_doctor_' || $1::text
          ORDER BY "createdAt" DESC LIMIT 1
        ) AS "lastMessage",
        (
          SELECT "createdAt" FROM chat_messages
          WHERE "conversationId" = 'patient_' || p.id || '_doctor_' || $1::text
          ORDER BY "createdAt" DESC LIMIT 1
        ) AS "lastMessageAt",
        (
          SELECT COUNT(*) FROM chat_messages
          WHERE "conversationId" = 'patient_' || p.id || '_doctor_' || $1::text
            AND "recipientId" = $1::integer AND "recipientType" = 'doctor'
            AND status != 'read'
        )::int AS "unreadCount"
      FROM patients p
      JOIN users u ON u.id = p."userId"
      JOIN appointments a ON a."patientId" = p.id
      WHERE a."doctorId" = $1::integer
      ORDER BY "lastMessageAt" DESC NULLS LAST, name
      LIMIT 50
    `, [doctorId]);
    res.json({ success: true, contacts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/doctor/chat/contacts/nurses ────────────────────────────────────
// Lists all nurses (for doctor to initiate chat)
router.get('/contacts/nurses', authUser, requireDoctor, async (req, res) => {
  const doctorId = getDoctorId(req);
  try {
    const { rows } = await pool.query(`
      SELECT
        n.id,
        n."firstName" || ' ' || n."lastName" AS name,
        NULL AS avatar,
        n.email,
        n.specialization,
        (
          SELECT content FROM chat_messages
          WHERE "conversationId" = 'nurse_' || n.id || '_doctor_' || $1::text
          ORDER BY "createdAt" DESC LIMIT 1
        ) AS "lastMessage",
        (
          SELECT "createdAt" FROM chat_messages
          WHERE "conversationId" = 'nurse_' || n.id || '_doctor_' || $1::text
          ORDER BY "createdAt" DESC LIMIT 1
        ) AS "lastMessageAt",
        (
          SELECT COUNT(*) FROM chat_messages
          WHERE "conversationId" = 'nurse_' || n.id || '_doctor_' || $1::text
            AND "recipientId" = $1::integer AND "recipientType" = 'doctor'
            AND status != 'read'
        )::int AS "unreadCount"
      FROM nurses n
      ORDER BY "lastMessageAt" DESC NULLS LAST, name
      LIMIT 100
    `, [doctorId]);
    res.json({ success: true, contacts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/doctor/chat/messages ─────────────────────────────────────────
// Returns conversation list: latest message per contact (patients + nurses)
router.get('/messages', authUser, requireDoctor, async (req, res) => {
  const doctorId = getDoctorId(req);
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON ("conversationId")
        m."conversationId",
        m.content AS "lastMessage",
        m."createdAt" AS "lastMessageAt",
        m."senderId",
        m."senderType",
        m."recipientId",
        m."recipientType",
        (
          SELECT COUNT(*) FROM chat_messages
          WHERE "conversationId" = m."conversationId"
            AND "recipientId" = $1::integer AND "recipientType" = 'doctor'
            AND status != 'read'
        )::int AS "unreadCount"
      FROM chat_messages m
      WHERE m."conversationId" LIKE '%doctor_' || $1::text || '%'
         OR m."conversationId" LIKE '%_' || $1::text
      ORDER BY "conversationId", m."createdAt" DESC
    `, [doctorId]);

    // Sort combined result by most recent
    rows.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.json({ success: true, conversations: rows, count: rows.length });
  } catch (err) {
    console.error('Chat conversation list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/doctor/chat/messages/:conversationId ──────────────────────────
router.get('/messages/:conversationId', authUser, requireDoctor, async (req, res) => {
  const doctorId = getDoctorId(req);
  const { conversationId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
  const before = req.query.before; // ISO timestamp for pagination

  // Security: ensure this doctor is part of this conversation
  if (!conversationId.endsWith(`_doctor_${doctorId}`)) {
    return res.status(403).json({ error: 'Access denied to this conversation' });
  }

  try {
    const params = [conversationId, doctorId, limit];
    const beforeClause = before ? `AND m."createdAt" < $4` : '';
    if (before) params.push(before);

    await ensureChatTranslationColumn();
    const { rows } = await pool.query(`
      SELECT
        m.id, m."conversationId", m."senderId", m."senderType",
        m."recipientId", m."recipientType", m.content, m."messageType",
        m.attachments, m.status, m."createdAt", m.translated_content
      FROM chat_messages m
      WHERE m."conversationId" = $1
        AND (m."senderId" = $2 OR m."recipientId" = $2)
        ${beforeClause}
      ORDER BY m."createdAt" DESC
      LIMIT $3
    `, params);

    // Mark fetched messages as read
    await pool.query(`
      UPDATE chat_messages
      SET status = 'read', "readAt" = NOW()
      WHERE "conversationId" = $1
        AND "recipientId" = $2 AND "recipientType" = 'doctor'
        AND status != 'read'
    `, [conversationId, doctorId]);

    res.json({ success: true, messages: rows.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/doctor/chat/messages ─────────────────────────────────────────
router.post('/messages', authUser, requireDoctor, async (req, res) => {
  const doctorId = getDoctorId(req);
  const { conversationId, recipientId, recipientType, content, messageType = 'text' } = req.body;

  const hasContent = content?.trim();
  const hasAttachments = req.body.attachments && JSON.parse(req.body.attachments).length > 0;
  if (!conversationId || !recipientId || !recipientType || (!hasContent && !hasAttachments)) {
    return res.status(400).json({ error: 'conversationId, recipientId, recipientType, and content or attachment are required' });
  }

  // Allowed team/patient types
  const VALID_TYPES = ['patient', 'nurse', 'doctor', 'assistant', 'team'];
  if (!VALID_TYPES.includes(recipientType)) {
    return res.status(400).json({ error: 'Invalid recipientType' });
  }

  // Security: doctor must be the sender and must own this conversation
  const expectedConvId = `${recipientType}_${recipientId}_doctor_${doctorId}`;
  if (conversationId !== expectedConvId) {
    return res.status(403).json({ error: 'Invalid conversationId' });
  }

  try {
    await ensureChatTranslationColumn();
    const attachments = req.body.attachments ? JSON.parse(req.body.attachments) : [];
    const trimmedContent = content?.trim() || '';

    // Translation Agent: if the doctor is messaging a patient and the
    // patient's language differs from the message's, translate inline so
    // the recipient sees it in their own language without a separate
    // manual "translate this" step. Text-only — real-time voice-to-voice
    // translation during a live call needs infra (streaming ASR + TTS
    // pipeline) this endpoint doesn't have.
    let translatedContent = null;
    if (recipientType === 'patient' && req.body.targetLang && trimmedContent) {
      try {
        const t = await translateClinical({
          text: trimmedContent,
          sourceLang: req.body.sourceLang || 'auto',
          targetLang: req.body.targetLang,
          context: 'consultation_chat',
          audience: 'patient',
        });
        translatedContent = { lang: req.body.targetLang, text: t.translatedText, glossary: t.glossary || [] };
      } catch (err) {
        console.warn('[doctor-chat] translation agent failed:', err.message);
      }
    }

    const { rows } = await pool.query(`
      INSERT INTO chat_messages
        ("conversationId", "senderId", "senderType", "recipientId", "recipientType",
         content, "messageType", attachments, status, translated_content, "createdAt", "updatedAt")
      VALUES ($1, $2, 'doctor', $3, $4, $5, $6, $7::jsonb, 'sent', $8::jsonb, NOW(), NOW())
      RETURNING *
    `, [conversationId, doctorId, recipientId, recipientType, trimmedContent, messageType, JSON.stringify(attachments), translatedContent ? JSON.stringify(translatedContent) : null]);

    res.json({ success: true, message: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/doctor/chat/read/:conversationId ────────────────────────────
router.patch('/read/:conversationId', authUser, requireDoctor, async (req, res) => {
  const doctorId = getDoctorId(req);
  const { conversationId } = req.params;

  if (!conversationId.endsWith(`_doctor_${doctorId}`)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    await pool.query(`
      UPDATE chat_messages
      SET status = 'read', "readAt" = NOW()
      WHERE "conversationId" = $1
        AND "recipientId" = $2 AND "recipientType" = 'doctor'
        AND status != 'read'
    `, [conversationId, doctorId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/doctor/chat/contacts/team ─────────────────────────────────────
// Returns combined list: nurses + other doctors + doctor_assistants + team_members
router.get('/contacts/team', authUser, requireDoctor, async (req, res) => {
  const doctorId = getDoctorId(req);
  try {
    const { rows } = await pool.query(`
      WITH last_msg AS (
        SELECT
          "conversationId",
          MAX("createdAt")                                          AS "lastMessageAt",
          (array_agg(content ORDER BY "createdAt" DESC))[1]        AS "lastMessage"
        FROM chat_messages
        WHERE "conversationId" LIKE '%_doctor_' || $1::text
        GROUP BY "conversationId"
      ),
      unread AS (
        SELECT "conversationId", COUNT(*)::int AS cnt
        FROM chat_messages
        WHERE "conversationId" LIKE '%_doctor_' || $1::text
          AND "recipientId" = $1::integer
          AND "recipientType" = 'doctor'
          AND status != 'read'
        GROUP BY "conversationId"
      )

      -- Nurses
      SELECT
        n.id,
        n."firstName" || ' ' || n."lastName"  AS name,
        n.email,
        NULL::text                             AS avatar,
        n.specialization                       AS role_label,
        'nurse'                                AS "memberType",
        lm."lastMessage",
        lm."lastMessageAt",
        COALESCE(u.cnt, 0)                     AS "unreadCount"
      FROM nurses n
      LEFT JOIN last_msg lm ON lm."conversationId" = 'nurse_' || n.id || '_doctor_' || $1::text
      LEFT JOIN unread    u  ON u."conversationId"  = 'nurse_' || n.id || '_doctor_' || $1::text

      UNION ALL

      -- Other doctors (only those with recent messages, max 50 others)
      SELECT
        d.id,
        d."firstName" || ' ' || d."lastName"  AS name,
        d.email,
        d."profileImage"                       AS avatar,
        d.specialization                       AS role_label,
        'doctor'                               AS "memberType",
        lm."lastMessage",
        lm."lastMessageAt",
        COALESCE(u.cnt, 0)                     AS "unreadCount"
      FROM doctors d
      LEFT JOIN last_msg lm ON lm."conversationId" = 'doctor_' || d.id || '_doctor_' || $1::text
      LEFT JOIN unread    u  ON u."conversationId"  = 'doctor_' || d.id || '_doctor_' || $1::text
      WHERE d.id != $1::integer
        AND lm."lastMessageAt" IS NOT NULL   -- only show doctors we've chatted with

      UNION ALL

      -- Doctor assistants for this doctor
      SELECT
        da.id,
        da."firstName" || ' ' || da."lastName" AS name,
        da.email,
        NULL::text                              AS avatar,
        da.role                                 AS role_label,
        'assistant'                             AS "memberType",
        lm."lastMessage",
        lm."lastMessageAt",
        COALESCE(u.cnt, 0)                      AS "unreadCount"
      FROM doctor_assistants da
      LEFT JOIN last_msg lm ON lm."conversationId" = 'assistant_' || da.id || '_doctor_' || $1::text
      LEFT JOIN unread    u  ON u."conversationId"  = 'assistant_' || da.id || '_doctor_' || $1::text
      WHERE da."doctorId" = $1::integer

      UNION ALL

      -- Platform team members
      SELECT
        tm.id,
        tm."firstName" || ' ' || tm."lastName" AS name,
        tm.email,
        tm."profileImage"                       AS avatar,
        COALESCE(tm.designation, tm.role::text)       AS role_label,
        'team'                                  AS "memberType",
        lm."lastMessage",
        lm."lastMessageAt",
        COALESCE(u.cnt, 0)                      AS "unreadCount"
      FROM team_members tm
      LEFT JOIN last_msg lm ON lm."conversationId" = 'team_' || tm.id || '_doctor_' || $1::text
      LEFT JOIN unread    u  ON u."conversationId"  = 'team_' || tm.id || '_doctor_' || $1::text
      WHERE tm."isActive" = true

      ORDER BY "lastMessageAt" DESC NULLS LAST, name
      LIMIT 200
    `, [doctorId]);
    res.json({ success: true, contacts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/doctor/chat/upload ────────────────────────────────────────────
router.post('/upload', authUser, requireDoctor, (req, res) => {
  chatUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    // req.file.location = S3 URL; req.file.key = S3 object key
    res.json({
      success:  true,
      url:      `/api/doctor/chat/files/${encodeURIComponent(req.file.key)}`,
      s3Key:    req.file.key,
      name:     req.file.originalname,
      size:     req.file.size,
      mimeType: req.file.mimetype,
    });
  });
});

// ── GET /api/doctor/chat/files/:key ─────────────────────────────────────────
// Redirect to a short-lived presigned S3 URL (auth required)
router.get('/files/:key', authUser, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    // Guard: key must start with 'chat/'
    if (!key.startsWith('chat/')) return res.status(403).json({ error: 'Forbidden' });
    const url = await s3PresignedUrl(key, 3600);
    res.redirect(302, url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
