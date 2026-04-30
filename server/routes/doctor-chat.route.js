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
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../db/pgPool.js';
import { authUser } from '../middleware/auth.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── File upload setup ──────────────────────────────────────────────────────
const CHAT_UPLOAD_DIR = path.join(__dirname, '../../uploads/chat');
if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

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
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHAT_UPLOAD_DIR),
    filename:    (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
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

    const { rows } = await pool.query(`
      SELECT
        m.id, m."conversationId", m."senderId", m."senderType",
        m."recipientId", m."recipientType", m.content, m."messageType",
        m.attachments, m.status, m."createdAt"
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
    const attachments = req.body.attachments ? JSON.parse(req.body.attachments) : [];
    const { rows } = await pool.query(`
      INSERT INTO chat_messages
        ("conversationId", "senderId", "senderType", "recipientId", "recipientType",
         content, "messageType", attachments, status, "createdAt", "updatedAt")
      VALUES ($1, $2, 'doctor', $3, $4, $5, $6, $7::jsonb, 'sent', NOW(), NOW())
      RETURNING *
    `, [conversationId, doctorId, recipientId, recipientType, content?.trim() || '', messageType, JSON.stringify(attachments)]);

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
// Upload a file attachment for chat
router.post('/upload', authUser, requireDoctor, (req, res) => {
  chatUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const url = `/api/doctor/chat/files/${req.file.filename}`;
    res.json({
      success: true,
      url,
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  });
});

// ── GET /api/doctor/chat/files/:fileName ────────────────────────────────────
// Serve an uploaded chat file (auth required)
router.get('/files/:fileName', authUser, (req, res) => {
  const safeName = path.basename(req.params.fileName);
  const filePath = path.join(CHAT_UPLOAD_DIR, safeName);
  const resolved = path.resolve(filePath);
  // Path traversal guard
  if (!resolved.startsWith(path.resolve(CHAT_UPLOAD_DIR))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(resolved);
});

export default router;
