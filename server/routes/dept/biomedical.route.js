import express from 'express';
import jwt from 'jsonwebtoken';
import { loginBiomedical } from '../../controllers/dept/biomedical.controller.js';
import { JWT_CONFIG } from '../../config/auth.config.js';
import llmProvider from '../../services/ai-brain/llm-provider.js';

const router = express.Router();

// ─── Auth middleware ───────────────────────────────────────────────────────────

const authBiomedical = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ success: false, error: 'Biomedical token required' });
  try {
    req.biomedUser = jwt.verify(token, JWT_CONFIG.SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

router.post('/login', (req, res, next) => { req.skipAuth = true; next(); }, loginBiomedical);

// ─── Helper ───────────────────────────────────────────────────────────────────

const aiComplete = async (messages, { maxTokens = 900, temperature = 0.35 } = {}) => {
  const result = await llmProvider.complete({ messages, maxTokens, temperature });
  return result?.content || result?.text || result?.message || String(result || '');
};

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

export default router;
