/**
 * iCal (.ics) File Generator
 * Generates calendar files for appointment synchronization
 * Compatible with Google Calendar, Apple Calendar, Outlook, etc.
 */

import { doctorDisplayName } from './doctor-name.js';

/**
 * Format date to iCal format: YYYYMMDDTHHMMSSZ
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} iCal formatted date
 */
const formatICalDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

/**
 * Escape special characters for iCal format
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
const escapeICalText = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
};

/**
 * Parse appointment time and create Date objects
 * @param {string} appointmentDate - Date in YYYY-MM-DD format
 * @param {string} appointmentTime - Time in HH:MM format
 * @param {number} duration - Duration in minutes (default: 30)
 * @returns {Object} { startDate, endDate }
 */
const parseAppointmentDateTime = (appointmentDate, appointmentTime, duration = 30) => {
  // Parse date
  const datePart = appointmentDate instanceof Date 
    ? appointmentDate.toISOString().split('T')[0]
    : String(appointmentDate).split('T')[0];
  
  // Parse time (handle HH:MM or HH:MM:SS)
  const timePart = String(appointmentTime).trim().split(':');
  const hours = timePart[0].padStart(2, '0');
  const minutes = (timePart[1] || '00').padStart(2, '0');
  
  // Create start date in UTC
  const startDate = new Date(`${datePart}T${hours}:${minutes}:00Z`);
  
  // Create end date (add duration)
  const endDate = new Date(startDate.getTime() + (duration * 60 * 1000));
  
  return { startDate, endDate };
};

/**
 * Generate iCal file content for an appointment
 * @param {Object} appointment - Appointment details
 * @returns {string} iCal file content
 */
export const generateICalFile = (appointment) => {
  const {
    id,
    patientName,
    patientEmail,
    doctorName,
    doctorEmail,
    specialization,
    appointmentDate,
    appointmentTime,
    duration = 30,
    consultationType,
    consultationFee,
    symptoms,
    notes,
    location,
    meetingLink
  } = appointment;

  // Parse dates
  const { startDate, endDate } = parseAppointmentDateTime(
    appointmentDate,
    appointmentTime,
    duration
  );

  // Generate unique ID
  const uid = `appointment-${id}@mediczy.com`;
  
  // Current timestamp
  const now = new Date();
  const timestamp = formatICalDate(now);
  
  // Build description
  let description = `Medical Appointment with ${doctorDisplayName(doctorName)}`;
  if (specialization) {
    description += `\\n\\nSpecialization: ${escapeICalText(specialization)}`;
  }
  if (consultationType) {
    description += `\\n\\nConsultation Type: ${escapeICalText(consultationType)}`;
  }
  if (consultationFee) {
    description += `\\n\\nConsultation Fee: ₹${consultationFee}`;
  }
  if (symptoms) {
    description += `\\n\\nSymptoms: ${escapeICalText(symptoms)}`;
  }
  if (notes) {
    description += `\\n\\nNotes: ${escapeICalText(notes)}`;
  }
  if (meetingLink) {
    description += `\\n\\nJoin Link: ${meetingLink}`;
  }
  
  // Build location
  let eventLocation = '';
  if (consultationType === 'online' || consultationType === 'video') {
    eventLocation = 'Online Video Consultation';
    if (meetingLink) {
      eventLocation += ` - ${meetingLink}`;
    }
  } else if (location) {
    eventLocation = escapeICalText(location);
  } else {
    eventLocation = 'Medical Facility';
  }
  
  // Build summary (title)
  const summary = `Medical Appointment - ${doctorDisplayName(doctorName)}`;
  
  // Build alarm (reminder) - 1 day before
  const alarmTrigger = '-P1D'; // 1 day before
  
  // Generate iCal content
  const icalContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mediczy//Appointment Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART:${formatICalDate(startDate)}`,
    `DTEND:${formatICalDate(endDate)}`,
    `SUMMARY:${escapeICalText(summary)}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${eventLocation}`,
    `STATUS:CONFIRMED`,
    `SEQUENCE:0`,
    `PRIORITY:5`,
    // Organizer (Doctor)
    doctorEmail ? `ORGANIZER;CN=${escapeICalText(doctorName)}:mailto:${doctorEmail}` : null,
    // Attendee (Patient)
    patientEmail ? `ATTENDEE;CN=${escapeICalText(patientName)};RSVP=TRUE:mailto:${patientEmail}` : null,
    // Reminder alarm
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: Appointment with ${doctorDisplayName(doctorName)}`,
    `TRIGGER:${alarmTrigger}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  
  return icalContent;
};

/**
 * Generate iCal file for doctor's perspective
 * @param {Object} appointment - Appointment details
 * @returns {string} iCal file content
 */
export const generateDoctorICalFile = (appointment) => {
  const {
    id,
    patientName,
    patientEmail,
    patientPhone,
    doctorName,
    doctorEmail,
    specialization,
    appointmentDate,
    appointmentTime,
    duration = 30,
    consultationType,
    symptoms,
    notes
  } = appointment;

  const { startDate, endDate } = parseAppointmentDateTime(
    appointmentDate,
    appointmentTime,
    duration
  );

  const uid = `doctor-appointment-${id}@mediczy.com`;
  const now = new Date();
  const timestamp = formatICalDate(now);
  
  // Build description for doctor
  let description = `Patient Appointment: ${patientName}`;
  if (patientPhone) {
    description += `\\n\\nPatient Phone: ${patientPhone}`;
  }
  if (patientEmail) {
    description += `\\n\\nPatient Email: ${patientEmail}`;
  }
  if (consultationType) {
    description += `\\n\\nConsultation Type: ${escapeICalText(consultationType)}`;
  }
  if (symptoms) {
    description += `\\n\\nReported Symptoms: ${escapeICalText(symptoms)}`;
  }
  if (notes) {
    description += `\\n\\nNotes: ${escapeICalText(notes)}`;
  }
  
  const summary = `Patient: ${patientName}`;
  const eventLocation = consultationType === 'online' || consultationType === 'video'
    ? 'Online Video Consultation'
    : 'Clinic';
  
  const icalContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mediczy//Doctor Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART:${formatICalDate(startDate)}`,
    `DTEND:${formatICalDate(endDate)}`,
    `SUMMARY:${escapeICalText(summary)}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${eventLocation}`,
    `STATUS:CONFIRMED`,
    `SEQUENCE:0`,
    `PRIORITY:5`,
    // Attendee (Doctor as main attendee)
    doctorEmail ? `ATTENDEE;CN=${escapeICalText(doctorName)};ROLE=REQ-PARTICIPANT:mailto:${doctorEmail}` : null,
    // Reminder - 1 hour before
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:Upcoming appointment with ${patientName}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  
  return icalContent;
};

/**
 * Generate iCal filename
 * @param {Object} appointment - Appointment details
 * @param {string} type - 'patient' or 'doctor'
 * @returns {string} Filename
 */
export const generateICalFilename = (appointment, type = 'patient') => {
  const { id, doctorName, patientName, appointmentDate } = appointment;
  const date = appointmentDate instanceof Date
    ? appointmentDate.toISOString().split('T')[0]
    : String(appointmentDate).split('T')[0];
  
  const name = type === 'doctor' 
    ? patientName?.replace(/\s+/g, '-') 
    : doctorName?.replace(/\s+/g, '-');
  
  return `mediczy-appointment-${name}-${date}-${id}.ics`;
};

export default {
  generateICalFile,
  generateDoctorICalFile,
  generateICalFilename,
  formatICalDate,
  escapeICalText
};
