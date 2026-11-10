import express from 'express';
import jwt from 'jsonwebtoken';
import { loginBloodBank } from '../../controllers/dept/bloodBank.controller.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { connectPostgres } from '../../db/postgres.js';
import { safeRouter } from '../../utils/safeRouter.js';
import { bloodBankScope } from '../../services/dept-tenant-scope.service.js';
import { orgFromToken, orgRequiredResponse } from '../../services/tenant-scope.service.js';
import llmProvider from '../../services/ai-brain/llm-provider.js';

const router = safeRouter(express.Router());
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ─── Auth middleware ───────────────────────────────────────────────────────────

const authBloodBank = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Blood bank token required' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_CONFIG.SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired blood bank token' });
  }
  // Tenant isolation (WP-0.5): every request is bound to the hospital in the token; a token without one is refused.
  const org = orgFromToken(decoded);
  if (!org) return res.status(403).json(orgRequiredResponse);
  req.bloodBankUser = decoded;
  req.bloodBankOrgId = org;
  next();
};

// ─── AI helper ────────────────────────────────────────────────────────────────

const aiComplete = async (messages, { maxTokens = 800, temperature = 0.5 } = {}) => {
  const result = await llmProvider.chat({ messages, maxTokens, temperature });
  return result?.content || result?.text || result?.message || String(result || '');
};

// ─── Schema bootstrap ─────────────────────────────────────────────────────────

const ensureTablesRaw = async () => {
  const db = await connectPostgres();

  // Core blood unit inventory
  await db.query(`
    CREATE TABLE IF NOT EXISTS blood_bank_units (
      id SERIAL PRIMARY KEY,
      unit_number VARCHAR(80) UNIQUE NOT NULL,
      blood_group VARCHAR(4) NOT NULL,
      component VARCHAR(40) NOT NULL DEFAULT 'whole_blood',
      donor_name VARCHAR(160),
      collected_at DATE NOT NULL,
      expires_at DATE NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'available',
      location VARCHAR(120),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS blood_bank_requisitions (
      id SERIAL PRIMARY KEY,
      requisition_number VARCHAR(80) UNIQUE NOT NULL,
      patient_id VARCHAR(80),
      patient_name VARCHAR(160) NOT NULL,
      ward VARCHAR(120),
      blood_group VARCHAR(4) NOT NULL,
      component VARCHAR(40) NOT NULL DEFAULT 'whole_blood',
      units_requested INTEGER NOT NULL DEFAULT 1,
      urgency VARCHAR(24) NOT NULL DEFAULT 'routine',
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(160),
      notes TEXT,
      issued_unit_ids INTEGER[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- Rich donor registry
    CREATE TABLE IF NOT EXISTS blood_bank_donors (
      id SERIAL PRIMARY KEY,
      donor_id VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      blood_group VARCHAR(4) NOT NULL,
      phone VARCHAR(24),
      whatsapp VARCHAR(24),
      email VARCHAR(160),
      age INTEGER,
      gender VARCHAR(10),
      address TEXT,
      city VARCHAR(100),
      pincode VARCHAR(12),
      donor_type VARCHAR(20) NOT NULL DEFAULT 'voluntary',
      total_donations INTEGER NOT NULL DEFAULT 0,
      last_donation_date DATE,
      next_eligible_date DATE,
      eligible BOOLEAN NOT NULL DEFAULT TRUE,
      health_notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notification_consent BOOLEAN NOT NULL DEFAULT TRUE,
      preferred_channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_bb_donors_group ON blood_bank_donors(blood_group);
    CREATE INDEX IF NOT EXISTS idx_bb_donors_eligible ON blood_bank_donors(eligible, is_active);

    -- Donation history per donor
    CREATE TABLE IF NOT EXISTS blood_donor_donations (
      id SERIAL PRIMARY KEY,
      donor_id INTEGER NOT NULL REFERENCES blood_bank_donors(id) ON DELETE CASCADE,
      donation_date DATE NOT NULL DEFAULT CURRENT_DATE,
      blood_group VARCHAR(4) NOT NULL,
      component VARCHAR(40) NOT NULL DEFAULT 'whole_blood',
      units_collected NUMERIC(4,2) DEFAULT 1,
      bag_number VARCHAR(80),
      hb_level NUMERIC(5,2),
      blood_pressure VARCHAR(20),
      pulse INTEGER,
      weight NUMERIC(5,1),
      temperature NUMERIC(4,1),
      screening_passed BOOLEAN DEFAULT TRUE,
      adverse_reactions TEXT,
      camp_location VARCHAR(200),
      recorded_by VARCHAR(160),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_bb_donations_donor ON blood_donor_donations(donor_id);

    -- AI-driven outreach campaigns
    CREATE TABLE IF NOT EXISTS blood_donor_communications (
      id SERIAL PRIMARY KEY,
      blood_group_needed VARCHAR(4),
      component VARCHAR(40),
      units_needed INTEGER DEFAULT 1,
      urgency VARCHAR(20) NOT NULL DEFAULT 'routine',
      message_subject VARCHAR(255),
      message_body TEXT NOT NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      total_donors INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      responded_count INTEGER DEFAULT 0,
      created_by VARCHAR(160),
      sent_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- Per-donor delivery receipts
    CREATE TABLE IF NOT EXISTS blood_donor_comm_recipients (
      id SERIAL PRIMARY KEY,
      comm_id INTEGER NOT NULL REFERENCES blood_donor_communications(id) ON DELETE CASCADE,
      donor_id INTEGER NOT NULL REFERENCES blood_bank_donors(id) ON DELETE CASCADE,
      phone VARCHAR(24),
      status VARCHAR(20) DEFAULT 'pending',
      response TEXT,
      responded_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_bb_comm_recipients_comm ON blood_donor_comm_recipients(comm_id);

    CREATE TABLE IF NOT EXISTS blood_bank_audit_events (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(80),
      actor VARCHAR(160),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_bb_audit_created ON blood_bank_audit_events(created_at DESC);
  `);

  return db;
};

// One database handle per request, bound to the caller's hospital and returned to the pool when the response ends.
const ensureTables = async (req, res) => {
  const raw = await ensureTablesRaw();
  await bloodBankScope.ensure(raw); // adds organization_id + forced row-level security; fails closed
  const db = bloodBankScope.scopedDb(raw, req.bloodBankOrgId);
  res.once('close', () => { db.release(); });
  return db;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateDonorId = () => `DNR-${Date.now().toString(36).toUpperCase()}`;
const actorName = (req) => req.bloodBankUser?.name || req.bloodBankUser?.email || 'Blood Bank Staff';
const recordAudit = async (db, req, eventType, entityType, entityId, payload = {}) => {
  await db.query(
    `INSERT INTO blood_bank_audit_events (event_type, entity_type, entity_id, actor, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [eventType, entityType, entityId ? String(entityId) : null, actorName(req), JSON.stringify(payload)]
  );
};

// Compute next eligibility date: whole blood → 56 days, platelets → 7 days, plasma → 28 days
const nextEligible = (lastDate, component = 'whole_blood') => {
  const days = component === 'platelets' ? 7 : component === 'plasma' ? 28 : 56;
  const d = new Date(lastDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ─── Login ────────────────────────────────────────────────────────────────────

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginBloodBank);

// ─── Blood unit summary ───────────────────────────────────────────────────────

router.get('/summary', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { rows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'available')::int AS available_units,
        COUNT(*) FILTER (WHERE status = 'available' AND expires_at <= CURRENT_DATE + INTERVAL '7 days')::int AS expiring_soon,
        COUNT(*) FILTER (WHERE status = 'issued' AND updated_at::date = CURRENT_DATE)::int AS issued_today,
        (SELECT COUNT(*)::int FROM blood_bank_requisitions WHERE status = 'pending') AS pending_requests
      FROM blood_bank_units
    `);
    const groups = await db.query(`
      SELECT blood_group, COUNT(*)::int AS units
      FROM blood_bank_units
      WHERE status = 'available'
      GROUP BY blood_group ORDER BY blood_group
    `);
    res.json({ success: true, data: { ...rows[0], byGroup: groups.rows } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load blood bank summary' });
  }
});

// ─── Inventory ────────────────────────────────────────────────────────────────

router.get('/inventory', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { bloodGroup, status } = req.query;
    const params = []; const filters = [];
    if (bloodGroup) { params.push(bloodGroup); filters.push(`blood_group = $${params.length}`); }
    if (status)     { params.push(status);      filters.push(`status = $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await db.query(`SELECT * FROM blood_bank_units ${where} ORDER BY expires_at ASC, created_at DESC`, params);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load inventory' });
  }
});

router.post('/inventory', authBloodBank, async (req, res) => {
  try {
    const { unitNumber, bloodGroup, component = 'whole_blood', donorName, collectedAt, expiresAt, location } = req.body;
    if (!unitNumber || !BLOOD_GROUPS.includes(bloodGroup) || !collectedAt || !expiresAt)
      return res.status(400).json({ success: false, message: 'unitNumber, valid bloodGroup, collectedAt and expiresAt are required' });
    const db = await ensureTables(req, res);
    const { rows } = await db.query(`
      INSERT INTO blood_bank_units (unit_number, blood_group, component, donor_name, collected_at, expires_at, location)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [unitNumber, bloodGroup, component, donorName || null, collectedAt, expiresAt, location || null]);
    await recordAudit(db, req, 'unit_created', 'unit', rows[0].id, rows[0]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.code === '23505' ? 'Unit number already exists' : 'Failed to add unit' });
  }
});

// ─── Donors — list & register ─────────────────────────────────────────────────

router.get('/donors', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { bloodGroup, eligible, search, city, donorType, limit = 200, offset = 0 } = req.query;
    const params = []; const filters = ['is_active = TRUE'];
    if (bloodGroup) { params.push(bloodGroup); filters.push(`blood_group = $${params.length}`); }
    if (eligible !== undefined) { params.push(eligible === 'true'); filters.push(`eligible = $${params.length}`); }
    if (city)       { params.push(`%${city}%`);       filters.push(`city ILIKE $${params.length}`); }
    if (donorType)  { params.push(donorType);          filters.push(`donor_type = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length} OR donor_id ILIKE $${params.length})`);
    }
    const where = `WHERE ${filters.join(' AND ')}`;
    params.push(Number(limit), Number(offset));
    const { rows } = await db.query(
      `SELECT *, (next_eligible_date IS NULL OR next_eligible_date <= CURRENT_DATE) AS eligible_now
       FROM blood_bank_donors ${where}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM blood_bank_donors ${where}`,
      params.slice(0, -2)
    );
    res.json({ success: true, data: rows, total: countRows[0].total });
  } catch (err) {
    console.error('[BloodBank donors GET]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load donors' });
  }
});

router.post('/donors', authBloodBank, async (req, res) => {
  try {
    const {
      donorId, name, bloodGroup, phone, whatsapp, email, age, gender,
      address, city, pincode, donorType = 'voluntary', lastDonationDate,
      eligible = true, healthNotes, notificationConsent = true, preferredChannel = 'whatsapp',
    } = req.body;
    if (!name || !BLOOD_GROUPS.includes(bloodGroup))
      return res.status(400).json({ success: false, message: 'name and valid bloodGroup are required' });
    const db = await ensureTables(req, res);
    const id = donorId || generateDonorId();
    const nextDate = lastDonationDate ? nextEligible(lastDonationDate) : null;
    const { rows } = await db.query(`
      INSERT INTO blood_bank_donors
        (donor_id, name, blood_group, phone, whatsapp, email, age, gender, address, city, pincode,
         donor_type, last_donation_date, next_eligible_date, eligible, health_notes,
         notification_consent, preferred_channel)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (organization_id, donor_id) DO UPDATE SET
        name=$2, blood_group=$3, phone=$4, whatsapp=$5, email=$6, age=$7, gender=$8,
        address=$9, city=$10, pincode=$11, donor_type=$12, last_donation_date=$13,
        next_eligible_date=$14, eligible=$15, health_notes=$16,
        notification_consent=$17, preferred_channel=$18, updated_at=NOW()
      RETURNING *
    `, [id, name, bloodGroup, phone||null, whatsapp||null, email||null, age||null, gender||null,
        address||null, city||null, pincode||null, donorType, lastDonationDate||null,
        nextDate, eligible, healthNotes||null, notificationConsent, preferredChannel]);
    await recordAudit(db, req, 'donor_saved', 'donor', rows[0].id, { donorId: rows[0].donor_id, bloodGroup: rows[0].blood_group });
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[BloodBank donors POST]', err.message);
    res.status(500).json({ success: false, message: err.code === '23505' ? 'Donor ID already exists' : 'Failed to register donor' });
  }
});

router.get('/donors/:id', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { rows } = await db.query(`SELECT * FROM blood_bank_donors WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Donor not found' });
    const donations = await db.query(`SELECT * FROM blood_donor_donations WHERE donor_id = $1 ORDER BY donation_date DESC`, [req.params.id]);
    res.json({ success: true, data: { ...rows[0], donations: donations.rows } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch donor' });
  }
});

router.put('/donors/:id', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const {
      name, bloodGroup, phone, whatsapp, email, age, gender, address, city, pincode,
      donorType, eligible, healthNotes, notificationConsent, preferredChannel, isActive,
    } = req.body;
    const { rows } = await db.query(`
      UPDATE blood_bank_donors SET
        name=COALESCE($2,name), blood_group=COALESCE($3,blood_group),
        phone=COALESCE($4,phone), whatsapp=COALESCE($5,whatsapp),
        email=COALESCE($6,email), age=COALESCE($7,age), gender=COALESCE($8,gender),
        address=COALESCE($9,address), city=COALESCE($10,city), pincode=COALESCE($11,pincode),
        donor_type=COALESCE($12,donor_type), eligible=COALESCE($13,eligible),
        health_notes=COALESCE($14,health_notes),
        notification_consent=COALESCE($15,notification_consent),
        preferred_channel=COALESCE($16,preferred_channel),
        is_active=COALESCE($17,is_active), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, name, bloodGroup, phone, whatsapp, email, age, gender, address, city, pincode,
        donorType, eligible, healthNotes, notificationConsent, preferredChannel, isActive]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Donor not found' });
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update donor' });
  }
});

router.delete('/donors/:id', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { rowCount } = await db.query(`UPDATE blood_bank_donors SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Donor not found' });
    res.json({ success: true, message: 'Donor deactivated' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to deactivate donor' });
  }
});

// ─── Donation history ─────────────────────────────────────────────────────────

router.post('/donors/:id/donations', authBloodBank, async (req, res) => {
  const db = await ensureTables(req, res);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const donorRes = await client.query(`SELECT * FROM blood_bank_donors WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!donorRes.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Donor not found' }); }

    const {
      donationDate = new Date().toISOString().slice(0,10),
      component = 'whole_blood', unitsCollected = 1,
      bagNumber, hbLevel, bloodPressure, pulse, weight, temperature,
      screeningPassed = true, adverseReactions, campLocation, recordedBy, notes,
    } = req.body;

    if (!screeningPassed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Screening failed — donation cannot be recorded' });
    }

    const { rows: [donation] } = await client.query(`
      INSERT INTO blood_donor_donations
        (donor_id, donation_date, blood_group, component, units_collected, bag_number,
         hb_level, blood_pressure, pulse, weight, temperature, screening_passed,
         adverse_reactions, camp_location, recorded_by, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [req.params.id, donationDate, donorRes.rows[0].blood_group, component, unitsCollected,
        bagNumber||null, hbLevel||null, bloodPressure||null, pulse||null, weight||null,
        temperature||null, screeningPassed, adverseReactions||null, campLocation||null,
        recordedBy||null, notes||null]);

    const eligDate = nextEligible(donationDate, component);
    await client.query(`
      UPDATE blood_bank_donors SET
        total_donations = total_donations + 1,
        last_donation_date = $2,
        next_eligible_date = $3,
        eligible = FALSE,
        updated_at = NOW()
      WHERE id = $1
    `, [req.params.id, donationDate, eligDate]);

    await recordAudit(client, req, 'donation_recorded', 'donation', donation.id, { donorId: req.params.id, component, unitsCollected });
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { donation, next_eligible_date: eligDate } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[BloodBank donation POST]', err.message);
    res.status(500).json({ success: false, message: 'Failed to record donation' });
  } finally {
    client.release();
  }
});

// ─── Eligible donor lookup ────────────────────────────────────────────────────

router.get('/donors/eligible/:bloodGroup', authBloodBank, async (req, res) => {
  try {
    const { bloodGroup } = req.params;
    if (!BLOOD_GROUPS.includes(bloodGroup))
      return res.status(400).json({ success: false, message: 'Invalid blood group' });
    const { compatibleGroups } = req.query;
    const db = await ensureTables(req, res);

    // Universal donors: O- can donate to anyone; for plasma AB+ is universal
    let groups = [bloodGroup];
    if (compatibleGroups === 'true') {
      const compatibility = {
        'A+':  ['A+', 'A-', 'O+', 'O-'],
        'A-':  ['A-', 'O-'],
        'B+':  ['B+', 'B-', 'O+', 'O-'],
        'B-':  ['B-', 'O-'],
        'AB+': ['A+','A-','B+','B-','AB+','AB-','O+','O-'],
        'AB-': ['AB-','A-','B-','O-'],
        'O+':  ['O+', 'O-'],
        'O-':  ['O-'],
      };
      groups = compatibility[bloodGroup] || [bloodGroup];
    }

    const { rows } = await db.query(`
      SELECT *, (next_eligible_date IS NULL OR next_eligible_date <= CURRENT_DATE) AS eligible_now
      FROM blood_bank_donors
      WHERE blood_group = ANY($1::text[])
        AND is_active = TRUE
        AND notification_consent = TRUE
        AND eligible = TRUE
        AND (next_eligible_date IS NULL OR next_eligible_date <= CURRENT_DATE)
      ORDER BY total_donations DESC, last_donation_date ASC NULLS FIRST
    `, [groups]);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error('[BloodBank eligible GET]', err.message);
    res.status(500).json({ success: false, message: 'Failed to get eligible donors' });
  }
});

// ─── AI: draft outreach message ───────────────────────────────────────────────

router.post('/communications/ai-draft', authBloodBank, async (req, res) => {
  try {
    const {
      bloodGroupNeeded, component = 'whole_blood', unitsNeeded = 1,
      urgency = 'routine', hospitalName = 'MGM Hospitals', donorCount,
      channel = 'whatsapp', additionalContext = '',
    } = req.body;

    if (!BLOOD_GROUPS.includes(bloodGroupNeeded))
      return res.status(400).json({ success: false, message: 'Valid bloodGroupNeeded is required' });

    const urgencyLabel = urgency === 'critical' ? '🆘 URGENT —' : urgency === 'high' ? '⚠️ Important —' : '';
    const componentLabel = {
      whole_blood: 'Whole Blood', prbc: 'Packed Red Blood Cells (PRBC)',
      ffp: 'Fresh Frozen Plasma (FFP)', platelets: 'Platelets',
      cryoprecipitate: 'Cryoprecipitate',
    }[component] || component;

    const channelStyle = channel === 'whatsapp'
      ? 'WhatsApp message — conversational, warm, brief, uses emojis appropriately'
      : channel === 'sms'
      ? 'SMS — very short (under 160 chars), no emojis, clear call to action'
      : 'email — formal, compassionate, includes subject line and body';

    const system = `You are a compassionate blood bank communication specialist at ${hospitalName}.
Draft a personalized donor outreach message that is warm, respectful, and motivating — never alarming.
The message must:
- Address the donor personally as "Dear Donor" (the actual name will be inserted at send time)
- Clearly state the blood need without causing panic
- Include the hospital name and a contact number placeholder {{CONTACT_NUMBER}}
- End with sincere gratitude
- Be appropriate for ${channelStyle}
${urgency === 'critical' ? '- Convey urgency clearly but calmly' : ''}
${additionalContext ? `Additional context: ${additionalContext}` : ''}`;

    const userMsg = `Draft a ${channel} donor outreach message for:
- Blood group needed: ${bloodGroupNeeded}
- Component: ${componentLabel}
- Units needed: ${unitsNeeded}
- Urgency: ${urgency}
- Eligible donors who can receive this: ${donorCount || 'several'} donors matched
- Hospital: ${hospitalName}

Also provide a short subject line (for email) and a brief 1-line summary of the message.
Format your response as JSON: { "subject": "...", "body": "...", "summary": "..." }`;

    const raw = await aiComplete(
      [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      { maxTokens: 600, temperature: 0.55 }
    );

    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: `${urgencyLabel} Blood Donation Request — ${bloodGroupNeeded}`, body: raw, summary: '' };
    } catch {
      parsed = { subject: `${urgencyLabel} Blood Donation Request — ${bloodGroupNeeded}`, body: raw, summary: '' };
    }

    res.json({
      success: true,
      data: {
        subject: parsed.subject || `Blood Donation Request — ${bloodGroupNeeded}`,
        body: parsed.body || raw,
        summary: parsed.summary || '',
        bloodGroupNeeded, component, unitsNeeded, urgency, channel,
      },
    });
  } catch (err) {
    console.error('[BloodBank AI draft]', err.message);
    res.status(500).json({ success: false, message: 'AI draft failed — please try again' });
  }
});

// ─── Send communication to eligible donors ────────────────────────────────────

router.post('/communications/send', authBloodBank, async (req, res) => {
  const db = await ensureTables(req, res);
  const client = await db.connect();
  try {
    const {
      bloodGroupNeeded, component, unitsNeeded = 1, urgency = 'routine',
      messageSubject, messageBody, channel = 'whatsapp',
      donorIds, // optional: specific donor IDs; if omitted, all eligible are targeted
    } = req.body;

    if (!messageBody?.trim())
      return res.status(400).json({ success: false, message: 'messageBody is required' });

    await client.query('BEGIN');

    // Resolve target donors
    let targetDonors;
    if (donorIds?.length) {
      const { rows } = await client.query(
        `SELECT id, name, phone, whatsapp, email, preferred_channel FROM blood_bank_donors
         WHERE id = ANY($1::int[]) AND is_active = TRUE AND notification_consent = TRUE`,
        [donorIds]
      );
      targetDonors = rows;
    } else {
      let groups = [bloodGroupNeeded];
      if (bloodGroupNeeded) {
        const compatibility = {
          'A+': ['A+','A-','O+','O-'], 'A-': ['A-','O-'],
          'B+': ['B+','B-','O+','O-'], 'B-': ['B-','O-'],
          'AB+': ['A+','A-','B+','B-','AB+','AB-','O+','O-'], 'AB-': ['AB-','A-','B-','O-'],
          'O+': ['O+','O-'], 'O-': ['O-'],
        };
        groups = compatibility[bloodGroupNeeded] || [bloodGroupNeeded];
      }
      const { rows } = await client.query(
        `SELECT id, name, phone, whatsapp, email, preferred_channel FROM blood_bank_donors
         WHERE blood_group = ANY($1::text[])
           AND is_active = TRUE AND notification_consent = TRUE AND eligible = TRUE
           AND (next_eligible_date IS NULL OR next_eligible_date <= CURRENT_DATE)`,
        [groups]
      );
      targetDonors = rows;
    }

    if (!targetDonors.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'No eligible donors found matching criteria' });
    }

    // Create communication record
    const staffName = req.bloodBankUser?.name || req.bloodBankUser?.email || 'Blood Bank Staff';
    const { rows: [comm] } = await client.query(`
      INSERT INTO blood_donor_communications
        (blood_group_needed, component, units_needed, urgency, message_subject, message_body,
         channel, status, total_donors, created_by, sent_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'sent',$8,$9,NOW())
      RETURNING *
    `, [bloodGroupNeeded||null, component||null, unitsNeeded, urgency, messageSubject||null,
        messageBody, channel, targetDonors.length, staffName]);

    // Create per-donor recipient rows (simulated dispatch)
    const recipientValues = targetDonors.map((d, i) => {
      const contactNum = channel === 'whatsapp' ? (d.whatsapp || d.phone) : channel === 'sms' ? d.phone : d.email;
      return `(${comm.id}, ${d.id}, ${contactNum ? `'${contactNum.replace(/'/g, "''")}'` : 'NULL'}, 'sent')`;
    }).join(', ');

    if (recipientValues) {
      await client.query(`
        INSERT INTO blood_donor_comm_recipients (comm_id, donor_id, phone, status)
        VALUES ${recipientValues}
      `);
    }

    await client.query(
      `UPDATE blood_donor_communications SET sent_count = $2 WHERE id = $1`,
      [comm.id, targetDonors.length]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        communicationId: comm.id,
        totalDonors: targetDonors.length,
        channel,
        sentAt: comm.sent_at,
        donors: targetDonors.map(d => ({
          id: d.id, name: d.name,
          contact: channel === 'whatsapp' ? (d.whatsapp || d.phone) : channel === 'sms' ? d.phone : d.email,
        })),
      },
      message: `Message dispatched to ${targetDonors.length} eligible donor${targetDonors.length > 1 ? 's' : ''} via ${channel}.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[BloodBank comm send]', err.message);
    res.status(500).json({ success: false, message: 'Failed to send communication' });
  } finally {
    client.release();
  }
});

// ─── Communication history ────────────────────────────────────────────────────

router.get('/communications', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { limit = 50, offset = 0 } = req.query;
    const { rows } = await db.query(
      `SELECT c.*,
         COALESCE(
           (SELECT COUNT(*)::int FROM blood_donor_comm_recipients r WHERE r.comm_id = c.id AND r.status = 'responded'),
           0
         ) AS responded_count
       FROM blood_donor_communications c
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), Number(offset)]
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load communications' });
  }
});

router.get('/communications/:id/recipients', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { rows } = await db.query(`
      SELECT r.*, d.name, d.blood_group, d.phone
      FROM blood_donor_comm_recipients r
      JOIN blood_bank_donors d ON d.id = r.donor_id
      WHERE r.comm_id = $1
      ORDER BY r.created_at
    `, [req.params.id]);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load recipients' });
  }
});

// ─── Requisitions ─────────────────────────────────────────────────────────────

router.get('/requisitions', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { rows } = await db.query(`SELECT * FROM blood_bank_requisitions ORDER BY created_at DESC`);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load requisitions' });
  }
});

router.post('/requisitions', authBloodBank, async (req, res) => {
  try {
    const { patientId, patientName, ward, bloodGroup, component = 'whole_blood', unitsRequested = 1, urgency = 'routine', requestedBy, notes } = req.body;
    if (!patientName || !BLOOD_GROUPS.includes(bloodGroup))
      return res.status(400).json({ success: false, message: 'patientName and valid bloodGroup are required' });
    const db = await ensureTables(req, res);
    const { rows } = await db.query(`
      INSERT INTO blood_bank_requisitions
        (requisition_number, patient_id, patient_name, ward, blood_group, component, units_requested, urgency, requested_by, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [`REQ-${Date.now()}`, patientId||null, patientName, ward||null, bloodGroup, component, unitsRequested, urgency, requestedBy||null, notes||null]);
    await recordAudit(db, req, 'requisition_created', 'requisition', rows[0].id, { bloodGroup, component, unitsRequested, urgency });
    res.status(201).json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create requisition' });
  }
});

router.post('/requisitions/:id/issue', authBloodBank, async (req, res) => {
  const db = await ensureTables(req, res);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const id = Number(req.params.id);
    const reqResult = await client.query(`SELECT * FROM blood_bank_requisitions WHERE id=$1 FOR UPDATE`, [id]);
    const requisition = reqResult.rows[0];
    if (!requisition) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Requisition not found' }); }
    // This lock is the state-transition guard. Without it, a repeated request
    // could select a fresh set of available units and overwrite the first
    // allocation on the requisition.
    if (requisition.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        code: 'REQUISITION_NOT_ISSUABLE',
        message: `Only pending requisitions can be issued (current status: ${requisition.status})`,
      });
    }
    const units = await client.query(`
      SELECT id FROM blood_bank_units
      WHERE blood_group=$1 AND component=$2 AND status='available' AND expires_at>=CURRENT_DATE
      ORDER BY expires_at ASC LIMIT $3 FOR UPDATE
    `, [requisition.blood_group, requisition.component, requisition.units_requested]);
    if (units.rows.length < requisition.units_requested) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Insufficient compatible units available' });
    }
    const unitIds = units.rows.map(r => r.id);
    await client.query(`UPDATE blood_bank_units SET status='issued', updated_at=NOW() WHERE id=ANY($1::int[])`, [unitIds]);
    const { rows: [updated] } = await client.query(`
      UPDATE blood_bank_requisitions SET status='issued', issued_unit_ids=$2::int[], updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [id, unitIds]);
    await recordAudit(client, req, 'requisition_issued', 'requisition', updated.id, { unitIds });
    await client.query('COMMIT');
    res.json({ success: true, data: updated });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Failed to issue requisition' });
  } finally {
    client.release();
  }
});


router.post('/cross-match', authBloodBank, async (req, res) => {
  try {
    const { bloodGroup, component = 'whole_blood', unitsRequested = 1 } = req.body;
    if (!BLOOD_GROUPS.includes(bloodGroup)) return res.status(400).json({ success: false, message: 'Valid bloodGroup is required' });
    const compatibility = {
      'A+': ['A+','A-','O+','O-'], 'A-': ['A-','O-'],
      'B+': ['B+','B-','O+','O-'], 'B-': ['B-','O-'],
      'AB+': ['A+','A-','B+','B-','AB+','AB-','O+','O-'], 'AB-': ['AB-','A-','B-','O-'],
      'O+': ['O+','O-'], 'O-': ['O-'],
    };
    const db = await ensureTables(req, res);
    const compatibleGroups = compatibility[bloodGroup] || [bloodGroup];
    const { rows } = await db.query(`
      SELECT id, unit_number, blood_group, component, expires_at
      FROM blood_bank_units
      WHERE blood_group = ANY($1::text[]) AND component = $2 AND status = 'available' AND expires_at >= CURRENT_DATE
      ORDER BY expires_at ASC
      LIMIT $3
    `, [compatibleGroups, component, unitsRequested]);
    res.json({ success: true, data: { compatible: rows.length >= Number(unitsRequested), compatibleGroups, units: rows } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to cross-match units' });
  }
});

router.post('/requisitions/:id/return', authBloodBank, async (req, res) => {
  const db = await ensureTables(req, res);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM blood_bank_requisitions WHERE id=$1 FOR UPDATE`, [req.params.id]);
    const requisition = rows[0];
    if (!requisition) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Requisition not found' }); }
    if (requisition.status !== 'issued') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Only issued requisitions can be returned' }); }
    await client.query(`UPDATE blood_bank_units SET status='available', updated_at=NOW() WHERE id=ANY($1::int[])`, [requisition.issued_unit_ids]);
    const { rows: [updated] } = await client.query(`UPDATE blood_bank_requisitions SET status='returned', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    await recordAudit(client, req, 'requisition_returned', 'requisition', updated.id, { unitIds: requisition.issued_unit_ids });
    await client.query('COMMIT');
    res.json({ success: true, data: updated });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Failed to return requisition' });
  } finally {
    client.release();
  }
});

router.get('/alerts', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const shortages = await db.query(`
      WITH groups AS (SELECT unnest($1::text[]) AS blood_group)
      SELECT groups.blood_group, COUNT(u.id)::int AS available_units
      FROM groups LEFT JOIN blood_bank_units u ON u.blood_group = groups.blood_group AND u.status = 'available'
      GROUP BY groups.blood_group
      HAVING COUNT(u.id) < 5
      ORDER BY groups.blood_group
    `, [BLOOD_GROUPS]);
    const expiring = await db.query(`
      SELECT id, unit_number, blood_group, component, expires_at
      FROM blood_bank_units
      WHERE status='available' AND expires_at <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY expires_at ASC
    `);
    res.json({ success: true, data: { shortages: shortages.rows, expiring: expiring.rows } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load alerts' });
  }
});

router.get('/audit', authBloodBank, async (req, res) => {
  try {
    const db = await ensureTables(req, res);
    const { rows } = await db.query(`SELECT * FROM blood_bank_audit_events ORDER BY created_at DESC LIMIT 100`);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load audit events' });
  }
});

export default router;
