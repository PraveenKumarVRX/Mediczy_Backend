/** Shared QMS notify message formatting (no DB / provider imports). */

/** SMS gateways prefer plain text — strip WhatsApp markdown emphasis. */
export function toSmsPlainText(message) {
  return String(message || '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[_~`]/g, '')
    .trim();
}

export function tokenSlipText(entry = {}) {
  const meta = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
  const lines = [
    'MediQzy — OPD Token',
    `Token: *${entry.tokenNumber}*`,
    entry.patientName ? `Patient: ${entry.patientName}` : null,
    entry.doctorName ? `Doctor: ${entry.doctorName}` : null,
    meta.specialization ? `OPD: ${meta.specialization}` : null,
    entry.counterId ? `Counter / Room: ${entry.counterId}` : null,
    `Est. wait: ~${entry.estimatedWaitMinutes || 15} min`,
    meta.appointmentTime ? `Appt time: ${meta.appointmentTime}` : null,
    'Please keep this token and wait to be called.',
  ];
  return lines.filter(Boolean).join('\n');
}
