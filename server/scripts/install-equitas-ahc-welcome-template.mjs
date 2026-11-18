#!/usr/bin/env node
/**
 * Installs templates/emails/equitas-ahc-welcome.html as Equitas Bank's corporate employee welcome.
 * Dry run unless --apply. Sends nothing, and leaves the reminder email as it is.
 *
 *   node scripts/ssm-env-loader.mjs scripts/install-equitas-ahc-welcome-template.mjs [--apply]
 */
import { readFile } from 'node:fs/promises';
import pool from '../db/pgPool.js';

const EQUITAS_UID = 'C9TV9Y';
const NAME = 'Equitas Complimentary Health Checkup Welcome';
const SUBJECT = 'Your Complimentary Health Checkup from {{companyName}} | Book by {{ahcValidUntil}}';
const EVENT = 'corporate_employee_welcome';

const apply = process.argv.includes('--apply');
const html = await readFile(new URL('../templates/emails/equitas-ahc-welcome.html', import.meta.url), 'utf8');
const client = await pool.connect();

try {
  await client.query('BEGIN');
  const { rows: [corporate] } = await client.query(
    `SELECT id, "companyName", "assignedTo" FROM corporates WHERE unique_id = $1`, [EQUITAS_UID]
  );
  if (!corporate?.assignedTo) throw new Error(`Corporate ${EQUITAS_UID} not found or has no assigned team user`);

  const { rows: [existing] } = await client.query(
    `SELECT id FROM welcome_email_templates WHERE name = $1 AND team_user_id = $2 ORDER BY id LIMIT 1`,
    [NAME, corporate.assignedTo]
  );
  const { rows: [template] } = existing
    ? await client.query(
      `UPDATE welcome_email_templates SET subject = $2, html_content = $3, is_active = true, updated_at = NOW()
        WHERE id = $1 RETURNING id`, [existing.id, SUBJECT, html])
    : await client.query(
      `INSERT INTO welcome_email_templates (name, subject, html_content, team_user_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW()) RETURNING id`, [NAME, SUBJECT, html, corporate.assignedTo]);

  await client.query(
    `INSERT INTO email_event_assignments (event_type, team_user_id, template_id, corporate_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (event_type, corporate_id) WHERE corporate_id IS NOT NULL
     DO UPDATE SET template_id = EXCLUDED.template_id, team_user_id = EXCLUDED.team_user_id, updated_at = NOW()`,
    [EVENT, corporate.assignedTo, template.id, corporate.id]
  );

  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(`${apply ? 'Installed' : 'Dry run, nothing saved'}: "${NAME}" for ${corporate.companyName}`
    + ` (${existing ? 'updated' : 'new'} template, ${html.length} characters).`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
