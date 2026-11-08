/**
 * Consultation-type capability predicates for doctor search (F-1).
 *
 * Why this file exists
 * --------------------
 * `GET /api/doctors` and `GET /api/doctors/available` accept
 * `consultationType=online|walkIn|homeVisit`. Both filters were resolving to the
 * wrong signal, and both silently returned (almost) nothing in production:
 *
 *   online   -> `("isOnline" = true)`. But `isOnline` is PRESENCE — "logged in
 *               right now", declared beside lastLoginAt and computed from the
 *               active-socket set in chat.route.js — not CAPABILITY. True for
 *               5 of 1104 active doctors, so an online-consult search returned
 *               5 results, and 0 of the 61 active psychiatrists/psychologists,
 *               every one of whom is online-capable.
 *
 *   walkIn   -> `hasAddress AND googleVerifiedLocation`. The Google conjunct
 *               matched 0 of 1104: `clinicAddress_json` holds only
 *               state/city/pincode/country/street/line1 across every active row,
 *               never placeId/source/provider, so it is unsatisfiable by
 *               construction. In-person search returned an empty list for every
 *               patient, platform-wide.
 *
 *   homeVisit-> shared the walk-in predicate, so a home-visit search could
 *               return doctors who do not offer one.
 *
 * Capability is recorded in the `consultationTypes` JSONB, whose keys are
 * consistently camelCase (`online`, `walkIn`, `homeVisit`) across all 1104 rows.
 *
 * Caveat — the same shape as the fee-provenance caveat in doctorNormalizer: the
 * legacy model default materialised `online.available = true` into ALL 1104 rows
 * and `walkIn.available = true` into 1103, so these predicates are permissive and
 * will match nearly every doctor until per-doctor capability is actually curated.
 * That is still strictly better than filtering on a column that means something
 * else. `homeVisit.available` is true for 0 doctors, which is accurate.
 *
 * Values are compared as jsonb rather than cast with `::boolean`, so a
 * non-boolean value in one of these keys can never raise at query time.
 */

/** Teleconsultation capability (NOT "online right now"). */
export const ONLINE_CAPABILITY_SQL = `("consultationTypes"->'online'->'available' = 'true'::jsonb)`;

/** Presence — "logged in right now". Deliberately separate from capability. */
export const ONLINE_PRESENCE_SQL = `("isOnline" = true)`;

/** In-person/walk-in capability. Pair with an address check; see below. */
export const WALKIN_CAPABILITY_SQL = `("consultationTypes"->'walkIn'->'available' = 'true'::jsonb)`;

/** Home-visit capability. Truthfully 0 doctors record this today. */
export const HOMEVISIT_CAPABILITY_SQL = `("consultationTypes"->'homeVisit'->'available' = 'true'::jsonb)`;

/**
 * Normalise the many spellings the routes accept into a canonical key.
 * Returns null for anything unrecognised, so callers add no filter at all
 * rather than silently applying the wrong one.
 */
export function normalizeConsultationType(raw) {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (v === 'online' || v === 'tele' || v === 'teleconsult' || v === 'video') return 'online';
  if (v === 'walkin' || v === 'walk-in' || v === 'walk_in'
      || v === 'inperson' || v === 'in-person' || v === 'in_person'
      || v === 'clinic' || v === 'offline') return 'walkIn';
  if (v === 'homevisit' || v === 'home-visit' || v === 'home_visit' || v === 'home') return 'homeVisit';
  return null;
}

/**
 * SQL predicate for a requested consultation type, or null when the type is not
 * recognised (caller then applies no consultation filter).
 *
 * @param {string} requestedType  raw query value
 * @param {object} [opts]
 * @param {string} [opts.hasAddressSql]  SQL fragment asserting a usable clinic
 *        address. When supplied it is AND-ed into the walk-in predicate, so an
 *        in-person result always has somewhere for the patient to actually go.
 */
export function consultationCapabilitySql(requestedType, opts = {}) {
  const { hasAddressSql } = opts;
  switch (normalizeConsultationType(requestedType)) {
    case 'online':
      return ONLINE_CAPABILITY_SQL;
    case 'walkIn':
      return hasAddressSql
        ? `(${WALKIN_CAPABILITY_SQL} AND ${hasAddressSql})`
        : WALKIN_CAPABILITY_SQL;
    case 'homeVisit':
      return HOMEVISIT_CAPABILITY_SQL;
    default:
      return null;
  }
}
