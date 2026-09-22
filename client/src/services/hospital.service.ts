/**
 * Hospital API Service
 * Centralized service for all hospital-related API calls
 * Maps frontend actions to backend /api/hospital/practice endpoints
 */

import api from '@/lib/api';
import {
  INSURANCE_POLICY_CATEGORIES,
  DEFAULT_INSURANCE_POLICY_CATEGORY,
  type InsurancePolicyCategory
} from '@/constants/insurancePolicyCategories';

const BASE_URL = '/api/hospital/practice';

export interface HospitalHeaders {
  Authorization: string;
}

/**
 * Get authorization headers for hospital requests
 */
export const getHospitalHeaders = (): HospitalHeaders => {
  const token = localStorage.getItem('hospitalToken') || localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`
  };
};

const ALLOWED_POLICY_CATEGORY_SET = new Set(
  INSURANCE_POLICY_CATEGORIES.map((category) => category.value)
);

const normalizePolicyCategory = (value?: string): InsurancePolicyCategory => {
  const candidate = String(value || '').trim();
  if (ALLOWED_POLICY_CATEGORY_SET.has(candidate)) {
    return candidate as InsurancePolicyCategory;
  }

  throw new Error(
    `Invalid policy category '${candidate || 'empty'}'. Allowed values: ${INSURANCE_POLICY_CATEGORIES.map((category) => category.value).join(', ')}`
  );
};

// ============================================================================
// APPOINTMENTS
// ============================================================================

export const appointmentService = {
  /**
   * Get all appointments
   */
  getAll: async (params?: { status?: string; date?: string; upcoming?: boolean }) => {
    const response = await api.get(`${BASE_URL}/appointments`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create new appointment
   */
  create: async (data: any) => {
    const response = await api.post(`${BASE_URL}/appointments`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Update appointment
   */
  update: async (id: string | number, data: any) => {
    const response = await api.patch(`${BASE_URL}/appointments/${id}`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Delete appointment
   */
  delete: async (id: string | number) => {
    const response = await api.delete(`${BASE_URL}/appointments/${id}`, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// MEDICAL RECORDS (MRD)
// ============================================================================

export const medicalRecordService = {
  /**
   * Get all medical records
   */
  getAll: async (params?: { patientId?: number | string; doctorId?: number | string; recordType?: string }) => {
    const response = await api.get(`${BASE_URL}/medical-records`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create new medical record
   */
  create: async (data: {
    patientId: number;
    doctorId: number;
    appointmentId?: number;
    diagnosis: string;
    treatment: string;
    symptoms?: string;
    vitalSigns?: any;
    prescriptions?: any;
    recordType?: string;
    recordDate?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/medical-records`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Update medical record
   */
  update: async (id: string | number, data: any) => {
    const response = await api.patch(`${BASE_URL}/medical-records/${id}`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// EHR (Electronic Health Records)
// ============================================================================

export const ehrService = {
  /**
   * Get EHR for patient
   */
  getByPatient: async (patientId: number | string) => {
    const response = await api.get(`${BASE_URL}/ehr/${patientId}`, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create EHR record
   */
  create: async (data: {
    patientId: number | string;
    height?: number;
    weight?: number;
    bloodType?: string;
    allergies?: any;
    chronicDiseases?: any;
    medications?: any;
    emergencyContact?: any;
    insuranceDetails?: any;
    recordType?: string;
    content?: any;
    metadata?: any;
  }) => {
    const payload = {
      patientId: data.patientId,
      height: data.height ?? data.content?.height,
      weight: data.weight ?? data.content?.weight,
      bloodType: data.bloodType ?? data.content?.bloodType,
      allergies: data.allergies ?? data.content?.allergies,
      chronicDiseases: data.chronicDiseases ?? data.content?.chronicDiseases,
      medications: data.medications ?? data.content?.medications,
      emergencyContact: data.emergencyContact ?? data.content?.emergencyContact,
      insuranceDetails: data.insuranceDetails ?? data.content?.insuranceDetails,
    };
    const response = await api.post(`${BASE_URL}/ehr`, payload, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Update EHR record
   */
  update: async (patientId: number | string, data: any) => {
    const response = await api.patch(`${BASE_URL}/ehr/${patientId}`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// VITAL SIGNS
// ============================================================================

export const vitalSignsService = {
  /**
   * Get vital signs
   */
  getAll: async (params?: { patientId?: number | string; from?: string; to?: string; fromDate?: string; toDate?: string; latest?: boolean }) => {
    const queryParams = {
      patientId: params?.patientId,
      fromDate: params?.fromDate ?? params?.from,
      toDate: params?.toDate ?? params?.to,
      latest: params?.latest,
    };
    const response = await api.get(`${BASE_URL}/vitals`, {
      params: queryParams,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create vital signs record
   */
  create: async (data: {
    patientId: number | string;
    systolic?: number;
    diastolic?: number;
    temperature?: number;
    bloodPressure?: string;
    heartRate?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
    height?: number;
    bmi?: number;
    recordedAt?: string;
    recordedBy?: string | number;
    notes?: string;
  }) => {
    let systolic = data.systolic;
    let diastolic = data.diastolic;
    if ((systolic === undefined || diastolic === undefined) && data.bloodPressure) {
      const [sys, dia] = String(data.bloodPressure).split('/').map((v) => parseInt(v.trim(), 10));
      if (!Number.isNaN(sys)) systolic = sys;
      if (!Number.isNaN(dia)) diastolic = dia;
    }
    const payload = {
      patientId: data.patientId,
      systolic,
      diastolic,
      temperature: data.temperature,
      heartRate: data.heartRate,
      respiratoryRate: data.respiratoryRate,
      oxygenSaturation: data.oxygenSaturation,
      weight: data.weight,
      height: data.height,
      notes: data.notes,
      recordedBy: data.recordedBy,
    };
    const response = await api.post(`${BASE_URL}/vitals`, payload, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// INSURANCE & BILLING
// ============================================================================

export const insuranceService = {
  /**
   * Get insurance claims
   */
  getClaims: async (params?: { status?: string; from?: string; to?: string }) => {
    const response = await api.get(`${BASE_URL}/insurance/claims`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create insurance claim
   */
  createClaim: async (data: {
    patientId: number;
    policyId: number;
    appointmentId?: number;
    claimAmount: number;
    claimType: string;
    diagnosis: string;
    treatmentDetails: string;
    documents?: any[];
  }) => {
    const response = await api.post(`${BASE_URL}/insurance/claims`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Update claim
   */
  updateClaim: async (id: string | number, data: any) => {
    const response = await api.patch(`${BASE_URL}/insurance/claims/${id}`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Get insurance policies
   */
  getPolicies: async (params?: { patientId?: number }) => {
    const response = await api.get(`${BASE_URL}/insurance/policies`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create insurance policy
   */
  createPolicy: async (data: {
    patientId: number;
    policyNumber: string;
    insuranceProvider: string;
    planName?: string;
    policyType?: string;
    coverageAmount: number;
    deductible?: number;
    copay?: number;
    validFrom: string;
    validUpto?: string;
    eCardAvailable?: boolean;
  }) => {
    const category = normalizePolicyCategory(data.policyType || data.planName || DEFAULT_INSURANCE_POLICY_CATEGORY);

    const payload = {
      ...data,
      planName: category,
      policyType: category
    };

    const response = await api.post(`${BASE_URL}/insurance/policies`, payload, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// DISCHARGE SUMMARIES
// ============================================================================

export const dischargeSummaryService = {
  /**
   * Create discharge summary
   */
  create: async (data: {
    patientId: number;
    admissionDate: string;
    dischargeDate: string;
    diagnosis: string;
    treatment: string;
    followUpInstructions?: string;
    medications?: any[];
    doctorId: number;
  }) => {
    const response = await api.post(`${BASE_URL}/discharge-summaries`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Submit discharge summary
   */
  submit: async (id: string | number, data: any) => {
    const response = await api.post(`${BASE_URL}/discharge-summaries/submit`, {
      id,
      ...data
    }, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// LAB ORDERS
// ============================================================================

export const labOrderService = {
  /**
   * Get lab orders
   */
  getAll: async (params?: { status?: string; patientId?: number | string; fromDate?: string; toDate?: string }) => {
    const response = await api.get(`${BASE_URL}/labs`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create lab order
   */
  create: async (data: {
    patientId: number | string;
    doctorId?: number | string;
    testType?: string;
    testName?: string;
    tests?: any[];
    priority?: string;
    notes?: string;
    instructions?: string;
    totalAmount?: number;
  }) => {
    const headers = { headers: getHospitalHeaders() };
    if (Array.isArray(data.tests) && data.tests.length > 0) {
      const response = await api.post(`${BASE_URL}/lab-orders`, {
        patientId: data.patientId,
        tests: data.tests,
        priority: data.priority,
        notes: data.notes ?? data.instructions,
        totalAmount: data.totalAmount,
      }, headers);
      return response.data;
    }

    const response = await api.post(`${BASE_URL}/labs`, {
      patientId: data.patientId,
      doctorId: data.doctorId ?? 'unassigned',
      testType: data.testType ?? data.testName ?? 'Lab Test',
      testCategory: 'general',
      priority: data.priority ?? 'normal',
      notes: data.notes ?? data.instructions,
    }, headers);
    return response.data;
  }
};

// ============================================================================
// ORDER STATUS (EMR → Lab / Pharmacy)
// ============================================================================

export const orderStatusService = {
  getForPatient: async (patientId: number | string) => {
    const response = await api.get(`${BASE_URL}/order-status`, {
      params: { patientId },
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// IMAGING ORDERS
// ============================================================================

export const imagingOrderService = {
  /**
   * Create imaging order
   */
  create: async (data: {
    patientId: number | string;
    doctorId?: number | string;
    imagingType?: string;
    bodyPart?: string;
    tests?: any[];
    priority?: string;
    contrast?: string;
    clinicalIndication?: string;
    notes?: string;
    totalAmount?: number;
  }) => {
    const tests = Array.isArray(data.tests) && data.tests.length > 0
      ? data.tests
      : [{
          type: data.imagingType ?? 'X-Ray',
          bodyPart: data.bodyPart ?? 'General',
          contrast: data.contrast ?? 'no',
          indication: data.clinicalIndication ?? data.notes ?? '',
        }];

    const response = await api.post(`${BASE_URL}/imaging-orders`, {
      patientId: data.patientId,
      tests,
      priority: data.priority,
      notes: data.notes ?? data.clinicalIndication,
      totalAmount: data.totalAmount,
    }, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// PRESCRIPTIONS
// ============================================================================

export const prescriptionService = {
  /**
   * Create prescription
   */
  create: async (data: {
    patientId: number | string;
    doctorId?: number | string;
    medications: any[];
    diagnosis?: string;
    instructions?: string;
    notes?: string;
    // This endpoint is a safety-gated issuing path (WP-1.2) — a documented allergy/interaction in enforce mode
    // returns 409 SAFETY_BLOCK unless the caller re-sends with an acknowledged override.
    safetyOverride?: { reason: string; acknowledgedCodes: string[] };
  }) => {
    const payload = {
      patientId: data.patientId,
      doctorId: data.doctorId ?? 'unassigned',
      medications: data.medications,
      diagnosis: data.diagnosis,
      notes: data.notes ?? data.instructions,
      ...(data.safetyOverride ? { safetyOverride: data.safetyOverride } : {}),
    };
    const response = await api.post(`${BASE_URL}/prescriptions`, payload, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// PROCEDURE SCHEDULER
// ============================================================================

export const procedureService = {
  /**
   * Schedule procedure
   */
  schedule: async (data: {
    patientId: number | string;
    doctorId?: number | string;
    procedureId?: string | number;
    procedureName?: string;
    scheduledDate: string;
    scheduledTime: string;
    priority?: string;
    anesthesiaType?: string;
    room?: string;
    notes?: string;
    duration?: number;
    specialInstructions?: string;
  }) => {
    const payload = {
      procedureId: data.procedureId ?? data.procedureName ?? 'custom-procedure',
      patientId: data.patientId,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      priority: data.priority,
      anesthesiaType: data.anesthesiaType,
      room: data.room,
      notes: data.notes ?? data.specialInstructions,
      estimatedDuration: data.duration,
    };
    const response = await api.post(`${BASE_URL}/procedures/schedule`, payload, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// IP SHEETS
// ============================================================================

export const ipSheetService = {
  /**
   * Create IP sheet
   */
  create: async (data: {
    patientId: number | string;
    bedId: number;
    admissionDate: string;
    wardType: string;
    primaryDoctor: number;
  }) => {
    const response = await api.post(`${BASE_URL}/ip-sheets`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// BRANCHES & CLINICS
// ============================================================================

export const branchService = {
  /**
   * Create branch
   */
  create: async (data: {
    branchName: string;
    location: string;
    contactNumber: string;
    branchType: string;
  }) => {
    const response = await api.post(`${BASE_URL}/branches`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

export const clinicService = {
  /**
   * Create clinic
   */
  create: async (data: {
    clinicName: string;
    specialty: string;
    location: string;
    timings: string;
  }) => {
    const response = await api.post(`${BASE_URL}/clinics`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// AMBULANCE
// ============================================================================

export const ambulanceService = {
  /**
   * Add vehicle
   */
  addVehicle: async (data: {
    vehicleNumber: string;
    vehicleType: string;
    driverName: string;
    driverContact: string;
    availability: string;
  }) => {
    const response = await api.post(`${BASE_URL}/ambulances/vehicles`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// STAFF MANAGEMENT
// ============================================================================

export const staffService = {
  /**
   * Get all staff
   */
  getAll: async (params?: { role?: string; department?: string }) => {
    const response = await api.get(`${BASE_URL}/staff`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Add staff
   */
  create: async (data: {
    name: string;
    email: string;
    phone: string;
    role: string;
    department: string;
    qualification?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/staff`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Update staff
   */
  update: async (id: string | number, data: any) => {
    const response = await api.patch(`${BASE_URL}/staff/${id}`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Delete staff
   */
  delete: async (id: string | number) => {
    const response = await api.delete(`${BASE_URL}/staff/${id}`, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// PATIENTS
// ============================================================================

export const patientService = {
  /**
   * Get all patients
   */
  getAll: async (params?: { search?: string; status?: string }) => {
    const response = await api.get(`${BASE_URL}/patients`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create patient
   */
  create: async (data: {
    name: string;
    email?: string;
    phone: string;
    dateOfBirth: string;
    gender: string;
    address?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/patients`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Update patient
   */
  update: async (id: string | number, data: any) => {
    const response = await api.patch(`${BASE_URL}/patients/${id}`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// ============================================================================
// BED MANAGEMENT
// ============================================================================

export const bedService = {
  /**
   * Get all beds
   */
  getAll: async (params?: { ward?: string; status?: string }) => {
    const response = await api.get(`${BASE_URL}/beds`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create bed
   */
  create: async (data: {
    bedNumber: string;
    ward: string;
    bedType: string;
    status: string;
  }) => {
    const response = await api.post(`${BASE_URL}/beds`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Update bed
   */
  update: async (id: string | number, data: any) => {
    const response = await api.patch(`${BASE_URL}/beds/${id}`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Delete bed
   */
  delete: async (id: string | number) => {
    const response = await api.delete(`${BASE_URL}/beds/${id}`, {
      headers: getHospitalHeaders()
    });
    return response.data;
  }
};

// Export all services
export default {
  appointments: appointmentService,
  medicalRecords: medicalRecordService,
  ehr: ehrService,
  vitalSigns: vitalSignsService,
  insurance: insuranceService,
  dischargeSummary: dischargeSummaryService,
  labOrders: labOrderService,
  imagingOrders: imagingOrderService,
  prescriptions: prescriptionService,
  orderStatus: orderStatusService,
  procedures: procedureService,
  ipSheets: ipSheetService,
  branches: branchService,
  clinics: clinicService,
  ambulance: ambulanceService,
  staff: staffService,
  patients: patientService,
  beds: bedService
};
