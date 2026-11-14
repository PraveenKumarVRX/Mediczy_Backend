/**
 * CareOS — Instant MDT / Clinical Board + AI Consensus
 */
import { AccessToken } from '../../integrations/livekit.js';
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

const livekitUrl = () => process.env.LIVEKIT_URL || 'wss://msh-kw9tvxa9.livekit.cloud';

export async function createMdtCallToken({ sessionId, userId, userName, role = 'specialist' }) {
  await ensure();
  const { rows } = await pool.query(`SELECT * FROM careos_mdt_sessions WHERE id = $1`, [sessionId]);
  const session = rows[0];
  if (!session) {
    return { configured: false, message: 'MDT session not found' };
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = livekitUrl();

  if (!apiKey || !apiSecret) {
    return {
      configured: false,
      room: session.livekit_room,
      message: 'LiveKit not configured — set LIVEKIT_API_KEY and LIVEKIT_API_SECRET',
    };
  }

  const room = session.livekit_room;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `${role}-${userId}`,
    name: userName || `User ${userId}`,
    ttl: '2h',
  });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  return {
    configured: true,
    token: await token.toJwt(),
    room,
    livekitUrl: url,
    sessionId,
  };
}

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function listMdtSessions(organizationId, limit = 25) {
  await ensure();
  const { rows } = await pool.query(
    `SELECT id, patient_id, title, status, livekit_room, created_at
     FROM careos_mdt_sessions
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organizationId, limit]
  );
  return rows;
}

export async function startClinicalBoard({ patientId, organizationId, title, startedBy }) {
  await ensure();
  const room = `careos-patient-${patientId}-${Date.now()}`;
  const { rows } = await pool.query(
    `INSERT INTO careos_mdt_sessions (organization_id, patient_id, title, started_by, livekit_room)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [organizationId, patientId, title || 'Clinical Board', startedBy, room]
  );
  await appendClinicalEvent({
    organizationId,
    patientId,
    eventType: 'mdt_started',
    title: `Clinical Board: ${title}`,
    body: 'Instant MDT started — specialists invited to join',
    actorType: 'doctor',
    actorId: startedBy,
    severity: 'info',
  });
  return rows[0];
}

export async function joinClinicalBoard({ sessionId, userId, userName, role }) {
  await ensure();
  const { rows } = await pool.query(`SELECT * FROM careos_mdt_sessions WHERE id = $1`, [sessionId]);
  const session = rows[0];
  if (!session) return { joined: false, error: 'Session not found' };

  await appendClinicalEvent({
    organizationId: session.organization_id,
    patientId: session.patient_id,
    eventType: 'specialist_joined',
    title: `${userName || role || 'Specialist'} joined Clinical Board`,
    body: session.title,
    actorType: 'specialist',
    actorId: userId,
    actorName: userName || role,
    severity: 'info',
    metadata: { sessionId },
  });

  return { joined: true, session, room: session.livekit_room };
}

export async function recordOpinion({ sessionId, specialistRole, specialistName, opinion, recommendation }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_mdt_opinions (session_id, specialist_role, specialist_name, opinion, recommendation)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [sessionId, specialistRole, specialistName, opinion, recommendation || null]
  );
  const session = await pool.query(`SELECT * FROM careos_mdt_sessions WHERE id = $1`, [sessionId]);
  if (session.rows[0]) {
    await appendClinicalEvent({
      organizationId: session.rows[0].organization_id,
      patientId: session.rows[0].patient_id,
      eventType: 'mdt_opinion',
      title: `${specialistRole}: ${recommendation || opinion.slice(0, 80)}`,
      body: opinion,
      actorType: 'specialist',
      actorName: specialistName || specialistRole,
      severity: 'info',
    });
  }
  return rows[0];
}

export async function getAIConsensus(sessionId) {
  await ensure();
  const { rows: opinions } = await pool.query(
    `SELECT * FROM careos_mdt_opinions WHERE session_id = $1 ORDER BY created_at`,
    [sessionId]
  );
  if (!opinions.length) return { consensus: null, message: 'No opinions recorded yet' };

  const llm = await llmProvider.chat({
    messages: [
      {
        role: 'system',
        content: `Summarize multidisciplinary opinions. Output JSON:
{ "consensusPercent": 0-100, "summary": "", "agreements": [], "conflicts": [{ "topic", "positions" }] }`,
      },
      { role: 'user', content: JSON.stringify(opinions, null, 2) },
    ],
    temperature: 0.2,
    maxTokens: 1000,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let parsed;
  try { parsed = JSON.parse(llm.content || '{}'); } catch { parsed = { summary: llm.content }; }

  return { opinions, consensus: parsed, disclaimer: 'AI consensus is assistive — MDT lead makes final decision' };
}

export default { startClinicalBoard, joinClinicalBoard, recordOpinion, getAIConsensus, createMdtCallToken, listMdtSessions };
