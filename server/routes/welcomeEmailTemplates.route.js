import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import nodemailer from 'nodemailer';

const router = express.Router();

export const EVENT_TYPES = [
  { eventType: 'team_welcome', name: 'Team Member Welcome', description: 'Sent when a new team member (staff) account is created', defaultSubject: 'Welcome to Mediqzy - Team Portal Access 👥', color: '#2563eb', variables: ['{{firstName}}', '{{lastName}}', '{{email}}', '{{role}}', '{{department}}', '{{temporaryPassword}}'] },
  { eventType: 'doctor_welcome', name: 'Doctor Welcome', description: 'Sent when a new doctor account is created on the platform', defaultSubject: 'Welcome to Mediqzy - Doctor Portal Access 🏥', color: '#0d9488', variables: ['{{firstName}}', '{{lastName}}', '{{email}}', '{{specialization}}', '{{temporaryPassword}}'] },
  { eventType: 'hospital_welcome', name: 'Hospital Welcome', description: 'Sent when a new hospital/clinic account is created', defaultSubject: 'Welcome to Mediqzy - Hospital Portal Access 🏥', color: '#0d9488', variables: ['{{hospitalName}}', '{{email}}', '{{contactPerson}}', '{{temporaryPassword}}'] },
  { eventType: 'corporate_welcome', name: 'Corporate Welcome', description: 'Sent when a new corporate client account is created', defaultSubject: 'Welcome to Mediqzy - Corporate Portal Access 🏢', color: '#7c3aed', variables: ['{{companyName}}', '{{email}}', '{{contactPerson}}', '{{temporaryPassword}}'] },
  { eventType: "corporate_employee_welcome", name: "Corporate employee welcome_sigin", description: "Sent when a corporate employee account is created", defaultSubject: "Welcome to {{companyName}} Employee Health Portal", color: "#0f766e", variables: ["{{employeeName}}", "{{firstName}}", "{{lastName}}", "{{email}}", "{{username}}", "{{userId}}", "{{loginIdentifier}}", "{{companyName}}", "{{employeeId}}", "{{department}}", "{{temporaryPassword}}", "{{password}}", "{{loginUrl}}", "{{planName}}", "{{coverageAmount}}", "{{planValidity}}", "{{planSponsor}}", "{{planCopay}}", "{{planBenefits}}"] },
  { eventType: "corporate_employee_reminder", name: "Corporate Employee Reminder", description: "Sent as a follow-up nudge to corporate employees who already received a welcome email, with a fresh temporary password", defaultSubject: "Reminder: Activate Your {{companyName}} Health Portal Access", color: "#b45309", variables: ["{{employeeName}}", "{{firstName}}", "{{lastName}}", "{{email}}", "{{username}}", "{{userId}}", "{{loginIdentifier}}", "{{companyName}}", "{{employeeId}}", "{{department}}", "{{temporaryPassword}}", "{{password}}", "{{loginUrl}}", "{{planName}}", "{{coverageAmount}}", "{{planValidity}}", "{{planSponsor}}", "{{planCopay}}", "{{planBenefits}}"] }
];

const VALID_EVENT_TYPES = new Set(EVENT_TYPES.map(e => e.eventType));

function getTransporter() {
  return nodemailer.createTransporter({ host: process.env.SMTP_HOST || 'smtppro.zoho.in', port: parseInt(process.env.SMTP_PORT || '465'), secure: true, auth: { user: process.env.SMTP_USER || 'support@mediqzy.com', pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS } });
}

function hasDangerousContent(html) { return /<script[\s>]/i.test(html); }

// GET / — template library + event assignments
// ?corporateId=N  → also returns per-corporate assignment overrides for that corporate
router.get('/', authUser, async (req, res) => {
  const userId = req.user?.id || req.user?.teamMemberId;
  const corporateId = req.query.corporateId ? parseInt(req.query.corporateId, 10) : null;
  try {
    const templates = await postgresSequelize.query(
      `SELECT id, name, subject, html_content AS "htmlContent", to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt" FROM welcome_email_templates WHERE team_user_id = :userId ORDER BY updated_at DESC`,
      { replacements: { userId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    // Team-user-level assignments (baseline)
    const assignmentRows = await postgresSequelize.query(
      `SELECT eea.event_type AS "eventType", eea.template_id AS "templateId", wet.name AS "templateName", eea.corporate_id AS "corporateId"
       FROM email_event_assignments eea
       LEFT JOIN welcome_email_templates wet ON wet.id = eea.template_id
       WHERE eea.team_user_id = :userId AND eea.corporate_id IS NULL`,
      { replacements: { userId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    const assignments = {};
    for (const row of assignmentRows) assignments[row.eventType] = { templateId: row.templateId, templateName: row.templateName };

    // Per-corporate assignment overrides (if corporateId requested)
    let corporateAssignments = {};
    if (corporateId) {
      const corpRows = await postgresSequelize.query(
        `SELECT eea.event_type AS "eventType", eea.template_id AS "templateId", wet.name AS "templateName"
         FROM email_event_assignments eea
         LEFT JOIN welcome_email_templates wet ON wet.id = eea.template_id
         WHERE eea.corporate_id = :corporateId`,
        { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      for (const row of corpRows) corporateAssignments[row.eventType] = { templateId: row.templateId, templateName: row.templateName };
    }

    res.json({ success: true, data: { templates: Array.isArray(templates) ? templates : [], assignments, corporateAssignments, eventTypes: EVENT_TYPES } });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch templates' });
  }
});

// POST / — create a new template
router.post('/', authUser, async (req, res) => {
  const userId = req.user?.id || req.user?.teamMemberId;
  const { name, subject, htmlContent } = req.body;
  if (!name || !subject || !htmlContent) return res.status(400).json({ success: false, message: 'Name, subject and HTML content are required' });
  if (hasDangerousContent(htmlContent)) return res.status(400).json({ success: false, message: 'Script tags are not allowed in HTML content' });
  try {
    const result = await postgresSequelize.query(
      `INSERT INTO welcome_email_templates (name, subject, html_content, team_user_id, is_active, created_at, updated_at) VALUES (:name, :subject, :htmlContent, :userId, true, NOW(), NOW()) RETURNING id, name, subject, html_content AS "htmlContent", to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt"`,
      { replacements: { name, subject, htmlContent, userId }, type: postgresSequelize.QueryTypes.INSERT }
    );
    const created = Array.isArray(result) && Array.isArray(result[0]) ? result[0][0] : (Array.isArray(result) ? result[0] : result);
    res.json({ success: true, data: created, message: 'Template created successfully' });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ success: false, message: 'Failed to create template' });
  }
});

// PUT /assign — assign or unassign a template to an event type (must be before /:id)
// Body: { eventType, templateId, corporateId? }
// If corporateId is provided → corporate-specific assignment (overrides team-user default)
// If corporateId is absent  → team-user-level assignment (baseline for all corporates)
router.put('/assign', authUser, async (req, res) => {
  const userId = req.user?.id || req.user?.teamMemberId;
  const { eventType, templateId, corporateId } = req.body;
  if (!eventType || !VALID_EVENT_TYPES.has(eventType)) return res.status(400).json({ success: false, message: 'Invalid event type' });
  const corpId = corporateId ? parseInt(corporateId, 10) : null;
  try {
    if (templateId === null || templateId === undefined || templateId === '') {
      // Unassign — corporate-specific or team-user-level
      if (corpId) {
        await postgresSequelize.query(
          'DELETE FROM email_event_assignments WHERE event_type = :eventType AND corporate_id = :corpId',
          { replacements: { eventType, corpId }, type: postgresSequelize.QueryTypes.DELETE }
        );
        return res.json({ success: true, message: 'Corporate template override removed — will fall back to team default' });
      }
      await postgresSequelize.query(
        'DELETE FROM email_event_assignments WHERE event_type = :eventType AND team_user_id = :userId AND corporate_id IS NULL',
        { replacements: { eventType, userId }, type: postgresSequelize.QueryTypes.DELETE }
      );
      return res.json({ success: true, message: 'Template unassigned — event will use built-in default' });
    }

    // Validate template belongs to this team user
    const tplRows = await postgresSequelize.query(
      'SELECT id FROM welcome_email_templates WHERE id = :templateId AND team_user_id = :userId',
      { replacements: { templateId, userId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    if (!tplRows || tplRows.length === 0) return res.status(404).json({ success: false, message: 'Template not found' });

    if (corpId) {
      // Upsert corporate-specific assignment
      await postgresSequelize.query(
        `INSERT INTO email_event_assignments (event_type, team_user_id, template_id, corporate_id, updated_at)
         VALUES (:eventType, :userId, :templateId, :corpId, NOW())
         ON CONFLICT (event_type, corporate_id) WHERE corporate_id IS NOT NULL
         DO UPDATE SET template_id = EXCLUDED.template_id, team_user_id = EXCLUDED.team_user_id, updated_at = NOW()`,
        { replacements: { eventType, userId, templateId, corpId }, type: postgresSequelize.QueryTypes.INSERT }
      );
      return res.json({ success: true, message: 'Template assigned to this corporate' });
    }

    // Team-user-level assignment / global default
    await postgresSequelize.query(
      `INSERT INTO email_event_assignments (event_type, team_user_id, template_id, updated_at)
       VALUES (:eventType, :userId, :templateId, NOW())
       ON CONFLICT (event_type, team_user_id) WHERE corporate_id IS NULL
       DO UPDATE SET template_id = EXCLUDED.template_id, updated_at = NOW()`,
      { replacements: { eventType, userId, templateId }, type: postgresSequelize.QueryTypes.INSERT }
    );
    res.json({ success: true, message: 'Template assigned to event (all corporates default)' });
  } catch (error) {
    console.error('Error assigning template:', error);
    res.status(500).json({ success: false, message: 'Failed to assign template' });
  }
});

// PUT /:id — update a template by ID
router.put('/:id', authUser, async (req, res) => {
  const userId = req.user?.id || req.user?.teamMemberId;
  const { id } = req.params;
  const { name, subject, htmlContent } = req.body;
  if (!name || !subject || !htmlContent) return res.status(400).json({ success: false, message: 'Name, subject and HTML content are required' });
  if (hasDangerousContent(htmlContent)) return res.status(400).json({ success: false, message: 'Script tags are not allowed in HTML content' });
  try {
    await postgresSequelize.query(
      `UPDATE welcome_email_templates SET name = :name, subject = :subject, html_content = :htmlContent, updated_at = NOW() WHERE id = :id AND team_user_id = :userId`,
      { replacements: { id, userId, name, subject, htmlContent }, type: postgresSequelize.QueryTypes.UPDATE }
    );
    res.json({ success: true, message: 'Template updated successfully' });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ success: false, message: 'Failed to update template' });
  }
});

// DELETE /:id — delete a template
router.delete('/:id', authUser, async (req, res) => {
  const userId = req.user?.id || req.user?.teamMemberId;
  const { id } = req.params;
  try {
    await postgresSequelize.query('DELETE FROM welcome_email_templates WHERE id = :id AND team_user_id = :userId', { replacements: { id, userId }, type: postgresSequelize.QueryTypes.DELETE });
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ success: false, message: 'Failed to delete template' });
  }
});

// POST /:id/test — send test email (uses draft content if provided, else loads from DB)
router.post('/:id/test', authUser, async (req, res) => {
  const userId = req.user?.id || req.user?.teamMemberId;
  const { id } = req.params;
  const { testEmail, subject: bodySubject, htmlContent: bodyHtml } = req.body;
  if (!testEmail) return res.status(400).json({ success: false, message: 'testEmail is required' });

  let subject, htmlContent;
  if (bodySubject && bodyHtml) {
    subject = bodySubject; htmlContent = bodyHtml;
  } else {
    const rows = await postgresSequelize.query('SELECT subject, html_content FROM welcome_email_templates WHERE id = :id AND team_user_id = :userId', { replacements: { id, userId }, type: postgresSequelize.QueryTypes.SELECT });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Template not found' });
    subject = rows[0].subject; htmlContent = rows[0].html_content;
  }
  if (hasDangerousContent(htmlContent)) return res.status(400).json({ success: false, message: 'Script tags are not allowed' });

  const sampleValues = { '{{employeeName}}': 'John Doe', '{{firstName}}': 'John', '{{lastName}}': 'Doe', '{{email}}': testEmail, '{{role}}': 'Team Member', '{{department}}': 'General', '{{temporaryPassword}}': 'TempPass@123!', '{{password}}': 'TempPass@123!', '{{username}}': testEmail, '{{loginIdentifier}}': testEmail, '{{specialization}}': 'General Physician', '{{hospitalName}}': 'Sample Hospital', '{{companyName}}': 'Sample Corp Ltd', '{{contactPerson}}': 'John Doe', '{{employeeId}}': 'EMP-001' };
  let rendered = htmlContent; let renderedSubject = subject;
  for (const [k, v] of Object.entries(sampleValues)) { const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); rendered = rendered.replace(re, v); renderedSubject = renderedSubject.replace(re, v); }

  try {
    await getTransporter().sendMail({ from: `"Mediqzy Team" <${process.env.SMTP_USER || 'support@mediqzy.com'}>`, to: testEmail, subject: `[TEST] ${renderedSubject}`, html: rendered });
    res.json({ success: true, message: `Test email sent to ${testEmail}` });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send test email' });
  }
});

export default router;
