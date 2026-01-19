/**
 * Hospital API Service
 * Centralized service for all hospital-related API calls
 * Maps frontend actions to backend /api/hospital/practice endpoints
 */

import api from '@/lib/api';

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
  getAll: async (params?: { patientId?: number; doctorId?: number; recordType?: string }) => {
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
  getByPatient: async (patientId: number) => {
    const response = await api.get(`${BASE_URL}/ehr/${patientId}`, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create EHR record
   */
  create: async (data: {
    patientId: number;
    recordType: string;
    content: any;
    metadata?: any;
  }) => {
    const response = await api.post(`${BASE_URL}/ehr`, data, {
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Update EHR record
   */
  update: async (patientId: number, data: any) => {
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
  getAll: async (params?: { patientId?: number; from?: string; to?: string }) => {
    const response = await api.get(`${BASE_URL}/vitals`, {
      params,
      headers: getHospitalHeaders()
    });
    return response.data;
  },

  /**
   * Create vital signs record
   */
  create: async (data: {
    patientId: number;
    temperature?: number;
    bloodPressure?: string;
    heartRate?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
    height?: number;
    bmi?: number;
    recordedAt?: string;
    recordedBy?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/vitals`, data, {
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
  createPolicy: async (data: any) => {
    const response = await api.post(`${BASE_URL}/insurance/policies`, data, {
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
  getAll: async (params?: { status?: string; patientId?: number }) => {
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
    patientId: number;
    doctorId: number;
    testType: string;
    testName: string;
    priority?: string;
    instructions?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/lab-orders`, data, {
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
    patientId: number;
    doctorId: number;
    imagingType: string;
    bodyPart: string;
    priority?: string;
    clinicalIndication?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/imaging-orders`, data, {
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
    patientId: number;
    doctorId: number;
    medications: any[];
    diagnosis?: string;
    instructions?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/prescriptions`, data, {
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
    patientId: number;
    doctorId: number;
    procedureName: string;
    scheduledDate: string;
    scheduledTime: string;
    duration?: number;
    specialInstructions?: string;
  }) => {
    const response = await api.post(`${BASE_URL}/procedures/schedule`, data, {
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
    patientId: number;
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
  procedures: procedureService,
  ipSheets: ipSheetService,
  branches: branchService,
  clinics: clinicService,
  ambulance: ambulanceService,
  staff: staffService,
  patients: patientService,
  beds: bedService
};
