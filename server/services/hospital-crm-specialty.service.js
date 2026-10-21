import sharedPool from '../db/pgPool.js';

const SPECIALTY_CATALOG = [
  { code: 'obgyn', displayName: 'Obstetrics & Gynecology', segments: ['Pregnancy care', 'High-risk pregnancy', 'Women health', 'PCOS', 'Maternity packages'], funnel: ['Campaign', 'Lead', 'Counselling', 'Appointment', 'Consultation', 'Registration', 'Maternity journey'], kpis: ['Leads', 'Appointments', 'Antenatal registrations', 'Revenue', 'CAC', 'ROI'] },
  { code: 'ivf', displayName: 'IVF & Fertility', segments: ['IVF', 'IUI', 'Fertility consultation', 'Male infertility', 'Female infertility', 'Fertility preservation'], funnel: ['Lead', 'Contact', 'Fertility counselling', 'Doctor consultation', 'Evaluation', 'Treatment decision', 'Cycle start', 'Treatment completion'], kpis: ['Fertility leads', 'Counselling sessions', 'Treatment starts', 'Treatment revenue', 'CAC', 'ROI'] },
  { code: 'dentistry', displayName: 'Dentistry', segments: ['Dental implants', 'Smile design', 'Aligners', 'Root canal', 'Cosmetic dentistry'], funnel: ['Lead', 'Appointment', 'Consultation', 'Treatment plan', 'Treatment accepted', 'Procedure', 'Repeat visit'], kpis: ['Leads', 'Treatment plans', 'Treatment acceptance', 'Average treatment value', 'Revenue', 'ROI'] },
  { code: 'physiotherapy', displayName: 'Physiotherapy & Rehabilitation', segments: ['Orthopedic rehabilitation', 'Sports rehabilitation', 'Post-operative rehabilitation', 'Chronic pain'], funnel: ['Lead', 'Assessment', 'Treatment plan', 'First session', 'Program enrollment', 'Program completion', 'Repeat/referral'], kpis: ['Initial assessments', 'Therapy starts', 'Sessions', 'Program completion', 'Retention', 'ROI'] },
  { code: 'cardiology', displayName: 'Cardiology', segments: ['Heart health checkups', 'Preventive cardiology', 'Angiography', 'Angioplasty', 'Cardiac surgery'], funnel: ['Lead', 'Appointment', 'Cardiologist consultation', 'Diagnostic evaluation', 'Treatment recommendation', 'Procedure', 'Follow-up'], kpis: ['High-intent leads', 'Consultations', 'Diagnostics', 'Procedure opportunities', 'Revenue', 'ROI'] },
  { code: 'diabetology', displayName: 'Diabetology', segments: ['Diabetes consultation', 'Diabetes management', 'Preventive screening', 'Metabolic health'], funnel: ['Lead', 'Consultation', 'Assessment', 'Program enrollment', 'Follow-up', 'Retention'], kpis: ['Consultations', 'Program enrollment', 'Follow-up patients', 'Retention', 'LTV', 'ROI'] },
  { code: 'orthopedics', displayName: 'Orthopedics', segments: ['Knee replacement', 'Hip replacement', 'Sports injuries', 'Spine', 'Joint pain'], funnel: ['Lead', 'Appointment', 'Orthopedic consultation', 'Imaging', 'Treatment recommendation', 'Surgery/conservative care', 'Follow-up'], kpis: ['Consultations', 'Imaging', 'Surgery candidates', 'Surgeries', 'Revenue', 'ROI'] },
  { code: 'nephrology', displayName: 'Nephrology', segments: ['Kidney health', 'Chronic kidney disease', 'Dialysis', 'Kidney transplant'], funnel: ['Lead', 'Consultation', 'Evaluation', 'Treatment program', 'Ongoing care'], kpis: ['Consultations', 'Diagnostics', 'Program enrolments', 'Retention', 'Revenue', 'ROI'] },
  { code: 'oncology', displayName: 'Oncology', segments: ['Cancer screening', 'Second opinion', 'Chemotherapy', 'Radiation oncology', 'Supportive care'], funnel: ['Lead', 'Consultation', 'Evaluation', 'Treatment recommendation', 'Treatment start', 'Follow-up'], kpis: ['Consultations', 'Second opinions', 'Treatment starts', 'Referral leads', 'Revenue', 'ROI'] },
  { code: 'neurology', displayName: 'Neurology', segments: ['Stroke', 'Headache', 'Epilepsy', 'Parkinsons', 'Neuro rehabilitation'], funnel: ['Lead', 'Appointment', 'Consultation', 'Diagnostics', 'Treatment start', 'Follow-up'], kpis: ['Appointments', 'Consultations', 'Diagnostics', 'Treatment starts', 'Revenue', 'ROI'] },
  { code: 'gastroenterology', displayName: 'Gastroenterology', segments: ['GI consultation', 'Endoscopy', 'Colonoscopy', 'Liver care', 'IBD'], funnel: ['Lead', 'Appointment', 'Consultation', 'Diagnostic/procedure', 'Treatment', 'Follow-up'], kpis: ['Consultations', 'Procedure enquiries', 'Procedures', 'Revenue', 'CAC', 'ROI'] },
  { code: 'pulmonology', displayName: 'Pulmonology', segments: ['Respiratory consultation', 'Asthma', 'COPD', 'Sleep health', 'Lung screening'], funnel: ['Lead', 'Appointment', 'Consultation', 'Diagnostics', 'Treatment plan', 'Follow-up'], kpis: ['Leads', 'Consultations', 'Diagnostics', 'Treatment starts', 'Revenue', 'ROI'] },
  { code: 'pediatrics', displayName: 'Pediatrics', segments: ['Newborn care', 'Vaccination', 'Growth monitoring', 'Child development'], funnel: ['Lead', 'Appointment', 'Consultation', 'Vaccination visit', 'Follow-up', 'Repeat visit'], kpis: ['New patient leads', 'Consultations', 'Vaccination visits', 'Repeat visits', 'Retention', 'ROI'] },
  { code: 'ent', displayName: 'ENT', segments: ['Sinus', 'Hearing', 'Tonsils', 'Ear care', 'Voice disorders'], funnel: ['Lead', 'Appointment', 'Consultation', 'Diagnostic procedure', 'Surgery', 'Follow-up'], kpis: ['Consultations', 'Diagnostics', 'Surgeries', 'Revenue', 'CAC', 'ROI'] },
  { code: 'dermatology', displayName: 'Dermatology', segments: ['Medical dermatology', 'Acne', 'Hair loss', 'Skin screening', 'Cosmetic dermatology'], funnel: ['Lead', 'Appointment', 'Consultation', 'Treatment plan', 'Treatment accepted', 'Procedure', 'Repeat visit'], kpis: ['Treatment plans', 'Treatment acceptance', 'Procedures', 'Repeat visits', 'Revenue', 'ROI'] },
  { code: 'ophthalmology', displayName: 'Ophthalmology', segments: ['Cataract', 'LASIK', 'Retina', 'Glaucoma', 'Eye checkup'], funnel: ['Lead', 'Eye consultation', 'Diagnostic', 'Recommendation', 'Surgery', 'Follow-up'], kpis: ['Eye consultations', 'Diagnostics', 'Surgery candidates', 'Surgeries', 'Revenue', 'ROI'] },
  { code: 'general-surgery', displayName: 'General Surgery', segments: ['Surgical consultation', 'Laparoscopy', 'Hernia', 'Gallbladder', 'Day care surgery'], funnel: ['Lead', 'Appointment', 'Consultation', 'Pre-op evaluation', 'Procedure', 'Discharge', 'Follow-up'], kpis: ['Consultations', 'Procedure opportunities', 'Procedures', 'Revenue', 'CAC', 'ROI'] },
  { code: 'bariatric-surgery', displayName: 'Bariatric Surgery', segments: ['Weight management', 'Bariatric consultation', 'Metabolic surgery', 'Nutrition'], funnel: ['Lead', 'Assessment', 'Consultation', 'Treatment plan', 'Surgery', 'Follow-up'], kpis: ['Leads', 'Assessments', 'Surgery candidates', 'Surgeries', 'Revenue', 'ROI'] },
  { code: 'urology', displayName: 'Urology', segments: ['Kidney stones', 'Prostate', 'Urological surgery', 'Mens health'], funnel: ['Lead', 'Consultation', 'Diagnostics', 'Procedure lead', 'Surgery', 'Follow-up'], kpis: ['Consultations', 'Diagnostics', 'Procedure leads', 'Surgeries', 'Revenue', 'ROI'] },
  { code: 'internal-medicine', displayName: 'Internal Medicine', segments: ['General consultation', 'Chronic care', 'Preventive health', 'Second opinion'], funnel: ['Lead', 'Appointment', 'Consultation', 'Assessment', 'Care plan', 'Follow-up'], kpis: ['Leads', 'Consultations', 'Care plans', 'Retention', 'LTV', 'ROI'] },
  { code: 'preventive-health', displayName: 'Preventive Health & Health Checkups', segments: ['Executive health', 'Corporate health', 'Womens health', 'Senior health', 'Cancer screening'], funnel: ['Campaign', 'Enquiry', 'Booking', 'Checkup', 'Result/follow-up', 'Specialist consultation', 'Treatment opportunity'], kpis: ['Bookings', 'Completed checkups', 'Package sales', 'Average package value', 'Revenue', 'ROI'] },
];

function tenantId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('A valid tenantId is required'), { statusCode: 400 });
  return id;
}

function intOrNull(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function json(value, fallback = {}) {
  if (value == null) return fallback;
  return typeof value === 'object' ? value : JSON.parse(value);
}

async function ensureSpecialties(tenant) {
  for (const specialty of SPECIALTY_CATALOG) {
    await sharedPool.query(
      `INSERT INTO crm_specialty_profiles (tenant_id, code, display_name, category, funnel_stages, segments, kpis, config)
       VALUES ($1, $2, $3, 'hospital', $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)
       ON CONFLICT (tenant_id, code) DO UPDATE SET display_name = EXCLUDED.display_name, funnel_stages = EXCLUDED.funnel_stages, segments = EXCLUDED.segments, kpis = EXCLUDED.kpis, updated_at = NOW()`,
      [tenant, specialty.code, specialty.displayName, JSON.stringify(specialty.funnel), JSON.stringify(specialty.segments), JSON.stringify(specialty.kpis), JSON.stringify({ source: 'medgrowth_catalog' })]
    );
  }
}

export async function listSpecialties(tenant) {
  const id = tenantId(tenant);
  await ensureSpecialties(id);
  const result = await sharedPool.query(`SELECT * FROM crm_specialty_profiles WHERE tenant_id = $1 AND is_active = TRUE ORDER BY display_name`, [id]);
  return result.rows.map((row) => ({ ...row, funnel_stages: json(row.funnel_stages, []), segments: json(row.segments, []), kpis: json(row.kpis, []) }));
}

async function getSpecialty(tenant, code) {
  const rows = await listSpecialties(tenant);
  const specialty = rows.find((row) => row.code === code) || rows.find((row) => row.display_name.toLowerCase() === String(code).toLowerCase());
  if (!specialty) throw Object.assign(new Error('Specialty not found'), { statusCode: 404 });
  return specialty;
}

export async function getSpecialtyDashboard(tenant, code, { from, to } = {}) {
  const id = tenantId(tenant);
  const specialty = await getSpecialty(id, code);
  const start = from || '1970-01-01';
  const end = to || '2999-12-31';
  const service = specialty.display_name;
  const [summary, funnel, campaigns, doctors, referrals] = await Promise.all([
    sharedPool.query(`SELECT COUNT(*)::int AS leads, COUNT(*) FILTER (WHERE lifecycle_stage = 'qualified')::int AS qualified, COUNT(*) FILTER (WHERE lifecycle_stage LIKE 'appointment%')::int AS appointments, COUNT(*) FILTER (WHERE lifecycle_stage IN ('visited', 'consulted'))::int AS visits, COUNT(*) FILTER (WHERE lifecycle_stage IN ('procedure_advised', 'admission_advised', 'won'))::int AS treatment_opportunities, COALESCE(SUM(actual_revenue), 0)::numeric AS revenue, AVG(score)::numeric(10,2) AS average_score FROM crm_leads_v2 WHERE tenant_id = $1 AND (service_line ILIKE $2 OR metadata->>'specialty_code' = $3) AND created_at >= $4::timestamptz AND created_at < $5::timestamptz`, [id, service, specialty.code, start, end]),
    sharedPool.query(`SELECT lifecycle_stage AS stage, COUNT(*)::int AS count FROM crm_leads_v2 WHERE tenant_id = $1 AND (service_line ILIKE $2 OR metadata->>'specialty_code' = $3) AND created_at >= $4::timestamptz AND created_at < $5::timestamptz GROUP BY lifecycle_stage ORDER BY count DESC`, [id, service, specialty.code, start, end]),
    sharedPool.query(`SELECT c.id, c.name, COALESCE((SELECT SUM(amount) FROM crm_campaign_costs cc WHERE cc.tenant_id = c.tenant_id AND cc.campaign_id = c.id AND cc.cost_date >= $4::date AND cc.cost_date < $5::date), 0)::numeric AS spend, (SELECT COUNT(*) FROM crm_leads_v2 l WHERE l.tenant_id = c.tenant_id AND l.campaign_id = c.id AND (l.service_line ILIKE $2 OR l.metadata->>'specialty_code' = $3) AND l.created_at >= $4::timestamptz AND l.created_at < $5::timestamptz)::int AS leads, COALESCE((SELECT SUM(r.net_amount) FROM crm_revenue_events r JOIN crm_leads_v2 l ON l.id = r.lead_id AND l.tenant_id = r.tenant_id WHERE r.tenant_id = c.tenant_id AND l.campaign_id = c.id AND (l.service_line ILIKE $2 OR l.metadata->>'specialty_code' = $3) AND r.revenue_date >= $4::date AND r.revenue_date < $5::date), 0)::numeric AS revenue FROM crm_campaigns_unified c WHERE c.tenant_id = $1 AND c.deleted_at IS NULL ORDER BY revenue DESC, leads DESC LIMIT 25`, [id, service, specialty.code, start, end]),
    sharedPool.query(`SELECT doctor_id, COUNT(*)::int AS leads, COUNT(*) FILTER (WHERE lifecycle_stage IN ('appointment_booked', 'visited', 'consulted', 'won'))::int AS conversions, COALESCE(SUM(actual_revenue), 0)::numeric AS revenue FROM crm_leads_v2 WHERE tenant_id = $1 AND doctor_id IS NOT NULL AND (service_line ILIKE $2 OR metadata->>'specialty_code' = $3) AND created_at >= $4::timestamptz AND created_at < $5::timestamptz GROUP BY doctor_id ORDER BY revenue DESC, conversions DESC LIMIT 25`, [id, service, specialty.code, start, end]),
    sharedPool.query(`SELECT referral_type, provider_name, COUNT(*)::int AS referrals, COUNT(*) FILTER (WHERE status = 'converted')::int AS converted, COALESCE(SUM(revenue_amount), 0)::numeric AS revenue FROM crm_provider_referrals WHERE tenant_id = $1 AND metadata->>'specialty_code' = $2 GROUP BY referral_type, provider_name ORDER BY revenue DESC LIMIT 25`, [id, specialty.code]),
  ]);
  return { specialty, summary: summary.rows[0] || {}, funnel: funnel.rows, campaigns: campaigns.rows.map((row) => ({ ...row, roas: Number(row.spend) ? Number(row.revenue) / Number(row.spend) : null })), doctors: doctors.rows, referrals: referrals.rows };
}

export async function compareSpecialties(tenant, codes = []) {
  const list = await listSpecialties(tenant);
  const selected = codes.length ? list.filter((row) => codes.includes(row.code)) : list.slice(0, 5);
  return Promise.all(selected.map((row) => getSpecialtyDashboard(tenant, row.code)));
}

export async function listDiagnosticCentres(tenant) {
  const id = tenantId(tenant);
  return (await sharedPool.query(`SELECT * FROM crm_diagnostic_centres WHERE tenant_id = $1 ORDER BY city, centre_name`, [id])).rows;
}

export async function createDiagnosticCentre(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const result = await sharedPool.query(`INSERT INTO crm_diagnostic_centres (tenant_id, code, centre_name, city, region, pincode, address, capacity_per_day, home_collection_zones, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb) RETURNING *`, [id, input.code, input.centreName, input.city || null, input.region || null, input.pincode || null, input.address || null, Number(input.capacityPerDay) || null, JSON.stringify(input.homeCollectionZones || []), JSON.stringify(input.metadata || {})]);
  return result.rows[0];
}

export async function listDiagnosticProducts(tenant) {
  const id = tenantId(tenant);
  return (await sharedPool.query(`SELECT * FROM crm_diagnostic_products WHERE tenant_id = $1 ORDER BY product_type, product_name`, [id])).rows;
}

export async function createDiagnosticProduct(input) {
  const id = tenantId(input.tenantId);
  const result = await sharedPool.query(`INSERT INTO crm_diagnostic_products (tenant_id, product_type, code, product_name, category, original_price, selling_price, expected_margin_percent, home_collection_available, included_product_ids, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb) RETURNING *`, [id, input.productType || 'test', input.code, input.productName, input.category || null, input.originalPrice == null ? null : Number(input.originalPrice), input.sellingPrice == null ? null : Number(input.sellingPrice), input.expectedMarginPercent == null ? null : Number(input.expectedMarginPercent), Boolean(input.homeCollectionAvailable), JSON.stringify(input.includedProductIds || []), JSON.stringify(input.metadata || {})]);
  return result.rows[0];
}

export async function getDiagnosticDashboard(tenant, { from, to } = {}) {
  const id = tenantId(tenant);
  const start = from || '1970-01-01';
  const end = to || '2999-12-31';
  const [summary, centres, products, channels, referrals] = await Promise.all([
    sharedPool.query(`SELECT COUNT(*)::int AS bookings, COUNT(*) FILTER (WHERE booking_status IN ('sample_collected', 'completed'))::int AS collections, COUNT(*) FILTER (WHERE booking_status = 'completed')::int AS completed_tests, COUNT(*) FILTER (WHERE collection_mode = 'home_collection')::int AS home_collection_bookings, COALESCE(SUM(revenue_amount), 0)::numeric AS revenue, COALESCE(AVG(NULLIF(booking_value, 0)), 0)::numeric AS average_order_value FROM crm_diagnostic_bookings WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`, [id, start, end]),
    sharedPool.query(`SELECT c.id, c.centre_name, c.city, COUNT(b.id)::int AS bookings, COUNT(b.id) FILTER (WHERE b.booking_status = 'completed')::int AS completed_tests, COALESCE(SUM(b.revenue_amount), 0)::numeric AS revenue FROM crm_diagnostic_centres c LEFT JOIN crm_diagnostic_bookings b ON b.centre_id = c.id AND b.tenant_id = c.tenant_id AND b.created_at >= $2::timestamptz AND b.created_at < $3::timestamptz WHERE c.tenant_id = $1 GROUP BY c.id ORDER BY revenue DESC, bookings DESC`, [id, start, end]),
    sharedPool.query(`SELECT p.id, p.product_name, p.product_type, COUNT(b.id)::int AS bookings, COUNT(b.id) FILTER (WHERE b.booking_status = 'completed')::int AS completed_tests, COALESCE(SUM(b.revenue_amount), 0)::numeric AS revenue FROM crm_diagnostic_products p LEFT JOIN crm_diagnostic_bookings b ON b.product_id = p.id AND b.tenant_id = p.tenant_id AND b.created_at >= $2::timestamptz AND b.created_at < $3::timestamptz WHERE p.tenant_id = $1 GROUP BY p.id ORDER BY revenue DESC, bookings DESC LIMIT 30`, [id, start, end]),
    sharedPool.query(`SELECT provider, COALESCE(SUM((metrics->>'leads')::numeric), 0)::numeric AS leads, COALESCE(SUM((metrics->>'bookings')::numeric), 0)::numeric AS bookings, COALESCE(SUM((metrics->>'revenue')::numeric), 0)::numeric AS revenue, COALESCE(SUM((metrics->>'spend')::numeric), 0)::numeric AS spend FROM crm_channel_metrics WHERE tenant_id = $1 AND metric_date >= $2::date AND metric_date < $3::date GROUP BY provider ORDER BY revenue DESC`, [id, start, end]),
    sharedPool.query(`SELECT referral_type, provider_name, COUNT(*)::int AS referrals, COUNT(*) FILTER (WHERE status = 'converted')::int AS converted, COALESCE(SUM(revenue_amount), 0)::numeric AS revenue FROM crm_provider_referrals WHERE tenant_id = $1 GROUP BY referral_type, provider_name ORDER BY revenue DESC LIMIT 25`, [id]),
  ]);
  return { summary: summary.rows[0] || {}, centres: centres.rows, products: products.rows, channels: channels.rows.map((row) => ({ ...row, roas: Number(row.spend) ? Number(row.revenue) / Number(row.spend) : null })), referrals: referrals.rows };
}

export async function createDiagnosticBooking(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const booking = await sharedPool.query(`INSERT INTO crm_diagnostic_bookings (tenant_id, lead_id, identity_id, centre_id, product_id, campaign_id, source_id, booking_status, collection_mode, scheduled_at, booking_value, revenue_amount, source_system, source_ref, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb) ON CONFLICT (tenant_id, source_system, source_ref) WHERE source_ref IS NOT NULL DO UPDATE SET booking_status = EXCLUDED.booking_status, updated_at = NOW() RETURNING *`, [id, intOrNull(input.leadId), intOrNull(input.identityId), intOrNull(input.centreId), intOrNull(input.productId), intOrNull(input.campaignId), intOrNull(input.sourceId), input.bookingStatus || 'new', input.collectionMode || 'centre', input.scheduledAt || null, Number(input.bookingValue) || 0, Number(input.revenueAmount) || 0, input.sourceSystem || 'crm', input.sourceRef || null, JSON.stringify(input.metadata || {})]);
  const row = booking.rows[0];
  await sharedPool.query(`INSERT INTO crm_diagnostic_booking_events (tenant_id, booking_id, event_type, metadata) VALUES ($1, $2, 'booking_created', $3::jsonb)`, [id, row.id, JSON.stringify({ actorUserId: actorUserId || null })]);
  return row;
}

export async function listIntegrations(tenant) {
  const id = tenantId(tenant);
  return (await sharedPool.query(`SELECT id, provider, integration_type, status, account_ref, last_sync_at, last_sync_status, config FROM crm_marketing_integrations WHERE tenant_id = $1 ORDER BY provider, integration_type`, [id])).rows;
}

export async function createIntegration(input, actorUserId) {
  if (input.integrationType === 'communication') throw Object.assign(new Error('Use the authorized channel settings endpoint.'), {statusCode: 400});
  const id = tenantId(input.tenantId);
  const result = await sharedPool.query(`INSERT INTO crm_marketing_integrations (tenant_id, provider, integration_type, status, account_ref, credentials_ref, config, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) ON CONFLICT (tenant_id, provider, integration_type) DO UPDATE SET status = EXCLUDED.status, account_ref = EXCLUDED.account_ref, credentials_ref = EXCLUDED.credentials_ref, config = EXCLUDED.config, updated_at = NOW() RETURNING *`, [id, input.provider, input.integrationType || 'ads', input.status || 'not_configured', input.accountRef || null, input.credentialsRef || null, JSON.stringify(input.config || {}), actorUserId || null]);
  return result.rows[0];
}

export async function getDigitalOverview(tenant, { from, to } = {}) {
  const id = tenantId(tenant);
  const start = from || '1970-01-01';
  const end = to || '2999-12-31';
  const [integrations, metrics, content] = await Promise.all([
    listIntegrations(id),
    sharedPool.query(`SELECT provider, COUNT(*)::int AS metric_days, COALESCE(SUM((metrics->>'impressions')::numeric), 0)::numeric AS impressions, COALESCE(SUM((metrics->>'clicks')::numeric), 0)::numeric AS clicks, COALESCE(SUM((metrics->>'leads')::numeric), 0)::numeric AS leads, COALESCE(SUM((metrics->>'bookings')::numeric), 0)::numeric AS bookings, COALESCE(SUM((metrics->>'revenue')::numeric), 0)::numeric AS revenue, COALESCE(SUM((metrics->>'spend')::numeric), 0)::numeric AS spend FROM crm_channel_metrics WHERE tenant_id = $1 AND metric_date >= $2::date AND metric_date < $3::date GROUP BY provider ORDER BY revenue DESC`, [id, start, end]),
    sharedPool.query(`SELECT workflow_status, COUNT(*)::int AS count FROM crm_content_calendar WHERE tenant_id = $1 GROUP BY workflow_status ORDER BY workflow_status`, [id]),
  ]);
  return { integrations, channels: metrics.rows.map((row) => ({ ...row, ctr: Number(row.impressions) ? Number(row.clicks) / Number(row.impressions) : null, roas: Number(row.spend) ? Number(row.revenue) / Number(row.spend) : null })), contentWorkflow: content.rows };
}

export async function listContent(tenant, specialtyCode) {
  const id = tenantId(tenant);
  return (await sharedPool.query(`SELECT * FROM crm_content_calendar WHERE tenant_id = $1 AND ($2::text IS NULL OR specialty_code = $2) ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 200`, [id, specialtyCode || null])).rows;
}

export async function createContent(input, actorUserId) {
  const id = tenantId(input.tenantId);
  const result = await sharedPool.query(`INSERT INTO crm_content_calendar (tenant_id, specialty_code, campaign_id, channel, content_type, title, workflow_status, scheduled_at, owner_user_id, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) RETURNING *`, [id, input.specialtyCode || null, intOrNull(input.campaignId), input.channel, input.contentType || 'educational', input.title, input.workflowStatus || 'idea', input.scheduledAt || null, intOrNull(input.ownerUserId) || actorUserId || null, JSON.stringify(input.metadata || {})]);
  return result.rows[0];
}

export async function listReferrals(tenant) {
  const id = tenantId(tenant);
  return (await sharedPool.query(`SELECT * FROM crm_provider_referrals WHERE tenant_id = $1 ORDER BY referred_at DESC LIMIT 200`, [id])).rows;
}

export async function createReferral(input) {
  const id = tenantId(input.tenantId);
  const result = await sharedPool.query(`INSERT INTO crm_provider_referrals (tenant_id, referral_type, provider_name, provider_ref, lead_id, booking_id, status, revenue_amount, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING *`, [id, input.referralType || 'doctor', input.providerName, input.providerRef || null, intOrNull(input.leadId), intOrNull(input.bookingId), input.status || 'open', Number(input.revenueAmount) || 0, JSON.stringify(input.metadata || {})]);
  return result.rows[0];
}

export { SPECIALTY_CATALOG };
