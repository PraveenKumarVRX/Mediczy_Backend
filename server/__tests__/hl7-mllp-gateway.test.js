/**
 * HL7 v2 / MLLP Gateway — unit tests for parser and dispatcher.
 * Does NOT start a TCP server (no network I/O).
 */

import { jest } from '@jest/globals';

// Suppress event-bus and MQTT side effects
jest.unstable_mockModule('../services/hypergrid-event-bus.service.js', () => ({
  publishEvent: jest.fn().mockResolvedValue(true),
}));

const { parseHL7, dispatchMessage, buildAck, LOINC_MAP } = await import('../services/hl7-mllp-gateway.service.js');

// ── Sample HL7 messages ────────────────────────────────────────────────────────

const ADT_A01 = [
  'MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|MSG001|P|2.5.1',
  'EVN|A01|20260101120000',
  'PID|1||12345^^^MRN||Smith^John^||19700101|M',
  'PV1|1|I|WARD3^ROOM2^BED1|||ATTENDING^DrJones^|||||||20260101100000',
].join('\r');

const ADT_A03 = [
  'MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101180000||ADT^A03|MSG002|P|2.5.1',
  'EVN|A03|20260101180000',
  'PID|1||12345^^^MRN||Smith^John^',
  'PV1|1|O',
].join('\r');

const ORU_R01_VITALS = [
  'MSH|^~\\&|MONITOR|ICU|EHR|HOSPITAL|20260101120500||ORU^R01|MSG003|P|2.5.1',
  'PID|1||12345^^^MRN',
  'OBR|1|||VITALS^Vital Signs',
  'OBX|1|NM|8867-4^Heart Rate^LN||82|bpm|60-100|N|F',
  'OBX|2|NM|59408-5^SpO2^LN||97|%|95-100|N|F',
  'OBX|3|NM|9279-1^Respiratory Rate^LN||18|/min|12-20|N|F',
  'OBX|4|NM|8480-6^Systolic BP^LN||130|mmHg|90-140|N|F',
  'OBX|5|NM|8462-4^Diastolic BP^LN||80|mmHg|60-90|N|F',
].join('\r');

const ORU_R01_LAB = [
  'MSH|^~\\&|LAB|HOSPITAL|EHR|HOSPITAL|20260101121000||ORU^R01|MSG004|P|2.5.1',
  'PID|1||12345^^^MRN',
  'OBR|1|||CHEM^Chemistry Panel',
  'OBX|1|NM|2823-3^Potassium^LN||5.8|mmol/L|3.5-5.0|H|F',
  'OBX|2|NM|2160-0^Creatinine^LN||180|umol/L|50-110|H|F',
  'OBX|3|NM|2532-0^Lactate^LN||3.2|mmol/L|0.5-2.2|H|F',
].join('\r');

const UNSUPPORTED_MSG = [
  'MSH|^~\\&|APP|FAC|APP2|FAC2|20260101120000||QRY^A19|MSG005|P|2.5.1',
  'QRD|20260101120000|R|I|Q00001|1^RD|1^MO|Patient^Info',
].join('\r');

// ── parseHL7 ──────────────────────────────────────────────────────────────────

describe('parseHL7', () => {
  it('parses MSH, PID, PV1 segments from ADT^A01', () => {
    const seg = parseHL7(ADT_A01);
    expect(seg.MSH).toHaveLength(1);
    expect(seg.PID).toHaveLength(1);
    expect(seg.PV1).toHaveLength(1);
  });

  it('parses multiple OBX segments from ORU^R01', () => {
    const seg = parseHL7(ORU_R01_VITALS);
    expect(seg.OBX).toHaveLength(5);
  });

  it('extracts message type from MSH-9 (array index 8)', () => {
    const seg = parseHL7(ADT_A01);
    expect(seg.MSH[0][8]).toBe('ADT^A01'); // MSH split: [0]=MSH [8]=msgType [9]=controlId
  });
});

// ── dispatchMessage ────────────────────────────────────────────────────────────

describe('dispatchMessage — ADT^A01', () => {
  it('returns PatientAdmitted event', () => {
    const { event, error } = dispatchMessage(ADT_A01);
    expect(error).toBeNull();
    expect(event.type).toBe('PatientAdmitted');
    expect(event.source).toBe('hl7');
    expect(event.payload.mrn).toBe('12345');
    expect(event.payload.lastName).toBe('Smith');
    expect(event.payload.ward).toBe('WARD3');
  });
});

describe('dispatchMessage — ADT^A03', () => {
  it('returns PatientDischarged event', () => {
    const { event, error } = dispatchMessage(ADT_A03);
    expect(error).toBeNull();
    expect(event.type).toBe('PatientDischarged');
    expect(event.payload.mrn).toBe('12345');
    // dischargeDisposition and dischargeTime are optional — depend on PV1 field count
    expect(event.payload).toHaveProperty('dischargeDisposition');
    expect(event.payload).toHaveProperty('dischargeTime');
  });
});

describe('dispatchMessage — ORU^R01 vitals', () => {
  it('returns ObservationResult with 5 vital observations', () => {
    const { event, error } = dispatchMessage(ORU_R01_VITALS);
    expect(error).toBeNull();
    expect(event.type).toBe('ObservationResult');
    expect(event.payload.mrn).toBe('12345');
    expect(event.payload.observations).toHaveLength(5);
    // Verify LOINC mapping
    const hr = event.payload.observations.find(o => o.loincCode === '8867-4');
    expect(hr.name).toBe('heartRate');
    expect(hr.value).toBe(82);
  });

  it('maps SpO₂, RR, BP LOINC codes correctly', () => {
    const { event } = dispatchMessage(ORU_R01_VITALS);
    const obs = event.payload.observations;
    expect(obs.find(o => o.loincCode === '59408-5').name).toBe('spo2');
    expect(obs.find(o => o.loincCode === '9279-1').name).toBe('respiratoryRate');
    expect(obs.find(o => o.loincCode === '8480-6').name).toBe('sbp');
    expect(obs.find(o => o.loincCode === '8462-4').name).toBe('dbp');
  });
});

describe('dispatchMessage — ORU^R01 labs', () => {
  it('maps K⁺, creatinine, lactate LOINC codes', () => {
    const { event } = dispatchMessage(ORU_R01_LAB);
    const obs = event.payload.observations;
    const k = obs.find(o => o.loincCode === '2823-3');
    expect(k.name).toBe('potassium');
    expect(k.value).toBe(5.8);
    expect(k.flag).toBe('H');
    const cr = obs.find(o => o.loincCode === '2160-0');
    expect(cr.name).toBe('creatinine');
    expect(cr.value).toBe(180);
  });
});

describe('dispatchMessage — unsupported type', () => {
  it('returns error for QRY^A19', () => {
    const { event, error } = dispatchMessage(UNSUPPORTED_MSG);
    expect(event).toBeNull();
    expect(error).toMatch(/unsupported message type/i);
  });

  it('returns error for missing MSH', () => {
    const { event, error } = dispatchMessage('ZZZ|invalid');
    expect(event).toBeNull();
    expect(error).toMatch(/missing MSH/i);
  });
});

// ── buildAck ──────────────────────────────────────────────────────────────────

describe('buildAck', () => {
  it('builds a valid MLLP-framed ACK^AA', () => {
    const seg = parseHL7(ADT_A01);
    const msh = seg.MSH[0];
    const ack = buildAck(msh, 'AA');
    expect(ack.startsWith('\x0b')).toBe(true);         // MLLP Start-of-Block
    expect(ack.includes('\x1c')).toBe(true);            // MLLP End-of-Block
    expect(ack).toContain('MSA|AA|MSG001');             // control ID from msh[9]
    expect(ack).toContain('RECEIVING_APP');             // receiver became sender
  });

  it('builds ACK^AE with error message', () => {
    const seg = parseHL7(ADT_A01);
    const ack = buildAck(seg.MSH[0], 'AE', 'Unsupported message type');
    expect(ack).toContain('MSA|AE|');
    expect(ack).toContain('Unsupported message type');
  });
});

// ── LOINC_MAP coverage ────────────────────────────────────────────────────────

describe('LOINC_MAP', () => {
  it('contains standard vital sign LOINC codes', () => {
    expect(LOINC_MAP['8867-4']).toBe('heartRate');
    expect(LOINC_MAP['59408-5']).toBe('spo2');
    expect(LOINC_MAP['9279-1']).toBe('respiratoryRate');
    expect(LOINC_MAP['8480-6']).toBe('sbp');
    expect(LOINC_MAP['8310-5']).toBe('temperature');
  });

  it('contains common lab LOINC codes', () => {
    expect(LOINC_MAP['2823-3']).toBe('potassium');
    expect(LOINC_MAP['2951-2']).toBe('sodium');
    expect(LOINC_MAP['2160-0']).toBe('creatinine');
    expect(LOINC_MAP['2532-0']).toBe('lactate');
    expect(LOINC_MAP['49563-0']).toBe('hsTroponin');
  });

  it('has at least 25 LOINC mappings', () => {
    expect(Object.keys(LOINC_MAP).length).toBeGreaterThanOrEqual(25);
  });
});
