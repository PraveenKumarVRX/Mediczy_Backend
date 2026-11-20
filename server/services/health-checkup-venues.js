// Keep numeric lab IDs compatible; prefix hospital IDs to avoid overlapping keys.
export const HEALTH_CHECKUP_VENUES_SQL = `(SELECT l.id::text AS id,l.id AS partner_id,'lab'::text AS partner_type,l.name,to_jsonb(l.address) AS address,l."phoneNumber",to_jsonb(l.accreditation) AS accreditation,l.rating,l.metadata,l.status::text AS status FROM labs l
 UNION ALL
 SELECT 'hospital:'||h.id::text,h.id,'hospital',h.hospital_name,to_jsonb(h.address),to_jsonb(h)->>'phoneNumber',NULL::jsonb,NULL::numeric,COALESCE(to_jsonb(h)->'metadata','{}'::jsonb),h.status::text FROM hospitals h)`;
export const validVenueId = value => /^(hospital:)?\d+$/.test(String(value || ''));

// What a member's lab search matches besides the name: the app tells them to try "an area, city or PIN
// code". Lab addresses are objects (city, zipCode or pincode, street, formatted_address, locality, area,
// state); hospital addresses are plain strings. Coordinates are left out so a PIN never matches digits
// inside a latitude.
export const VENUE_SEARCH_TEXT = `COALESCE(CASE WHEN jsonb_typeof(l.address)='object' THEN concat_ws(' ',
  l.address->>'city', l.address->>'zipCode', l.address->>'pincode', l.address->>'postalCode', l.address->>'street',
  l.address->>'formatted_address', l.address->>'formatted', l.address->>'locality', l.address->>'area', l.address->>'state')
  WHEN jsonb_typeof(l.address)='string' THEN l.address #>> '{}' END, '')`;

// A venue's 6-digit PIN code (labs: zipCode/pincode/postalCode, else the first PIN-shaped number in the
// address text; hospitals: from the address string). Used so a PIN search means "near this PIN": same
// 3-digit postal area (411 = Pune), nearest PIN first. NULL when the address has none.
export const VENUE_PIN = `substring(COALESCE(CASE WHEN jsonb_typeof(l.address)='object' THEN
  COALESCE(NULLIF(l.address->>'zipCode',''), NULLIF(l.address->>'pincode',''), NULLIF(l.address->>'postalCode',''),
  l.address->>'formatted_address', l.address->>'formatted') END, ${VENUE_SEARCH_TEXT}) from '[1-9][0-9]{5}')`;

// A venue can only be offered for a check-up when it has time slots to book. Mirrors slots() in
// health-checkup.route.js (first of these keys present). None of the hospitals has slots set up
// (2026-11-20: 0 of 10,776), so without this every hospital dead-ended at "No slots on this date".
export const VENUE_HAS_SLOTS = `(jsonb_typeof(COALESCE(l.metadata->'healthCheckupSlots', l.metadata->'health_checkup_slots',
  l.metadata->'pickupSlots', l.metadata->'pickup_slots')) = 'array' AND jsonb_array_length(COALESCE(l.metadata->'healthCheckupSlots',
  l.metadata->'health_checkup_slots', l.metadata->'pickupSlots', l.metadata->'pickup_slots')) > 0)`;
