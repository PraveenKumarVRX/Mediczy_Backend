/**
 * HL7 v2 / MLLP Gateway
 *
 * A TCP server implementing the Minimal Lower Layer Protocol (MLLP) for
 * receiving HL7 v2.x messages from ADT systems, lab analyzers, and
 * bedside monitors. Normalises to the canonical HyperGrid event bus.
 *
 * Supported message types:
 *   ADT^A01  — Patient Admit
 *   ADT^A02  — Patient Transfer
 *   ADT^A03  — Patient Discharge
 *   ADT^A08  — Patient Information Update
 *   ORU^R01  — Lab result / observation report (vitals from monitors)
 *   ORM^O01  — Order message
 *   ACK      — Acknowledgement
 *
 * Protocol: MLLP (RFC 2575 / HL7 2.x Implementation Guide)
 *   Start-of-Block: 0x0B (\x0b)
 *   End-of-Block:   0x1C (\x1c)
 *   Carriage Return: 0x0D (\r)
 *
 * Standards:
 *   - HL7 International v2.5.1 (backwards-compatible with 2.3, 2.4)
 *   - NHS HSCIC HL7 v2 Implementation Guide (UK)
 *   - IHE PIX/PDQ / LTW Integration Profiles
 *   - LOINC codes for observations (US / international)
 */

import net from 'net';
import EventEmitter from 'events';
import { publishEvent } from './hypergrid-event-bus.service.js';

// ── MLLP framing constants ─────────────────────────────────────────────────────
const MLLP_SOB = '\x0b'; // Start-of-Block
const MLLP_EOB = '\x1c'; // End-of-Block
const MLLP_CR  = '\r';   // Carriage Return (end of transmission)

// ── HL7 v2 ACK message builder ────────────────────────────────────────────────

function buildAck(msh, ackCode = 'AA', errorMsg = '') {
  // MSH split by '|': [0]=MSH [1]=encChars [2]=sendApp [3]=sendFac [4]=rcvApp [5]=rcvFac [6]=ts [7]=sec [8]=msgType [9]=controlId [10]=procId [11]=version
  const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const ackMsh = [
    'MSH', '^~\\&',
    msh[4] || '', msh[5] || '',  // swap: receiver becomes new sender
    msh[2] || '', msh[3] || '',  // original sender becomes receiver
    now, '',
    'ACK',
    now,
    'P', '2.5.1',
  ].join('|');
  const msa = `MSA|${ackCode}|${msh[9] || ''}${errorMsg ? `|${errorMsg}` : ''}`;
  return `${MLLP_SOB}${ackMsh}\r${msa}\r${MLLP_EOB}${MLLP_CR}`;
}

// ── HL7 parser — segment/field/component decomposition ───────────────────────

function parseHL7(raw) {
  const segments = raw.split('\r').filter(Boolean);
  const parsed = {};
  for (const seg of segments) {
    const fields = seg.split('|');
    const name = fields[0];
    if (!parsed[name]) parsed[name] = [];
    parsed[name].push(fields);
  }
  return parsed;
}

function field(seg, idx) { return (seg && seg[idx]) || ''; }
function component(f, idx) { return (f && f.split('^')[idx]) || ''; }

// ── Message handlers ────────────────────────────────────────────────────────────

/**
 * ADT^A01 — Patient Admit
 */
function handleAdtA01(segments) {
  const pid = segments.PID?.[0];
  const pv1 = segments.PV1?.[0];
  if (!pid) return null;

  return {
    type: 'PatientAdmitted',
    source: 'hl7',
    payload: {
      mrn:           component(field(pid, 3), 0),
      lastName:      component(field(pid, 5), 0),
      firstName:     component(field(pid, 5), 1),
      dob:           field(pid, 7),
      gender:        field(pid, 8),
      admitDateTime: field(pv1, 44),
      ward:          component(field(pv1, 3), 0),
      bed:           component(field(pv1, 3), 2),
      admitDiagnosis: field(pv1, 4),
      attendingDoctor: component(field(pv1, 7), 0),
    },
  };
}

/**
 * ADT^A02 — Patient Transfer
 */
function handleAdtA02(segments) {
  const pid = segments.PID?.[0];
  const pv1 = segments.PV1?.[0];
  if (!pid) return null;

  return {
    type: 'PatientTransferred',
    source: 'hl7',
    payload: {
      mrn:          component(field(pid, 3), 0),
      fromWard:     component(field(pv1, 6), 0),
      toWard:       component(field(pv1, 3), 0),
      toBed:        component(field(pv1, 3), 2),
      transferTime: field(pv1, 45),
    },
  };
}

/**
 * ADT^A03 — Patient Discharge
 */
function handleAdtA03(segments) {
  const pid = segments.PID?.[0];
  const pv1 = segments.PV1?.[0];
  if (!pid) return null;

  return {
    type: 'PatientDischarged',
    source: 'hl7',
    payload: {
      mrn:             component(field(pid, 3), 0),
      dischargeTime:   field(pv1, 45),
      dischargeDisposition: field(pv1, 36),
    },
  };
}

/**
 * ORU^R01 — Observation Result (lab or vitals from bedside monitor)
 * Maps LOINC codes to canonical vital names.
 */
const LOINC_MAP = {
  '8867-4':  'heartRate',          // Heart rate
  '59408-5': 'spo2',               // Oxygen saturation by pulse oximetry
  '9279-1':  'respiratoryRate',    // Respiratory rate
  '8480-6':  'sbp',                // Systolic blood pressure
  '8462-4':  'dbp',                // Diastolic blood pressure
  '8310-5':  'temperature',        // Body temperature
  '59454-9': 'etCo2',              // End-tidal CO₂
  '2708-6':  'pao2',               // Oxygen partial pressure
  '2703-7':  'paco2',              // CO₂ partial pressure
  '2744-1':  'pH',                 // pH
  '59260-0': 'haemoglobin',        // Haemoglobin
  '2823-3':  'potassium',          // Potassium
  '2951-2':  'sodium',             // Sodium
  '2160-0':  'creatinine',         // Creatinine
  '2345-7':  'glucose',            // Glucose
  '6299-2':  'bun',                // Blood urea nitrogen
  '1742-6':  'alt',                // ALT
  '1920-8':  'ast',                // AST
  '1975-2':  'bilirubin',          // Total bilirubin
  '6301-6':  'inr',                // INR
  '2532-0':  'lactate',            // Lactate
  '26515-7': 'platelets',          // Platelet count
  '718-7':   'haemoglobin',        // Haemoglobin (alt LOINC)
  '4548-4':  'hba1c',              // HbA1c
  '2085-9':  'hdlCholesterol',     // HDL
  '2089-1':  'ldlCholesterol',     // LDL
  '3043-7':  'triglycerides',      // Triglycerides
  '10839-9': 'troponin',           // Troponin I
  '49563-0': 'hsTroponin',         // High-sensitivity Troponin I
  '83107-3': 'proBnp',             // NT-proBNP
  '30522-7': 'crp',                // CRP (high sensitivity)
  '1988-5':  'crp',                // CRP
};

function handleOruR01(segments) {
  const pid = segments.PID?.[0];
  const obrs = segments.OBR || [];
  const obxs = segments.OBX || [];
  if (!pid) return null;

  const mrn = component(field(pid, 3), 0);
  const observations = [];

  for (const obx of obxs) {
    const loincCode = component(field(obx, 3), 0);
    const name = LOINC_MAP[loincCode] || field(obx, 3); // fall back to raw code
    const value = field(obx, 5);
    const unit  = field(obx, 6);
    const range = field(obx, 7);
    const flag  = field(obx, 8); // H, L, HH, LL, N
    const status = field(obx, 11); // F=final, P=preliminary, C=corrected

    observations.push({ name, loincCode, value: parseFloat(value) || value, unit, referenceRange: range, flag, status });
  }

  const orderedDt = field(obrs[0] || [], 7);
  return {
    type: 'ObservationResult',
    source: 'hl7',
    payload: { mrn, orderedAt: orderedDt, observations },
  };
}

/**
 * ORM^O01 — Order message
 */
function handleOrmO01(segments) {
  const pid = segments.PID?.[0];
  const orc = segments.ORC?.[0];
  const obr = segments.OBR?.[0];
  if (!pid) return null;

  return {
    type: 'OrderPlaced',
    source: 'hl7',
    payload: {
      mrn:       component(field(pid, 3), 0),
      orderId:   field(orc, 3),
      orderCode: component(field(obr, 4), 0),
      orderName: component(field(obr, 4), 1),
      priority:  field(obr, 5),
      orderedAt: field(obr, 6),
    },
  };
}

// ── MFN handlers (Master File Notifications — HL7 v2.5.1 §8) ─────────────────

/**
 * MFN^M02 — Master File — Staff/Practitioner
 * Synchronises provider directory (HPR) with partner systems.
 */
function handleMfnM02(segments) {
  const mfi = segments.MFI?.[0];
  const mfes = segments.MFE || [];
  const stfs  = segments.STF || [];
  const practitioners = stfs.map((stf, i) => ({
    staffId:       component(field(stf, 1), 0),
    lastName:      component(field(stf, 3), 0),
    firstName:     component(field(stf, 3), 1),
    staffType:     field(stf, 4),   // e.g. 'MD', 'NP', 'RN'
    specialty:     component(field(stf, 5), 0),
    activeFlag:    field(stf, 7),   // 'Y' | 'N'
    primaryDept:   component(field(stf, 8), 0),
    effectiveDate: mfes[i] ? field(mfes[i], 3) : null,
    actionCode:    mfes[i] ? field(mfes[i], 1) : 'MAD', // MAD=add, MDL=delete, MUP=update
  }));
  return {
    type: 'MasterFilePractitionerUpdated',
    source: 'hl7',
    payload: {
      masterFileId:  component(field(mfi, 1), 0),
      responseLvl:   field(mfi, 3),
      practitioners,
    },
  };
}

/**
 * MFN^M04 — Master File — Charge Description Master (CDM)
 * Synchronises procedure/fee schedule with partner billing systems.
 */
function handleMfnM04(segments) {
  const mfi  = segments.MFI?.[0];
  const mfes = segments.MFE || [];
  const cdms = segments.CDM || [];
  const charges = cdms.map((cdm, i) => ({
    chargeCode:    component(field(cdm, 1), 0),
    description:   field(cdm, 2),
    chargeType:    field(cdm, 3),
    cptCode:       component(field(cdm, 4), 0),
    price:         parseFloat(field(cdm, 7)) || null,
    activeFlag:    field(cdm, 8),
    actionCode:    mfes[i] ? field(mfes[i], 1) : 'MAD',
  }));
  return {
    type: 'MasterFileChargeUpdated',
    source: 'hl7',
    payload: {
      masterFileId: component(field(mfi, 1), 0),
      charges,
    },
  };
}

/**
 * MFN^M05 — Master File — Location (Wards, Rooms, Beds)
 * Synchronises hospital location hierarchy.
 */
function handleMfnM05(segments) {
  const mfi  = segments.MFI?.[0];
  const mfes = segments.MFE || [];
  const locs = segments.LOC || [];
  const locations = locs.map((loc, i) => ({
    locationId:    component(field(loc, 1), 0),
    description:   field(loc, 2),
    locationType:  field(loc, 3),   // 'N'=nursing unit, 'R'=room, 'B'=bed, 'C'=clinic
    organization:  component(field(loc, 4), 0),
    status:        field(loc, 7),
    actionCode:    mfes[i] ? field(mfes[i], 1) : 'MAD',
  }));
  return {
    type: 'MasterFileLocationUpdated',
    source: 'hl7',
    payload: {
      masterFileId: component(field(mfi, 1), 0),
      locations,
    },
  };
}

/**
 * MFN^M08 — Master File — Test/Observation (Lab catalogue, LOINC mapped)
 * Synchronises lab test catalogue with reference ranges.
 */
function handleMfnM08(segments) {
  const mfi  = segments.MFI?.[0];
  const mfes = segments.MFE || [];
  const oms3s = segments.OM3 || [];
  const oms1s = segments.OM1 || [];
  const tests = oms1s.map((om1, i) => ({
    testCode:        component(field(om1, 2), 0),
    loincCode:       component(field(om1, 2), 1),
    testName:        field(om1, 3),
    specimen:        field(om1, 15),
    unit:            component(field(om1, 26), 0),
    normalRange:     field(oms3s[i] || [], 5),
    criticalHigh:    field(oms3s[i] || [], 8),
    criticalLow:     field(oms3s[i] || [], 7),
    processingTime:  field(om1, 27),
    actionCode:      mfes[i] ? field(mfes[i], 1) : 'MAD',
  }));
  return {
    type: 'MasterFileLabTestUpdated',
    source: 'hl7',
    payload: {
      masterFileId: component(field(mfi, 1), 0),
      tests,
    },
  };
}

/**
 * MFN^M12 — Master File — Additional Basic Observation/Services
 * Handles vital sign observation catalogue updates.
 */
function handleMfnM12(segments) {
  const mfi  = segments.MFI?.[0];
  const mfes = segments.MFE || [];
  const oms1s = segments.OM1 || [];
  const observations = oms1s.map((om1, i) => ({
    observationId:  component(field(om1, 2), 0),
    loincCode:      component(field(om1, 2), 1),
    name:           field(om1, 3),
    category:       field(om1, 5),
    dataType:       field(om1, 20),
    units:          component(field(om1, 26), 0),
    actionCode:     mfes[i] ? field(mfes[i], 1) : 'MAD',
  }));
  return {
    type: 'MasterFileObservationUpdated',
    source: 'hl7',
    payload: {
      masterFileId: component(field(mfi, 1), 0),
      observations,
    },
  };
}

// MFN action code labels for audit/logging
const MFN_ACTION_LABELS = { MAD: 'add', MDL: 'delete', MUP: 'update', MDC: 'deactivate' };
export { MFN_ACTION_LABELS };

// ── Message dispatcher ────────────────────────────────────────────────────────

function dispatchMessage(raw) {
  const segments = parseHL7(raw);
  const msh = segments.MSH?.[0];
  if (!msh) return { event: null, error: 'Missing MSH segment' };

  const msgType   = field(msh, 8);  // MSH-9 Message Type (array index 8 after splitting by '|')
  const [type, trigger] = msgType.split('^');

  let event = null;
  switch (`${type}^${trigger}`) {
    case 'ADT^A01': event = handleAdtA01(segments); break;
    case 'ADT^A02': event = handleAdtA02(segments); break;
    case 'ADT^A03': event = handleAdtA03(segments); break;
    case 'ADT^A08': event = handleAdtA01(segments); if (event) event.type = 'PatientInfoUpdated'; break;
    case 'ORU^R01': event = handleOruR01(segments); break;
    case 'ORM^O01': event = handleOrmO01(segments); break;
    // ── MFN — Master File Notifications ───────────────────────────────────
    case 'MFN^M01': event = { type: 'MasterFileGenericUpdated', source: 'hl7', payload: { raw: msgType } }; break;
    case 'MFN^M02': event = handleMfnM02(segments); break;
    case 'MFN^M04': event = handleMfnM04(segments); break;
    case 'MFN^M05': event = handleMfnM05(segments); break;
    case 'MFN^M08': event = handleMfnM08(segments); break;
    case 'MFN^M12': event = handleMfnM12(segments); break;
    default:
      return { event: null, msh, error: `Unsupported message type: ${msgType}` };
  }
  return { event, msh, error: null };
}

// ── MLLP TCP server ───────────────────────────────────────────────────────────

class HL7MllpGateway extends EventEmitter {
  constructor(port = 2575, host = '0.0.0.0') {
    super();
    this.port = parseInt(process.env.HL7_MLLP_PORT || port);
    this.host = process.env.HL7_MLLP_HOST || host;
    this.server = null;
    this.connections = new Set();
    this.stats = { received: 0, processed: 0, errors: 0 };
  }

  start() {
    this.server = net.createServer(socket => {
      this.connections.add(socket);
      let buffer = '';

      socket.on('data', chunk => {
        buffer += chunk.toString('latin1');
        let start, end;
        while ((start = buffer.indexOf(MLLP_SOB)) !== -1 && (end = buffer.indexOf(MLLP_EOB, start)) !== -1) {
          const raw = buffer.slice(start + 1, end).replace(/\r/g, '\r');
          buffer = buffer.slice(end + 2);
          this.stats.received++;

          const { event, msh, error } = dispatchMessage(raw);
          if (error) {
            this.stats.errors++;
            console.warn('[HL7-MLLP] Parse error:', error);
            if (msh) socket.write(buildAck(msh, 'AE', error));
            continue;
          }

          if (event) {
            this.stats.processed++;
            publishEvent(event.type, { ...event.payload, _hl7Source: true }).catch(() => {});
            this.emit('message', event);
          }

          if (msh) socket.write(buildAck(msh, 'AA'));
        }
      });

      socket.on('error', err => { console.warn('[HL7-MLLP] Socket error:', err.message); });
      socket.on('close', () => { this.connections.delete(socket); });
    });

    this.server.on('error', err => {
      console.error('[HL7-MLLP] Server error:', err.message);
      this.emit('error', err);
    });

    this.server.listen(this.port, this.host, () => {
      console.log(`[HL7-MLLP] Gateway listening on ${this.host}:${this.port}`);
      this.emit('listening', { port: this.port, host: this.host });
    });

    return this;
  }

  stop() {
    for (const sock of this.connections) sock.destroy();
    this.server?.close(() => { this.emit('closed'); });
  }

  getStats() { return { ...this.stats, activeConnections: this.connections.size }; }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let gateway = null;

export function startHL7Gateway(port) {
  if (gateway) return gateway;
  gateway = new HL7MllpGateway(port);
  gateway.start();
  return gateway;
}

export function stopHL7Gateway() { gateway?.stop(); gateway = null; }
export function getGatewayStats() { return gateway?.getStats() ?? null; }
export function getGatewayInstance() { return gateway; }

// Named exports for parser utilities (useful for testing and adapters)
export { parseHL7, dispatchMessage, buildAck, LOINC_MAP };
