/**
 * CareOS — Dynamic Care Team per patient
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/careos-phase1.migration.js';
import { appendClinicalEvent } from './clinical-timeline.service.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

const MDT_RULES = {
  'septic shock': ['icu_consultant', 'infectious_disease', 'nephrologist', 'clinical_pharmacist', 'microbiology', 'dietitian', 'respiratory_therapist'],
  'sepsis': ['icu_consultant', 'infectious_disease', 'clinical_pharmacist'],
  'nstemi': ['cardiologist', 'clinical_pharmacist', 'cardiac_nursing'],
  'stroke': ['neurologist', 'neurosurgeon', 'cardiologist', 'radiology'],
  'complex': ['icu_consultant', 'clinical_pharmacist'],
};

export async function getOrCreateCareTeam(patientId, organizationId, admissionId) {
  await ensure();
  let { rows } = await pool.query(
    `SELECT * FROM careos_care_teams WHERE organization_id = $1 AND patient_id = $2 AND ($3::bigint IS NULL OR admission_id = $3)`,
    [organizationId, patientId, admissionId || null]
  );
  if (!rows[0]) {
    const ins = await pool.query(
      `INSERT INTO careos_care_teams (organization_id, patient_id, admission_id, name)
       VALUES ($1,$2,$3,'Care Team') RETURNING *`,
      [organizationId, patientId, admissionId || null]
    );
    rows = ins.rows;
  }
  const team = rows[0];
  const members = await pool.query(`SELECT * FROM careos_team_members WHERE team_id = $1 ORDER BY joined_at`, [team.id]);
  return { ...team, members: members.rows };
}

export async function addTeamMember({ teamId, userId, role, specialty, displayName, invitedBy = 'manual' }) {
  await ensure();
  const { rows } = await pool.query(
    `INSERT INTO careos_team_members (team_id, user_id, role, specialty, display_name, invited_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (team_id, role, user_id) DO UPDATE SET status = 'active', joined_at = NOW()
     RETURNING *`,
    [teamId, userId || null, role, specialty || null, displayName || role, invitedBy]
  );
  return rows[0];
}

export async function autoInviteSpecialists(patientId, organizationId, diagnosisText) {
  const team = await getOrCreateCareTeam(patientId, organizationId);
  const dx = String(diagnosisText || '').toLowerCase();
  let roles = [];
  for (const [key, specialists] of Object.entries(MDT_RULES)) {
    if (dx.includes(key)) roles = specialists;
  }
  if (!roles.length) roles = MDT_RULES.complex;

  const invited = [];
  for (const role of roles) {
    const m = await addTeamMember({
      teamId: team.id,
      role,
      displayName: role.replace(/_/g, ' '),
      invitedBy: 'ai_mdt',
    });
    invited.push(m);
    await appendClinicalEvent({
      organizationId,
      patientId,
      eventType: 'specialist_joined',
      title: `${m.display_name} invited to care team`,
      body: `AI suggested invite based on diagnosis context: ${diagnosisText || 'complex case'}`,
      actorType: 'ai',
      actorName: 'CareOS Coordinator',
      severity: 'info',
    });
  }
  return { teamId: team.id, invited };
}

export default { getOrCreateCareTeam, addTeamMember, autoInviteSpecialists };
