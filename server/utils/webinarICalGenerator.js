/**
 * Webinar iCal Generator
 * Generates calendar files for webinar synchronization
 * Extends existing icalGenerator for webinar-specific needs
 */

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
 * Generate iCal file for webinar registration
 * @param {Object} webinarData - Webinar details
 * @param {Object} userData - User registration details
 * @returns {string} iCal file content
 */
export const generateWebinarICalFile = (webinarData, userData = null) => {
  const {
    id,
    title,
    description,
    scheduled_at,
    duration,
    meeting_url,
    max_participants,
    doctor
  } = webinarData;

  // Calculate start and end times
  const startDate = new Date(scheduled_at);
  const endDate = new Date(startDate.getTime() + (duration || 60) * 60000);
  
  // Extract doctor info
  const doctorName = doctor?.name || 'Mediczy Doctor';
  const doctorEmail = doctor?.email || 'webinars@mediczy.com';
  
  // Generate unique ID
  const uid = `webinar-${id}@mediczy.com`;
  
  // Current timestamp
  const now = new Date();
  const timestamp = formatICalDate(now);
  
  // Build description
  let eventDescription = escapeICalText(description || 'Live medical webinar session');
  eventDescription += `\\n\\nHost: Dr. ${escapeICalText(doctorName)}`;
  eventDescription += `\\n\\nMaximum Attendees: ${max_participants || 'Unlimited'}`;
  
  if (userData) {
    eventDescription += `\\n\\nRegistered as: ${escapeICalText(userData.name || userData.email)}`;
  }
  
  eventDescription += `\\n\\nJoin URL: ${escapeICalText(meeting_url || `https://meet.mediczy.com/webinar-${id}`)}`;
  
  // Build location
  const eventLocation = 'Online Webinar - Mediczy Platform';
  
  // Build summary (title)
  const summary = escapeICalText(title);
  
  // Build organizer
  const organizerEmail = doctorEmail;
  const organizerName = `Dr. ${doctorName}`;
  
  // Build attendee (if user data provided)
  let attendeeBlock = '';
  if (userData && userData.email) {
    attendeeBlock = `ATTENDEE;CN=${escapeICalText(userData.name || 'Participant')};RSVP=TRUE:mailto:${userData.email}\n`;
  }
  
  // Build alarms (reminders)
  const alarms = [
    // 1 week before
    {
      trigger: '-P7D',
      description: `Webinar in 1 week: ${title}`
    },
    // 1 day before
    {
      trigger: '-P1D',
      description: `Webinar tomorrow: ${title}`
    },
    // 2 hours before
    {
      trigger: '-PT2H',
      description: `Webinar in 2 hours: ${title}`
    },
    // 15 minutes before
    {
      trigger: '-PT15M',
      description: `Webinar starting in 15 minutes!`
    }
  ];
  
  // Build alarm blocks
  const alarmBlocks = alarms.map(alarm => `
BEGIN:VALARM
TRIGGER:${alarm.trigger}
DESCRIPTION:${escapeICalText(alarm.description)}
ACTION:DISPLAY
END:VALARM`.trim()).join('\n');
  
  // Generate iCal content
  const icalContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mediczy//Webinar Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'X-WR-CALNAME:Mediczy Medical Webinars',
    'X-WR-TIMEZONE:Asia/Kolkata',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART:${formatICalDate(startDate)}`,
    `DTEND:${formatICalDate(endDate)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${eventDescription}`,
    `LOCATION:${eventLocation}`,
    `ORGANIZER;CN=${escapeICalText(organizerName)}:mailto:${organizerEmail}`,
    attendeeBlock,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'CLASS:PUBLIC',
    'PRIORITY:5',
    `URL:https://app.mediqzy.com/webinar/${id}`,
    alarmBlocks,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(line => line).join('\r\n');

  return icalContent;
};

/**
 * Generate iCal file for webinar host (doctor)
 * @param {Object} webinarData - Webinar details
 * @returns {string} iCal file content
 */
export const generateWebinarHostICalFile = (webinarData) => {
  const {
    id,
    title,
    description,
    scheduled_at,
    duration,
    meeting_url,
    max_participants,
    doctor
  } = webinarData;

  const startDate = new Date(scheduled_at);
  const endDate = new Date(startDate.getTime() + (duration || 60) * 60000);
  
  // Extract doctor info
  const doctorName = doctor?.name || 'Mediczy Doctor';
  const doctorEmail = doctor?.email || 'webinars@mediczy.com';
  
  const uid = `webinar-host-${id}@mediczy.com`;
  const now = new Date();
  const timestamp = formatICalDate(now);
  
  // Build description for host
  let eventDescription = escapeICalText(description || 'Host live medical webinar session');
  eventDescription += `\\n\\nYou are hosting this webinar as Dr. ${escapeICalText(doctorName)}`;
  eventDescription += `\\n\\nMaximum Participants: ${max_participants || 'Unlimited'}`;
  eventDescription += `\\n\\nHost Dashboard: https://app.mediczy.com/doctor/webinars`;
  eventDescription += `\\n\\nStart Webinar: ${escapeICalText(meeting_url || `https://meet.mediczy.com/webinar-${id}?host=true`)}`;
  
  const summary = `[HOST] ${escapeICalText(title)}`;
  const eventLocation = 'Online Webinar - Mediczy Platform';
  const organizerEmail = doctorEmail;
  
  // Host needs early reminders
  const alarms = [
    { trigger: '-P7D', description: 'Webinar in 1 week - Prepare materials' },
    { trigger: '-P1D', description: 'Webinar tomorrow - Review presentation' },
    { trigger: '-PT1H', description: 'Webinar in 1 hour - Setup check' },
    { trigger: '-PT15M', description: 'Starting in 15 minutes - Join now!' }
  ];
  
  const alarmBlocks = alarms.map(alarm => `
BEGIN:VALARM
TRIGGER:${alarm.trigger}
DESCRIPTION:${escapeICalText(alarm.description)}
ACTION:DISPLAY
END:VALARM`.trim()).join('\n');
  
  const icalContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mediczy//Webinar Host Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'X-WR-CALNAME:Mediczy Webinars (Hosting)',
    'X-WR-TIMEZONE:Asia/Kolkata',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART:${formatICalDate(startDate)}`,
    `DTEND:${formatICalDate(endDate)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${eventDescription}`,
    `LOCATION:${eventLocation}`,
    `ORGANIZER;CN=Dr. ${escapeICalText(doctor_name)}:mailto:${organizerEmail}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'CLASS:PUBLIC',
    'PRIORITY:9',
    `URL:https://app.mediqzy.com/doctor/webinars/${id}`,
    alarmBlocks,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icalContent;
};

/**
 * Generate filename for webinar iCal file
 * @param {Object} webinarData - Webinar details
 * @param {boolean} isHost - Whether this is for host
 * @returns {string} Filename
 */
export const generateWebinarICalFilename = (webinarData, isHost = false) => {
  const { id, title } = webinarData;
  const sanitizedTitle = title
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)
    .toLowerCase();
  
  const prefix = isHost ? 'host' : 'webinar';
  return `${prefix}-${sanitizedTitle}-${id}.ics`;
};

/**
 * Export helper functions from main iCal generator
 */
export { escapeICalText, formatICalDate };
