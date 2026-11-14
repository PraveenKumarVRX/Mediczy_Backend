/**
 * Email Auto-Update Service
 * Automatically updates portal data based on email analysis
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';
import { Op } from 'sequelize';
import nodemailer from '../integrations/nodemailer.js';
import whatsappProductionService from './whatsapp-production.service.js';

// Shared SMTP transporter (lazy singleton)
let _smtpTransporter = null;
function getSmtpTransporter() {
  if (!_smtpTransporter) {
    _smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: parseInt(process.env.SMTP_PORT || '465') === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return _smtpTransporter;
}

export async function autoUpdatePortal(email, aiAnalysis) {
  const updates = [];

  try {
    switch (aiAnalysis.intent) {
      case 'appointment_request':
        const appointmentUpdates = await handleAppointmentRequest(email, aiAnalysis);
        updates.push(...appointmentUpdates);
        break;

      case 'test_result':
        const testUpdates = await handleTestResult(email, aiAnalysis);
        updates.push(...testUpdates);
        break;

      case 'prescription':
        const prescriptionUpdates = await handlePrescription(email, aiAnalysis);
        updates.push(...prescriptionUpdates);
        break;

      case 'patient_query':
        const queryUpdates = await handlePatientQuery(email, aiAnalysis);
        updates.push(...queryUpdates);
        break;

      case 'billing':
        const billingUpdates = await handleBillingEmail(email, aiAnalysis);
        updates.push(...billingUpdates);
        break;

      case 'feedback':
        const feedbackUpdates = await handleFeedback(email, aiAnalysis);
        updates.push(...feedbackUpdates);
        break;
    }

    return updates;
  } catch (error) {
    console.error('Error in auto-update:', error);
    return [];
  }
}

/**
 * Handle appointment request emails — full pipeline:
 *  1. Send acknowledgement email immediately
 *  2. Look up / update patient details in DB
 *  3. Book appointment (appointments table, status=pending)
 *  4. Send booking confirmation via email + WhatsApp
 */
async function handleAppointmentRequest(email, aiAnalysis) {
  const updates = [];

  try {
    // ── Extract key fields ──────────────────────────────────────────────────
    const senderEmail = parseSenderEmail(email.from);
    const patientName = aiAnalysis.entities?.patientName || extractNameFromEmail(email.from);
    const rawDate     = aiAnalysis.entities?.date || extractDateFromText(email.body || email.htmlBody || '');
    const phone       = aiAnalysis.entities?.phone || extractPhoneFromText(email.body || '');

    // Compute appointment date: use extracted date or next business day
    let appointmentDate = rawDate ? new Date(rawDate) : null;
    if (!appointmentDate || isNaN(appointmentDate.getTime())) {
      // Default: next weekday at 10:00 AM
      appointmentDate = nextBusinessDay();
    }
    const apptDateStr = appointmentDate.toISOString().slice(0, 10);   // YYYY-MM-DD
    const apptTime    = '10:00:00';
    const apptDateTimeISO = `${apptDateStr}T${apptTime}`;
    const displayDate = appointmentDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // ── Step 1: Send acknowledgement email immediately ──────────────────────
    if (senderEmail) {
      try {
        await getSmtpTransporter().sendMail({
          from: `"Mediqzy Care" <${process.env.SMTP_USER}>`,
          to: senderEmail,
          subject: `We received your health checkup request — SmartHealth`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:30px;text-align:center;border-radius:12px 12px 0 0;">
                <h1 style="color:#fff;margin:0;font-size:20px;">Request Received ✅</h1>
              </div>
              <div style="background:#f8fafc;padding:30px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
                <p style="font-size:16px;color:#334155;">Dear <strong>${patientName}</strong>,</p>
                <p style="color:#475569;">Thank you for reaching out! We have received your health checkup appointment request and our team is reviewing it.</p>
                <p style="color:#475569;">We will confirm your appointment details within <strong>24 hours</strong>. If you have any urgent queries, please reply to this email.</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
                <p style="color:#94a3b8;font-size:12px;text-align:center;">Team Mediqzy &nbsp;|&nbsp; support@mediqzy.com</p>
              </div>
            </div>`,
        });
        console.log(`[autoUpdate] Acknowledgement email sent to ${senderEmail}`);
        updates.push({ type: 'ack_email_sent', action: 'sent', details: { to: senderEmail }, timestamp: new Date() });
      } catch (ackErr) {
        console.warn(`[autoUpdate] Ack email failed: ${ackErr.message}`);
      }
    }

    // ── Step 2: Look up / update patient in users table ────────────────────
    let user = null;
    if (senderEmail) {
      const [[found]] = await postgresSequelize.query(
        `SELECT id, "firstName", "lastName", email, "phoneNumber" FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1`,
        { replacements: { email: senderEmail } }
      );
      user = found || null;
    }

    // Update phone number if we extracted one and user lacks it
    if (user && phone && !user.phoneNumber) {
      await postgresSequelize.query(
        `UPDATE users SET "phoneNumber" = :phone, "updatedAt" = NOW() WHERE id = :id`,
        { replacements: { phone, id: user.id } }
      );
      user.phoneNumber = phone;
      updates.push({ type: 'patient_phone_updated', action: 'updated', details: { userId: user.id, phone }, timestamp: new Date() });
    }

    // ── Step 3: Save to appointment_inquiries & book appointment ───────────
    // Each write is independent — a FK miss on inquiry won't block the appointment record
    try {
      await postgresSequelize.query(
        `INSERT INTO appointment_inquiries
           (email_id, patient_name, patient_email, preferred_date, status, notes, created_at, updated_at)
         VALUES
           (:emailId, :patientName, :patientEmail, :preferredDate, 'scheduled', :notes, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        {
          replacements: {
            emailId:       email.id,
            patientName,
            patientEmail:  senderEmail || '',
            preferredDate: apptDateStr,
            notes:         `Auto-booked from inbound email. Subject: ${email.subject}`,
          },
        }
      );
    } catch (iqErr) {
      console.warn(`[autoUpdate] appointment_inquiries insert skipped: ${iqErr.message}`);
    }

    // Insert into appointments table
    let appointmentId = null;
    try {
      const [[newAppt]] = await postgresSequelize.query(
        `INSERT INTO appointments
           ("patientName", "patientEmail", "patientPhone",
            "doctorName", "appointmentDate", "appointmentTime", "appointmentDateTime",
            "consultationType", status, reason, notes,
            "userId", "createdAt", "updatedAt")
         VALUES
           (:patientName, :patientEmail, :patientPhone,
            'To be assigned', :appointmentDate, :appointmentTime, :appointmentDateTime,
            'in-person', 'pending', :reason, :notes,
            :userId, NOW(), NOW())
         RETURNING id`,
        {
          replacements: {
            patientName,
            patientEmail:        senderEmail || '',
            patientPhone:        phone || user?.phoneNumber || '',
            appointmentDate:     apptDateStr,
            appointmentTime:     apptTime,
            appointmentDateTime: apptDateTimeISO,
            reason:              `Health checkup request via email`,
            notes:               `Auto-booked from inbound email (id=${email.id}). Subject: ${email.subject}`,
            userId:              user?.id || null,
          },
        }
      );
      appointmentId = newAppt?.id;
      console.log(`[autoUpdate] Appointment #${appointmentId} created for ${patientName} on ${apptDateStr}`);
      updates.push({ type: 'appointment_booked', action: 'created', details: { appointmentId, appointmentDate: apptDateStr }, timestamp: new Date() });
    } catch (apptErr) {
      console.warn(`[autoUpdate] appointments insert failed: ${apptErr.message}`);
    }

    // ── Step 4: Confirmation email + WhatsApp ──────────────────────────────
    const location = 'Mediqzy Health Centre';

    // Confirmation email
    if (senderEmail) {
      try {
        await getSmtpTransporter().sendMail({
          from: `"Mediqzy Health" <${process.env.SMTP_USER}>`,
          to: senderEmail,
          subject: `Your health checkup appointment is confirmed — ${displayDate}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:linear-gradient(135deg,#10b981,#0ea5e9);padding:30px;text-align:center;border-radius:12px 12px 0 0;">
                <h1 style="color:#fff;margin:0;font-size:20px;">Appointment Confirmed 🎉</h1>
              </div>
              <div style="background:#f8fafc;padding:30px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
                <p style="font-size:16px;color:#334155;">Dear <strong>${patientName}</strong>,</p>
                <p style="color:#475569;">Your health checkup appointment has been booked. Here are the details:</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                  <tr><td style="padding:8px;color:#64748b;width:40%;">📅 Date</td><td style="padding:8px;color:#1e293b;font-weight:600;">${displayDate}</td></tr>
                  <tr style="background:#f1f5f9;"><td style="padding:8px;color:#64748b;">🕙 Time</td><td style="padding:8px;color:#1e293b;font-weight:600;">10:00 AM</td></tr>
                  <tr><td style="padding:8px;color:#64748b;">📍 Location</td><td style="padding:8px;color:#1e293b;font-weight:600;">${location}</td></tr>
                  <tr style="background:#f1f5f9;"><td style="padding:8px;color:#64748b;">🔖 Ref ID</td><td style="padding:8px;color:#1e293b;font-weight:600;">#${appointmentId}</td></tr>
                </table>
                <p style="color:#475569;">Please arrive <strong>15 minutes early</strong> and bring a valid photo ID.</p>
                <p style="color:#475569;">To reschedule or cancel, reply to this email or call us at <strong>support@mediqzy.com</strong>.</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
                <p style="color:#94a3b8;font-size:12px;text-align:center;">Team Mediqzy &nbsp;|&nbsp; support@mediqzy.com</p>
              </div>
            </div>`,
        });
        console.log(`[autoUpdate] Confirmation email sent to ${senderEmail}`);
        updates.push({ type: 'confirmation_email_sent', action: 'sent', details: { to: senderEmail }, timestamp: new Date() });
      } catch (confErr) {
        console.warn(`[autoUpdate] Confirmation email failed: ${confErr.message}`);
      }
    }

    // WhatsApp confirmation
    const patientPhone = phone || user?.phoneNumber;
    if (patientPhone) {
      try {
        await whatsappProductionService.sendAppointmentConfirmation({
          to: patientPhone,
          patientName,
          doctorName: 'our medical team',
          date: displayDate,
          time: '10:00 AM',
          location,
          isHealthCheckup: true,
        });
        console.log(`[autoUpdate] WhatsApp confirmation sent to ${patientPhone}`);
        updates.push({ type: 'whatsapp_confirmation_sent', action: 'sent', details: { to: patientPhone }, timestamp: new Date() });
      } catch (waErr) {
        console.warn(`[autoUpdate] WhatsApp confirmation failed: ${waErr.message}`);
      }
    }

  } catch (error) {
    console.error('Error handling appointment request:', error.message);
  }

  return updates;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseSenderEmail(rawFrom) {
  if (!rawFrom) return '';
  const match = rawFrom.match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : rawFrom.trim().toLowerCase();
}

function nextBusinessDay() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function extractPhoneFromText(text) {
  const m = text.match(/(?:\+91[-\s]?)?[6-9]\d{9}/);
  return m ? m[0].replace(/[\s-]/g, '') : null;
}

/**
 * Handle test result emails
 */
async function handleTestResult(email, aiAnalysis) {
  const updates = [];

  try {
    // Extract test type and values from email
    const testResult = {
      type: aiAnalysis.entities?.testType || extractTestType(email.body),
      values: aiAnalysis.entities?.testValues || {},
      reportDate: new Date(),
      source: 'email',
      status: 'received'
    };

    // Create notification for lab results
    await postgresSequelize.query(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data,
        created_at
      )
      VALUES (
        :teamMemberId,
        'lab_result',
        'New Lab Result Received',
        'Lab results received from ${email.from}',
        :data,
        NOW()
      )
    `, {
      replacements: {
        teamMemberId: email.teamMemberId,
        data: JSON.stringify(testResult)
      }
    });

    updates.push({
      type: 'test_result_notification',
      action: 'created',
      details: testResult,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error handling test result:', error);
  }

  return updates;
}

/**
 * Handle prescription emails
 */
async function handlePrescription(email, aiAnalysis) {
  const updates = [];

  try {
    const medicines = extractMedicinesFromText(email.body);
    const patientName = aiAnalysis.entities?.patientName || extractNameFromEmail(email.from);

    if (medicines.length > 0) {
      // Create prescription record
      await postgresSequelize.query(`
        INSERT INTO prescriptions (
          patient_name,
          sender_email,
          medicines,
          status,
          source,
          team_member_id,
          created_at
        )
        VALUES (
          :patientName,
          :senderEmail,
          :medicines,
          'pending_review',
          'email',
          :teamMemberId,
          NOW()
        )
      `, {
        replacements: {
          patientName,
          senderEmail: email.from,
          medicines: JSON.stringify(medicines),
          teamMemberId: email.teamMemberId
        }
      });

      updates.push({
        type: 'prescription_received',
        action: 'created',
        details: {
          medicines,
          patientName
        },
        timestamp: new Date()
      });
    }
  } catch (error) {
    console.error('Error handling prescription:', error);
  }

  return updates;
}

/**
 * Handle patient query emails
 */
async function handlePatientQuery(email, aiAnalysis) {
  const updates = [];

  try {
    // Create ticket for patient query
    const ticketData = {
      to: email.from,
      subject: `Re: ${email.subject}`,
      body: `Thank you for your inquiry. We will get back to you shortly.\n\nYour message:\n${email.body.substring(0, 200)}...`,
      status: 'open',
      source: 'email',
      teamMemberId: email.teamMemberId
    };

    // Auto-generate initial response (optional)
    if (aiAnalysis.sentiment === 'negative') {
      ticketData.priority = 'high';
    }

    updates.push({
      type: 'patient_query_ticket',
      action: 'created',
      details: ticketData,
      timestamp: new Date(),
      requiresAction: true
    });
  } catch (error) {
    console.error('Error handling patient query:', error);
  }

  return updates;
}

/**
 * Handle billing emails
 */
async function handleBillingEmail(email, aiAnalysis) {
  const updates = [];

  try {
    const amount = extractAmountFromText(email.body);
    const invoiceNumber = extractInvoiceNumber(email.body);

    if (amount || invoiceNumber) {
      // Create billing record or update
      await postgresSequelize.query(`
        INSERT INTO billing_notifications (
          sender_email,
          amount,
          invoice_number,
          subject,
          team_member_id,
          status,
          created_at
        )
        VALUES (
          :senderEmail,
          :amount,
          :invoiceNumber,
          :subject,
          :teamMemberId,
          'pending',
          NOW()
        )
      `, {
        replacements: {
          senderEmail: email.from,
          amount,
          invoiceNumber,
          subject: email.subject,
          teamMemberId: email.teamMemberId
        }
      });

      updates.push({
        type: 'billing_notification',
        action: 'created',
        details: { amount, invoiceNumber },
        timestamp: new Date()
      });
    }
  } catch (error) {
    console.error('Error handling billing email:', error);
  }

  return updates;
}

/**
 * Handle feedback emails
 */
async function handleFeedback(email, aiAnalysis) {
  const updates = [];

  try {
    const sentiment = aiAnalysis.sentiment || 'neutral';
    const rating = sentimentToRating(sentiment);

    // Create feedback record
    await postgresSequelize.query(`
      INSERT INTO feedback (
        sender_email,
        content,
        sentiment,
        rating,
        team_member_id,
        created_at
      )
      VALUES (
        :senderEmail,
        :content,
        :sentiment,
        :rating,
        :teamMemberId,
        NOW()
      )
    `, {
      replacements: {
        senderEmail: email.from,
        content: email.body,
        sentiment,
        rating,
        teamMemberId: email.teamMemberId
      }
    });

    updates.push({
      type: 'feedback_recorded',
      action: 'created',
      details: { sentiment, rating },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error handling feedback:', error);
  }

  return updates;
}

// ===================== Helper Functions =====================

function extractNameFromEmail(emailAddress) {
  const parts = emailAddress.split('@')[0].split(/[._-]/);
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function extractDateFromText(text) {
  const datePattern = /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-]\d{1,2}[-]\d{1,2})/;
  const match = text.match(datePattern);
  return match ? match[0] : null;
}

function extractTestType(text) {
  const testTypes = ['blood', 'urine', 'xray', 'ct scan', 'ultrasound', 'ecg', 'echo', 'covid'];
  for (const type of testTypes) {
    if (text.toLowerCase().includes(type)) {
      return type;
    }
  }
  return 'general';
}

function extractMedicinesFromText(text) {
  const medicines = [];
  const medicineKeywords = [
    'aspirin', 'ibuprofen', 'paracetamol', 'amoxicillin', 'lisinopril', 'metformin',
    'atorvastatin', 'omeprazole', 'sertraline', 'levothyroxine', 'insulin'
  ];

  medicineKeywords.forEach(med => {
    if (text.toLowerCase().includes(med.toLowerCase())) {
      medicines.push(med);
    }
  });

  return medicines;
}

function extractAmountFromText(text) {
  const amountPattern = /[\$₹]\s*(\d+[.,]\d{2}|\d+)/;
  const match = text.match(amountPattern);
  return match ? parseFloat(match[1].replace(/,/, '')) : null;
}

function extractInvoiceNumber(text) {
  const invoicePattern = /invoice\s*[:#]?\s*#?([A-Z0-9\-]+)/i;
  const match = text.match(invoicePattern);
  return match ? match[1] : null;
}

function sentimentToRating(sentiment) {
  switch (sentiment) {
    case 'positive':
      return 5;
    case 'neutral':
      return 3;
    case 'negative':
      return 1;
    default:
      return 3;
  }
}

export {
  handleAppointmentRequest,
  handleTestResult,
  handlePrescription,
  handlePatientQuery,
  handleBillingEmail,
  handleFeedback
};
