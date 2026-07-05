/**
 * CareOS — Global collaboration (cross-border clinical board)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-ecosystem.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';
import { logFederationAudit } from './care-federation.service.js';
import { getOrSyncPassport } from './medical-passport.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function startGlobalClinicalBoard({
  patientId,
  organizationId,
  title,
  hostUserId,
  invitedOrgIds = [],
  languages = ['en'],
}) {
  await ensure();
  const passport = await getOrSyncPassport(patientId, organizationId);
  const room = `careos-global-${patientId}-${Date.now()}`;

  const { rows } = await pool.query(
    `INSERT INTO careos_global_sessions
      (organization_id, patient_id, passport_id, title, host_user_id, livekit_room, invited_orgs, languages)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
    [organizationId, patientId, passport.id, title || 'Global Clinical Board', hostUserId, room, invitedOrgIds, JSON.stringify(languages)]
  );
  const session = rows[0];

  for (const orgId of invitedOrgIds) {
    await pool.query(
      `INSERT INTO careos_global_session_participants (session_id, org_network_id, status)
       VALUES ($1,$2,'invited')`,
      [session.id, orgId]
    );
  }

  await appendClinicalEvent({
    organizationId,
    patientId,
    eventType: 'global_mdt_started',
    title: `Global Clinical Board: ${title}`,
    body: `Cross-border session with ${invitedOrgIds.length} invited organization(s)`,
    actorType: 'doctor',
    actorId: hostUserId,
    severity: 'info',
    metadata: { sessionId: session.id, invitedOrgs: invitedOrgIds },
  });

  await logFederationAudit({
    sessionId: session.id,
    actorUserId: hostUserId,
    actorOrgId: organizationId,
    action: 'global_board_started',
    resourceType: 'global_session',
    resourceId: String(session.id),
    patientId,
  });

  return session;
}

export async function joinGlobalSession({ sessionId, userId, orgNetworkId, displayName, role, languagePreference }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_global_session_participants
      (session_id, org_network_id, user_id, role, display_name, language_preference, status, joined_at)
     VALUES ($1,$2,$3,$4,$5,$6,'joined',NOW())
     RETURNING *`,
    [sessionId, orgNetworkId || null, userId, role, displayName, languagePreference || 'en']
  );
  return rows[0];
}

export async function translateClinicalMessage({ text, sourceLang, targetLang, context }) {
  const llm = await llmProvider.chat({
    messages: [
      {
        role: 'system',
        content: `Translate clinical text from ${sourceLang} to ${targetLang}. Preserve medical terminology accuracy. Output JSON: { "translated", "clinicalTerms" }`,
      },
      { role: 'user', content: `Context: ${context || 'clinical board'}\n\nText:\n${text}` },
    ],
    temperature: 0.1,
    maxTokens: 600,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });
  try {
    return JSON.parse(llm.content || '{}');
  } catch {
    return { translated: llm.content, clinicalTerms: [] };
  }
}

export default { startGlobalClinicalBoard, joinGlobalSession, translateClinicalMessage };
