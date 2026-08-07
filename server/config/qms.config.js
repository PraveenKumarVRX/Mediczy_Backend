/** Shared QMS defaults for hospital / clinic / lab portals. */
export const QMS_PORTAL_DEFAULTS = {
  hospital: {
    portal: 'hospital',
    department: 'opd',
    queueZone: 'opd-waiting',
    label: 'Hospital OPD',
  },
  clinic: {
    portal: 'clinic',
    department: 'opd',
    queueZone: 'clinic-waiting',
    label: 'Clinic',
  },
  lab: {
    portal: 'lab',
    department: 'lab',
    queueZone: 'lab-waiting',
    label: 'Lab collection',
  },
  radiology: {
    portal: 'radiology',
    department: 'radiology',
    queueZone: 'radiology-waiting',
    label: 'Radiology',
  },
  pharmacy: {
    portal: 'pharmacy',
    department: 'pharmacy',
    queueZone: 'pharmacy-waiting',
    label: 'Pharmacy',
  },
};

/** Departments a journey token can move through (same public T-###). */
export const QMS_JOURNEY_DEPARTMENTS = [
  { key: 'opd', label: 'OPD' },
  { key: 'lab', label: 'Lab' },
  { key: 'radiology', label: 'Radiology' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'er', label: 'ER' },
];

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'general';
}

/** Canonical waiting-room zone for a doctor / OPD specialty. */
export function queueZoneForDoctor({ doctorId, specialization, opdCode, queueZone } = {}) {
  if (queueZone) return String(queueZone);
  if (opdCode) return `opd-${slug(opdCode)}`;
  if (doctorId) return `opd-doc-${parseInt(doctorId, 10)}`;
  if (specialization) return `opd-${slug(specialization)}`;
  return 'opd-waiting';
}

export function isInPersonConsultation(type) {
  const t = String(type || '').toLowerCase().replace(/_/g, '-');
  return ['in-person', 'inperson', 'walk-in', 'walkin', 'opd', 'offline', 'clinic'].includes(t);
}

export default QMS_PORTAL_DEFAULTS;
