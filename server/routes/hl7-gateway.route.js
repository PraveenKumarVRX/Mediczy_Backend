/**
 * HL7 v2 / MLLP Gateway Routes
 *
 * Endpoints:
 *   GET  /api/v1/hl7/status            — gateway running state + stats
 *   POST /api/v1/hl7/start             — start MLLP TCP server
 *   POST /api/v1/hl7/stop              — stop MLLP TCP server
 *   POST /api/v1/hl7/validate          — validate HL7 v2 message structure
 *   POST /api/v1/hl7/parse             — parse raw HL7 v2 → JSON segments
 *   POST /api/v1/hl7/transform/fhir    — transform HL7 v2 message → FHIR R4 resource
 *   GET  /api/v1/hl7/message-types     — list supported message types
 *   POST /api/v1/hl7/simulate          — inject a test HL7 message (dev/QA)
 *
 * HL7 Message Types Supported:
 *   ADT^A01 Admit, ADT^A02 Transfer, ADT^A03 Discharge, ADT^A08 Update
 *   ORU^R01 Observation Result (lab/vitals)
 *   ORM^O01 Order Message
 *   DFT^P03 Detail Financial Transaction (charge posting)
 *   MDM^T02 Medical Document Management (discharge summary, clinical note)
 *   SIU^S12 Notification of new appointment / S14 Appointment modification
 *
 * Standards: HL7 v2.5.1, MLLP RFC 2575, IHE PIX/PDQ, NHS HSCIC
 */

import { Router } from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  startHL7Gateway, stopHL7Gateway, getGatewayStats,
  parseHL7, dispatchMessage, buildAck, LOINC_MAP
} from '../services/hl7-mllp-gateway.service.js';
import fhirMapper from '../services/fhir-mapper.service.js';

const router = Router();

// ── Supported message type registry ──────────────────────────────────────────
const SUPPORTED_TYPES = [
  { type: 'ADT^A01', description: 'Patient Admit', trigger: 'PatientAdmitted',      standard: 'HL7 v2.5.1 §3.3.1' },
  { type: 'ADT^A02', description: 'Patient Transfer', trigger: 'PatientTransferred', standard: 'HL7 v2.5.1 §3.3.2' },
  { type: 'ADT^A03', description: 'Patient Discharge', trigger: 'PatientDischarged', standard: 'HL7 v2.5.1 §3.3.3' },
  { type: 'ADT^A08', description: 'Patient Info Update', trigger: 'PatientInfoUpdated', standard: 'HL7 v2.5.1 §3.3.8' },
  { type: 'ORU^R01', description: 'Observation Result (lab/vitals)', trigger: 'ObservationResult', standard: 'HL7 v2.5.1 §7.3.1', loincMapped: true },
  { type: 'ORM^O01', description: 'Order Message', trigger: 'OrderPlaced', standard: 'HL7 v2.5.1 §4.3' },
  { type: 'DFT^P03', description: 'Detail Financial Transaction (charge posting)', trigger: 'ChargePosted', standard: 'HL7 v2.5.1 §6.4.3' },
  { type: 'MDM^T02', description: 'Medical Document Management — Document Available', trigger: 'DocumentAvailable', standard: 'HL7 v2.5.1 §9.6.2' },
  { type: 'SIU^S12', description: 'Notification of New Appointment (Scheduling)', trigger: 'AppointmentScheduled', standard: 'HL7 v2.5.1 §10.3.2' },
  { type: 'SIU^S14', description: 'Appointment Modification', trigger: 'AppointmentModified', standard: 'HL7 v2.5.1 §10.3.4' },
  { type: 'ACK',     description: 'General Acknowledgement', trigger: 'Acknowledgement',    standard: 'HL7 v2.5.1 §2.9' },
  // ── MFN — Master File Notifications (GAP-6) ──────────────────────────────────
  { type: 'MFN^M01', description: 'Master File — Generic',                          trigger: 'MasterFileGenericUpdated',      standard: 'HL7 v2.5.1 §8.3.1' },
  { type: 'MFN^M02', description: 'Master File — Staff/Practitioner (HPR sync)',    trigger: 'MasterFilePractitionerUpdated', standard: 'HL7 v2.5.1 §8.3.2', loincMapped: false },
  { type: 'MFN^M04', description: 'Master File — Charge Description Master (CDM)', trigger: 'MasterFileChargeUpdated',       standard: 'HL7 v2.5.1 §8.3.4' },
  { type: 'MFN^M05', description: 'Master File — Location (Ward/Room/Bed)',         trigger: 'MasterFileLocationUpdated',     standard: 'HL7 v2.5.1 §8.3.5' },
  { type: 'MFN^M08', description: 'Master File — Lab Test/Observation Catalogue',  trigger: 'MasterFileLabTestUpdated',      standard: 'HL7 v2.5.1 §8.3.8', loincMapped: true },
  { type: 'MFN^M12', description: 'Master File — Basic Observation/Vital Signs',   trigger: 'MasterFileObservationUpdated',  standard: 'HL7 v2.5.1 §8.3.12', loincMapped: true },
];

// ── HL7 v2 Validator ─────────────────────────────────────────────────────────
function validateHL7Message(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'string') {
    return { valid: false, errors: ['Message must be a non-empty string'] };
  }

  const lines = raw.split('\r').filter(Boolean);
  if (lines[0]?.substring(0, 3) !== 'MSH') {
    errors.push('First segment must be MSH');
  }

  const msh = lines[0]?.split('|');
  if (msh && msh.length < 12) {
    errors.push(`MSH segment has only ${msh.length} fields; minimum 12 required`);
  }

  if (msh) {
    const msgType = msh[8];
    const known = SUPPORTED_TYPES.find(t => t.type === msgType);
    if (!known) {
      warnings.push(`Message type '${msgType}' is not in the supported type list — will be dispatched but may not trigger domain events`);
    }
    const version = msh[11];
    if (version && !['2.3', '2.4', '2.5', '2.5.1'].includes(version)) {
      warnings.push(`HL7 version '${version}' may not be fully supported; supported: 2.3, 2.4, 2.5, 2.5.1`);
    }
  }

  // Check PID segment for ADT messages
  if (msh?.[8]?.startsWith('ADT')) {
    if (!lines.some(l => l.startsWith('PID'))) {
      errors.push('ADT messages must contain a PID (Patient Identification) segment');
    }
    if (!lines.some(l => l.startsWith('PV1'))) {
      warnings.push('ADT messages typically include a PV1 (Patient Visit) segment');
    }
  }

  // Check OBX for ORU messages
  if (msh?.[8] === 'ORU^R01') {
    if (!lines.some(l => l.startsWith('OBR'))) {
      errors.push('ORU^R01 messages must contain an OBR (Observation Request) segment');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    segmentCount: lines.length,
    messageType:  msh?.[8] || 'unknown',
    version:      msh?.[11] || 'unknown',
    sendingApp:   msh?.[2] || '',
    sendingFacility: msh?.[3] || '',
  };
}

// ── HL7 → FHIR Transform ─────────────────────────────────────────────────────
function transformHL7ToFHIR(parsed, msgType) {
  const pid = parsed.PID?.[0];
  const pv1 = parsed.PV1?.[0];
  const obr = parsed.OBR?.[0];
  const obxList = parsed.OBX || [];

  const f = (seg, idx) => (seg && seg[idx]) || '';
  const c = (str, idx) => (str && str.split('^')[idx]) || '';

  if (msgType?.startsWith('ADT')) {
    // Map to FHIR Patient + Encounter
    const patientResource = {
      resourceType: 'Patient',
      id: c(f(pid, 3), 0) || `hl7-${Date.now()}`,
      meta: { source: 'hl7-adt', lastUpdated: new Date().toISOString() },
      identifier: [{ system: 'urn:oid:2.16.840.1.113883.4.1', value: c(f(pid, 3), 0) }],
      name: [{ use: 'official', family: c(f(pid, 5), 0), given: [c(f(pid, 5), 1)].filter(Boolean) }],
      gender: { 'M': 'male', 'F': 'female', 'U': 'unknown' }[f(pid, 8)] || 'unknown',
      birthDate: f(pid, 7) ? `${f(pid, 7).slice(0,4)}-${f(pid, 7).slice(4,6)}-${f(pid, 7).slice(6,8)}` : undefined,
    };

    const encounterStatus = { 'A01': 'in-progress', 'A03': 'finished', 'A02': 'in-progress' };
    const evtCode = msgType.split('^')[1];
    const encounterResource = pv1 ? {
      resourceType: 'Encounter',
      id: `enc-${c(f(pv1, 19), 0) || Date.now()}`,
      meta: { source: 'hl7-adt' },
      status: encounterStatus[evtCode] || 'in-progress',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'Inpatient' },
      subject: { reference: `Patient/${patientResource.id}` },
      location: [{ location: { display: `${c(f(pv1, 3), 0)} — Bed ${c(f(pv1, 3), 2)}` } }],
    } : null;

    return { resourceType: 'Bundle', type: 'transaction', entry: [
      { resource: patientResource },
      ...(encounterResource ? [{ resource: encounterResource }] : [])
    ]};
  }

  if (msgType === 'ORU^R01') {
    // Map to FHIR Observations
    const loincReverse = Object.fromEntries(Object.entries(LOINC_MAP).map(([k, v]) => [v, k]));
    const observations = obxList.map((obx, i) => {
      const obxSeg = obx[0]; // OBX segment fields
      const valueType = f(obxSeg, 2);
      const loincCode  = c(f(obxSeg, 3), 0);
      const loincName  = c(f(obxSeg, 3), 1) || LOINC_MAP[loincCode] || 'Unknown';
      const value      = f(obxSeg, 5);
      const unit       = c(f(obxSeg, 6), 1);
      const abnFlag    = f(obxSeg, 8);
      return {
        resourceType: 'Observation',
        id: `obs-${Date.now()}-${i}`,
        meta: { source: 'hl7-oru' },
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: loincCode, display: loincName }], text: loincName },
        valueQuantity: valueType === 'NM' ? { value: Number(value), unit, system: 'http://unitsofmeasure.org' } : undefined,
        valueString:   valueType !== 'NM' ? value : undefined,
        interpretation: abnFlag ? [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: abnFlag }] }] : undefined,
        effectiveDateTime: new Date().toISOString(),
      };
    });
    return { resourceType: 'Bundle', type: 'collection', entry: observations.map(r => ({ resource: r })) };
  }

  return { resourceType: 'OperationOutcome', issue: [{ severity: 'information', code: 'not-supported', diagnostics: `HL7→FHIR transform for ${msgType} returns raw parsed segments` }], parsed };
}

// ── Route Handlers ────────────────────────────────────────────────────────────

// GET /api/v1/hl7/status
router.get('/status', authUser, (_req, res) => {
  const stats = getGatewayStats();
  res.json({
    success: true,
    data: {
      running:           stats !== null,
      ...(stats || {}),
      supportedTypes:    SUPPORTED_TYPES.length,
      loincMappedCodes:  Object.keys(LOINC_MAP).length,
      protocol:          'MLLP (RFC 2575)',
      standards:         ['HL7 v2.5.1', 'IHE PIX/PDQ', 'NHS HSCIC', 'IEC 60601-1-8 alarms'],
    }
  });
});

// POST /api/v1/hl7/start
router.post('/start', authUser, (req, res) => {
  try {
    const gw = startHL7Gateway(req.body.port);
    res.json({ success: true, data: { message: 'HL7 MLLP gateway started', port: gw.port } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/hl7/stop
router.post('/stop', authUser, (_req, res) => {
  stopHL7Gateway();
  res.json({ success: true, data: { message: 'HL7 MLLP gateway stopped' } });
});

// GET /api/v1/hl7/message-types
router.get('/message-types', authUser, (_req, res) => {
  res.json({ success: true, count: SUPPORTED_TYPES.length, data: SUPPORTED_TYPES });
});

// POST /api/v1/hl7/validate
router.post('/validate', authUser, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'message field required (raw HL7 v2 string with \\r segment separators)' });
  const result = validateHL7Message(message);
  res.status(result.valid ? 200 : 422).json({ success: result.valid, data: result });
});

// POST /api/v1/hl7/parse
router.post('/parse', authUser, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'message field required' });
  try {
    const parsed = parseHL7(message);
    const validation = validateHL7Message(message);
    res.json({ success: true, data: { parsed, validation } });
  } catch (err) {
    res.status(422).json({ success: false, message: err.message });
  }
});

// POST /api/v1/hl7/transform/fhir
router.post('/transform/fhir', authUser, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'message field required' });
  try {
    const parsed   = parseHL7(message);
    const msh      = parsed.MSH?.[0];
    const msgType  = msh?.[8] || '';
    const fhirBundle = transformHL7ToFHIR(parsed, msgType);
    res.json({ success: true, data: { sourceMessageType: msgType, fhirVersion: '4.0.1', ...fhirBundle } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/hl7/simulate — inject a synthetic HL7 message (for QA/testing)
router.post('/simulate', authUser, (req, res) => {
  const { messageType = 'ADT^A01', patientId = 'TEST001', mrn = 'MRN12345' } = req.body;

  const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const syntheticMessages = {
    'ADT^A01': `MSH|^~\\&|TEST|MEDICZY|ADT|MEDICZY|${now}||ADT^A01|MSG${now}|P|2.5.1\rPID|1||${mrn}^^^MRN||Smith^John^A||19800101|M|||123 Main St^^Mumbai^MH^400001^IN||9876543210|||S|||${patientId}\rPV1|1|I|GEN-W^101^Bed-A|||||||DR.SHARMA||||I||||||ADM-${Date.now()}\r`,
    'ORU^R01': `MSH|^~\\&|LAB|MEDICZY|HIS|MEDICZY|${now}||ORU^R01|MSG${now}|P|2.5.1\rPID|1||${mrn}^^^MRN||Smith^John^A||19800101|M\rOBR|1|||CBC^Complete Blood Count\rOBX|1|NM|718-7^Hemoglobin^LN||13.5|g/dL|13.5-17.5||||F\rOBX|2|NM|4544-3^Hematocrit^LN||41.0|%|41-53||||F\r`,
    'DFT^P03': `MSH|^~\\&|BILLING|MEDICZY|HIS|MEDICZY|${now}||DFT^P03|MSG${now}|P|2.5.1\rPID|1||${mrn}^^^MRN||Smith^John^A\rFT1|1||${now}|${now}|CG|CONS-001^Consultation^LOCAL|Specialist consultation||1||1500.00\r`,
    'SIU^S12': `MSH|^~\\&|SCHED|MEDICZY|HIS|MEDICZY|${now}||SIU^S12|MSG${now}|P|2.5.1\rSCH|||APT-${Date.now()}||||CONSULT^Consultation|||60|||^^^${now}\rPID|1||${mrn}^^^MRN||Smith^John^A\r`,
  };

  const rawMessage = syntheticMessages[messageType] || syntheticMessages['ADT^A01'];
  try {
    const { event, msh, error } = dispatchMessage(rawMessage);
    res.json({
      success: true,
      data: {
        messageType, syntheticMessage: rawMessage.replace(/\r/g, '\n'),
        dispatched: !!event, event, error: error || null,
        ack: buildAck(msh, error ? 'AE' : 'AA', error || ''),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
