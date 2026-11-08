/**
 * doctorNormalizer.js
 * -------------------
 * Single source of truth for normalizing raw doctor DB records before they
 * are sent to API clients.
 *
 * Background:
 *   Multiple save paths have written the same JSONB columns in different shapes
 *   over time (Title Case vs lowercase day keys, array vs comma-string, flat fee
 *   columns vs feeStructure JSONB, etc.).  Applying this normalizer at response
 *   time makes every endpoint return a consistent shape regardless of how the
 *   row was originally created.
 *
 * Canonical guarantees:
 *   - weeklySchedule  → always lowercase day keys; each day has
 *                       { isAvailable, startTime, endTime, slots[] }
 *                       + optional { inPerson, online } for richer clients
 *   - weeklyAvailability → always lowercase day keys; each day has
 *                       { isAvailable, slots[] }
 *   - feeStructure    → always { online, inClinic, followUp, emergency }
 *                       (derived from scalar fee columns when JSONB is empty)
 *   - qualifications  → always string[]
 *   - languages       → always string[]
 *   - specializations → always string[] (back-filled from specialization scalar)
 *   - servicesOffered → always string[]
 *   - symptoms        → always string[] (for appointment records)
 *   - consultationTypes → keys always camelCase (online / walkIn / homeVisit)
 *   - verificationStatus → always present ("verified" / "pending" / "unverified")
 */

export const WEEK_DAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

// ── Primitive helpers ──────────────────────────────────────────────────────────

/**
 * Coerce any value to a string array:
 *   null / undefined → []
 *   string           → JSON-parse attempt, then comma-split fallback
 *   array            → returned as-is (shallow copy)
 *   other            → [String(value)]
 */
export function toArray(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {}
    }
    return trimmed.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [String(value)];
}

/** Parse a JSONB field that may arrive as a string or already as an object. */
export function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value);
      if (p && typeof p === 'object' && !Array.isArray(p)) return p;
    } catch {}
  }
  return fallback;
}

// ── weeklySchedule normalizer ──────────────────────────────────────────────────

/**
 * Normalize a raw weeklySchedule value (any known variant) into:
 *   { monday: { isAvailable, startTime, endTime, slots[], [inPerson?], [online?] }, … }
 */
export function normalizeWeeklySchedule(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const normalized = {};
  for (const day of WEEK_DAYS) {
    const titleDay = day.charAt(0).toUpperCase() + day.slice(1);
    const entry = raw[day] ?? raw[titleDay];

    if (!entry || typeof entry !== 'object') {
      normalized[day] = { isOff: true, isAvailable: false, startTime: null, endTime: null, slots: [], blockedSlots: [] };
      continue;
    }

    // Format B: { inPerson: {...}, online: {...}, isOff }
    if (entry.inPerson !== undefined || entry.online !== undefined) {
      const ip = safeJson(entry.inPerson, {});
      const ol = safeJson(entry.online, {});
      const isOff = entry.isOff === true;

      const allStarts = [ip.startTime, ol.startTime].filter(Boolean);
      const allEnds   = [ip.endTime,   ol.endTime  ].filter(Boolean);

      const slotSet = new Set([
        ...(Array.isArray(ip.slots) ? ip.slots : []),
        ...(Array.isArray(ol.slots) ? ol.slots : []),
      ]);

      normalized[day] = {
        isOff,
        isAvailable: !isOff && (ip.enabled !== false || ol.enabled !== false || ip.isAvailable !== false || ol.isAvailable !== false),
        startTime:   allStarts.length ? allStarts.reduce((a, b) => a < b ? a : b) : null,
        endTime:     allEnds.length   ? allEnds.reduce((a, b)   => a > b ? a : b) : null,
        slots:       Array.from(slotSet).sort(),
        inPerson:    ip,
        online:      ol,
        blockedSlots: Array.isArray(entry.blockedSlots) ? entry.blockedSlots : [],
      };
    } else {
      // Format A: { available, startTime, endTime, slots }
      normalized[day] = {
        isAvailable: entry.available !== false && entry.isAvailable !== false,
        startTime:   entry.startTime || null,
        endTime:     entry.endTime   || null,
        slots:       Array.isArray(entry.slots) ? entry.slots : [],
      };
    }
  }
  return normalized;
}

// ── weeklyAvailability normalizer ──────────────────────────────────────────────

const DEFAULT_AVAILABILITY = Object.fromEntries(
  WEEK_DAYS.map(d => [d, { isAvailable: false, slots: [] }])
);

/**
 * Normalize a raw weeklyAvailability value — always lowercase keys, always
 * { isAvailable: bool, slots: string[] }.
 */
export function normalizeWeeklyAvailability(raw) {
  const base = { ...DEFAULT_AVAILABILITY };
  if (!raw || typeof raw !== 'object') return base;

  for (const day of WEEK_DAYS) {
    const titleDay = day.charAt(0).toUpperCase() + day.slice(1);
    const entry = raw[day] ?? raw[titleDay];
    if (!entry || typeof entry !== 'object') continue;

    base[day] = {
      isAvailable: Boolean(entry.isAvailable ?? entry.available),
      slots: Array.isArray(entry.slots) ? entry.slots : [],
    };
  }
  return base;
}

// ── feeStructure normalizer ────────────────────────────────────────────────────

/**
 * Build a canonical feeStructure from whichever columns are populated.
 * Always returns { online, inClinic, followUp, emergency } — null when unknown.
 */
export function normalizeFeeStructure(doc) {
  const existing = safeJson(doc.feeStructure, {});
  if (Object.keys(existing).length > 0) {
    return {
      online:    existing.online    ?? existing.onlineConsultation ?? null,
      inClinic:  existing.inClinic  ?? existing.inPerson           ?? existing.walkIn ?? null,
      followUp:  existing.followUp  ?? null,
      emergency: existing.emergency ?? null,
    };
  }
  // Fall back to scalar fee columns
  const online   = parseFloat(doc.onlineConsultationFee)   || parseFloat(doc.consultationFees) || null;
  const inClinic = parseFloat(doc.inPersonConsultationFee) || parseFloat(doc.consultationFees) || null;
  return {
    online,
    inClinic,
    followUp:  null,
    emergency: parseFloat(doc.emergencyFee) || null,
  };
}

// ── consultationTypes normalizer ───────────────────────────────────────────────

const CONSULT_DEFAULTS = {
  online:    { available: false, fee: 0 },
  walkIn:    { available: false, fee: 0 },
  homeVisit: { available: false, fee: 0 },
};

/** Normalize consultationTypes to always have camelCase keys. */
export function normalizeConsultationTypes(raw) {
  const base = safeJson(raw, {});
  // Merge any snake_case variants into camelCase
  return {
    online:    base.online    ?? base.online_consultation    ?? CONSULT_DEFAULTS.online,
    walkIn:    base.walkIn    ?? base.walk_in   ?? base.walkin ?? CONSULT_DEFAULTS.walkIn,
    homeVisit: base.homeVisit ?? base.home_visit             ?? CONSULT_DEFAULTS.homeVisit,
  };
}

// ── verificationStatus ─────────────────────────────────────────────────────────

export function normalizeVerificationStatus(doc) {
  if (doc.verificationStatus) return doc.verificationStatus;
  if (doc.isVerified === true) return 'verified';
  if (doc.isVerified === false) return 'unverified';
  return 'pending';
}

// ── Master normalizer ──────────────────────────────────────────────────────────

/**
 * Apply all normalizations to a raw doctor record.
 * Safe to call on Sequelize model instances or plain objects.
 */
/**
 * D-6: clinicAddress is a TEXT column that holds a JSON document for most rows
 * (759 of them), so clients had to JSON.parse it themselves. Resolve it to a real
 * object: prefer the structured clinicAddress_json, then parse the JSON text, and
 * fall back to wrapping a plain free-text address. Returns null when there is none.
 */
function normalizeClinicAddress(doc) {
  const structured = doc.clinicAddress_json;
  if (structured && typeof structured === 'object' && !Array.isArray(structured)
      && Object.keys(structured).length > 0) {
    return structured;
  }

  const raw = doc.clinicAddress;
  if (raw && typeof raw === 'object') return raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch { /* stored text is not valid JSON — treat it as a plain address */ }
    }
    return { address: trimmed };
  }

  return null;
}

export function normalizeDoctorProfile(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const doc = typeof raw.toJSON === 'function' ? raw.toJSON() : { ...raw };

  // Keep the original text around for any client still expecting the string form.
  if (typeof doc.clinicAddress === 'string') {
    doc.clinicAddressText = doc.clinicAddress;
  }
  doc.clinicAddress = normalizeClinicAddress(doc);

  if (doc.weeklySchedule) {
    doc.weeklySchedule = normalizeWeeklySchedule(doc.weeklySchedule) ?? doc.weeklySchedule;
  }

  if (doc.weeklyAvailability) {
    doc.weeklyAvailability = normalizeWeeklyAvailability(doc.weeklyAvailability);
  }

  doc.feeStructure      = normalizeFeeStructure(doc);
  doc.qualifications    = toArray(doc.qualifications);
  doc.languages         = toArray(doc.languages);
  doc.servicesOffered   = toArray(doc.servicesOffered);
  doc.consultationTypes = normalizeConsultationTypes(doc.consultationTypes);

  // Back-fill plural array from scalar
  if (doc.specialization && (!Array.isArray(doc.specializations) || doc.specializations.length === 0)) {
    doc.specializations = [doc.specialization];
  } else {
    doc.specializations = toArray(doc.specializations);
  }

  doc.verificationStatus = normalizeVerificationStatus(doc);

  // Canonical profile photo field — DB column is profileImage; some clients expect profilePicture
  doc.profileImage = doc.profileImage || doc.profilePicture || null;
  doc.profilePicture = doc.profileImage;

  return doc;
}

/**
 * Normalize an appointment record — ensures array fields are always arrays.
 */
export function normalizeAppointment(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const doc = typeof raw.toJSON === 'function' ? raw.toJSON() : { ...raw };

  doc.symptoms    = toArray(doc.symptoms);
  doc.medications = toArray(doc.medications);
  doc.allergies   = toArray(doc.allergies);

  return doc;
}
