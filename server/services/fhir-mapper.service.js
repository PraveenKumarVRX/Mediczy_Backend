/**
 * FHIR R4 Resource Mapper Service
 * 
 * Maps Mediczy database models to FHIR R4 JSON resources.
 * Supports: Patient, Encounter, Condition, MedicationRequest,
 * DiagnosticReport, Observation, AllergyIntolerance, Bundle.
 * 
 * Ref: https://www.hl7.org/fhir/r4/
 */

class FHIRMapper {
  constructor() {
    this.baseUrl = process.env.FHIR_BASE_URL || 'https://api.mediqzy.com/api/fhir/r4';
  }

  // ── Patient ────────────────────────────────────────────────
  mapPatient(patient) {
    return {
      resourceType: 'Patient',
      id: String(patient.id),
      meta: { lastUpdated: patient.updated_at || patient.updatedAt || new Date().toISOString() },
      identifier: [
        ...(patient.abha_id ? [{ system: 'https://healthid.abdm.gov.in', value: patient.abha_id }] : []),
        { system: `${this.baseUrl}/identifier/mrn`, value: String(patient.id) }
      ],
      active: patient.status !== 'inactive',
      name: [{
        use: 'official',
        given: [patient.first_name || patient.firstName || ''].filter(Boolean),
        family: patient.last_name || patient.lastName || ''
      }],
      telecom: [
        ...(patient.phone ? [{ system: 'phone', value: patient.phone, use: 'mobile' }] : []),
        ...(patient.email ? [{ system: 'email', value: patient.email }] : [])
      ],
      gender: this.mapGender(patient.gender),
      birthDate: patient.date_of_birth || patient.dob || undefined,
      address: patient.address ? [{
        use: 'home',
        line: [patient.address.line1, patient.address.line2].filter(Boolean),
        city: patient.address.city,
        state: patient.address.state,
        postalCode: patient.address.pincode || patient.address.zip,
        country: patient.address.country || 'IN'
      }] : []
    };
  }

  // ── Encounter ──────────────────────────────────────────────
  mapEncounter(appointment, patient) {
    return {
      resourceType: 'Encounter',
      id: String(appointment.id),
      meta: { lastUpdated: appointment.updated_at || new Date().toISOString() },
      status: this.mapEncounterStatus(appointment.status),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: appointment.consultation_type === 'video' ? 'VR' : 'AMB',
        display: appointment.consultation_type === 'video' ? 'Virtual' : 'Ambulatory'
      },
      subject: { reference: `Patient/${appointment.patient_id}` },
      participant: [{
        individual: { reference: `Practitioner/${appointment.doctor_id}` }
      }],
      period: {
        start: appointment.appointment_date || appointment.start_time,
        end: appointment.end_time || undefined
      },
      reasonCode: appointment.reason ? [{
        text: appointment.reason
      }] : []
    };
  }

  // ── Condition (from ICD-10 diagnoses) ──────────────────────
  mapCondition(diagnosis, patientId) {
    return {
      resourceType: 'Condition',
      id: String(diagnosis.id || `cond-${Date.now()}`),
      meta: { lastUpdated: diagnosis.created_at || new Date().toISOString() },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }]
      },
      verificationStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }]
      },
      code: {
        coding: [
          ...(diagnosis.icd10_code ? [{
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: diagnosis.icd10_code,
            display: diagnosis.description || diagnosis.icd10_description
          }] : []),
          ...(diagnosis.snomed_code ? [{
            system: 'http://snomed.info/sct',
            code: diagnosis.snomed_code,
            display: diagnosis.snomed_display
          }] : [])
        ],
        text: diagnosis.description || diagnosis.diagnosis_text || ''
      },
      subject: { reference: `Patient/${patientId}` },
      recordedDate: diagnosis.created_at || diagnosis.date
    };
  }

  // ── MedicationRequest (from prescriptions) ─────────────────
  mapMedicationRequest(prescription, patientId) {
    return {
      resourceType: 'MedicationRequest',
      id: String(prescription.id),
      meta: { lastUpdated: prescription.updated_at || new Date().toISOString() },
      status: prescription.status === 'active' ? 'active' : 'completed',
      intent: 'order',
      medicationCodeableConcept: {
        text: prescription.medication_name || prescription.drug_name || prescription.medicine_name
      },
      subject: { reference: `Patient/${patientId}` },
      requester: { reference: `Practitioner/${prescription.doctor_id}` },
      dosageInstruction: [{
        text: prescription.dosage || prescription.instructions || '',
        timing: {
          code: { text: prescription.frequency || '' }
        },
        route: prescription.route ? {
          coding: [{ display: prescription.route }]
        } : undefined
      }],
      dispenseRequest: prescription.duration_days ? {
        expectedSupplyDuration: {
          value: prescription.duration_days,
          unit: 'days',
          system: 'http://unitsofmeasure.org',
          code: 'd'
        }
      } : undefined,
      authoredOn: prescription.created_at || prescription.date
    };
  }

  // ── DiagnosticReport (lab results) ─────────────────────────
  mapDiagnosticReport(labResult, patientId) {
    return {
      resourceType: 'DiagnosticReport',
      id: String(labResult.id),
      meta: { lastUpdated: labResult.updated_at || new Date().toISOString() },
      status: labResult.status === 'final' ? 'final' : 'preliminary',
      code: {
        text: labResult.test_name || labResult.report_type || 'Lab Report'
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: labResult.test_date || labResult.created_at,
      issued: labResult.created_at,
      result: labResult.observations ? labResult.observations.map((obs, i) => ({
        reference: `Observation/${labResult.id}-obs-${i}`
      })) : [],
      conclusion: labResult.conclusion || labResult.interpretation
    };
  }

  // ── Observation (vitals / lab values) ──────────────────────
  mapObservation(vital, patientId) {
    return {
      resourceType: 'Observation',
      id: String(vital.id || `obs-${Date.now()}`),
      meta: { lastUpdated: vital.updated_at || new Date().toISOString() },
      status: 'final',
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
          display: 'Vital Signs'
        }]
      }],
      code: {
        coding: this.getVitalCoding(vital.type || vital.name),
        text: vital.type || vital.name
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: vital.recorded_at || vital.created_at,
      valueQuantity: vital.value !== undefined ? {
        value: parseFloat(vital.value),
        unit: vital.unit || '',
        system: 'http://unitsofmeasure.org'
      } : undefined
    };
  }

  // ── AllergyIntolerance ─────────────────────────────────────
  mapAllergyIntolerance(allergy, patientId) {
    return {
      resourceType: 'AllergyIntolerance',
      id: String(allergy.id),
      meta: { lastUpdated: allergy.updated_at || new Date().toISOString() },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }]
      },
      type: allergy.type === 'intolerance' ? 'intolerance' : 'allergy',
      category: [allergy.category || 'medication'],
      criticality: allergy.severity === 'severe' ? 'high' : 'low',
      code: {
        text: allergy.substance || allergy.allergen || allergy.name
      },
      subject: { reference: `Patient/${patientId}` },
      recordedDate: allergy.created_at,
      reaction: allergy.reaction ? [{
        manifestation: [{ text: allergy.reaction }],
        severity: allergy.severity || 'moderate'
      }] : []
    };
  }

  // ── Bundle (collection of resources) ───────────────────────
  createBundle(resources, type = 'searchset') {
    return {
      resourceType: 'Bundle',
      type,
      total: resources.length,
      timestamp: new Date().toISOString(),
      entry: resources.map(resource => ({
        fullUrl: `${this.baseUrl}/${resource.resourceType}/${resource.id}`,
        resource
      }))
    };
  }

  // ── Helpers ────────────────────────────────────────────────
  mapGender(gender) {
    if (!gender) return 'unknown';
    const g = gender.toLowerCase();
    if (g === 'male' || g === 'm') return 'male';
    if (g === 'female' || g === 'f') return 'female';
    if (g === 'other') return 'other';
    return 'unknown';
  }

  mapEncounterStatus(status) {
    const map = {
      'scheduled': 'planned', 'confirmed': 'planned', 'in_progress': 'in-progress',
      'completed': 'finished', 'cancelled': 'cancelled', 'no_show': 'cancelled'
    };
    return map[status] || 'unknown';
  }

  getVitalCoding(type) {
    const codings = {
      'blood_pressure': [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure' }],
      'heart_rate': [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }],
      'temperature': [{ system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' }],
      'respiratory_rate': [{ system: 'http://loinc.org', code: '9279-1', display: 'Respiratory rate' }],
      'oxygen_saturation': [{ system: 'http://loinc.org', code: '2708-6', display: 'Oxygen saturation' }],
      'weight': [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }],
      'height': [{ system: 'http://loinc.org', code: '8302-2', display: 'Body height' }],
      'bmi': [{ system: 'http://loinc.org', code: '39156-5', display: 'BMI' }]
    };
    return codings[type?.toLowerCase()] || [{ display: type }];
  }
}

const fhirMapper = new FHIRMapper();
export default fhirMapper;
export { FHIRMapper };
