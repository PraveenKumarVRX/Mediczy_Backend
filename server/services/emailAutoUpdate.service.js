/**
 * Email Auto-Update Service
 * Automatically updates portal data based on email analysis
 */

import { postgresSequelize } from '../db/postgres-sequelize.js';
import { Op } from 'sequelize';

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
 * Handle appointment request emails
 */
async function handleAppointmentRequest(email, aiAnalysis) {
  const updates = [];

  try {
    // Extract patient name and preferred date from email
    const patientName = aiAnalysis.entities?.patientName || extractNameFromEmail(email.from);
    const preferredDate = aiAnalysis.entities?.date || extractDateFromText(email.body);

    // Search for matching patient appointments or create inquiry
    if (patientName && preferredDate) {
      // Create appointment inquiry record
      const [appointmentInquiry, created] = await postgresSequelize.query(`
        INSERT INTO appointment_inquiries (
          email, 
          patient_name, 
          preferred_date, 
          status, 
          source, 
          team_member_id, 
          created_at
        )
        VALUES (
          :email,
          :patientName,
          :preferredDate,
          'pending',
          'email',
          :teamMemberId,
          NOW()
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `, {
        replacements: {
          email: email.from,
          patientName,
          preferredDate,
          teamMemberId: email.teamMemberId
        }
      });

      if (created) {
        updates.push({
          type: 'appointment_inquiry',
          action: 'created',
          details: {
            patientName,
            preferredDate
          },
          timestamp: new Date()
        });
      }
    }
  } catch (error) {
    console.error('Error handling appointment request:', error);
  }

  return updates;
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
