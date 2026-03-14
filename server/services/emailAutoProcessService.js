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

/** Suffixes stripped from lab report PDF filenames to extract employee name */
const LAB_FILENAME_NOISE_RE = /\s*(MAYDEN|MER|ECG|USG|REPORT|REPORTS|BLOOD\s*REPORTS?|AND\s+ECG|LAB|MEDICAL\s*FITNESS)\s*/gi;

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

/**
 * Look up a user by corporate employeeId (e.g. "E113901") via user_associations.
 */
async function findUserByEmployeeId(empId) {
  if (!empId) return null;
  const normalised = empId.trim().toUpperCase();
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT u.id, u."firstName", u."lastName", u.email, u."phoneNumber", u.organization_id
       FROM user_associations ua
       JOIN users u ON u.id = ua."userId"
       WHERE ua."entityType" = 'corporate'
         AND ua.role = 'employee'
         AND UPPER(ua.metadata->>'employeeId') = :empId
       LIMIT 1`,
      { replacements: { empId: normalised } }
    );
    return rows[0] || null;
  } catch (e) {
    logger.warn('[emailAutoProcess] findUserByEmployeeId error:', e.message);
    return null;
  }
}

/**
 * Extract employee name from a lab-report PDF filename.
 * Strips common suffixes: MAYDEN, MER, ECG, REPORT, etc.
 * Returns cleaned name or null.
 *
 * Examples:
 *   "UMA KANNAN MAYDEN MER.pdf"  → "UMA KANNAN"
 *   "SHANKAR MAYDEN.pdf"         → "SHANKAR"
 *   "GAURAV SINGH BHADOURIA.pdf" → "GAURAV SINGH BHADOURIA"
 *   "Rpt_2602202619240952.PDF"   → null (no extractable name)
 */
function extractNameFromFilename(filename) {
  if (!filename) return null;
  let name = filename.replace(/\.pdf$/i, '').trim();
  // Skip filenames that are just report codes (Rpt_xxxx, 0278ZB001633_...)
  if (/^(Rpt_|[0-9])/i.test(name)) return null;
  // Strip leading "MR." / "MR " / "MRS." / "MS."
  name = name.replace(/^(MR\.?\s*|MRS\.?\s*|MS\.?\s*)/i, '');
  // Strip lab-related suffixes
  name = name.replace(LAB_FILENAME_NOISE_RE, ' ').trim();
  // Clean up  multiple spaces
  name = name.replace(/\s+/g, ' ').trim();
  // Need at least 2 characters of a real name
  if (name.length < 2) return null;
  // Must contain letters
  if (!/[A-Za-z]/.test(name)) return null;
  return name;
}

/**
 * Parse HTML tables from email bodies that contain employee data columns.
 * Looks for tables with headers: empid, empname, contact no, email id
 *
 * Returns array of { empId, name, phone, email } objects.
 */
function parseEmployeeTableFromHtml(html) {
  if (!html) return [];
  const results = [];

  // Simple HTML table parser — extract all <tr> rows
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
  if (!tableMatch) return [];

  for (const tableHtml of tableMatch) {
    const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    if (!rows || rows.length < 2) continue;

    // Parse header row to find column indices
    const headerCells = (rows[0].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
      .map(cell => {
        let text = cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim().toLowerCase();
        // normalise: "contact no" → "contact no", "email id" → "email id"
        return text;
      });

    const idxEmpId   = headerCells.findIndex(h => /emp\s*id/i.test(h));
    const idxEmpName = headerCells.findIndex(h => /emp\s*name/i.test(h));
    const idxPhone   = headerCells.findIndex(h => /contact/i.test(h));
    const idxEmail   = headerCells.findIndex(h => /email/i.test(h));

    // Must have at least name column to be useful
    if (idxEmpName < 0) continue;

    // Parse data rows (skip header)
    for (let r = 1; r < rows.length; r++) {
      const dataCells = (rows[r].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
        .map(cell => cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim());

      const empName = idxEmpName >= 0 ? (dataCells[idxEmpName] || '').trim() : '';
      if (!empName) continue;

      const empId  = idxEmpId >= 0 ? (dataCells[idxEmpId] || '').trim() : '';
      const phone  = idxPhone >= 0 ? (dataCells[idxPhone] || '').replace(/[^0-9+]/g, '').trim() : '';
      const rawEmail = idxEmail >= 0 ? (dataCells[idxEmail] || '').trim() : '';

      // email field may have "work@example.com / personal@gmail.com" — take the corporate one
      let email = '';
      if (rawEmail) {
        const emailParts = rawEmail.split(/[\/,;|]/).map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));
        // Prefer corporate domain emails
        email = emailParts.find(e => CORPORATE_DOMAINS.has(emailDomain(e))) || emailParts[0] || '';
      }

      results.push({ empId, name: empName, phone, email });
    }
  }

  return results;
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
 * Returns { isReport, labName, pdfAttachments, subjectIsPatientName, patientName }
 * or { isReport: false }
 */
export function detectLabReport(email) {
  const sender   = parseSender(email.from || '');
  const domain   = emailDomain(sender.email);
  const fromLab  = LAB_DOMAINS.has(domain);

  // Collect ALL PDF attachments (not just those matching REPORT_FILE_RE)
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];
  const pdfAttachments = attachments.filter(a =>
    (a.mimeType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf'))
  );

  // Also check for legacy-named report files even from non-lab senders
  const legacyReportAtt = pdfAttachments.find(a => REPORT_FILE_RE.test(a.filename || ''));

  // Require either: (a) email from a known lab domain with PDFs, or (b) a legacy report-named PDF
  if (!fromLab && !legacyReportAtt) {
    return { isReport: false };
  }

  // If from lab but no PDFs, not a report
  if (fromLab && pdfAttachments.length === 0) {
    return { isReport: false };
  }

  // Determine lab name
  const labName = email.fromName || sender.name || domain || 'Unknown Lab';

  // Sometimes the subject IS the patient name (e.g. "JITUL SHETH" pattern from labs)
  const trimmedSubject = (email.subject || '').trim();
  const subjectWords   = trimmedSubject.split(/\s+/);
  const subjectIsPatientName =
    subjectWords.length >= 2 && subjectWords.length <= 4 &&
    subjectWords.every(w => /^[A-Za-z.]{2,}$/.test(w));

  return {
    isReport: true,
    labName,
    pdfAttachments: fromLab ? pdfAttachments : (legacyReportAtt ? [legacyReportAtt] : []),
    subjectIsPatientName,
    patientName: subjectIsPatientName ? trimmedSubject : null,
  };
}

/**
 * Save health-report PDFs from lab emails to the `reports` table.
 * Each PDF attachment is matched to an employee by:
 *   1. Employee name extracted from the PDF filename
 *   2. Subject line as patient name
 *   3. Employee data from HTML table in the email thread
 * Skips if already saved (healthReportSaved = true).
 *
 * @param {object} email  EmailInbox model instance
 * @returns {boolean} true if at least one report saved
 */
export async function saveHealthReportFromEmail(email) {
  if (email.healthReportSaved) return false;

  const meta = detectLabReport(email);
  if (!meta.isReport) return false;

  try {
    const reportDate = email.receivedAt || email.createdAt || new Date();

    // Avoid duplicate report entries for the same email
    const [existingRows] = await postgresSequelize.query(
      `SELECT id FROM reports WHERE metadata->>'emailId' = :emailId LIMIT 1`,
      { replacements: { emailId: email.id } }
    );
    if (existingRows.length > 0) {
      await email.update({ healthReportSaved: true });
      return false;
    }

    // Parse employee table from HTML body (ours or quoted in lab reply)
    const htmlBody = email.htmlBody || email.body || '';
    const employeeRows = parseEmployeeTableFromHtml(htmlBody);

    // Build a name→user lookup from the HTML table for matching
    const tableUserCache = new Map();
    for (const row of employeeRows) {
      if (row.name) tableUserCache.set(row.name.toUpperCase(), row);
    }

    // Subject-level fallback user (if subject = patient name)
    let subjectUser = null;
    if (meta.patientName) {
      subjectUser = await findUserByName(meta.patientName);
    }

    let savedCount = 0;

    // Process each PDF attachment separately
    for (const att of meta.pdfAttachments) {
      // Skip non-report inline images
      if (att.filename && /\.(jpg|jpeg|png|gif|bmp)$/i.test(att.filename)) continue;

      let user = null;
      const nameFromFile = extractNameFromFilename(att.filename);

      // Strategy 1: Match employee by name extracted from filename
      if (nameFromFile) {
        // Try exact name match first
        user = await findUserByName(nameFromFile);

        // If not found, try matching against HTML table employee data
        if (!user && tableUserCache.size > 0) {
          const upperName = nameFromFile.toUpperCase();
          for (const [tableName, tableRow] of tableUserCache) {
            // Check if extracted name contains the table name or vice versa
            if (upperName.includes(tableName) || tableName.includes(upperName)) {
              // Found matching row — use empId to look up user precisely
              if (tableRow.empId) {
                user = await findUserByEmployeeId(tableRow.empId);
              }
              if (!user && tableRow.email) {
                user = await findUserByEmail(tableRow.email);
              }
              if (!user) {
                user = await findUserByName(tableRow.name);
              }
              break;
            }
          }
        }
      }

      // Strategy 2: Use subject as patient name (for single-attachment emails)
      if (!user && subjectUser && meta.pdfAttachments.length === 1) {
        user = subjectUser;
      }

      if (!user) {
        logger.debug(`[emailAutoProcess] saveHealthReport: no user match for attachment "${att.filename}" in email ${email.id}`);
        continue;
      }

      const fileName = att.filename || 'Health Report.pdf';
      const filePath = att.downloadUrl || `/api/team/emails/${email.id}/attachment`;
      const reportName = (nameFromFile || att.filename?.replace(/\.pdf$/i, '') || 'Health Report');

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
            fileUrl:  att.downloadUrl || filePath,
            fileSize: att.size || 0,
            mimeType: att.mimeType || 'application/pdf',
            testName: reportName,
            labName:  meta.labName,
            reportDate,
            orgId:    user.organization_id || null,
            metadata: JSON.stringify({
              emailId:      email.id,
              subject:      email.subject,
              from:         email.from,
              receivedAt:   email.receivedAt,
              attachmentId: att.contentId || null,
            }),
          },
        }
      );

      savedCount++;
      logger.info(`[emailAutoProcess] Report "${fileName}" saved for user ${user.id} (email ${email.id})`);
    }

    if (savedCount > 0) {
      await email.update({ healthReportSaved: true });
      logger.info(`[emailAutoProcess] ${savedCount} report(s) saved from email ${email.id}`);
    }

    return savedCount > 0;
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
 * Extract employee info from the email (HTML booking tables or sender domain)
 * and update their user profile: email and phone number.
 *
 * Sources of employee data:
 *   1. HTML tables in booking emails with empid/empname/contact no/email id columns
 *   2. Sender email from a known corporate domain (legacy fallback)
 *
 * @param {object} email  EmailInbox model instance
 * @returns {boolean} true if any user was updated
 */
export async function updateEmployeeEmailFromInbox(email) {
  if (email.employeeEmailUpdated) return false;

  try {
    let updatedCount = 0;

    // ── Strategy 1: Parse HTML table for employee data ──────────────
    const htmlBody = email.htmlBody || email.body || '';
    const employeeRows = parseEmployeeTableFromHtml(htmlBody);

    if (employeeRows.length > 0) {
      for (const row of employeeRows) {
        if (!row.name) continue;

        let user = null;

        // Match by employeeId first (most precise)
        if (row.empId) {
          user = await findUserByEmployeeId(row.empId);
        }

        // Match by corporate email
        if (!user && row.email) {
          user = await findUserByEmail(row.email);
        }

        // Match by name
        if (!user && row.name) {
          user = await findUserByName(row.name);
        }

        if (!user) {
          logger.debug(`[emailAutoProcess] employeeProfileUpdate: no match for "${row.name}" (${row.empId})`);
          continue;
        }

        // Build update fields
        const updates = [];
        const replacements = { userId: user.id };

        // Update email if we have a better one
        if (row.email && user.email?.toLowerCase() !== row.email.toLowerCase()) {
          // Only update if the current email looks auto-generated (e00679@, pending+E@)
          const currentEmail = (user.email || '').toLowerCase();
          const isAutoEmail = /^(e\d+@|pending\+)/i.test(currentEmail);
          if (isAutoEmail || !currentEmail) {
            updates.push('email = :newEmail');
            replacements.newEmail = row.email;
          }
        }

        // Update phone if we have one and it differs
        if (row.phone && row.phone.length >= 10) {
          const currentPhone = (user.phoneNumber || '').replace(/[^0-9]/g, '');
          const newPhone = row.phone.replace(/[^0-9]/g, '');
          if (currentPhone !== newPhone) {
            updates.push('"phoneNumber" = :newPhone');
            replacements.newPhone = row.phone;
          }
        }

        if (updates.length > 0) {
          updates.push('"updatedAt" = NOW()');
          await postgresSequelize.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = :userId`,
            { replacements }
          );
          updatedCount++;
          logger.info(
            `[emailAutoProcess] Updated user ${user.id} profile from email table: ${updates.filter(u => u !== '"updatedAt" = NOW()').join(', ')}`
          );
        }
      }
    }

    // ── Strategy 2: Legacy — sender from corporate domain ───────────
    if (updatedCount === 0 && employeeRows.length === 0) {
      const sender = parseSender(email.from || '');
      if (sender.email) {
        const domain = emailDomain(sender.email);
        if (CORPORATE_DOMAINS.has(domain)) {
          let user = await findUserByEmail(sender.email);
          if (!user && sender.name) {
            user = await findUserByName(email.fromName || sender.name);
          }

          if (user && user.email?.toLowerCase() !== sender.email.toLowerCase()) {
            await postgresSequelize.query(
              `UPDATE users SET email = :newEmail, "updatedAt" = NOW() WHERE id = :userId`,
              { replacements: { newEmail: sender.email, userId: user.id } }
            );
            updatedCount++;
            logger.info(`[emailAutoProcess] Updated user ${user.id} email: ${user.email} → ${sender.email}`);
          }
        }
      }
    }

    if (updatedCount > 0 || employeeRows.length > 0) {
      await email.update({ employeeEmailUpdated: true });
    }

    return updatedCount > 0;
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
