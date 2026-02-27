/**
 * emailAutoProcessService.js
 *
 * Three core tasks triggered for every inbound email:
 *  1. Auto-create a support ticket (once per email, no duplicates)
 *  2. Detect & save health-report PDFs to the reports table
 *  3. Update the employee's real work email if it differs from the portal email
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';
import EmailInbox from '../models/emailInbox.model.js';
import { createAutoTicket } from './autoTicketService.js';
import logger from '../config/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Known diagnostic / labs domains whose emails carry health reports */
const LAB_DOMAINS = new Set([
  'medall.in', 'thyrocare.com', 'lal.in', 'srl.com',
  'neubergdiagnostics.com', 'agilus.in', 'metropolisindia.com',
  'drmohans.com', 'neuberg.in', 'labindia.com', 'healthspring.in',
  'dianovalabs.com', 'healthians.com', 'redcliffe.in', 'vijayapath.in',
  'vijayapath.com', 'pulseimagingcentre.com', 'pulseimagingcentre.gmail.com',
]);

/** Regexes that indicate subject / filename looks like a health report */
const REPORT_SUBJECT_RE = /\b(health\s*report|lab\s*report|mhc|master\s*health|test\s*result|diagnostic\s*report|blood\s*report|checkup\s*report|medical\s*report|jitul|health\s*check)\b/i;
const REPORT_FILE_RE    = /^(Rpt_|Report|HReport|Lab|Result|MHC|health|Diag)/i;

/** Map aiEmailProcessor intent → ticket category */
const INTENT_TO_CATEGORY = {
  appointment_request:    'health-checkup',
  appointment_cancellation: 'appointment-cancellation',
  appointment_reschedule: 'appointment-reschedule',
  test_result:            'health-report',
  prescription:           'prescription',
  billing:                'billing',
  complaint:              'complaint',
  feedback:               'general',
  patient_query:          'doctor-consultation',
  other:                  'general',
};

/** Priority per intent */
const INTENT_TO_PRIORITY = {
  appointment_cancellation: 'high',
  billing:                  'high',
  complaint:                'high',
  test_result:              'high',
  appointment_request:      'medium',
  prescription:             'medium',
  patient_query:            'medium',
  appointment_reschedule:   'medium',
  feedback:                 'low',
  other:                    'low',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse RFC 2822 from field → { name, email }
 * Handles: "Name" <email@domain>, Name <email@domain>, email@domain alone
 */
function parseSender(rawFrom) {
  if (!rawFrom) return { name: '', email: '' };
  const match = rawFrom.match(/^"?([^"<]+?)"?\s*<([^>]+)>/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, ''),
      email: match[2].trim().toLowerCase(),
    };
  }
  const bare = rawFrom.trim().toLowerCase();
  return { name: '', email: bare };
}

/** Extract the domain part of an email address */
function emailDomain(addr) {
  const parts = addr.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

/**
 * Look up a user in the `users` table by exact email.
 */
async function findUserByEmail(email) {
  if (!email) return null;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT id, "firstName", "lastName", email, organization_id
       FROM users
       WHERE LOWER(email) = LOWER(:email)
       LIMIT 1`,
      { replacements: { email } }
    );
    return rows[0] || null;
  } catch (e) {
    logger.warn('[emailAutoProcess] findUserByEmail error:', e.message);
    return null;
  }
}

/**
 * Look up a user by full name (case-insensitive).
 * Supports "JITUL SHETH" → firstName=JITUL lastName=SHETH
 */
async function findUserByName(fullName) {
  if (!fullName || fullName.length < 3) return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName  = parts.slice(1).join(' ');

  try {
    const [rows] = await postgresSequelize.query(
      `SELECT id, "firstName", "lastName", email, organization_id
       FROM users
       WHERE LOWER("firstName") = LOWER(:firstName)
         AND LOWER("lastName")  = LOWER(:lastName)
       LIMIT 1`,
      { replacements: { firstName, lastName } }
    );
    if (rows[0]) return rows[0];

    // Second try: single-token last name (e.g., "Kanagaraj Palanisamy")
    const [rows2] = await postgresSequelize.query(
      `SELECT id, "firstName", "lastName", email, organization_id
       FROM users
       WHERE LOWER("firstName" || ' ' || COALESCE("lastName",'')) = LOWER(:full)
       LIMIT 1`,
      { replacements: { full: fullName.trim() } }
    );
    return rows2[0] || null;
  } catch (e) {
    logger.warn('[emailAutoProcess] findUserByName error:', e.message);
    return null;
  }
}

// ─── 1. Ticket Creation ───────────────────────────────────────────────────────

/**
 * Create a support ticket for this email (skip if already created).
 * Records ticket_id back onto the email_inboxes row.
 *
 * @param {object} email  EmailInbox model instance
 * @returns {string|null} ticketId created or null if skipped
 */
export async function createTicketFromEmail(email) {
  // Skip if ticket already created for this email
  if (email.ticketId) return null;

  try {
    const sender  = parseSender(email.from);
    const intent  = email.aiIntent || 'other';
    const category = INTENT_TO_CATEGORY[intent] || 'general';
    const priority = INTENT_TO_PRIORITY[intent] || 'medium';

    const requesterName  = email.fromName || sender.name || sender.email || 'Unknown';
    const requesterEmail = sender.email || `${requesterName.toLowerCase().replace(/\s+/g,'')}@email.local`;

    // Build a human-readable description
    const body = email.aiSummary
      || email.body?.slice(0, 500)
      || email.htmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim().slice(0, 500)
      || `Email from ${requesterEmail} regarding: ${email.subject}`;

    const ticket = await createAutoTicket({
      source: 'email',
      requester: { name: requesterName, email: requesterEmail },
      intentLabel: category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      category,
      priority,
      title: `[Email] ${email.subject || `Email from ${requesterName}`}`,
      description: `From: ${email.from}\nSubject: ${email.subject}\nReceived: ${email.receivedAt || email.createdAt}\n\n${body}`,
      tags: ['email', 'auto-created'],
    });

    if (ticket?.ticketId) {
      await email.update({ ticketId: ticket.ticketId });
      logger.info(`[emailAutoProcess] Ticket ${ticket.ticketId} created for email ${email.id}`);
      return ticket.ticketId;
    }

    return null;
  } catch (err) {
    logger.error(`[emailAutoProcess] createTicketFromEmail error for ${email.id}: ${err.message}`);
    return null;
  }
}

// ─── 2. Health Report Detection & Saving ────────────────────────────────────

/**
 * Detect whether an email represents a health / lab report.
 * Returns { isReport, reportName, labName, attachment } or { isReport: false }
 */
export function detectLabReport(email) {
  const sender   = parseSender(email.from || '');
  const domain   = emailDomain(sender.email);
  const fromLab  = LAB_DOMAINS.has(domain);

  // Check for PDF attachments whose names look like reports
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];
  const pdfAttachment = attachments.find(a =>
    (a.mimeType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')) &&
    REPORT_FILE_RE.test(a.filename || '')
  );

  const subjectLooksLikeReport = REPORT_SUBJECT_RE.test(email.subject || '');

  // Require either: (a) email from a known lab domain, or (b) a PDF attachment with report filename
  // Subject alone is too noisy to trigger report saving.
  if (!fromLab && !pdfAttachment) {
    return { isReport: false };
  }

  // Determine lab name
  const labName = email.fromName || sender.name || domain || 'Unknown Lab';

  // Report name: use subject or attachment filename
  const reportName = pdfAttachment?.filename
    ? pdfAttachment.filename.replace(/\.pdf$/i, '')
    : (email.subject || 'Health Report');

  // Sometimes the subject IS the patient name (e.g. "JITUL SHETH" pattern from labs)
  const trimmedSubject = (email.subject || '').trim();
  const subjectWords   = trimmedSubject.split(/\s+/);
  // Subject is a patient name when: 2-4 pure-letter words, no digits/punctuation
  const subjectIsPatientName =
    subjectWords.length >= 2 && subjectWords.length <= 4 &&
    subjectWords.every(w => /^[A-Za-z]{2,}$/.test(w));

  return {
    isReport: true,
    reportName,
    labName,
    attachment: pdfAttachment || null,
    subjectIsPatientName,
    patientName: subjectIsPatientName ? trimmedSubject : null,
  };
}

/**
 * Save a health-report email to the `reports` table for the matched user.
 * Skips if already saved (healthReportSaved = true).
 *
 * @param {object} email  EmailInbox model instance
 * @returns {boolean} true if saved
 */
export async function saveHealthReportFromEmail(email) {
  if (email.healthReportSaved) return false;

  const meta = detectLabReport(email);
  if (!meta.isReport) return false;

  try {
    const sender = parseSender(email.from || '');

    // Resolve which user this report belongs to —
    // Priority: subject = patient name → match by name
    //           FROM email is a corporate user → match by email
    //           TO recipients → find first matching user
    let user = null;

    if (meta.patientName) {
      user = await findUserByName(meta.patientName);
    }

    if (!user && sender.email) {
      user = await findUserByEmail(sender.email);
    }

    // Try TO recipients
    if (!user && Array.isArray(email.to)) {
      for (const addr of email.to) {
        user = await findUserByEmail(typeof addr === 'string' ? addr : addr.address);
        if (user) break;
      }
    }

    if (!user) {
      logger.warn(`[emailAutoProcess] saveHealthReport: no user matched for email ${email.id}`);
      // Mark email so we don't retry forever
      await email.update({ healthReportSaved: false }); // Leave false, we couldn't match
      return false;
    }

    // Prepare insert data for reports table
    const att = meta.attachment;
    const fileName = att?.filename || `${meta.reportName}.pdf`;
    const filePath = att?.downloadUrl || `/api/team/emails/${email.id}/attachment`;
    const fileSize = att?.size || 0;
    const mimeType = att?.mimeType || 'application/pdf';
    const reportDate = email.receivedAt || email.createdAt || new Date();

    // Avoid duplicate report entries for the same email
    const [existingRows] = await postgresSequelize.query(
      `SELECT id FROM reports WHERE metadata->>'emailId' = :emailId LIMIT 1`,
      { replacements: { emailId: email.id } }
    );
    if (existingRows.length > 0) {
      await email.update({ healthReportSaved: true });
      return false; // already exists
    }

    await postgresSequelize.query(
      `INSERT INTO reports
         ("userId", "fileName", "filePath", "fileUrl", "fileSize", "mimeType",
          "reportType", "testName", "labName", "reportDate", status,
          "organization_id", metadata, "uploadedAt", "createdAt", "updatedAt")
       VALUES
         (:userId, :fileName, :filePath, :fileUrl, :fileSize, :mimeType,
          'lab', :testName, :labName, :reportDate, 'active',
          :orgId, :metadata::jsonb, NOW(), NOW(), NOW())`,
      {
        replacements: {
          userId:   user.id,
          fileName,
          filePath,
          fileUrl:  att?.downloadUrl || filePath,
          fileSize,
          mimeType,
          testName: meta.reportName,
          labName:  meta.labName,
          reportDate,
          orgId:    user.organization_id || null,
          metadata: JSON.stringify({
            emailId:    email.id,
            subject:    email.subject,
            from:       email.from,
            receivedAt: email.receivedAt,
          }),
        },
      }
    );

    await email.update({ healthReportSaved: true });
    logger.info(`[emailAutoProcess] Health report saved for user ${user.id} from email ${email.id}`);
    return true;
  } catch (err) {
    logger.error(`[emailAutoProcess] saveHealthReportFromEmail error for ${email.id}: ${err.message}`);
    return false;
  }
}

// ─── 3. Employee Email Update ─────────────────────────────────────────────────

/**
 * Known corporate email domains whose employees have portal accounts.
 * Add more as needed.
 */
const CORPORATE_DOMAINS = new Set([
  'equitasbank.com',
  'equitas.in',
  'healthplus.com',
  // Add more corporate client domains here as needed
]);

/**
 * If the sender of the email is a corporate employee with a work email
 * (e.g., kanagaraj.palanisamy@equitasbank.com) we try to find their user record
 * by name and update it with their real email address.
 *
 * @param {object} email  EmailInbox model instance
 * @returns {boolean} true if email was updated
 */
export async function updateEmployeeEmailFromInbox(email) {
  if (email.employeeEmailUpdated) return false;

  try {
    const sender = parseSender(email.from || '');
    if (!sender.email) return false;

    const domain = emailDomain(sender.email);

    // Only act on known corporate domains
    if (!CORPORATE_DOMAINS.has(domain)) return false;

    // Try to find user by the sender's current email first
    let user = await findUserByEmail(sender.email);

    // If not found, try matching by full name
    if (!user && sender.name) {
      const nameFromField = email.fromName || sender.name;
      user = await findUserByName(nameFromField);
    }

    if (!user) {
      logger.debug(`[emailAutoProcess] employeeEmailUpdate: no match for ${sender.email}`);
      return false;
    }

    // If the portal email is different (e.g. e00679@equitasbank.com vs kanagaraj@equitasbank.com)
    if (user.email?.toLowerCase() === sender.email.toLowerCase()) {
      await email.update({ employeeEmailUpdated: true }); // already up to date
      return false;
    }

    // Update the user's email to the real work email
    await postgresSequelize.query(
      `UPDATE users SET email = :newEmail, "updatedAt" = NOW()
       WHERE id = :userId`,
      { replacements: { newEmail: sender.email, userId: user.id } }
    );

    await email.update({ employeeEmailUpdated: true });
    logger.info(
      `[emailAutoProcess] Updated user ${user.id} email: ${user.email} → ${sender.email}`
    );
    return true;
  } catch (err) {
    logger.error(`[emailAutoProcess] updateEmployeeEmailFromInbox error for ${email.id}: ${err.message}`);
    return false;
  }
}

// ─── Full Processing Pipeline ────────────────────────────────────────────────

/**
 * Run all three tasks on a single email.
 * Safe to call multiple times (each task is idempotent).
 *
 * @param {object} email  EmailInbox model instance
 * @returns {object}  { ticketId, reportSaved, emailUpdated }
 */
export async function processEmailFull(email) {
  const [ticketId, reportSaved, emailUpdated] = await Promise.allSettled([
    createTicketFromEmail(email),
    saveHealthReportFromEmail(email),
    updateEmployeeEmailFromInbox(email),
  ]);

  return {
    emailId: email.id,
    ticketId:     ticketId.value     || null,
    reportSaved:  reportSaved.value  || false,
    emailUpdated: emailUpdated.value || false,
  };
}

/**
 * Batch-process ALL emails for a team member:
 *   - create tickets for any email not yet ticketed
 *   - save health reports from lab emails
 *   - update employee emails from corporate domains
 *
 * @param {number} teamMemberId
 * @param {{ limit?: number }} options
 * @returns {object} stats
 */
export async function batchProcessInbox(teamMemberId, { limit = 500 } = {}) {
  logger.info(`[emailAutoProcess] Batch processing inbox for team member ${teamMemberId}`);

  const emails = await EmailInbox.findAll({
    where: { teamMemberId },
    order: [['receivedAt', 'DESC']],
    limit,
  });

  const stats = {
    total: emails.length,
    ticketsCreated: 0,
    reportsSaved: 0,
    emailsUpdated: 0,
    errors: 0,
  };

  for (const email of emails) {
    try {
      const result = await processEmailFull(email);
      if (result.ticketId)     stats.ticketsCreated++;
      if (result.reportSaved)  stats.reportsSaved++;
      if (result.emailUpdated) stats.emailsUpdated++;
    } catch (err) {
      stats.errors++;
      logger.error(`[emailAutoProcess] batchProcess error for email ${email.id}: ${err.message}`);
    }
  }

  logger.info(`[emailAutoProcess] Batch done for team ${teamMemberId}:`, stats);
  return stats;
}
