// Keep numeric lab IDs compatible; prefix hospital IDs to avoid overlapping keys.
export const HEALTH_CHECKUP_VENUES_SQL = `(SELECT l.id::text AS id,l.id AS partner_id,'lab'::text AS partner_type,l.name,to_jsonb(l.address) AS address,l."phoneNumber",to_jsonb(l.accreditation) AS accreditation,l.rating,l.metadata,l.status::text AS status FROM labs l
 UNION ALL
 SELECT 'hospital:'||h.id::text,h.id,'hospital',h.hospital_name,to_jsonb(h.address),to_jsonb(h)->>'phoneNumber',NULL::jsonb,NULL::numeric,COALESCE(to_jsonb(h)->'metadata','{}'::jsonb),h.status::text FROM hospitals h)`;
export const validVenueId = value => /^(hospital:)?\d+$/.test(String(value || ''));
