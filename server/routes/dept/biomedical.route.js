import express from 'express';
import jwt from 'jsonwebtoken';
import { loginBiomedical } from '../../controllers/dept/biomedical.controller.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import llmProvider from '../../services/ai-brain/llm-provider.js';
import { connectPostgres } from '../../db/postgres.js';
import biomedicalEquipment from '../../services/biomedical-equipment.service.js';

const router = express.Router();

// ─── Auth middleware ───────────────────────────────────────────────────────────

const BIOMED_ROLES = new Set(['biomedical', 'hospital_admin', 'hospital', 'admin', 'super_admin', 'medical_director']);

const authBiomedical = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ success: false, error: 'Biomedical token required' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_CONFIG.SECRET);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  // The secret is shared by every portal, so a valid signature alone proves nothing about the role:
  // only biomedical staff and hospital/platform admins may use this module.
  if (!BIOMED_ROLES.has(decoded.role)) {
    return res.status(403).json({ success: false, error: 'Biomedical access required' });
  }
  req.biomedUser = decoded;
  next();
};

// ─── Login ────────────────────────────────────────────────────────────────────

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginBiomedical);

// ─── Helper ───────────────────────────────────────────────────────────────────

const ensureHyperGridInventoryTable = async (db) => {
  await db.query(`CREATE TABLE IF NOT EXISTS hg_equipment_inventory (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, equipment_class VARCHAR(120) NOT NULL, device_name VARCHAR(200) NOT NULL, manufacturer VARCHAR(160), model VARCHAR(160), serial_number VARCHAR(160), department VARCHAR(160), location VARCHAR(160), protocol VARCHAR(80), owner_department VARCHAR(120), integration_status VARCHAR(32) NOT NULL DEFAULT 'identified', connector_id INTEGER, notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`);
};

const aiComplete = async (messages, { maxTokens = 900, temperature = 0.35 } = {}) => {
  const result = await llmProvider.chat({ messages, maxTokens, temperature });
  return result?.content || result?.text || result?.message || String(result || '');
};


router.post('/equipment/sync-hypergrid', authBiomedical, async (req, res) => {
  try {
    const { deviceName, equipmentClass, manufacturer, model, serialNumber, department, location, protocol, notes } = req.body;
    if (!deviceName || !equipmentClass) return res.status(400).json({ success: false, error: 'deviceName and equipmentClass are required' });
    const db = await connectPostgres();
    await ensureHyperGridInventoryTable(db);
    const tenantId = req.biomedUser?.tenant_id || req.biomedUser?.organization_id || req.biomedUser?.hospital_id || req.biomedUser?.id;
    const { rows } = await db.query(`INSERT INTO hg_equipment_inventory (tenant_id, equipment_class, device_name, manufacturer, model, serial_number, department, location, protocol, owner_department, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Biomedical',$10) RETURNING *`, [tenantId, equipmentClass, deviceName, manufacturer || null, model || null, serialNumber || null, department || null, location || null, protocol || null, notes || null]);
    res.status(201).json({ success: true, equipment: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to sync equipment to HyperGrid' });
  }
});

// ─── POST /api/biomedical/ai/chat ─────────────────────────────────────────────
// ARIA — clinical engineering AI chat for biomedical staff.

router.post('/ai/chat', authBiomedical, async (req, res) => {
  try {
    const { message, context = '', history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'message is required' });

    const system = `You are ARIA (AI Repair & Intelligence Assistant), a world-class clinical engineering AI embedded in a hospital biomedical department. You are an expert in:
- Biomedical equipment troubleshooting and root cause analysis
- Preventive maintenance (PPM) protocols for hospital devices
- NABH, NABL, IEC 60601, ISO 13485 regulatory compliance
- Device calibration procedures and standards
- ECG machines, ventilators, patient monitors, defibrillators, infusion pumps, imaging equipment
- Failure mode analysis (FMEA) for medical devices
- Electrical safety testing (leakage current, ground impedance)
- Scheduled maintenance planning and resource optimisation
- Medical device vigilance and incident reporting

Be precise, technically accurate, and practical. Flag when an issue requires OEM support or immediate device withdrawal from service. Context: ${context || 'Biomedical engineering department query.'}`;

    const messages = [
      { role: 'system', content: system },
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const reply = await aiComplete(messages, { maxTokens: 1000, temperature: 0.4 });

    res.json({ success: true, reply, assistant: 'ARIA', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Biomedical AI] chat error:', err.message);
    res.status(500).json({ success: false, error: 'ARIA is temporarily unavailable.' });
  }
});

// ─── POST /api/biomedical/ai/device-diagnostic ────────────────────────────────
// AI-driven root cause analysis and repair guidance for a faulty device.

router.post('/ai/device-diagnostic', authBiomedical, async (req, res) => {
  try {
    const {
      deviceName, deviceId, manufacturer, model, yearOfManufacture,
      department, symptoms = [], errorCodes = [], lastService,
    } = req.body;

    if (!deviceName || !symptoms.length) {
      return res.status(400).json({ success: false, error: 'deviceName and symptoms are required' });
    }

    const prompt = `You are ARIA, a clinical engineering AI performing a remote device diagnostic.

DEVICE PROFILE:
- Device: ${deviceName} (ID: ${deviceId || 'N/A'})
- Manufacturer: ${manufacturer || 'Unknown'} | Model: ${model || 'Unknown'}
- Year: ${yearOfManufacture || 'Unknown'} | Department: ${department || 'Unknown'}
- Last Service: ${lastService || 'Unknown'}
- Reported Symptoms: ${symptoms.join('; ')}
- Error Codes / Alarms: ${errorCodes.length ? errorCodes.join(', ') : 'None reported'}

Generate a structured clinical engineering diagnostic report with:

1. LIKELY ROOT CAUSE: Most probable cause based on symptoms and error codes
2. DIFFERENTIAL CAUSES: 2-3 alternative causes to rule out
3. RISK ASSESSMENT: Patient safety risk if device continues in use (CRITICAL/HIGH/MEDIUM/LOW)
4. IMMEDIATE ACTION: What to do right now (withdraw/quarantine/monitor)
5. DIAGNOSTIC STEPS: Step-by-step troubleshooting procedure (numbered)
6. PARTS LIKELY NEEDED: Components that may require replacement
7. ESTIMATED REPAIR TIME: Expected downtime in hours
8. PREVENTIVE NOTE: How to prevent recurrence
9. OEM ESCALATION: Whether to contact manufacturer support and why

Be technically precise. Reference specific diagnostic procedures where applicable.`;

    const raw = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 1400, temperature: 0.25 });

    const parseSection = (text, header) => {
      const regex = new RegExp(`${header}[:\\s]*([\\s\\S]*?)(?=\\n[0-9]+\\.|\\n[A-Z ]{3,}:|$)`, 'i');
      const m = text.match(regex);
      return m ? m[1].trim() : '';
    };

    res.json({
      success: true,
      diagnostic: {
        deviceId, deviceName,
        generatedAt: new Date().toISOString(),
        rootCause:         parseSection(raw, 'LIKELY ROOT CAUSE'),
        differentialCauses:parseSection(raw, 'DIFFERENTIAL CAUSES'),
        riskAssessment:    parseSection(raw, 'RISK ASSESSMENT'),
        immediateAction:   parseSection(raw, 'IMMEDIATE ACTION'),
        diagnosticSteps:   parseSection(raw, 'DIAGNOSTIC STEPS'),
        partsNeeded:       parseSection(raw, 'PARTS LIKELY NEEDED'),
        estimatedRepairTime: parseSection(raw, 'ESTIMATED REPAIR TIME'),
        preventiveNote:    parseSection(raw, 'PREVENTIVE NOTE'),
        oemEscalation:     parseSection(raw, 'OEM ESCALATION'),
        raw,
        confidence: 0.88,
      },
    });
  } catch (err) {
    console.error('[Biomedical AI] diagnostic error:', err.message);
    res.status(500).json({ success: false, error: 'Diagnostic generation failed.' });
  }
});

// ─── POST /api/biomedical/ai/maintenance-plan ─────────────────────────────────
// Generate an optimised PPM schedule for a list of devices.

router.post('/ai/maintenance-plan', authBiomedical, async (req, res) => {
  try {
    const { devices = [], planningPeriod = '3 months', engineerCount = 4, department } = req.body;
    if (!devices.length) return res.status(400).json({ success: false, error: 'devices list is required' });

    const prompt = `You are ARIA, a clinical engineering AI. Generate an optimised preventive maintenance (PPM) schedule for a hospital biomedical department.

PLANNING PARAMETERS:
- Planning Period: ${planningPeriod}
- Available Engineers: ${engineerCount}
- Department Focus: ${department || 'All departments'}

DEVICE LIST:
${devices.map((d, i) => `${i + 1}. ${d.name} (${d.type || 'Unknown type'}) — Qty: ${d.quantity || 1}, Last PM: ${d.lastPM || 'Unknown'}, Frequency: ${d.pmFrequency || 'Monthly'}`).join('\n')}

Generate:
1. PRIORITY RANKING: Devices ranked by criticality and overdue status
2. MONTHLY SCHEDULE: Week-by-week maintenance plan for each month
3. ENGINEER ALLOCATION: Assign engineers to device groups
4. ESTIMATED HOURS: Time required per device type
5. CRITICAL DEVICES: Devices that need immediate attention
6. COMPLIANCE CALENDAR: NABH/regulatory milestones
7. COST ESTIMATE: Approximate maintenance cost in INR

Be practical, regulatory-compliant (NABH, IEC 60601), and resource-efficient.`;

    const plan = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 1200, temperature: 0.3 });

    res.json({
      success: true,
      plan,
      planningPeriod,
      deviceCount: devices.length,
      engineerCount,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Biomedical AI] maintenance-plan error:', err.message);
    res.status(500).json({ success: false, error: 'Maintenance plan generation failed.' });
  }
});

// ─── POST /api/biomedical/ai/compliance-check ─────────────────────────────────
// Check a device's compliance against NABH/NABL/IEC regulatory requirements.

router.post('/ai/compliance-check', authBiomedical, async (req, res) => {
  try {
    const {
      deviceName, deviceClass = 'B', lastCalibration, calibrationDueDate,
      lastElectricalSafety, ppmStatus, manufacturer, model,
    } = req.body;

    if (!deviceName) return res.status(400).json({ success: false, error: 'deviceName is required' });

    const prompt = `You are ARIA, a clinical engineering compliance AI. Evaluate the regulatory compliance status of this medical device.

DEVICE:
- Name: ${deviceName} | Model: ${model || 'N/A'} | Manufacturer: ${manufacturer || 'N/A'}
- Device Class: Class ${deviceClass}
- Last Calibration: ${lastCalibration || 'Not recorded'}
- Calibration Due: ${calibrationDueDate || 'Unknown'}
- Last Electrical Safety Test: ${lastElectricalSafety || 'Not recorded'}
- PPM Status: ${ppmStatus || 'Unknown'}

Evaluate against:
- NABH standards for biomedical equipment
- IEC 60601-1 (electrical safety)
- ISO 13485 (quality management)
- Legal Metrology Act (calibration)
- Medical Device Rules 2017 (India)

Provide:
1. COMPLIANCE STATUS: COMPLIANT / NON-COMPLIANT / PARTIALLY COMPLIANT
2. CRITICAL GAPS: Non-compliances that must be fixed immediately
3. MINOR GAPS: Issues to address in next review cycle
4. REQUIRED ACTIONS: Numbered action list with deadlines
5. NABH INDICATOR: Which NABH indicators this affects
6. RISK TO ACCREDITATION: Impact on hospital accreditation if unaddressed

Return a clear, actionable compliance report.`;

    const raw = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 900, temperature: 0.2 });

    const parseSection = (text, header) => {
      const regex = new RegExp(`${header}[:\\s]*([\\s\\S]*?)(?=\\n[0-9]+\\.|\\n[A-Z ]{3,}:|$)`, 'i');
      const m = text.match(regex);
      return m ? m[1].trim() : '';
    };

    res.json({
      success: true,
      compliance: {
        deviceName, model,
        status:              parseSection(raw, 'COMPLIANCE STATUS'),
        criticalGaps:        parseSection(raw, 'CRITICAL GAPS'),
        minorGaps:           parseSection(raw, 'MINOR GAPS'),
        requiredActions:     parseSection(raw, 'REQUIRED ACTIONS'),
        nabhIndicator:       parseSection(raw, 'NABH INDICATOR'),
        accreditationRisk:   parseSection(raw, 'RISK TO ACCREDITATION'),
        raw,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Biomedical AI] compliance-check error:', err.message);
    res.status(500).json({ success: false, error: 'Compliance check failed.' });
  }
});

// ─── POST /api/biomedical/ai/failure-prediction ───────────────────────────────
// Predict failure risk and remaining useful life for a device.

router.post('/ai/failure-prediction', authBiomedical, async (req, res) => {
  try {
    const {
      deviceName, ageYears, totalHoursRun, maintenanceHistory = [],
      incidentCount = 0, lastMajorRepair, usageIntensity = 'moderate',
    } = req.body;

    if (!deviceName) return res.status(400).json({ success: false, error: 'deviceName is required' });

    const prompt = `You are ARIA, a clinical engineering AI specialising in predictive maintenance. Assess the failure risk and remaining useful life of this hospital device.

DEVICE DATA:
- Device: ${deviceName}
- Age: ${ageYears || 'Unknown'} years
- Total Hours Run: ${totalHoursRun || 'Unknown'} hours
- Usage Intensity: ${usageIntensity}
- Incidents in Last Year: ${incidentCount}
- Last Major Repair: ${lastMajorRepair || 'Not recorded'}
- Maintenance History: ${maintenanceHistory.length ? maintenanceHistory.join('; ') : 'Not provided'}

Generate:
1. FAILURE RISK SCORE: 0-100 (100 = imminent failure) with explanation
2. REMAINING USEFUL LIFE: Estimated months before replacement needed
3. HIGH-RISK COMPONENTS: Parts most likely to fail next
4. RECOMMENDED ACTIONS: What to do to extend device life
5. REPLACEMENT TIMELINE: When to initiate procurement planning
6. COST-BENEFIT: Repair vs replace analysis

Be data-driven and conservative (patient safety first).`;

    const raw = await aiComplete([{ role: 'user', content: prompt }], { maxTokens: 800, temperature: 0.3 });

    res.json({ success: true, prediction: raw, deviceName, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[Biomedical AI] failure-prediction error:', err.message);
    res.status(500).json({ success: false, error: 'Failure prediction failed.' });
  }
});

// ─── Real equipment registry (Workstream 6, added 2026-09-18) ────────────────
// Additive only — does not change /equipment/sync-hypergrid or any AI route above.

// Same derivation as /equipment/sync-hypergrid so registry rows line up with
// the inventory rows that route writes.
const registryTenantId = (req) => req.biomedUser?.tenant_id || req.biomedUser?.organization_id || req.biomedUser?.hospital_id || req.biomedUser?.id;
const toPosInt = (v) => (/^\d+$/.test(String(v ?? '')) && Number(v) > 0 && Number(v) <= 2147483647 ? Number(v) : null);
const TICKET_PRIORITIES = ['routine', 'urgent', 'critical'];

router.get('/equipment', authBiomedical, async (req, res) => {
  try {
    const tenantId = registryTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant could not be determined from token' });
    const equipment = await biomedicalEquipment.listEquipment(tenantId);
    res.json({ success: true, data: equipment });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list equipment' });
  }
});

router.post('/maintenance-tickets', authBiomedical, async (req, res) => {
  try {
    const tenantId = registryTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant could not be determined from token' });
    const { equipmentId, issueDescription, priority } = req.body;
    if (!issueDescription) return res.status(400).json({ success: false, error: 'issueDescription is required' });
    if (priority !== undefined && priority !== null && !TICKET_PRIORITIES.includes(priority)) return res.status(400).json({ success: false, error: `priority must be one of ${TICKET_PRIORITIES.join(', ')}` });
    const hasEquip = equipmentId !== undefined && equipmentId !== null && equipmentId !== '';
    if (hasEquip && !toPosInt(equipmentId)) return res.status(400).json({ success: false, error: 'Invalid equipmentId' });
    const ticket = await biomedicalEquipment.openTicket({
      tenantId, equipmentId: hasEquip ? toPosInt(equipmentId) : null, issueDescription, priority: priority || undefined, reportedBy: req.biomedUser?.email || req.biomedUser?.id,
    });
    if (!ticket) return res.status(404).json({ success: false, error: 'Equipment not found' });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to open maintenance ticket' });
  }
});

router.get('/maintenance-tickets', authBiomedical, async (req, res) => {
  try {
    const tenantId = registryTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant could not be determined from token' });
    const tickets = await biomedicalEquipment.listTickets(tenantId, { status: req.query.status || null });
    res.json({ success: true, data: tickets });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list maintenance tickets' });
  }
});

router.post('/maintenance-tickets/:id/resolve', authBiomedical, async (req, res) => {
  try {
    const tenantId = registryTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant could not be determined from token' });
    const ticketId = toPosInt(req.params.id);
    if (!ticketId) return res.status(400).json({ success: false, error: 'Invalid ticket id' });
    const ticket = await biomedicalEquipment.resolveTicket(tenantId, ticketId, {
      resolutionNotes: req.body?.resolutionNotes, assignedTo: req.body?.assignedTo,
    });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    res.json({ success: true, data: ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to resolve maintenance ticket' });
  }
});

router.post('/calibration-schedule', authBiomedical, async (req, res) => {
  try {
    const tenantId = registryTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant could not be determined from token' });
    const { equipmentId, calibrationType, nextDueAt, frequencyDays } = req.body;
    if (!equipmentId || !calibrationType || !nextDueAt) {
      return res.status(400).json({ success: false, error: 'equipmentId, calibrationType, and nextDueAt are required' });
    }
    const equipId = toPosInt(equipmentId);
    if (!equipId) return res.status(400).json({ success: false, error: 'Invalid equipmentId' });
    const schedule = await biomedicalEquipment.scheduleCalibration({ tenantId, equipmentId: equipId, calibrationType, nextDueAt, frequencyDays });
    if (!schedule) return res.status(404).json({ success: false, error: 'Equipment not found' });
    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to schedule calibration' });
  }
});

router.post('/calibration-schedule/:id/complete', authBiomedical, async (req, res) => {
  try {
    const tenantId = registryTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant could not be determined from token' });
    const scheduleId = toPosInt(req.params.id);
    if (!scheduleId) return res.status(400).json({ success: false, error: 'Invalid schedule id' });
    const schedule = await biomedicalEquipment.recordCalibrationCompleted(tenantId, scheduleId);
    if (!schedule) return res.status(404).json({ success: false, error: 'Calibration schedule not found' });
    res.json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to record calibration completion' });
  }
});

// NABH-gap-assessment-ready: equipment due for calibration soon.
router.get('/calibration-due', authBiomedical, async (req, res) => {
  try {
    const tenantId = registryTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant could not be determined from token' });
    const withinDays = Number(req.query.withinDays) || 30;
    const due = await biomedicalEquipment.getCalibrationDueSoon(tenantId, withinDays);
    res.json({ success: true, data: due });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch calibration due list' });
  }
});

export default router;
