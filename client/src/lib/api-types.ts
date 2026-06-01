/**
 * Typed API Adapters — patient finance module
 * =============================================
 * Centralises all API payload shapes and response types for the
 * LabTests, SmartBenefitsHub, ClaimsExpress, MyInsurancePolicies,
 * NetworkHospitals, and MyReports pages.
 *
 * Usage:
 *   import { labApi, claimsApi, benefitsApi } from '@/lib/api-types';
 *   const tests = await labApi.getMyTests();          // → LabTestOrder[]
 *   const labs  = await labApi.searchLabs({ city });  // → LabProvider[]
 */

import api from '@/lib/api';

// ─── Shared primitives ────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page:  number;
  limit: number;
}

// ─── Lab Tests ────────────────────────────────────────────────────────────────

export type LabTestStatus =
  | 'pending' | 'pending_confirmation' | 'confirmed'
  | 'sample_collected' | 'processing' | 'completed' | 'cancelled';

export interface LabTestOrder {
  id:               string;
  testName:         string;
  testType:         string;
  status:           LabTestStatus;
  labName?:         string;
  labAddress?:      string;
  reportUrl?:       string;
  results?:         string;
  notes?:           string;
  urgency?:         string;
  hospitalId?:      number;
  createdAt:        string;
  expectedCompletionDate?: string;
}

export interface LabProvider {
  id:           number;
  name:         string;
  address:      { city: string; state: string; street: string; zipCode: string; coordinates?: { lat: number; lng: number } };
  services:     Array<{ name: string; category: string }>;
  rating:       string;
  accreditation: string;
  facilities:   string[];
}

export interface LabTestCheckoutPayload {
  tests:           Array<{ id: string; name: string; price: string }>;
  labId:           string;
  appointmentDate: string;
  collectionType:  'home' | 'lab';
  notes?:          string;
}

export interface RazorpayOrderResponse {
  orderId:   string;
  amount:    number;
  currency:  string;
  keyId:     string;
}

export const labApi = {
  getMyTests: () =>
    api.get<ApiResponse<{ labTests: LabTestOrder[] }>>('/lab-tests', { params: { limit: 100 } })
      .then(r => (r.data?.labTests || r.data?.data || []) as LabTestOrder[]),

  searchLabs: (params: { city?: string; pincode?: string; limit?: number }) =>
    api.get<ApiResponse<{ labs: LabProvider[] }>>('/labs', { params: { limit: 100, ...params } })
      .then(r => (r.data?.labs ?? []) as LabProvider[]),

  getCorpLabs: () =>
    api.get<ApiResponse<{ isCorporateEmployee: boolean; corporateName: string; labs: LabProvider[] }>>('/employee/my-labs')
      .then(r => r.data),

  createOrder: (payload: LabTestCheckoutPayload) =>
    api.post<ApiResponse<RazorpayOrderResponse>>('/lab-tests/checkout', payload)
      .then(r => r.data),

  verifyPayment: (data: { orderId: string; paymentId: string; signature: string; labTestIds: string[] }) =>
    api.post<ApiResponse<{ confirmed: boolean }>>('/lab-tests/payment/verify', data)
      .then(r => r.data),
};

// ─── Insurance Policies ───────────────────────────────────────────────────────

export type PolicyType = 'health' | 'life' | 'motor' | 'travel' | 'accident' | 'other';
export type PremiumFrequency = 'annual' | 'semi-annual' | 'quarterly' | 'monthly';

export interface InsurancePolicy {
  id:              string;
  insurerName:     string;
  policyNumber:    string;
  policyType:      PolicyType;
  coverageAmount:  number;
  premiumAmount?:  number;
  premiumFrequency?: PremiumFrequency;
  startDate?:      string;
  endDate?:        string;
  membersName?:    string;
  notes?:          string;
  documentUrl?:    string;
  createdAt:       string;
}

export interface OcrExtractedPolicy {
  insurerName?:     string | null;
  policyNumber?:    string | null;
  policyType?:      PolicyType | null;
  coverageAmount?:  string | null;
  premiumAmount?:   string | null;
  premiumFrequency?: PremiumFrequency | null;
  startDate?:       string | null;
  endDate?:         string | null;
  membersName?:     string | null;
  notes?:           string | null;
}

export const insuranceApi = {
  getMyPolicies: () =>
    api.get<ApiResponse<{ policies: InsurancePolicy[] }>>('/users/my-insurances')
      .then(r => (r.data?.policies ?? []) as InsurancePolicy[]),

  addPolicy: (fd: FormData) =>
    api.post<ApiResponse<{ policy: InsurancePolicy }>>('/users/my-insurances', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  deletePolicy: (id: string) =>
    api.delete<ApiResponse<null>>(`/users/my-insurances/${id}`).then(r => r.data),

  ocrExtract: (file: File) => {
    const fd = new FormData();
    fd.append('document', file);
    return api.post<ApiResponse<{ fields: OcrExtractedPolicy; confidence: string }>>('/api/ai/vision/extract-insurance', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
};

// ─── Benefits & Claims ────────────────────────────────────────────────────────

export interface BenefitPlan {
  id:           string;
  name:         string;
  type:         string;
  provider:     string;
  sumInsured:   number;
  utilized:     number;
  remaining:    number;
  premium:      number;
  startDate:    string;
  endDate:      string;
  status:       'active' | 'expired' | 'pending';
  policyNumber: string;
  benefits:     string[];
  eCardAvailable: boolean;
  cashlessNetwork: number;
}

export type ClaimStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'settled';

export interface Claim {
  id:           string;
  claimNumber:  string;
  type:         string;
  amount:       number;
  status:       ClaimStatus;
  submittedDate: string;
  processedDate?: string;
  hospital:     string;
  description:  string;
  documents?:   string[];
}

export const benefitsApi = {
  getPlans: () =>
    api.get<ApiResponse<{ plans: BenefitPlan[] }>>('/employee/benefits').catch(() => null)
      .then(r => (r?.data?.plans ?? []) as BenefitPlan[]),

  getClaims: () =>
    api.get<ApiResponse<{ claims: Claim[] }>>('/employee/claims').catch(() => null)
      .then(r => (r?.data?.claims ?? []) as Claim[]),

  submitClaim: (fd: FormData) =>
    api.post<ApiResponse<{ claim: Claim }>>('/employee/claims', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
};

// ─── Reports ──────────────────────────────────────────────────────────────────

export type ReportType = 'lab' | 'imaging' | 'prescription' | 'discharge' | 'other';

export interface PatientReport {
  id:            string;
  reportType:    ReportType;
  title:         string;
  description?:  string;
  fileUrl:       string;
  fileSize?:     number;
  uploadedAt:    string;
  doctorName?:   string;
  hospitalName?: string;
  tags?:         string[];
}

export const reportsApi = {
  getMyReports: (params?: { type?: ReportType; limit?: number }) =>
    api.get<ApiResponse<{ reports: PatientReport[] }>>('/patient/reports', { params })
      .then(r => (r.data?.reports ?? []) as PatientReport[]),

  uploadReport: (fd: FormData) =>
    api.post<ApiResponse<{ report: PatientReport }>>('/patient/reports/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  deleteReport: (id: string) =>
    api.delete<ApiResponse<null>>(`/patient/reports/${id}`).then(r => r.data),

  getDownloadUrl: (id: string): string =>
    `${import.meta.env.VITE_API_URL ?? ''}/patient/reports/${id}/download`,
};
