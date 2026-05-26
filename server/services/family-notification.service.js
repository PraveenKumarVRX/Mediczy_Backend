/**
 * Family Notification Service
 *
 * Sends real-time care journey updates to patient family contacts
 * via WhatsApp (primary) and SMS (fallback).
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

const FAMILY_TEMPLATES = {
  PATIENT_REGISTERED: (d) =>
    `✅ *${d.patientName}* has been registered at ${d.hospitalName}.\nPatient ID: *${d.admissionNumber}*\nFor queries call the help desk.`,

  ADMITTED: (d) =>
    `🏥 *${d.patientName}* has been admitted.\nWard: *${d.wardName}*, Bed: *${d.bedNumber}*\nAdmission No: ${d.admissionNumber}\nAttending Doctor: Dr. ${d.doctorName || 'assigned'}`,

  OT_STARTED: (d) =>
    `🔔 *${d.patientName}* has entered the Operation Theatre at ${d.time}.\nProcedure: ${d.procedureName}\nWe will update you when surgery is complete.`,

  OT_COMPLETED: (d) =>
    `✅ Surgery for *${d.patientName}* has been completed at ${d.time}.\n${d.surgeonNote ? `Surgeon update: ${d.surgeonNote}` : 'The surgical team will update the doctor shortly.'}\nPatient is moving to recovery.`,

  ICU_TRANSFERRED: (d) =>
    `📋 *${d.patientName}* has been shifted to the ICU for monitoring.\nThis is a standard precautionary step. The care team is closely monitoring them.`,

  WARD_TRANSFERRED: (d) =>
    `🛏 *${d.patientName}* has been moved.\nNew Ward: *${d.wardName}*, Bed: *${d.bedNumber}*`,

  DISCHARGE_READY: (d) =>
    `🏠 *${d.patientName}* is ready for discharge.\nPlease complete billing (₹${d.amount || 'see desk'}) at the billing counter.\nDischarge summary and e-prescription will be sent to the patient app.`,

  ER_ARRIVED: (d) =>
    `🚨 *${d.patientName}* has been registered in our Emergency Department.\nPatient ID: ${d.tempId}\nOur team is attending to them. We will keep you updated.`
};

async function getFamilyContacts(patientId, organizationId) {
  const rows = await sequelize.query(
    `SELECT phone, name, relationship FROM family_members WHERE user_id = :patientId LIMIT 3`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
  return rows;
}

async function sendWhatsApp(phone, message) {
  try {
    // Use existing whatsapp service if available
    const { default: whatsappService } = await import('./whatsapp.service.js').catch(() => ({ default: null }));
    if (whatsappService?.sendMessage) {
      await whatsappService.sendMessage(phone, message);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function sendSMS(phone, message) {
  try {
    const { SMSService } = await import('./sms.service.js').catch(() => ({ SMSService: null }));
    if (!SMSService) return false;
    const sms = new SMSService({ provider: process.env.SMS_PROVIDER || 'msg91' });
    await sms.sendSMS({ to: phone, body: message });
    return true;
  } catch {
    return false;
  }
}

async function notify(patientId, organizationId, templateKey, templateData) {
  const contacts = await getFamilyContacts(patientId, organizationId);
  if (!contacts.length) return { sent: 0 };

  const message = FAMILY_TEMPLATES[templateKey]?.(templateData);
  if (!message) return { sent: 0 };

  let sent = 0;
  for (const contact of contacts) {
    const phone = contact.phone?.replace(/\D/g, '');
    if (!phone) continue;
    const wa = await sendWhatsApp(phone, message);
    if (!wa) await sendSMS(phone, message);
    sent++;
  }
  return { sent, contacts: contacts.length };
}

export async function notifyPatientRegistered({ patientId, organizationId, patientName, hospitalName, admissionNumber }) {
  return notify(patientId, organizationId, 'PATIENT_REGISTERED', { patientName, hospitalName, admissionNumber });
}

export async function notifyAdmitted({ patientId, organizationId, patientName, wardName, bedNumber, admissionNumber, doctorName }) {
  return notify(patientId, organizationId, 'ADMITTED', { patientName, wardName, bedNumber, admissionNumber, doctorName });
}

export async function notifyOTStarted({ patientId, organizationId, patientName, procedureName }) {
  return notify(patientId, organizationId, 'OT_STARTED', {
    patientName, procedureName,
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  });
}

export async function notifyOTCompleted({ patientId, organizationId, patientName, surgeonNote }) {
  return notify(patientId, organizationId, 'OT_COMPLETED', {
    patientName, surgeonNote,
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  });
}

export async function notifyICUTransfer({ patientId, organizationId, patientName }) {
  return notify(patientId, organizationId, 'ICU_TRANSFERRED', { patientName });
}

export async function notifyWardTransfer({ patientId, organizationId, patientName, wardName, bedNumber }) {
  return notify(patientId, organizationId, 'WARD_TRANSFERRED', { patientName, wardName, bedNumber });
}

export async function notifyDischargeReady({ patientId, organizationId, patientName, amount }) {
  return notify(patientId, organizationId, 'DISCHARGE_READY', { patientName, amount });
}

export async function notifyERArrival({ patientId, organizationId, patientName, tempId }) {
  return notify(patientId, organizationId, 'ER_ARRIVED', { patientName, tempId });
}
