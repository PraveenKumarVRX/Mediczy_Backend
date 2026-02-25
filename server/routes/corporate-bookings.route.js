/**
 * Corporate Health Checkup Booking Route
 * Allows team members (e.g. parinitha@mysmarthealth.in) to book
 * health checkup appointments for corporate employees and
 * auto-trigger email + WhatsApp notifications to the employee.
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import emailServiceModule from '../services/emailService.js';
import whatsappProductionService from '../services/whatsapp-production.service.js';

const router = express.Router();

// Require team or admin role
function requireTeamOrAdmin(req, res, next) {
  const role = req.user?.role;
  if (!['team', 'admin', 'super_admin', 'team_member', 'team_lead'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Team or admin access required' });
  }
  return next();
}

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/employees
// Search Equitas employees for booking autocomplete
// ──────────────────────────────────────────────
router.get('/employees', authUser, requireTeamOrAdmin, async (req, res) => {
  try {
    const { search = '', corporateId = 5 } = req.query;
    const searchTerm = `%${search}%`;

    const employees = await postgresSequelize.query(
      `SELECT
         u.id,
         u."firstName",
         u."lastName",
         u.email,
         u."phoneNumber",
         u.gender,
         u."dateOfBirth"
       FROM user_associations ua
       JOIN users u ON u.id = ua."userId"
       WHERE ua."entityType" = 'corporate'
         AND ua."entityId" = :corporateId
         AND ua.role = 'employee'
         AND ua.status = 'active'
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

    return res.json({ success: true, employees });
  } catch (err) {
    console.error('[corporate-bookings] GET /employees error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/labs
// Fetch labs assigned to a corporate for the booking dropdown
// ──────────────────────────────────────────────
router.get('/labs', authUser, requireTeamOrAdmin, async (req, res) => {
  try {
    const { corporateId = 5 } = req.query;

    const labs = await postgresSequelize.query(
      `SELECT
         l.id,
         l.name,
         l.address,
         l.city,
         l.state,
         l."pinCode",
         l."phoneNumber",
         l.accreditation,
         cna.metadata
       FROM corporate_network_assignments cna
       JOIN labs l ON l.id = cna.partner_id
       WHERE cna.corporate_id = :corporateId
         AND cna.partner_type = 'lab'
         AND cna.is_active = true
       ORDER BY l.name
       LIMIT 200`,
      {
        replacements: { corporateId: parseInt(corporateId) },
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
// POST /api/corporate-bookings/health-checkup
// Book a health checkup for an Equitas employee
// Sends email + WhatsApp to employee
// ──────────────────────────────────────────────
router.post('/health-checkup', authUser, requireTeamOrAdmin, async (req, res) => {
  const {
    employeeId,          // user.id of the employee
    labId,               // lab.id
    labName,             // lab display name
    labAddress,          // lab address string
    checkupDate,         // 'YYYY-MM-DD'
    checkupTime,         // 'HH:MM' or slot string
    testPackage,         // e.g. "Annual Health Checkup", "CBC + LFT + KFT"
    notes = '',
    corporateId = 5,
    corporateName = 'Equitas Bank Ltd'
  } = req.body;

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

    // ── 2. Generate unique order number ───────────────────────────
    const orderNumber = `CHK-${corporateId}-${Date.now()}`;

    // ── 3. Insert into lab_orders ─────────────────────────────────
    const [insertResult] = await postgresSequelize.query(
      `INSERT INTO lab_orders
         (order_number, patient_id, test_type, test_category, status, notes, organization_id, created_at, updated_at)
       VALUES
         (:orderNumber, :patientId, :testType, 'corporate_health_checkup', 'pending', :notes, :orgId, NOW(), NOW())
       RETURNING id, order_number`,
      {
        replacements: {
          orderNumber,
          patientId: parseInt(employeeId),
          testType: testPackage,
          notes: `Corp Health Checkup | Lab: ${labName} (ID:${labId}) | Date: ${checkupDate} ${checkupTime || ''} | ${notes} | Booked by team: ${req.user.email}`,
          orgId: parseInt(corporateId)
        },
        type: postgresSequelize.QueryTypes.INSERT
      }
    );

    const bookingId = insertResult?.[0]?.id || insertResult?.id || orderNumber;
    const employeeFullName = `${employee.firstName} ${employee.lastName}`.trim();
    const displayDate = new Date(checkupDate).toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // ── 4. Send Email notification ─────────────────────────────────
    let emailResult = null;
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

      emailResult = await emailServiceModule.sendOutboundEmail(1, {
        to: employee.email,
        subject: `Your ${corporateName} Health Checkup is Booked — ${displayDate}`,
        htmlContent: emailHtml
      });
      console.log(`✅ [corporate-bookings] Email sent to ${employee.email}`);
    } catch (emailErr) {
      console.error('[corporate-bookings] Email failed:', emailErr.message);
    }

    // ── 5. Send WhatsApp notification ──────────────────────────────
    let whatsappResult = null;
    const rawPhone = (employee.phoneNumber || '').replace(/\D/g, '');
    const phoneE164 = rawPhone.startsWith('91') ? `+${rawPhone}` : `+91${rawPhone}`;

    if (rawPhone.length >= 10) {
      try {
        // Try structured template first
        whatsappResult = await whatsappProductionService.sendAppointmentConfirmation({
          to: phoneE164,
          patientName: employeeFullName,
          doctorName: `${labName} (Health Checkup)`,
          date: displayDate,
          time: checkupTime || 'As scheduled',
          location: labAddress || labName
        });
        console.log(`✅ [corporate-bookings] WhatsApp sent to ${phoneE164}`);
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
        email: emailResult ? 'sent' : 'failed',
        whatsapp: whatsappResult ? 'sent' : 'failed'
      }
    });
  } catch (err) {
    console.error('[corporate-bookings] POST /health-checkup error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/corporate-bookings/history
// List past corporate health checkup bookings
// ──────────────────────────────────────────────
router.get('/history', authUser, requireTeamOrAdmin, async (req, res) => {
  try {
    const { corporateId = 5, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

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
          corporateId: parseInt(corporateId),
          limit: parseInt(limit),
          offset
        },
        type: postgresSequelize.QueryTypes.SELECT
      }
    );

    const [countRow] = await postgresSequelize.query(
      `SELECT COUNT(*) AS total FROM lab_orders
       WHERE test_category = 'corporate_health_checkup'
         AND organization_id = :corporateId`,
      {
        replacements: { corporateId: parseInt(corporateId) },
        type: postgresSequelize.QueryTypes.SELECT
      }
    );

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

export default router;
