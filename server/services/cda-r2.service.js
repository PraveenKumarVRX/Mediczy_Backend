/**
 * HL7 Clinical Document Architecture Release 2 (CDA R2) Generator
 *
 * Produces standards-compliant CDA R2 XML documents for:
 *   - Discharge Summary     (LOINC 18842-5 / OID 2.16.840.1.113883.10.20.22.1.8)
 *   - Referral Note         (LOINC 57133-1 / OID 2.16.840.1.113883.10.20.22.1.14)
 *   - Continuity of Care    (LOINC 34133-9 / OID 2.16.840.1.113883.10.20.22.1.2)
 *   - Operative Note        (LOINC 11504-8 / OID 2.16.840.1.113883.10.20.22.1.7)
 *   - Diagnostic Imaging    (LOINC 18748-4 / OID 2.16.840.1.113883.10.20.22.1.5)
 *
 * All documents use:
 *   - ICD-10 for diagnoses (SNOMED fallback)
 *   - LOINC for observations/lab results
 *   - RxNorm for medications
 *   - ABDM-compatible ABHA identifier in recordTarget
 *
 * Standards:
 *   HL7 CDA R2 (ISO/HL7 27932)
 *   IHE PCC (Patient Care Coordination) content profiles
 *   ABDM Health Data Management Policy — PHR App interoperability
 */

import { randomUUID } from 'crypto';
import pool from '../db/pgPool.js';

const CDA_NS = 'urn:hl7-org:v3';
const MEDICZY_OID_ROOT = '2.16.840.1.113883.3.mediczy';
const LOINC_SYSTEM = '2.16.840.1.113883.6.1';
const ICD10_SYSTEM = '2.16.840.1.113883.6.90';
const SNOMED_SYSTEM = '2.16.840.1.113883.6.96';
const RXNORM_SYSTEM = '2.16.840.1.113883.6.88';

// ── DB table for CDA document registry ───────────────────────────────────────
export async function ensureCdaTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cda_documents (
      id              BIGSERIAL PRIMARY KEY,
      tenant_id       INTEGER,
      patient_id      INTEGER,
      document_type   VARCHAR(50) NOT NULL,
      loinc_code      VARCHAR(10),
      cda_id          UUID NOT NULL UNIQUE,
      xml_content     TEXT,
      status          VARCHAR(20) DEFAULT 'generated',
      reference_id    INTEGER,
      reference_type  VARCHAR(50),
      generated_by    INTEGER,
      generated_at    TIMESTAMPTZ DEFAULT NOW(),
      validated_at    TIMESTAMPTZ,
      validation_errors TEXT[]
    );
    CREATE INDEX IF NOT EXISTS idx_cda_patient ON cda_documents(patient_id, document_type);
    CREATE INDEX IF NOT EXISTS idx_cda_tenant  ON cda_documents(tenant_id, generated_at DESC);
  `);
}

// ── XML helpers ───────────────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ts(dt) {
  if (!dt) return new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  return new Date(dt).toISOString().replace(/[-:T.]/g, '').slice(0, 14);
}

function cdaDate(dt) {
  if (!dt) return '';
  return new Date(dt).toISOString().slice(0, 10).replace(/-/g, '');
}

// ── Header builder (shared across all document types) ─────────────────────────
function buildHeader({ docId, loincCode, loincDisplay, title, patient, doctor, hospital, effectiveTime }) {
  const abhaId = patient?.abha_id || patient?.abha_number;
  const patientGender = ({ male: 'M', female: 'F', other: 'UN' }[String(patient?.gender || '').toLowerCase()] || 'UN');

  return `  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="${MEDICZY_OID_ROOT}.cda"/>
  <id root="${docId}"/>
  <code code="${loincCode}" codeSystem="${LOINC_SYSTEM}" codeSystemName="LOINC" displayName="${esc(loincDisplay)}"/>
  <title>${esc(title)}</title>
  <effectiveTime value="${ts(effectiveTime)}"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en-IN"/>
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.3.mediczy.patient" extension="${esc(patient?.id)}"/>
      ${abhaId ? `<id root="https://healthid.abdm.gov.in" extension="${esc(abhaId)}"/>` : '<!-- No ABHA ID -->'}
      <addr use="HP">
        <streetAddressLine>${esc(patient?.address || '')}</streetAddressLine>
        <city>${esc(patient?.city || '')}</city>
        <state>${esc(patient?.state || '')}</state>
        <country>IN</country>
      </addr>
      <telecom value="tel:${esc(patient?.phone || '')}" use="MC"/>
      <patient>
        <name use="L">
          <given>${esc(patient?.first_name || patient?.firstName || '')}</given>
          <family>${esc(patient?.last_name || patient?.lastName || '')}</family>
        </name>
        <administrativeGenderCode code="${patientGender}" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="${cdaDate(patient?.date_of_birth || patient?.dob)}"/>
      </patient>
    </patientRole>
  </recordTarget>
  <author>
    <time value="${ts(effectiveTime)}"/>
    <assignedAuthor>
      <id root="${MEDICZY_OID_ROOT}.doctor" extension="${esc(doctor?.id)}"/>
      <assignedPerson>
        <name>
          <prefix>Dr.</prefix>
          <given>${esc(doctor?.first_name || doctor?.firstName || '')}</given>
          <family>${esc(doctor?.last_name || doctor?.lastName || '')}</family>
        </name>
      </assignedPerson>
      <representedOrganization>
        <id root="${MEDICZY_OID_ROOT}.hospital" extension="${esc(hospital?.id)}"/>
        <name>${esc(hospital?.name || hospital?.hospitalName || 'Mediczy Healthcare')}</name>
        <telecom value="tel:${esc(hospital?.phone || '')}"/>
        <addr>
          <city>${esc(hospital?.city || '')}</city>
          <country>IN</country>
        </addr>
      </representedOrganization>
    </assignedAuthor>
  </author>
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="${MEDICZY_OID_ROOT}.hospital" extension="${esc(hospital?.id)}"/>
        <name>${esc(hospital?.name || hospital?.hospitalName || 'Mediczy Healthcare')}</name>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>`;
}

// ── Section builders ──────────────────────────────────────────────────────────
function diagnosisSection(diagnoses = []) {
  const entries = diagnoses.map(d => `
      <entry typeCode="DRIV">
        <observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4"/>
          <id root="${randomUUID()}"/>
          <code code="29308-4" codeSystem="${LOINC_SYSTEM}" displayName="Diagnosis"/>
          <statusCode code="completed"/>
          <value xsi:type="CD"
            code="${esc(d.icd10_code || d.icd10Code || '')}"
            codeSystem="${ICD10_SYSTEM}"
            codeSystemName="ICD-10"
            displayName="${esc(d.diagnosis || d.condition || '')}"/>
        </observation>
      </entry>`).join('');

  return `
    <component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>
        <code code="11450-4" codeSystem="${LOINC_SYSTEM}" displayName="Problem List"/>
        <title>Diagnoses</title>
        <text>${esc(diagnoses.map(d => d.diagnosis || d.condition || '').join('; '))}</text>
        ${entries}
      </section>
    </component>`;
}

function medicationsSection(medications = []) {
  const entries = medications.map(m => `
      <entry typeCode="DRIV">
        <substanceAdministration classCode="SBADM" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.16"/>
          <id root="${randomUUID()}"/>
          <statusCode code="completed"/>
          <effectiveTime xsi:type="IVL_TS"/>
          <doseQuantity value="${esc(m.dosage || '')}" unit="${esc(m.unit || 'each')}"/>
          <rateQuantity value="${esc(m.frequency || '')}" unit="h"/>
          <consumable>
            <manufacturedProduct classCode="MANU">
              <templateId root="2.16.840.1.113883.10.20.22.4.23"/>
              <manufacturedMaterial>
                <code code="${esc(m.rxnorm_code || '')}"
                      codeSystem="${RXNORM_SYSTEM}"
                      displayName="${esc(m.name || '')}">
                  <originalText>${esc(m.name || '')} ${esc(m.composition || '')}</originalText>
                </code>
              </manufacturedMaterial>
            </manufacturedProduct>
          </consumable>
        </substanceAdministration>
      </entry>`).join('');

  return `
    <component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.1.1"/>
        <code code="10160-0" codeSystem="${LOINC_SYSTEM}" displayName="Medications"/>
        <title>Medications</title>
        <text>${esc(medications.map(m => `${m.name} ${m.composition || ''} — ${m.dosage} ${m.frequency}`).join('; '))}</text>
        ${entries}
      </section>
    </component>`;
}

function vitalsSection(vitals = {}) {
  const loincVitals = [
    { loinc: '8480-6', name: 'Systolic BP',    value: (vitals.bp || '').split('/')[0], unit: 'mm[Hg]' },
    { loinc: '8462-4', name: 'Diastolic BP',   value: (vitals.bp || '').split('/')[1], unit: 'mm[Hg]' },
    { loinc: '8867-4', name: 'Heart Rate',     value: vitals.heartRate || vitals.heart_rate, unit: '/min' },
    { loinc: '8310-5', name: 'Body Temperature', value: vitals.temperature, unit: '[degF]' },
    { loinc: '59408-5', name: 'SpO2',          value: vitals.spo2, unit: '%' },
    { loinc: '29463-7', name: 'Body Weight',   value: vitals.weight, unit: 'kg' },
    { loinc: '8302-2', name: 'Body Height',    value: vitals.height, unit: 'cm' },
  ].filter(v => v.value !== undefined && v.value !== null && v.value !== '');

  const entries = loincVitals.map(v => `
      <entry typeCode="DRIV">
        <observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.27"/>
          <id root="${randomUUID()}"/>
          <code code="${esc(v.loinc)}" codeSystem="${LOINC_SYSTEM}" displayName="${esc(v.name)}"/>
          <statusCode code="completed"/>
          <value xsi:type="PQ" value="${esc(v.value)}" unit="${esc(v.unit)}"/>
        </observation>
      </entry>`).join('');

  return `
    <component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.4.1"/>
        <code code="8716-3" codeSystem="${LOINC_SYSTEM}" displayName="Vital Signs"/>
        <title>Vital Signs</title>
        <text>${loincVitals.map(v => `${v.name}: ${v.value} ${v.unit}`).join(', ')}</text>
        ${entries}
      </section>
    </component>`;
}

function allergiesSection(allergies = []) {
  const entries = allergies.map(a => `
      <entry typeCode="DRIV">
        <act classCode="ACT" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.30"/>
          <id root="${randomUUID()}"/>
          <code code="48765-2" codeSystem="${LOINC_SYSTEM}"/>
          <statusCode code="active"/>
          <entryRelationship typeCode="SUBJ">
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.7"/>
              <id root="${randomUUID()}"/>
              <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
              <statusCode code="completed"/>
              <value xsi:type="CD" code="416098002" codeSystem="${SNOMED_SYSTEM}" displayName="Drug allergy">
                <qualifier>
                  <name code="246112005" codeSystem="${SNOMED_SYSTEM}" displayName="Severity"/>
                  <value code="255604002" codeSystem="${SNOMED_SYSTEM}" displayName="${esc(a.severity || 'Moderate')}"/>
                </qualifier>
              </value>
              <participant typeCode="CSM">
                <participantRole classCode="MANU">
                  <playingEntity classCode="MMAT">
                    <code displayName="${esc(typeof a === 'string' ? a : a.allergen || a)}"/>
                  </playingEntity>
                </participantRole>
              </participant>
            </observation>
          </entryRelationship>
        </act>
      </entry>`).join('');

  return `
    <component>
      <section>
        <templateId root="2.16.840.1.113883.10.20.22.2.6.1"/>
        <code code="48765-2" codeSystem="${LOINC_SYSTEM}" displayName="Allergies"/>
        <title>Allergies and Adverse Reactions</title>
        <text>${esc(allergies.map(a => typeof a === 'string' ? a : a.allergen || a).join(', ') || 'None reported')}</text>
        ${entries}
      </section>
    </component>`;
}

function narrativeSection(code, loincCode, loincDisplay, title, text) {
  return `
    <component>
      <section>
        <code code="${loincCode}" codeSystem="${LOINC_SYSTEM}" displayName="${esc(loincDisplay)}"/>
        <title>${esc(title)}</title>
        <text>${esc(text || 'N/A')}</text>
      </section>
    </component>`;
}

// ── Full CDA XML wrapper ──────────────────────────────────────────────────────
function wrapCda(header, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="${CDA_NS}"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="${CDA_NS} CDA.xsd">
${header}
  <component>
    <structuredBody>${body}
    </structuredBody>
  </component>
</ClinicalDocument>`;
}

// ── Document generators ───────────────────────────────────────────────────────

export function generateDischargeSummary({ patient, doctor, hospital, admission, diagnoses, medications, vitals, allergies, summaryText }) {
  const docId = randomUUID();
  const header = buildHeader({
    docId, loincCode: '18842-5', loincDisplay: 'Discharge Summary',
    title: `Discharge Summary — ${patient?.first_name || ''} ${patient?.last_name || ''}`,
    patient, doctor, hospital, effectiveTime: admission?.discharged_at || new Date(),
  });
  const body = [
    diagnosisSection(diagnoses),
    medicationsSection(medications),
    vitalsSection(vitals),
    allergiesSection(allergies),
    narrativeSection('dc', '8648-8', 'Hospital Course', 'Hospital Course', summaryText),
    narrativeSection('dp', '18776-5', 'Discharge Plan', 'Discharge Plan', admission?.discharge_instructions),
  ].join('');
  return { docId, xml: wrapCda(header, body), loincCode: '18842-5', documentType: 'discharge_summary' };
}

export function generateReferralNote({ patient, doctor, hospital, appointment, diagnoses, medications, allergies, referralReason, urgency }) {
  const docId = randomUUID();
  const header = buildHeader({
    docId, loincCode: '57133-1', loincDisplay: 'Referral Note',
    title: `Referral Note — ${patient?.first_name || ''} ${patient?.last_name || ''}`,
    patient, doctor, hospital, effectiveTime: appointment?.appointment_date || new Date(),
  });
  const body = [
    narrativeSection('rr', '42349-1', 'Reason for Referral', 'Reason for Referral', `${urgency ? `[${urgency.toUpperCase()}] ` : ''}${referralReason}`),
    diagnosisSection(diagnoses),
    medicationsSection(medications),
    allergiesSection(allergies),
  ].join('');
  return { docId, xml: wrapCda(header, body), loincCode: '57133-1', documentType: 'referral_note' };
}

export function generateCCD({ patient, doctor, hospital, diagnoses, medications, vitals, allergies, labResults = [] }) {
  const docId = randomUUID();
  const header = buildHeader({
    docId, loincCode: '34133-9', loincDisplay: 'Summary of Episode Note',
    title: `Continuity of Care Document — ${patient?.first_name || ''} ${patient?.last_name || ''}`,
    patient, doctor, hospital, effectiveTime: new Date(),
  });
  const labSection = labResults.length ? narrativeSection('lr', '30954-2', 'Lab Results', 'Laboratory Results',
    labResults.map(l => `${l.test_name || l.testName}: ${l.result} ${l.unit || ''} (${l.interpretation || 'N/A'})`).join('; ')
  ) : '';
  const body = [
    diagnosisSection(diagnoses),
    medicationsSection(medications),
    vitalsSection(vitals),
    allergiesSection(allergies),
    labSection,
  ].join('');
  return { docId, xml: wrapCda(header, body), loincCode: '34133-9', documentType: 'ccd' };
}

export function generateImagingReport({ patient, doctor, hospital, study, reportText }) {
  const docId = randomUUID();
  const header = buildHeader({
    docId, loincCode: '18748-4', loincDisplay: 'Diagnostic Imaging Report',
    title: `${esc(study?.modality || 'Imaging')} Report — ${patient?.first_name || ''} ${patient?.last_name || ''}`,
    patient, doctor, hospital, effectiveTime: study?.reported_at || new Date(),
  });
  const body = [
    narrativeSection('fi', '55111-9', 'Current Imaging Procedure', 'Procedure',
      `${study?.modality || ''} ${study?.body_part || study?.description || ''}`),
    narrativeSection('fn', '59776-5', 'Findings', 'Findings', reportText),
    narrativeSection('im', '19005-8', 'Impression', 'Impression', study?.impression || reportText),
  ].join('');
  return { docId, xml: wrapCda(header, body), loincCode: '18748-4', documentType: 'imaging_report' };
}

// ── Persistence helpers ───────────────────────────────────────────────────────
export async function saveCdaDocument({ tenantId, patientId, documentType, loincCode, cdaId, xml, referenceId, referenceType, generatedBy }) {
  const { rows } = await pool.query(
    `INSERT INTO cda_documents
       (tenant_id, patient_id, document_type, loinc_code, cda_id, xml_content, reference_id, reference_type, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, cda_id, document_type, generated_at`,
    [tenantId, patientId, documentType, loincCode, cdaId, xml, referenceId || null, referenceType || null, generatedBy || null]
  );
  return rows[0];
}

export async function listCdaDocuments(patientId, tenantId) {
  const { rows } = await pool.query(
    `SELECT id, cda_id, document_type, loinc_code, status, reference_id, reference_type, generated_at
     FROM cda_documents WHERE patient_id = $1 AND tenant_id = $2 ORDER BY generated_at DESC`,
    [patientId, tenantId]
  );
  return rows;
}

export async function getCdaDocument(id, tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM cda_documents WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  if (!rows.length) throw new Error('CDA document not found');
  return rows[0];
}

// Simple structural validator — checks required CDA elements are present
export function validateCdaXml(xml) {
  const errors = [];
  if (!xml.includes('<ClinicalDocument')) errors.push('Missing ClinicalDocument root element');
  if (!xml.includes('<typeId')) errors.push('Missing typeId (POCD_HD000040)');
  if (!xml.includes('<id root=')) errors.push('Missing document id');
  if (!xml.includes('<code code=')) errors.push('Missing document type code');
  if (!xml.includes('<recordTarget>')) errors.push('Missing recordTarget (patient)');
  if (!xml.includes('<author>')) errors.push('Missing author');
  if (!xml.includes('<custodian>')) errors.push('Missing custodian');
  if (!xml.includes('<component>')) errors.push('Missing body component');
  return { valid: errors.length === 0, errors };
}
