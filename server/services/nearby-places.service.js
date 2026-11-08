/**
 * Nearby places from our own data.
 *
 * /api/places/nearby used to be a thin proxy to Google Places and nothing else,
 * so with GOOGLE_MAPS_API_KEY unset it answered 503 to every request — which is
 * what the mobile app's "Find Hospital" screen was hitting, showing hospitals
 * with no distance. We already hold the data it was asking Google for: 10,645
 * geocoded rows in `hospitals` and 2,414 labs whose `address` JSONB carries
 * `coordinates.lat/lng`. This serves those, ordered by real distance.
 *
 * Results use the Google Places response shape the app already parses, plus a
 * `distance_km` field, so the fallback is a drop-in.
 */
import pool from '../db/pgPool.js';

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine distance in km between the bound point ($1 lat, $2 lng) and the
 * given latitude/longitude SQL expressions. LEAST/GREATEST clamp the cosine
 * into [-1, 1]: floating point can push it a hair outside, and acos() of
 * 1.0000000001 is a runtime error, not a rounding problem.
 */
const distanceSql = (latExpr, lngExpr) => `
  ${EARTH_RADIUS_KM} * acos(LEAST(1, GREATEST(-1,
    cos(radians($1::double precision)) * cos(radians(${latExpr}))
      * cos(radians(${lngExpr}) - radians($2::double precision))
    + sin(radians($1::double precision)) * sin(radians(${latExpr}))
  )))`;

/** Labs keep their coordinates inside the address JSONB, as text. */
const LAB_LAT = `(address->'coordinates'->>'lat')::double precision`;
const LAB_LNG = `(address->'coordinates'->>'lng')::double precision`;
const LAB_HAS_COORDS = `
  address->'coordinates'->>'lat' ~ '^-?[0-9]+(\\.[0-9]+)?$'
  AND address->'coordinates'->>'lng' ~ '^-?[0-9]+(\\.[0-9]+)?$'`;

async function nearbyHospitals(lat, lng, radiusKm, limit) {
  const distance = distanceSql('latitude', 'longitude');
  const { rows } = await pool.query(
    `SELECT hospital_name AS name,
            COALESCE(address, '') AS address,
            city, state, pincode, phone_number,
            latitude::double precision  AS lat,
            longitude::double precision AS lng,
            ${distance} AS distance_km
       FROM hospitals
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND COALESCE(status, 'active') <> 'inactive'
        AND ${distance} <= $3::double precision
      ORDER BY distance_km ASC
      LIMIT $4::int`,
    [lat, lng, radiusKm, limit]
  );
  return rows;
}

async function nearbyLabs(lat, lng, radiusKm, limit) {
  const distance = distanceSql(LAB_LAT, LAB_LNG);
  const { rows } = await pool.query(
    `SELECT name,
            COALESCE(address->>'formatted_address', address->>'street', '') AS address,
            address->>'city'    AS city,
            address->>'state'   AS state,
            address->>'zipCode' AS pincode,
            "phoneNumber"       AS phone_number,
            rating,
            "totalReviews"      AS total_reviews,
            ${LAB_LAT} AS lat,
            ${LAB_LNG} AS lng,
            ${distance} AS distance_km
       FROM labs
      WHERE ${LAB_HAS_COORDS}
        AND COALESCE(status, 'active') = 'active'
        AND ${distance} <= $3::double precision
      ORDER BY distance_km ASC
      LIMIT $4::int`,
    [lat, lng, radiusKm, limit]
  );
  return rows;
}

/**
 * Join address parts without repeating any of them. Stored addresses often
 * already end in the city and state, so a naive join produced
 * "123 MG Road, Bangalore, Karnataka, Bangalore, Karnataka" — the same
 * duplication QA reported on the AGILUS lab ("ITPL, bengalrur 560037, Itpl,
 * Bengalrur"). Comparison is case- and punctuation-insensitive because that is
 * exactly how the duplicates differ.
 */
export function joinAddressParts(parts) {
  const seen = new Set();
  const kept = [];
  for (const raw of parts) {
    const part = raw === null || raw === undefined ? '' : String(raw).trim().replace(/[\s,]+$/, '');
    if (!part) continue;
    const key = part.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    // Also skip a part already contained in what we have (…, Bengaluru 560037
    // followed by Bengaluru).
    if (kept.some((existing) => existing.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(key))) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.join(', ');
}

/** Google-Places-shaped result, so the app parses it with no change. */
function toPlace(row, types) {
  const vicinity = joinAddressParts([row.address, row.city, row.state, row.pincode]);
  return {
    name: row.name || 'Unknown',
    vicinity,
    geometry: { location: { lat: Number(row.lat), lng: Number(row.lng) } },
    rating: row.rating === null || row.rating === undefined ? 0 : Number(row.rating),
    user_ratings_total: Number(row.total_reviews || 0),
    types,
    business_status: 'OPERATIONAL',
    formatted_phone_number: row.phone_number || '',
    distance_km: Math.round(Number(row.distance_km) * 10) / 10,
  };
}

const PROVIDERS = {
  hospital: { load: nearbyHospitals, types: ['hospital', 'health', 'point_of_interest'] },
  doctor: { load: nearbyHospitals, types: ['doctor', 'health', 'point_of_interest'] },
  lab: { load: nearbyLabs, types: ['health', 'point_of_interest'] },
  laboratory: { load: nearbyLabs, types: ['health', 'point_of_interest'] },
  diagnostic: { load: nearbyLabs, types: ['health', 'point_of_interest'] },
};

export function supportsType(type) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, String(type || '').toLowerCase());
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {string} type        'hospital' | 'lab' | …  (see PROVIDERS)
 * @param {number} radiusMeters
 * @param {number} limit
 * @returns {Promise<object[]|null>} null when this type has no local source.
 */
export async function nearbyFromDatabase(lat, lng, type, radiusMeters = 5000, limit = 20) {
  const provider = PROVIDERS[String(type || '').toLowerCase()];
  if (!provider) return null;
  // Widen a very tight radius: the caller's 5 km is a Google default, and a
  // "nearest hospital" list that comes back empty is worse than one that
  // reaches a little further. Distance is on every result either way.
  const radiusKm = Math.max(1, Number(radiusMeters) || 5000) / 1000;
  let rows = await provider.load(lat, lng, radiusKm, limit);
  if (!rows.length && radiusKm < 50) rows = await provider.load(lat, lng, 50, limit);
  return rows.map((row) => toPlace(row, provider.types));
}

export const __test__ = { distanceSql, toPlace, PROVIDERS };
export { toPlace };
