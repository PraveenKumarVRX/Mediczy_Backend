/** Phase 1: Structured reporting templates + macros */
import pool from '../../db/pgPool.js';
import { applyTemplate } from './imaging-template-macros.js';

export { applyTemplate };

const DEFAULT_TEMPLATES = [
  {
    modality: 'CT',
    name: 'CT Chest — Standard',
    body: 'TECHNIQUE:\n{{technique}}\n\nFINDINGS:\n{{findings}}\n\nIMPRESSION:\n{{impression}}',
    macros: ['{{technique}}', '{{findings}}', '{{impression}}'],
  },
  {
    modality: 'MRI',
    name: 'MRI Brain — Standard',
    body: 'TECHNIQUE:\n{{technique}}\n\nFINDINGS:\n{{findings}}\n\nIMPRESSION:\n{{impression}}',
    macros: ['{{technique}}', '{{findings}}', '{{impression}}'],
  },
  {
    modality: 'XR',
    name: 'Chest X-Ray — Standard',
    body: 'FINDINGS:\n{{findings}}\n\nIMPRESSION:\n{{impression}}',
    macros: ['{{findings}}', '{{impression}}'],
  },
];

export async function ensureDefaultTemplates(tenantId) {
  for (const tpl of DEFAULT_TEMPLATES) {
    await pool.query(
      `INSERT INTO ris_report_templates (tenant_id, modality, name, body, macros, is_default)
       SELECT $1,$2,$3,$4,$5::jsonb,TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM ris_report_templates WHERE tenant_id = $1 AND modality = $2 AND is_default = TRUE
       )`,
      [tenantId, tpl.modality, tpl.name, tpl.body, JSON.stringify(tpl.macros)],
    );
  }
}

export async function listTemplates(tenantId, modality = null) {
  await ensureDefaultTemplates(tenantId);
  const r = await pool.query(
    `SELECT * FROM ris_report_templates WHERE tenant_id = $1 AND ($2::text IS NULL OR modality = $2)
     ORDER BY is_default DESC, name ASC`,
    [tenantId, modality],
  );
  return r.rows;
}

export async function createTemplate(tenantId, { modality, name, body, macros, createdBy }) {
  const r = await pool.query(
    `INSERT INTO ris_report_templates (tenant_id, modality, name, body, macros, created_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
    [tenantId, modality, name, body, JSON.stringify(macros || []), createdBy],
  );
  return r.rows[0];
}
