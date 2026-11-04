/**
 * Corporate Health Checkup Booking Route
 * Allows team members (e.g. parinitha@mysmarthealth.in) to book
 * health checkup appointments for corporate employees and
 * auto-trigger email + WhatsApp notifications to the employee.
 *
 * Also provides health report upload (PDF/image → S3) with
 * immediate email + WhatsApp delivery to the employee.
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { createCorporateCheckupOrder, withCorporateBookingContext } from '../services/corporate-health-checkup-booking.service.js';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import emailServiceModule from '../services/emailService.js';
import whatsappProductionService from '../services/whatsapp-production.service.js';
import { saveCorporateHealthReports } from '../services/corporate-health-reports.service.js';
import { corporateReportDownloadUrl } from '../services/corporate-report-storage-client.js';
import { requireCorporateAccess } from '../middleware/corporateTenant.js';
import { computeReportSla } from '../services/corporate-wellness-mis.service.js';

// ──────────────────────────────────────────────
// Reports are stored in MinIO via uploadToMinio service
// under: health-reports/corp-{corpId}/emp-{empId}/
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Multer — memory storage (file goes straight to S3)
// Accepts PDF and common image types up to 25 MB
// ──────────────────────────────────────────────
const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, JPG, PNG, WEBP, DOC/DOCX files are allowed'));
  }
});

const router = express.Router();

// ──────────────────────────────────────────────
// Helper: Detect auto-generated placeholder emails that aren't real mailboxes
// These are created during bulk employee import and will bounce if sent to.
// Patterns: e12345@equitasbank.com, pending+E12345@..., whatsapp.91xxx@mediczy.whatsapp
// ──────────────────────────────────────────────
function isPlaceholderEmail(email) {
  if (!email) return true;
  const lower = email.toLowerCase().trim();
  if (/^[a-z]{1,3}\d{3,}@/.test(lower)) return true;           // e68851@equitasbank.com
  if (lower.startsWith('pending+')) return true;                // pending+E68851@...
  if (lower.endsWith('@mediczy.whatsapp')) return true;         // whatsapp.91xxx@mediczy.whatsapp
  if (lower.includes('noemail') || lower.includes('no-email')) return true;
  return false;
}

function mapCorporateReportTypeToPatientReportType(reportType, mimeType) {
  const raw = String(reportType || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (raw.includes('prescription')) return 'prescription';
  if (raw.includes('imaging') || raw.includes('xray') || raw.includes('x-ray') || raw.includes('scan')) return 'imaging';
  if (raw.includes('general') || mime.includes('word')) return 'general';
  return 'lab';
}

// Require team or admin role
function requireTeamOrAdmin(req, res, next) {
  const role = req.user?.isAdmin ? 'admin' : req.user?.isTeam ? 'team' : req.user?.role;
  if (!['team', 'admin', 'super_admin', 'team_member', 'team_lead'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Team or admin access required' });
  }
  return next();
}

async function assertCorporateAccessForId(req,res,corporateId){
  let allowed=false;
  await requireCorporateAccess({...req,params:{corporateId}},res,()=>{allowed=true;});
  return allowed;
}

// ──────────────────────────────────────────────
// Helper: Send email using team user's SMTP config from email_settings
// Falls back to global email_configs (id=1) if no team config found
// ──────────────────────────────────────────────
async function assertEmployeeInCorporate(employeeId, corporateId) {
  const sql = [
    "SELECT 1 FROM user_associations",
    "WHERE \"userId\" = :employeeId",
    "AND \"entityType\" = \x27corporate\x27",
    "AND \"entityId\" = :corporateId",
    "AND role = \x27employee\x27",
    "AND status = \x27active\x27",
    "LIMIT 1"
  ].join(" ");
  const [row] = await postgresSequelize.query(sql, {
    replacements: { employeeId: parseInt(employeeId), corporateId: parseInt(corporateId) },
    type: postgresSequelize.QueryTypes.SELECT
  });
  return !!row;
}

async function sendCorporateEmail(teamUserId, { to, subject, html }) {
  // Try team user's email_settings first (e.g. care@mysmarthealth.in)
  const [cfg] = await postgresSequelize.query(
    `SELECT email, display_name, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password
     FROM email_settings
     WHERE user_id = :userId AND is_active = true AND deleted_at IS NULL
     ORDER BY is_default DESC LIMIT 1`,
    { replacements: { userId: teamUserId }, type: postgresSequelize.QueryTypes.SELECT }
  );

  if (cfg && cfg.smtp_host && cfg.smtp_password) {
    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: cfg.smtp_port || 465,
      secure: cfg.smtp_port === 465 || cfg.smtp_secure === true,
      auth: {
        user: cfg.smtp_username || cfg.email,
        pass: cfg.smtp_password
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false', minVersion: 'TLSv1.2' }
    });

    const fromAddr = `"${cfg.display_name || 'Mediqzy Care'}" <${cfg.email}>`;
    const result = await transporter.sendMail({
      from: fromAddr,
      to,
      subject,
      html,
      headers: { 'X-Mediqzy-System': 'true', 'X-Sender-Type': 'corporate-booking' }
    });
    console.log(`✅ [corporate-email] Sent to ${to} via ${cfg.email} (messageId: ${result.messageId})`);
    return result;
  }

  // Fallback: global email_configs
  console.log(`⚠️ [corporate-email] No team email_settings for user ${teamUserId}, using global config`);
  return await emailServiceModule.sendOutboundEmail(1, { to, subject, htmlContent: html });
}

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/employees
// Search corporate employees for booking autocomplete
// ──────────────────────────────────────────────
router.get('/employees', authUser, requireTeamOrAdmin, requireCorporateAccess, async (req, res) => {
  try {
    const { search = '', corporateId } = req.query;
    if (!corporateId) return res.status(400).json({ success: false, message: 'corporateId is required' });
    const searchTerm = `%${search}%`;

    const employees = await postgresSequelize.query(
      `SELECT DISTINCT
         u.id,
         u."firstName",
         u."lastName",
         u.email,
         u."phoneNumber",
         u.gender,
         u."dateOfBirth",
         ce."employeeId", COALESCE(NULLIF(ce.department,''),'General') AS department
       FROM users u
       LEFT JOIN corporate_employees ce ON ce."userId"=u.id AND ce.corporate_id=:corporateId
       LEFT JOIN user_associations ua ON ua."userId"=u.id AND ua."entityId"=:corporateId AND ua."entityType"='corporate' AND ua.role='employee' AND ua.status='active'
       WHERE (ce."isActive"=true OR (ce.id IS NULL AND ua."userId" IS NOT NULL))
         AND (
           LOWER(u."firstName" || ' ' || u."lastName") LIKE LOWER(:search)
           OR LOWER(u.email) LIKE LOWER(:search)
           OR u."phoneNumber" LIKE :search
         )
       ORDER BY u."firstName", u."lastName"
       LIMIT 30`,
      {
        replacements: { corporateId: parseInt(corporateId), search: searchTerm },
        type: postgresSequelize.QueryTypes.SELECT
      }
    );

    // Roster-only employees (HR added them, but no app account is linked yet)
    // have no users.id, so a report can't be attached to them at all - but
    // they shouldn't be invisible to this search either (QA: "latha" is a
    // real employee, search just returned nothing). Surface them separately
    // so the UI can explain why they can't be selected, instead of the
    // search looking like it found nothing.
    let rosterOnlyMatches = [];
    if (employees.length === 0) {
      rosterOnlyMatches = await postgresSequelize.query(
        `SELECT ce."employeeId", ce.email, ce.metadata
           FROM corporate_employees ce
          WHERE ce.corporate_id = :corporateId
            AND ce."userId" IS NULL
            AND ce."isActive" = true
            AND (
              LOWER(COALESCE(ce.metadata->>'firstName','') || ' ' || COALESCE(ce.metadata->>'lastName','')) LIKE LOWER(:search)
              OR LOWER(COALESCE(ce.email, '')) LIKE LOWER(:search)
            )
          LIMIT 10`,
        { replacements: { corporateId: parseInt(corporateId), search: searchTerm }, type: postgresSequelize.QueryTypes.SELECT }
      );
    }

    return res.json({ success: true, employees, rosterOnlyMatches });
  } catch (err) {
    console.error('[corporate-bookings] GET /employees error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/my-corporate
// Returns the corporate assigned to the logged-in team member
// Derived from corporates.assignedTo = req.user.id
// ──────────────────────────────────────────────
router.get('/my-corporate', authUser, requireTeamOrAdmin, async (req, res) => {
  try {
    const teamMemberId = req.user.id;
    const { corporateId } = req.query;

    // Primary: corporates.assignedTo = team member id
    let [corporate] = await postgresSequelize.query(
      `SELECT id, "companyName", email, "phoneNumber", industry, "employeeCount", status, metadata
       FROM corporates
       WHERE "assignedTo" = :teamMemberId AND status = 'Active'
       LIMIT 1`,
      { replacements: { teamMemberId }, type: postgresSequelize.QueryTypes.SELECT }
    );

    // Fallback for admin users: use ?corporateId= param or first active corporate
    if (!corporate && req.user.role === 'admin') {
      if (corporateId) {
        const [adminCorp] = await postgresSequelize.query(
          `SELECT id, "companyName", email, "phoneNumber", industry, "employeeCount", status, metadata
           FROM corporates WHERE id = :corporateId AND status = 'Active' LIMIT 1`,
          { replacements: { corporateId: parseInt(corporateId) }, type: postgresSequelize.QueryTypes.SELECT }
        );
        corporate = adminCorp || null;
      } else {
        const [adminCorp] = await postgresSequelize.query(
          `SELECT id, "companyName", email, "phoneNumber", industry, "employeeCount", status, metadata
           FROM corporates WHERE status = 'Active' ORDER BY id ASC LIMIT 1`,
          { type: postgresSequelize.QueryTypes.SELECT }
        );
        corporate = adminCorp || null;
      }
    }

    if (!corporate) {
      return res.json({ success: true, corporate: null, message: 'No corporate assigned to this team member' });
    }

    // Also get a quick employee count
    const [{ count: employeeCount }] = await postgresSequelize.query(
      `SELECT COUNT(*) AS count FROM corporate_employees WHERE corporate_id = :corporateId AND "isActive" = true`,
      { replacements: { corporateId: corporate.id }, type: postgresSequelize.QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      corporate: { ...corporate, employeeCount: parseInt(employeeCount) || 0 }
    });
  } catch (err) {
    console.error('[corporate-bookings] GET /my-corporate error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/employee-eligibility
// Returns the packages assigned to a specific employee for a corporate,
// including benefit availability (usedAt = null → available)
// ──────────────────────────────────────────────
router.get('/employee-eligibility', authUser, requireTeamOrAdmin, requireCorporateAccess, async (req, res) => {
  try {
    const { employeeId, corporateId } = req.query;

    if (!employeeId || !corporateId) {
      return res.status(400).json({ success: false, message: 'employeeId and corporateId are required' });
    }

    const packages = await postgresSequelize.query(
      `SELECT
         uhp."packageId",
         uhp."packageName",
         uhp."packageDetails",
         uhp."validFrom",
         uhp."validTo",
         uhp.status,
         uhp."usedAt",
         (uhp."usedAt" IS NULL AND uhp.status = 'active' AND uhp."validTo" > NOW()) AS available
       FROM user_health_packages uhp
       WHERE uhp."userId"   = :employeeId
         AND uhp.corporate_id = :corporateId
         AND uhp.status = 'active'
       ORDER BY uhp."packageId"`,
      {
        replacements: { employeeId: parseInt(employeeId), corporateId: parseInt(corporateId) },
        type: postgresSequelize.QueryTypes.SELECT
      }
    );

    const result = packages.map(p => {
      const details = typeof p.packageDetails === 'string'
        ? JSON.parse(p.packageDetails)
        : (p.packageDetails || {});
      return {
        packageId:   p.packageId,
        packageName: p.packageName,
        tests:       details.tests || details.features || [],
        price:       Number(details.price || details.cost || 0),
        description: details.description || '',
        validFrom:   p.validFrom,
        validTo:     p.validTo,
        status:      p.status,
        usedAt:      p.usedAt,
        available:   p.available,
      };
    });

    return res.json({ success: true, eligibility: result });
  } catch (err) {
    console.error('[corporate-bookings] GET /employee-eligibility error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/labs
// Fetch labs assigned to a corporate for the booking dropdown
// ──────────────────────────────────────────────
router.get('/labs', authUser, requireTeamOrAdmin, requireCorporateAccess, async (req, res) => {
  try {
    const { corporateId, search = '' } = req.query;
    if (!corporateId) return res.status(400).json({ success: false, message: 'corporateId is required' });
    const searchTerm = `%${search}%`;

    const labs = await postgresSequelize.query(
      `SELECT
         l.id,
         l.name,
         l.address,
         l.address->>'city'    AS city,
         l.address->>'state'   AS state,
         l.address->>'pinCode' AS "pinCode",
         l."phoneNumber",
         l.accreditation
       FROM corporate_network_assignments cna
       JOIN labs l ON l.id = cna.partner_id
       WHERE cna.corporate_id = :corporateId
         AND cna.partner_type = 'lab'
         AND (
           LOWER(l.name) LIKE LOWER(:search)
           OR LOWER(l.address->>'city') LIKE LOWER(:search)
           OR LOWER(l.address->>'state') LIKE LOWER(:search)
           OR LOWER(l.address->>'street') LIKE LOWER(:search)
         )
       ORDER BY l.name
       LIMIT 30`,
      {
        replacements: { corporateId: parseInt(corporateId), search: searchTerm },
        type: postgresSequelize.QueryTypes.SELECT
      }
    );

    return res.json({ success: true, labs });
  } catch (err) {
    console.error('[corporate-bookings] GET /labs error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/packages
// Fetch health checkup packages for a corporate.
// Primary source: user_health_packages (team-created via admin UI)
// Fallback:       membership_plans (legacy organisation plans)
// ──────────────────────────────────────────────
router.get('/packages', authUser, requireTeamOrAdmin, requireCorporateAccess, async (req, res) => {
  try {
    const { corporateId } = req.query;
    if (!corporateId) return res.status(400).json({ success: false, message: 'corporateId is required' });
    const cid = parseInt(corporateId);

    // 1. Team-created packages stored in user_health_packages
    const catalogRows = await postgresSequelize.query(`SELECT id::text AS id,name,features AS "packageDetails" FROM corporate_health_package_catalog WHERE is_active=true AND metadata->>'kind'='health_checkup' AND metadata->>'corporateId'=:corporateId`,{replacements:{corporateId:String(cid)},type:postgresSequelize.QueryTypes.SELECT});
    const uhpRows = await postgresSequelize.query(
      `SELECT DISTINCT ON ("packageId")
         "packageId"    AS id,
         "packageName"  AS name,
         "packageDetails"
       FROM user_health_packages
       WHERE corporate_id = :corporateId
         AND status = 'active'
       ORDER BY "packageId", "createdAt" DESC`,
      { replacements: { corporateId: cid }, type: postgresSequelize.QueryTypes.SELECT }
    );

    const uhpPackages = [...catalogRows,...uhpRows.filter(p=>!catalogRows.some(c=>c.id===p.id))].map(p => {
      const details = typeof p.packageDetails === 'string'
        ? JSON.parse(p.packageDetails)
        : (p.packageDetails || {});
      return {
        id:          p.id,
        name:        p.name,
        description: details.description || '',
        features:    details.tests || details.features || [],
        price:       Number(details.price || details.cost || 0),
        planType:    'health_checkup',
      };
    });

    // 2. Legacy membership_plans — ONLY used as fallback when no
    //    team-created packages exist in user_health_packages
    let planPackages = [];
    if (uhpPackages.length === 0) {
      const planRows = await postgresSequelize.query(
        `SELECT
           mp.id::text AS id,
           mp.name,
           mp.description,
           mp.features,
           mp."planType",
           COALESCE(mp."discountedPrice", mp.price) AS price
         FROM membership_plans mp
         WHERE mp."organizationId" = :corporateId
           AND mp."organizationType" = 'corporate'
           AND mp."isActive" = true
         ORDER BY mp."sortOrder" ASC NULLS LAST, mp.name ASC
         LIMIT 50`,
        { replacements: { corporateId: cid }, type: postgresSequelize.QueryTypes.SELECT }
      );

      planPackages = planRows.map(p => ({
        id:          p.id,
        name:        p.name,
        description: p.description || '',
        features:    p.features || [],
        price:       Number(p.price || 0),
        planType:    p.planType || 'health_checkup',
      }));
    }

    return res.json({ success: true, packages: [...uhpPackages, ...planPackages] });
  } catch (err) {
    console.error('[corporate-bookings] GET /packages error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/corporate-bookings/health-checkup
// Book a health checkup for an Equitas employee
// Sends email + WhatsApp to employee
// ──────────────────────────────────────────────
router.post('/health-checkup', authUser, requireTeamOrAdmin, requireCorporateAccess, async (req, res) => {
  const {
    employeeId,          // user.id of the employee
    labId,               // lab.id
    labName,             // lab display name
    labAddress,          // lab address string
    checkupDate,         // 'YYYY-MM-DD'
    checkupTime,         // 'HH:MM' or slot string
    testPackage,         // e.g. "Annual Health Checkup", "CBC + LFT + KFT"
    notes = '',
    corporateId,
    corporateName = '',
    sendEmail = true,
    sendWhatsapp = true
  } = req.body;

  if (!corporateId) {
    return res.status(400).json({ success: false, message: 'corporateId is required' });
  }
  if (!employeeId || !labId || !checkupDate || !testPackage) {
    return res.status(400).json({
      success: false,
      message: 'employeeId, labId, checkupDate and testPackage are required'
    });
  }

  try {
    // ── 1. Fetch employee details ──────────────────────────────────
    const [employee] = await postgresSequelize.query(
      `SELECT id, "firstName", "lastName", email, "phoneNumber", gender
       FROM users WHERE id = :employeeId LIMIT 1`,
      {
        replacements: { employeeId: parseInt(employeeId) },
        type: postgresSequelize.QueryTypes.SELECT
      }
    );

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    const resolvedCorporateId=req.resolvedCorporate.id;
    const orderNumber = `CHK-${resolvedCorporateId}-${Date.now()}-${randomUUID().slice(0,8)}`;
    const order=await createCorporateCheckupOrder({
      corporateId:resolvedCorporateId, employeeId, labId, bookedByUserId:req.user.id,
      orderNumber, testPackage,
      notes:`Corp Health Checkup | Lab: ${labName} (ID:${labId}) | Date: ${checkupDate} ${checkupTime || ''} | ${notes} | Booked by team: ${req.user.email}`
    });
    const bookingId=order.id;
    const employeeFullName = `${employee.firstName} ${employee.lastName}`.trim();
    const displayDate = new Date(checkupDate).toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // ── 4. Send Email notification (if enabled) ──────────────────────
    // Uses the team user's configured SMTP from email_settings table
    let emailResult = null;
    if (sendEmail !== false && sendEmail !== 'false') {
      if (isPlaceholderEmail(employee.email)) {
        console.log(`ℹ️ [corporate-bookings] Email skipped — placeholder address: ${employee.email}`);
      } else {
        try {
          const emailHtml = buildHealthCheckupEmailHtml({
            employeeName: employeeFullName,
            corporateName,
            labName,
            labAddress,
            testPackage,
            checkupDate: displayDate,
            checkupTime: checkupTime || 'As scheduled',
            orderNumber,
            notes
          });

          emailResult = await sendCorporateEmail(req.user.id, {
            to: employee.email,
            subject: `Your ${corporateName} Health Checkup is Booked — ${displayDate}`,
            html: emailHtml
          });
        } catch (emailErr) {
          console.error('[corporate-bookings] Email failed:', emailErr.message);
        }
      }
    } else {
      console.log(`ℹ️ [corporate-bookings] Email skipped (disabled by team user)`);
    }

    // ── 5. Send WhatsApp notification (if enabled) ─────────────────
    let whatsappResult = null;
    const rawPhone = (employee.phoneNumber || '').replace(/\D/g, '');
    const phoneE164 = rawPhone.startsWith('91') ? `+${rawPhone}` : `+91${rawPhone}`;

    if (sendWhatsapp === false || sendWhatsapp === 'false') {
      console.log(`ℹ️ [corporate-bookings] WhatsApp skipped (disabled by team user)`);
    } else if (rawPhone.length >= 10) {
      try {
        // Try structured template first
        whatsappResult = await whatsappProductionService.sendAppointmentConfirmation({
          to: phoneE164,
          patientName: employeeFullName,
          date: displayDate,
          time: checkupTime || '8:00 AM',
          location: labAddress || labName,
          isHealthCheckup: true
        });
        console.log(`✅ [corporate-bookings] WhatsApp sent to ${phoneE164} | SID: ${whatsappResult?.sid} | Status: ${whatsappResult?.status}`);
      } catch (waErr) {
        console.warn('[corporate-bookings] WhatsApp template failed, trying text fallback:', waErr.message);
        try {
          // Fallback: plain text session message
          const waText =
            `🏥 *Health Checkup Booking Confirmed*\n\n` +
            `Dear ${employeeFullName},\n\n` +
            `Your *${corporateName}* health checkup has been booked.\n\n` +
            `📋 *Package:* ${testPackage}\n` +
            `🏪 *Lab:* ${labName}\n` +
            `📍 *Address:* ${labAddress || labName}\n` +
            `📅 *Date:* ${displayDate}\n` +
            `⏰ *Time:* ${checkupTime || 'As scheduled'}\n` +
            `🔖 *Ref:* ${orderNumber}\n\n` +
            `Please carry a valid ID and arrive 10 mins early.\n\n` +
            `— Mediqzy | ${corporateName} Wellness Team`;

          whatsappResult = await whatsappProductionService.sendSessionMessage({
            to: phoneE164,
            body: waText
          });
          console.log(`✅ [corporate-bookings] WhatsApp text fallback sent to ${phoneE164}`);
        } catch (waErr2) {
          console.error('[corporate-bookings] WhatsApp fallback also failed:', waErr2.message);
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Health checkup booked and employee notified',
      booking: {
        id: bookingId,
        orderNumber,
        employee: {
          id: employee.id,
          name: employeeFullName,
          email: employee.email,
          phone: employee.phoneNumber
        },
        lab: { id: labId, name: labName, address: labAddress },
        testPackage,
        checkupDate: displayDate,
        checkupTime: checkupTime || 'As scheduled'
      },
      notifications: {
        email: (sendEmail === false || sendEmail === 'false') ? 'skipped' : (emailResult ? 'sent' : 'failed'),
        whatsapp: (sendWhatsapp === false || sendWhatsapp === 'false') ? 'skipped' : (whatsappResult ? 'sent' : 'failed')
      }
    });
  } catch (err) {
    console.error('[corporate-bookings] POST /health-checkup error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : 'Unable to book health checkup. Please try again.' });
  }
});

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/history
// List past corporate health checkup bookings
// ──────────────────────────────────────────────
router.get('/history', authUser, requireTeamOrAdmin, requireCorporateAccess, async (req, res) => {
  try {
    const { corporateId, page = 1, limit = 50 } = req.query;
    if (!corporateId) return res.status(400).json({ success: false, message: 'corporateId is required' });
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const {bookings,countRow}=await withCorporateBookingContext({corporateId:req.resolvedCorporate.id,bookedByUserId:req.user.id},async transaction=>{
      const bookings = await postgresSequelize.query(
        `SELECT
           lo.id,
           lo.order_number,
           lo.test_type,
           lo.status,
           lo.notes,
           lo.created_at,
           u.id AS employee_id,
           u."firstName",
           u."lastName",
           u.email,
           u."phoneNumber"
         FROM lab_orders lo
         JOIN users u ON u.id = lo.patient_id
         WHERE lo.test_category = 'corporate_health_checkup'
           AND lo.organization_id = :corporateId
         ORDER BY lo.created_at DESC
         LIMIT :limit OFFSET :offset`,
        {
          replacements: {
            corporateId: req.resolvedCorporate.id,
            limit: parseInt(limit),
            offset
          },
          transaction, type: postgresSequelize.QueryTypes.SELECT
        }
      );

      const [countRow] = await postgresSequelize.query(
        `SELECT COUNT(*) AS total FROM lab_orders
         WHERE test_category = 'corporate_health_checkup'
           AND organization_id = :corporateId`,
        {
          replacements: { corporateId: req.resolvedCorporate.id },
          transaction, type: postgresSequelize.QueryTypes.SELECT
        }
      );

      return {bookings,countRow};
    });

    return res.json({
      success: true,
      bookings,
      total: parseInt(countRow?.total || 0),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('[corporate-bookings] GET /history error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  HEALTH REPORT SECTION
// ══════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────
// POST /api/corporate-bookings/reports/upload
// Upload a health report PDF/image for an employee
// Stores on S3, records in DB, sends email + WhatsApp
// ──────────────────────────────────────────────
router.post(
  '/reports/upload',
  authUser,
  requireTeamOrAdmin,
  (req,res,next)=>reportUpload.array('reports',10)(req,res,error=>{
    if(!error)return next();
    return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({success:false,message:error.code==='LIMIT_FILE_SIZE'?'Each report must be 25 MB or smaller':error.code==='LIMIT_UNEXPECTED_FILE'?'Upload at most 10 reports':error.message});
  }),
  requireCorporateAccess,
  async (req, res) => {
    const {
      employeeId,
      reportName,
      reportType = 'annual_health_checkup',
      reportDate,
      labOrderId,
      notes = '',
      corporateId,
      corporateName = '',
      sendEmail = 'true',
      sendWhatsapp = 'true'
    } = req.body;

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one report file is required' });
    }
    if (!employeeId || !reportName || !reportDate) {
      return res.status(400).json({ success: false, message: 'employeeId, reportName and reportDate are required' });
    }
    if (!corporateId) {
      return res.status(400).json({ success: false, message: 'corporateId is required' });
    }
    if (String(reportType).toLowerCase().includes('pre_employment')) {
      return res.status(409).json({
        success: false,
        code: 'peme_case_required',
        message: 'Pre-employment reports must be recorded in the candidate PEME workflow, not the employee health-report flow.'
      });
    }

    try {
      // ── 1. Fetch employee ──────────────────────────────────
      const [employee] = await postgresSequelize.query(
        `SELECT id, "firstName", "lastName", email, "phoneNumber", organization_id
         FROM users WHERE id = :empId LIMIT 1`,
        { replacements: { empId: parseInt(employeeId) }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
      if (!(await assertEmployeeInCorporate(employeeId, req.resolvedCorporate.id))) {
        return res.status(403).json({ success: false, message: "Employee is not assigned to this corporate" });
      }


      const employeeFullName = `${employee.firstName} ${employee.lastName}`.trim();
      const displayDate = new Date(reportDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      const reportLabel = REPORT_TYPE_LABELS[reportType] || reportType;
      const checkupCompletedAt = new Date(`${reportDate}T00:00:00.000Z`);
      const deliveredAt = new Date();
      const sla = computeReportSla(checkupCompletedAt, deliveredAt);

      const savedReports=await saveCorporateHealthReports({
        corporateId:req.resolvedCorporate.id,employeeId,uploadedBy:req.user.id,files,reportName,reportType,reportDate,
        labOrderId:labOrderId?Number(labOrderId):null,notes,corporateName,reportLabel,checkupCompletedAt,deliveredAt,sla,
        patientReportType:mime=>mapCorporateReportTypeToPatientReportType(reportType,mime)
      });
      const uploadedReports=await Promise.all(savedReports.map(async report=>({...report,reportUrl:await corporateReportDownloadUrl(report.key,report.bucket)})));

      // ── 3. Send one consolidated Email ────────────────────
      let emailStatus = 'skipped';
      if (sendEmail !== 'false' && sendEmail !== false) {
        if (isPlaceholderEmail(employee.email)) {
          emailStatus = 'skipped_placeholder';
        } else {
          try {
            const subject = uploadedReports.length === 1
              ? `Your ${reportLabel} Report is Ready — ${corporateName}`
              : `Your ${uploadedReports.length} Health Reports are Ready — ${corporateName}`;
            const html = buildReportEmailHtml({
              employeeName: employeeFullName,
              corporateName,
              reportLabel,
              reportDate: displayDate,
              notes,
              reports: uploadedReports
            });
            await sendCorporateEmail(req.user.id, { to: employee.email, subject, html });
            emailStatus = 'sent';
            const ids = uploadedReports.map(r => r.id);
            await postgresSequelize.query(
              `UPDATE corporate_health_reports SET notified_email=TRUE, notified_at=NOW() WHERE id IN (:ids)`,
              { replacements: { ids }, type: postgresSequelize.QueryTypes.UPDATE }
            );
          } catch (e) {
            console.error('[corp-reports] Email failed:', e.message);
            emailStatus = 'failed';
          }
        }
      }

      // ── 4. Send one consolidated WhatsApp ─────────────────
      let waStatus = 'skipped';
      if (sendWhatsapp !== 'false' && sendWhatsapp !== false) {
        const rawPhone = (employee.phoneNumber || '').replace(/\D/g, '');
        const phoneE164 = rawPhone.startsWith('91') ? `+${rawPhone}` : `+91${rawPhone}`;
        if (rawPhone.length >= 10) {
          try {
            let waText;
            if (uploadedReports.length === 1) {
              waText =
                `📋 *Health Report Ready*\n\n` +
                `Dear ${employeeFullName},\n\n` +
                `Your *${reportLabel}* report from *${corporateName}* is now available.\n\n` +
                `📄 *Report:* ${uploadedReports[0].reportName}\n` +
                `📅 *Date:* ${displayDate}\n` +
                `${notes ? `📝 *Note:* ${notes}\n\n` : '\n'}` +
                `🔗 *Download:*\n${uploadedReports[0].reportUrl}\n\n` +
                `— Mediqzy | ${corporateName} Wellness Team`;
            } else {
              const fileLinks = uploadedReports.map((r, i) =>
                `${i + 1}. ${r.reportName}\n   🔗 ${r.reportUrl}`
              ).join('\n\n');
              waText =
                `📋 *${uploadedReports.length} Health Reports Ready*\n\n` +
                `Dear ${employeeFullName},\n\n` +
                `Your *${reportLabel}* reports from *${corporateName}* (${displayDate}) are now available:\n\n` +
                `${fileLinks}\n\n` +
                `${notes ? `📝 *Note:* ${notes}\n\n` : ''}` +
                `— Mediqzy | ${corporateName} Wellness Team`;
            }
            await whatsappProductionService.sendSessionMessage({ to: phoneE164, body: waText });
            waStatus = 'sent';
            const ids = uploadedReports.map(r => r.id);
            await postgresSequelize.query(
              `UPDATE corporate_health_reports SET notified_whatsapp=TRUE, notified_at=NOW() WHERE id IN (:ids)`,
              { replacements: { ids }, type: postgresSequelize.QueryTypes.UPDATE }
            );
          } catch (e) {
            console.error('[corp-reports] WhatsApp failed:', e.message);
            waStatus = 'failed';
          }
        }
      }

      return res.status(201).json({
        success: true,
        message: `${uploadedReports.length} report(s) uploaded and employee notified`,
        reports: uploadedReports,
        // keep backward-compat single-report field
        report: { ...uploadedReports[0], reportType, reportDate, reportDueAt: sla.dueAt, slaStatus: sla.status },
        employee: { id: employee.id, name: employeeFullName, email: employee.email },
        notifications: { email: emailStatus, whatsapp: waStatus }
      });
    } catch (err) {
      console.error('[corp-reports] upload error:', err);
      return res.status(err.status||err.statusCode||(err.code==='MALWARE_DETECTED'?400:500)).json({success:false,code:err.code||'REPORT_UPLOAD_FAILED',message:err.status||err.statusCode?err.message:err.code==='MALWARE_DETECTED'?'File rejected by antivirus scanning':'Report upload could not be completed. Please retry.'});
    }
  }
);

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/reports
// List all uploaded reports (optionally filter by employee)
// Merges manually-uploaded corporate_health_reports with auto-processed
// email reports from the reports table (both linked to the same corporate).
// ──────────────────────────────────────────────
router.get('/reports', authUser, requireTeamOrAdmin, requireCorporateAccess, async (req, res) => {
  try {
    const { corporateId, employeeId, page = 1, limit = 50 } = req.query;
    if (!corporateId) return res.status(400).json({ success: false, message: 'corporateId is required' });
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const empFilterChr = employeeId ? 'AND chr.employee_id = :employeeId' : '';
    const empFilterRpt = employeeId ? 'AND r."userId" = :employeeId' : '';

    // UNION of:
    //   1. corporate_health_reports — manually uploaded via team portal
    //   2. reports — auto-processed from lab emails (joined to corporate via user_associations)
    const unionQuery = `
      SELECT
        chr.id,
        chr.report_name,
        chr.report_type,
        chr.report_date::timestamptz AS report_date,
        chr.report_url,
        chr.s3_key AS storage_key,
        pr.metadata->>'bucket' AS storage_bucket,
        pr.metadata->>'storageBackend' AS storage_backend,
        chr.file_size_bytes,
        chr.mime_type,
        chr.notes,
        chr.notified_email,
        chr.notified_whatsapp,
        chr.notified_at,
        chr.checkup_type,
        chr.checkup_completed_at,
        chr.report_due_at,
        chr.report_delivered_at,
        chr.sla_status,
        chr.created_at,
        chr.lab_order_id,
        'manual' AS source,
        u.id AS employee_id,
        u."firstName",
        u."lastName",
        u.email,
        u."phoneNumber",
        up."firstName" AS uploader_first,
        up."lastName" AS uploader_last,
        lo.order_number
      FROM corporate_health_reports chr
      JOIN users u ON u.id = chr.employee_id
      LEFT JOIN users up ON up.id = chr.uploaded_by
      LEFT JOIN LATERAL (SELECT r.metadata FROM reports r WHERE r."userId"=chr.employee_id AND r.metadata->>'source'='team_corporate_health_upload' AND r.metadata->>'corporateHealthReportId'=chr.id::text LIMIT 1) pr ON true
      LEFT JOIN lab_orders lo ON lo.id = chr.lab_order_id
      WHERE chr.corporate_id = :corporateId
        AND COALESCE(chr.checkup_type, chr.report_type, '') <> 'pre_employment'
        ${empFilterChr}

      UNION ALL

      SELECT
        r.id,
        r."fileName" AS report_name,
        r."reportType"::text AS report_type,
        r."reportDate"::timestamptz AS report_date,
        r."fileUrl" AS report_url,
        r."filePath" AS storage_key,
        r.metadata->>'bucket' AS storage_bucket,
        r.metadata->>'storageBackend' AS storage_backend,
        r."fileSize" AS file_size_bytes,
        r."mimeType" AS mime_type,
        r.description AS notes,
        FALSE AS notified_email,
        TRUE AS notified_whatsapp,
        r."createdAt" AS notified_at,
        'annual_health_checkup'::varchar AS checkup_type,
        r."reportDate"::timestamptz AS checkup_completed_at,
        NULL::timestamptz AS report_due_at,
        r."createdAt" AS report_delivered_at,
        'on_time'::varchar AS sla_status,
        r."createdAt" AS created_at,
        NULL::int AS lab_order_id,
        'email' AS source,
        u.id AS employee_id,
        u."firstName",
        u."lastName",
        u.email,
        u."phoneNumber",
        NULL::varchar AS uploader_first,
        NULL::varchar AS uploader_last,
        NULL::varchar AS order_number
      FROM reports r
      JOIN users u ON u.id = r."userId"
      JOIN user_associations ua ON ua."userId" = u.id
        AND ua."entityType" = 'corporate'
        AND ua."entityId" = :corporateId
      WHERE r."reportType" = 'lab'
        AND COALESCE(r.metadata->>'source', '') NOT IN ('team_corporate_health_upload','patient_report_upload','legacy_report_upload')
        ${empFilterRpt}
    `;

    const {reports,countRow}=await withCorporateBookingContext({corporateId:req.resolvedCorporate.id,bookedByUserId:req.user.id},async transaction=>{
    const reports = await postgresSequelize.query(
      `SELECT * FROM (${unionQuery}) combined
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: {
          corporateId: req.resolvedCorporate.id,
          ...(employeeId ? { employeeId: parseInt(employeeId) } : {}),
          limit: parseInt(limit),
          offset,
        },
        transaction, type: postgresSequelize.QueryTypes.SELECT,
      }
    );

    const [countRow] = await postgresSequelize.query(
      `SELECT COUNT(*) AS total FROM (${unionQuery}) combined`,
      {
        replacements: {
          corporateId: req.resolvedCorporate.id,
          ...(employeeId ? { employeeId: parseInt(employeeId) } : {}),
        },
        transaction, type: postgresSequelize.QueryTypes.SELECT,
      }
    );

    return {reports,countRow};
    });
    for(const report of reports)if(report.storage_backend==='corporate_minio')report.report_url=await corporateReportDownloadUrl(report.storage_key,report.storage_bucket);
    return res.json({ success: true, reports, total: parseInt(countRow?.total || 0) });
  } catch (err) {
    console.error('[corp-reports] list error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/corporate-bookings/reports/:id/share
// Re-send email + WhatsApp for an already-uploaded report
// ──────────────────────────────────────────────
router.post('/reports/:id/share', authUser, requireTeamOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { sendEmail = true, sendWhatsapp = true, corporateName = '' } = req.body;

    const [row] = await postgresSequelize.query(
      `SELECT chr.*, pr.metadata AS storage_metadata, u."firstName", u."lastName", u.email, u."phoneNumber"
       FROM corporate_health_reports chr
       JOIN users u ON u.id = chr.employee_id
       LEFT JOIN LATERAL (SELECT r.metadata FROM reports r WHERE r."userId"=chr.employee_id AND r.metadata->>'source'='team_corporate_health_upload' AND r.metadata->>'corporateHealthReportId'=chr.id::text LIMIT 1) pr ON true
       WHERE chr.id = :id LIMIT 1`,
      { replacements: { id: parseInt(id) }, type: postgresSequelize.QueryTypes.SELECT }
    );

    if (!row || (req.body.corporateId && Number(req.body.corporateId)!==row.corporate_id)) return res.status(404).json({ success: false, message: 'Report not found' });
    if (!(await assertCorporateAccessForId(req, res, row.corporate_id))) return;

    if(row.storage_metadata?.storageBackend==='corporate_minio')row.report_url=await corporateReportDownloadUrl(row.s3_key,row.storage_metadata.bucket);
    const employeeFullName = `${row.firstName} ${row.lastName}`.trim();
    const displayDate = new Date(row.report_date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    const reportLabel = REPORT_TYPE_LABELS[row.report_type] || row.report_type;

    let emailStatus = 'skipped';
    let waStatus = 'skipped';

    if (sendEmail!==false&&sendEmail!=='false') {
      if (isPlaceholderEmail(row.email)) {
        console.log(`ℹ️ [corp-reports] Share email skipped — placeholder address: ${row.email}`);
        emailStatus = 'skipped_placeholder';
      } else {
        try {
          const html = buildReportEmailHtml({
            employeeName: employeeFullName,
            corporateName,
            reports:[{reportName:row.report_name,reportUrl:row.report_url,mimeType:row.mime_type}],
            reportLabel,
            reportDate: displayDate,
            reportUrl: row.report_url,
            notes: row.notes,
            mimeType: row.mime_type
          });
          await sendCorporateEmail(req.user.id, {
            to: row.email,
            subject: `Your ${reportLabel} Report — ${corporateName}`,
            html: html
          });
          emailStatus = 'sent';
        } catch (e) {
          emailStatus = 'failed';
          console.error('[corp-reports] share email failed:', e.message);
        }
      }
    }

    if (sendWhatsapp!==false&&sendWhatsapp!=='false') {
      const rawPhone = (row.phoneNumber || '').replace(/\D/g, '');
      const phoneE164 = rawPhone.startsWith('91') ? `+${rawPhone}` : `+91${rawPhone}`;
      if (rawPhone.length >= 10) {
        try {
          const waText =
            `📋 *Health Report — ${reportLabel}*\n\n` +
            `Dear ${employeeFullName},\n\n` +
            `Your *${row.report_name}* report (${displayDate}) from *${corporateName}* is available:\n\n` +
            `🔗 ${row.report_url}\n\n` +
            `— Mediqzy | ${corporateName} Wellness Team`;
          await whatsappProductionService.sendSessionMessage({ to: phoneE164, body: waText });
          waStatus = 'sent';
        } catch (e) {
          waStatus = 'failed';
          console.error('[corp-reports] share WA failed:', e.message);
        }
      }
    }

    // Update notification flags
    await postgresSequelize.query(
      `UPDATE corporate_health_reports
       SET notified_email = CASE WHEN :emailSent THEN TRUE ELSE notified_email END,
           notified_whatsapp = CASE WHEN :waSent THEN TRUE ELSE notified_whatsapp END,
           notified_at = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id: parseInt(id),
          emailSent: emailStatus === 'sent',
          waSent: waStatus === 'sent'
        },
        type: postgresSequelize.QueryTypes.UPDATE
      }
    );

    return res.json({
      success: true,
      message: 'Notifications resent',
      notifications: { email: emailStatus, whatsapp: waStatus }
    });
  } catch (err) {
    console.error('[corp-reports] share error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// Report type display labels
// ──────────────────────────────────────────────
const REPORT_TYPE_LABELS = {
  pre_employment: 'Pre-Employment Health Checkup',
  annual_health_checkup: 'Annual Health Checkup',
  lab_result: 'Lab Result',
  blood_test: 'Blood Test',
  lipid_profile: 'Lipid Profile',
  diabetic_screening: 'Diabetic Screening',
  cardiac_screening: 'Cardiac Screening',
  thyroid_panel: 'Thyroid Panel',
  xray: 'X-Ray',
  ecg: 'ECG Report',
  usg: 'USG Report',
  eye_checkup: 'Eye Checkup',
  dental_checkup: 'Dental Checkup',
  general_health_report: 'General Health Report',
  prescription: 'Prescription',
  other: 'Health Report'
};

// ──────────────────────────────────────────────
// Helper: Build health checkup confirmation email HTML
// ──────────────────────────────────────────────
function buildHealthCheckupEmailHtml({ employeeName, corporateName, labName, labAddress, testPackage, checkupDate, checkupTime, orderNumber, notes }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Health Checkup Booking Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin:0; padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background: linear-gradient(135deg, #1a56db 0%, #7c3aed 100%); padding:32px 40px; text-align:center;">
            <h1 style="color:#fff; margin:0; font-size:24px; font-weight:700;">🏥 Health Checkup Confirmed</h1>
            <p style="color:rgba(255,255,255,0.85); margin:8px 0 0; font-size:14px;">${corporateName} Employee Wellness Programme</p>
          </td>
        </tr>
        <!-- Greeting -->
        <tr>
          <td style="padding:32px 40px 16px;">
            <p style="font-size:16px; color:#374151; margin:0 0 8px;">Dear <strong>${employeeName}</strong>,</p>
            <p style="font-size:15px; color:#6b7280; margin:0;">Your health checkup appointment has been <strong style="color:#059669;">successfully booked</strong> as part of your <strong>${corporateName}</strong> wellness benefit.</p>
          </td>
        </tr>
        <!-- Booking details card -->
        <tr>
          <td style="padding:8px 40px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
              <tr><td colspan="2" style="background:#eff6ff; padding:12px 20px; border-bottom:1px solid #e5e7eb;">
                <strong style="color:#1d4ed8; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">📋 Booking Details</strong>
              </td></tr>
              <tr>
                <td style="padding:14px 20px 0; color:#374151; font-weight:600; font-size:14px; width:40%;">Reference No.</td>
                <td style="padding:14px 20px 0; color:#1d4ed8; font-size:14px; font-family:monospace;">${orderNumber}</td>
              </tr>
              <tr>
                <td style="padding:12px 20px 0; color:#374151; font-weight:600; font-size:14px;">Health Package</td>
                <td style="padding:12px 20px 0; color:#111827; font-size:14px;">${testPackage}</td>
              </tr>
              <tr>
                <td style="padding:12px 20px 0; color:#374151; font-weight:600; font-size:14px;">📅 Date</td>
                <td style="padding:12px 20px 0; color:#111827; font-size:14px;">${checkupDate}</td>
              </tr>
              <tr>
                <td style="padding:12px 20px 0; color:#374151; font-weight:600; font-size:14px;">⏰ Time</td>
                <td style="padding:12px 20px 0; color:#111827; font-size:14px;">${checkupTime}</td>
              </tr>
              <tr>
                <td style="padding:12px 20px 0; color:#374151; font-weight:600; font-size:14px;">🏪 Lab</td>
                <td style="padding:12px 20px 0; color:#111827; font-size:14px;"><strong>${labName}</strong></td>
              </tr>
              <tr>
                <td style="padding:12px 20px 20px; color:#374151; font-weight:600; font-size:14px; vertical-align:top;">📍 Address</td>
                <td style="padding:12px 20px 20px; color:#6b7280; font-size:14px;">${labAddress || labName}</td>
              </tr>
              ${notes ? `<tr><td style="padding:0 20px 16px; color:#374151; font-weight:600; font-size:14px; vertical-align:top;">Notes</td><td style="padding:0 20px 16px; color:#6b7280; font-size:14px;">${notes}</td></tr>` : ''}
            </table>
          </td>
        </tr>
        <!-- Instructions -->
        <tr>
          <td style="padding:0 40px 24px;">
            <div style="background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:16px 20px;">
              <p style="font-size:13px; color:#92400e; margin:0 0 6px;"><strong>📌 Please remember:</strong></p>
              <ul style="margin:0; padding-left:18px; font-size:13px; color:#92400e; line-height:1.7;">
                <li>Carry a valid government photo ID (Aadhaar / PAN / Passport)</li>
                <li>Arrive 10 minutes before your scheduled time</li>
                <li>Fasting may be required for certain tests — check with the lab</li>
                <li>For queries, contact your HR or Mediqzy support</li>
              </ul>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb; border-top:1px solid #e5e7eb; padding:20px 40px; text-align:center;">
            <p style="font-size:12px; color:#9ca3af; margin:0;">This is an automated notification from <strong>Mediqzy</strong> on behalf of <strong>${corporateName}</strong>.<br/>For support: <a href="mailto:support@mediqzy.com" style="color:#6366f1;">support@mediqzy.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ──────────────────────────────────────────────
// Helper: Build health report delivery email HTML
// ──────────────────────────────────────────────
// reports: [{ reportName, reportUrl, mimeType }]
function buildReportEmailHtml({ employeeName, corporateName, reportLabel, reportDate, notes, reports }) {
  const single = reports.length === 1;
  const title = single ? '📋 Health Report Ready' : `📋 ${reports.length} Health Reports Ready`;
  const intro = single
    ? `Your <strong>${reportLabel}</strong> report is ready. Click the button below to view or download it.`
    : `Your <strong>${reportLabel}</strong> reports (${reportDate}) are ready. Use the buttons below to access each file.`;

  const reportButtons = reports.map((r, i) => {
    const label = single ? '📥 View / Download Report' : `📥 ${i + 1}. ${r.reportName}`;
    return `
      <div style="margin-bottom:${single ? 0 : 12}px; text-align:center;">
        <a href="${r.reportUrl}" target="_blank"
           style="display:inline-block; background: linear-gradient(135deg, #059669 0%, #0891b2 100%); color:#fff; text-decoration:none; padding:12px 32px; border-radius:8px; font-size:${single ? 16 : 14}px; font-weight:700; letter-spacing:0.3px; min-width:280px;">
          ${label}
        </a>
        ${!single ? `<p style="font-size:10px; color:#9ca3af; margin:4px 0 0; word-break:break-all;"><a href="${r.reportUrl}" style="color:#6366f1;">${r.reportUrl}</a></p>` : ''}
      </div>`;
  }).join('');

  const singleLink = single
    ? `<p style="font-size:11px; color:#9ca3af; margin:10px 0 0;">
        If the button doesn't work, copy this link:<br/>
        <a href="${reports[0].reportUrl}" style="color:#6366f1; word-break:break-all;">${reports[0].reportUrl}</a>
       </p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Your Health Report${single ? '' : 's'} are Ready</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin:0; padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background: linear-gradient(135deg, #059669 0%, #0891b2 100%); padding:32px 40px; text-align:center;">
            <h1 style="color:#fff; margin:0; font-size:24px; font-weight:700;">${title}</h1>
            <p style="color:rgba(255,255,255,0.85); margin:8px 0 0; font-size:14px;">${corporateName} Employee Wellness Programme</p>
          </td>
        </tr>
        <!-- Greeting -->
        <tr>
          <td style="padding:32px 40px 16px;">
            <p style="font-size:16px; color:#374151; margin:0 0 8px;">Dear <strong>${employeeName}</strong>,</p>
            <p style="font-size:15px; color:#6b7280; margin:0;">${intro}</p>
          </td>
        </tr>
        <!-- Summary row -->
        <tr>
          <td style="padding:0 40px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px;">
              <tr><td colspan="2" style="background:#f0fdf4; padding:12px 20px; border-bottom:1px solid #e5e7eb; border-radius:10px 10px 0 0;">
                <strong style="color:#065f46; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">📄 Report Details</strong>
              </td></tr>
              <tr>
                <td style="padding:14px 20px 0; color:#374151; font-weight:600; font-size:14px; width:40%;">Type</td>
                <td style="padding:14px 20px 0; color:#111827; font-size:14px;">${reportLabel}</td>
              </tr>
              <tr>
                <td style="padding:12px 20px ${notes ? 0 : 20}px; color:#374151; font-weight:600; font-size:14px;">Date</td>
                <td style="padding:12px 20px ${notes ? 0 : 20}px; color:#111827; font-size:14px;">${reportDate}</td>
              </tr>
              ${notes ? `<tr><td style="padding:12px 20px 16px; color:#374151; font-weight:600; font-size:14px; vertical-align:top;">Notes</td><td style="padding:12px 20px 16px; color:#6b7280; font-size:14px;">${notes}</td></tr>` : ''}
            </table>
          </td>
        </tr>
        <!-- CTA Buttons -->
        <tr>
          <td style="padding:8px 40px 32px; text-align:center;">
            ${reportButtons}
            ${singleLink}
          </td>
        </tr>
        <!-- Notice -->
        <tr>
          <td style="padding:0 40px 24px;">
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:14px 20px;">
              <p style="font-size:13px; color:#1e40af; margin:0;">
                <strong>🔒 Confidential:</strong> This health report contains personal medical information. Please keep it secure and do not share with unauthorised persons.
              </p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb; border-top:1px solid #e5e7eb; padding:20px 40px; text-align:center;">
            <p style="font-size:12px; color:#9ca3af; margin:0;">Sent by <strong>Mediqzy</strong> on behalf of <strong>${corporateName}</strong>.<br/>For support: <a href="mailto:support@mediqzy.com" style="color:#6366f1;">support@mediqzy.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default router;
