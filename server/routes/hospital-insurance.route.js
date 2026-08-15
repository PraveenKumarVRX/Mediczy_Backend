/**
 * Hospital Insurance Claims Dashboard Routes
 * IHX-like functionality for claims management
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { body, query, param } from 'express-validator';
import InsuranceClaim from '../models/postgres/insuranceClaim.model.postgres.js';
import PreAuthorization from '../models/postgres/preAuthorization.model.postgres.js';
import InsurancePortalWorkspace from '../models/postgres/insurancePortalWorkspace.model.postgres.js';
import InsurancePortalMessageThread from '../models/postgres/insurancePortalMessageThread.model.postgres.js';
import InsurancePortalNotification from '../models/postgres/insurancePortalNotification.model.postgres.js';
import { User } from '../models/index.js';
import { Op } from 'sequelize';
import pdfGenerator from '../services/pdf-generator.service.js';
import insuranceProvider from '../services/insurance-provider.service.js';
import tpaAggregator from '../services/tpa-aggregator.service.js';
import { validateClaimForSubmission } from '../services/claims-rules-engine.service.js';
import { extractClaimFields } from '../services/insurance-document-ai.service.js';
import { runPreDischargeAudit } from '../services/insurance-pre-discharge-audit.service.js';
import { draftAppealLetter, checkDocumentationGaps } from '../services/insurance-ai-copilot.service.js';
import ClaimDenial from '../models/postgres/claimDenial.model.postgres.js';
import denialService from '../services/denial-management.service.js';
import socketService from '../services/socket.service.js';
import cacheService from '../services/cache.service.js';
import { uploadToMinio } from '../services/minio-upload.service.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { notifyClaimStatusChange, generateStatusQrCode } from '../services/insurance-claim-notify.service.js';
import nhcxClient, { isNhcxConfigured } from '../services/nhcx-client.service.js';
import pgPool from '../db/pgPool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// InsuranceClaim.associate()/PreAuthorization.associate() declare a `patient`
// belongsTo(User), but nothing in the codebase ever calls .associate() —
// models/index.js has no central association-wiring step for either model
// (unlike Appointment/Doctor/etc., which get wired via
// userHierarchy.associations.js). Every `include: [{ model: User, as:
// 'patient' }]` in this file was therefore hitting an unregistered alias:
// either a hard crash ("User is not associated to ...") or, at call sites
// guarded with `Model.associations?.patient ? [...] : []`, a silent skip
// that always came back with no patient data. Registering it once here,
// at module load, makes every include in this file resolve correctly.
if (typeof InsuranceClaim?.belongsTo === 'function' && !InsuranceClaim.associations?.patient) {
  InsuranceClaim.belongsTo(User, { foreignKey: 'patientId', as: 'patient' });
}
if (typeof PreAuthorization?.belongsTo === 'function' && !PreAuthorization.associations?.patient) {
  PreAuthorization.belongsTo(User, { foreignKey: 'patientId', as: 'patient' });
}

const CLAIM_STATUS_ALIASES = {
  pa_draft: 'draft',
  claim_draft: 'draft',
  pa_query_pending: 'query',
  pa_query_3hrs: 'query',
  claim_query: 'query',
  pa_approved: 'approved',
  settlement: 'approved',
  settled: 'paid',
  awaiting: 'pending',
  discharge_today: 'pending',
  discharge_tomorrow: 'pending',
  discharge_pending: 'pending'
};

const PORTAL_SECTION_FIELD_MAP = {
  'payer-management': 'payerManagement',
  'hospital-profile': 'hospitalProfile',
  'settings': 'settings',
  'compliance/govt-schemes': 'govtSchemes',
  'compliance/nhcx': 'nhcx',
  'compliance/abdm': 'abdm',
  'compliance/tariff': 'tariff',
  'compliance/empanelment': 'empanelment',
};

const buildPortalId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getRelativeDate = ({ hours = 0, days = 0 }) => {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  date.setDate(date.getDate() - days);
  return date;
};

const resolvePortalScope = (req) => {
  const requestHospitalId = req.query.hospitalId || req.body?.hospitalId;
  const requestOrganizationId = req.query.organizationId || req.body?.organizationId;
  const hospitalId = String(req.user?.hospitalId || requestHospitalId || req.user?.organizationId || requestOrganizationId || 'default-hospital');
  const organizationId = String(req.user?.organizationId || requestOrganizationId || hospitalId);

  return {
    hospitalId,
    organizationId,
    userId: req.user?.id ? String(req.user.id) : null,
    senderName: req.user?.name || req.user?.fullName || req.user?.email || 'Hospital Team',
  };
};

const serializeModel = (model) => (model?.toJSON ? model.toJSON() : model);

// insurance_claims has row-level security keyed on organization_id/patient_id
// (see current_org_id()/current_app_user_id() Postgres functions). Those GUCs
// are transaction-local and are NOT set anywhere else in this file, so every
// query against InsuranceClaim below was silently matching zero rows on
// SELECT and hard-failing with "new row violates row-level security policy"
// on INSERT/UPDATE. withClaimsRls() opens one transaction per request, sets
// the context from the authenticated user via req.setSequelizeRlsContext(),
// runs the callback with that transaction, and commits/rolls back around it.
async function withClaimsRls(req, work) {
  const transaction = await postgresSequelize.transaction();
  try {
    await req.setSequelizeRlsContext?.(transaction);
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

const buildDefaultPayerManagement = () => ({
  payerEmails: [
    { id: 'payer-1', insurer: 'Star Health', primaryEmail: 'claims@starhealth.in', ccEmails: 'escalation@starhealth.in', type: 'claims', region: 'South' },
    { id: 'payer-2', insurer: 'Star Health', primaryEmail: 'preauth@starhealth.in', ccEmails: '', type: 'pre_auth', region: 'South' },
    { id: 'payer-3', insurer: 'ICICI Lombard', primaryEmail: 'health.claims@icicilombard.com', ccEmails: 'senior.claims@icicilombard.com', type: 'claims', region: 'West' },
    { id: 'payer-4', insurer: 'HDFC Ergo', primaryEmail: 'tpa.claims@hdfcergo.com', ccEmails: '', type: 'claims', region: 'All India' },
    { id: 'payer-5', insurer: 'Bajaj Allianz', primaryEmail: 'hospital.claims@bajajallianz.co.in', ccEmails: '', type: 'claims', region: 'North' },
  ],
  announcements: [
    { id: 'announcement-1', insurer: 'Star Health', title: 'New claim submission portal', date: '2025-06-15', content: 'All hospitals must switch to new e-claims portal by July 1, 2025. Training sessions available.' },
    { id: 'announcement-2', insurer: 'ICICI Lombard', title: 'Updated tariff rates effective July 2025', date: '2025-06-10', content: 'Revised tariff rates for room rent and procedures. Check the updated schedule.' },
    { id: 'announcement-3', insurer: 'IRDAI', title: 'Mandatory NHCX integration by Q3 2025', date: '2025-06-01', content: 'All network hospitals must onboard NHCX by September 2025.' },
  ],
  contacts: [
    { id: 'contact-1', name: 'Star Health', phone: '044-28288800', email: 'customercare@starhealth.in', tpa: 'Direct' },
    { id: 'contact-2', name: 'ICICI Lombard', phone: '1800-266-9725', email: 'customersupport@icicilombard.com', tpa: 'Direct' },
    { id: 'contact-3', name: 'HDFC Ergo', phone: '1800-266-0700', email: 'healthclaims@hdfcergo.com', tpa: 'Medi Assist' },
    { id: 'contact-4', name: 'Bajaj Allianz', phone: '1800-209-5858', email: 'baglobal@bajajallianz.co.in', tpa: 'Direct' },
    { id: 'contact-5', name: 'New India Assurance', phone: '1800-209-1415', email: 'cmd@newindia.co.in', tpa: 'Paramount/Vidal' },
    { id: 'contact-6', name: 'Max Bupa (Niva)', phone: '1800-200-5577', email: 'care@nivabupa.com', tpa: 'Direct' },
  ],
});

const buildDefaultHospitalProfile = () => ({
  basic: {
    name: '', registrationNo: '', rohiniId: '', address: '', city: '', state: '', pin: '',
    phone: '', email: '', website: '', type: 'multi_specialty', establishedYear: '', latitude: '', longitude: '',
  },
  account: {
    bankName: '', accountNo: '', ifsc: '', branchName: '', accountType: 'current', gstNumber: '', panNumber: '',
  },
  rooms: [
    { id: 'room-1', type: 'General Ward', beds: 0, amenities: 'AC, TV', rate: 0 },
    { id: 'room-2', type: 'Semi-Private', beds: 0, amenities: 'AC, TV, Attached Bath', rate: 0 },
    { id: 'room-3', type: 'Private', beds: 0, amenities: 'AC, TV, Bath, Fridge', rate: 0 },
    { id: 'room-4', type: 'Deluxe', beds: 0, amenities: 'Full amenities', rate: 0 },
    { id: 'room-5', type: 'ICU', beds: 0, amenities: 'Ventilator, Monitor', rate: 0 },
    { id: 'room-6', type: 'NICU', beds: 0, amenities: 'Neonatal care', rate: 0 },
    { id: 'room-7', type: 'PICU', beds: 0, amenities: 'Pediatric care', rate: 0 },
  ],
  teamEmails: {
    claimTeamEmail: '',
    secondaryEmails: [''],
    otherTeam: '',
  },
  users: [],
});

const buildDefaultSettings = () => ({
  general: {
    autoAssignment: true,
    emailNotifications: true,
    smsNotifications: false,
    defaultCurrency: 'INR',
    timezone: 'Asia/Kolkata',
    language: 'en',
    claimPrefix: 'CLM',
    preAuthPrefix: 'PA',
    autoArchiveDays: '90',
  },
  notificationPreferences: {
    newClaim: { email: true, push: true },
    preAuthApproved: { email: true, push: true },
    queryReceived: { email: true, push: true },
    settlement: { email: true, push: true },
    documentMissing: { email: true, push: true },
    deadlineApproaching: { email: true, push: true },
    escalation: { email: true, push: true },
  },
  apiConfig: {
    nhcxEndpoint: 'https://nhcx.abdm.gov.in/api/v1',
    nhcxApiKey: '',
    abdmEndpoint: 'https://abha.abdm.gov.in/api/v3',
    abdmClientId: '',
    abdmClientSecret: '',
    webhookUrl: '',
    callbackUrl: '',
  },
  security: {
    autoLogout: '30 minutes',
    twoFactor: 'Email OTP',
    passwordExpiry: '90 days',
    ipWhitelisting: 'Not configured',
    auditLogging: 'All actions logged',
    dataEncryption: 'AES-256 at rest, TLS 1.3 in transit',
  },
});

const buildDefaultGovtSchemes = () => ({
  schemes: [
    {
      id: 'cghs', name: 'CGHS', fullName: 'Central Govt Health Scheme', empaneled: true, panelCode: 'CGHS-KA-2024-0192',
      patientEligibility: 'Central Govt employees, pensioners, dependents', coverage: 'Cashless treatment, CGHS rates applicable',
      keyContacts: 'CGHS Wellness Centre, Helpline: 1800-11-6666', claimProcess: 'Direct cashless - present CGHS card. No TPA. Reimbursement to hospital direct.',
      tariffRef: 'CGHS 2024 Schedule of Rates', color: 'bg-blue-100 text-blue-700',
    },
    {
      id: 'echs', name: 'ECHS', fullName: 'Ex-Servicemen Contributory Health Scheme', empaneled: true, panelCode: 'ECHS-MH-2023-0456',
      patientEligibility: 'Retired armed forces personnel and dependents', coverage: 'Cashless treatment at network hospitals',
      keyContacts: 'ECHS Polyclinic coordination. Helpline: 1800-180-1246', claimProcess: 'Pre-auth from ECHS Polyclinic or Station HQ. Submit claim to ZO/Controlling HQ.',
      tariffRef: 'ECHS 2023 Scale of Charges', color: 'bg-green-100 text-green-700',
    },
    {
      id: 'esi', name: 'ESI', fullName: 'Employees State Insurance Scheme', empaneled: false, panelCode: null,
      patientEligibility: 'Employees earning <= Rs 21,000/month in organized sector', coverage: 'Medical benefits, hospitalization, maternity',
      keyContacts: 'ESIC Regional Office. Helpline: 1800-11-2526', claimProcess: 'ESIC dispenses via its own hospitals. Referral to empaneled hospitals for super-specialty.',
      tariffRef: 'ESIC Rates', color: 'bg-orange-100 text-orange-700',
    },
    {
      id: 'pmjay', name: 'PMJAY / Ayushman Bharat', fullName: 'PM Jan Arogya Yojana', empaneled: true, panelCode: 'AB-KY-MH-2024-004521',
      patientEligibility: 'BPL and low-income families. Beneficiary card / PMJAY ID required.', coverage: 'Rs 5 lakh/family/year for secondary and tertiary care.',
      keyContacts: 'SHA helpline: 14555. NHA portal: pmjay.gov.in', claimProcess: 'Verify beneficiary on NHA portal. Raise pre-auth. Submit claim via NHA transaction management system.',
      tariffRef: 'HBP 2022 Package Rates', color: 'bg-yellow-100 text-yellow-700',
    },
    {
      id: 'rsby', name: 'RSBY / State Scheme', fullName: 'Rashtriya Swasthya Bima Yojana / State Insurance', empaneled: false, panelCode: null,
      patientEligibility: 'Below poverty line families per state scheme', coverage: 'Varies by state scheme', keyContacts: 'State Health Authority (SHA)',
      claimProcess: 'Varies by state. Check state SHA portal for empanelment and claim process.', tariffRef: 'State SHA Package Rates', color: 'bg-purple-100 text-purple-700',
    },
  ],
  claims: [
    { id: 'govt-claim-1', scheme: 'CGHS', claimNo: 'CGHS-2024-0891', patient: 'Mohan Gupta', beneficiaryId: 'CGHS-DEL-4521', amount: 48000, status: 'submitted', date: '2024-12-10', procedure: 'CABG Package' },
    { id: 'govt-claim-2', scheme: 'PMJAY', claimNo: 'PMJAY-TMS-2024-0312', patient: 'Lakshmi Bai', beneficiaryId: 'AB-MH-7891234', amount: 72000, status: 'approved', date: '2024-12-08', procedure: 'Joint Replacement' },
    { id: 'govt-claim-3', scheme: 'ECHS', claimNo: 'ECHS-MH-2024-0156', patient: 'Col. SK Sharma (Retd)', beneficiaryId: 'ECHS-PUNE-9901', amount: 135000, status: 'pending_docs', date: '2024-12-07', procedure: 'Cardiac Surgery' },
    { id: 'govt-claim-4', scheme: 'CGHS', claimNo: 'CGHS-2024-0870', patient: 'Sunita Verma', beneficiaryId: 'CGHS-DEL-8821', amount: 22000, status: 'settled', date: '2024-12-05', procedure: 'Day Care Procedure' },
  ],
});

const buildDefaultNHCX = () => ({
  onboardingStep: 0,
  environment: 'Sandbox',
  // Computed, not hardcoded — reflects whether NHCX_CLIENT_ID/SECRET are
  // actually set, so this never claims readiness the platform doesn't have.
  activationStatus: isNhcxConfigured() ? 'Sandbox Ready' : 'Not Configured',
  hfrData: {
    facilityId: '', facilityName: '', ownershipCode: '', facilityType: '', systemOfMedicine: 'modern',
    longitude: '', latitude: '', address: '', state: '', district: '', pin: '',
  },
  participantData: {
    participantName: '', participantCode: '', role: 'provider', signingCertificate: '', encryptionCertificate: '', callbackUrl: '',
  },
  requirements: [
    { item: 'Health Facility Registry (HFR) Registration', done: false },
    { item: 'Valid ROHINI ID', done: false },
    { item: 'ABDM Health ID Integration', done: false },
    { item: 'Digital Signing Certificate (DSC)', done: false },
    { item: 'NHCX Sandbox Access', done: isNhcxConfigured() },
    { item: 'FHIR R4 Resource Support', done: true },
    { item: 'API Endpoint Configuration', done: false },
  ],
  timeline: [
    { date: 'Q1 2025', milestone: 'Sandbox registration', status: 'overdue' },
    { date: 'Q2 2025', milestone: 'Integration testing', status: 'current' },
    { date: 'Q3 2025', milestone: 'Pilot with 2+ payers', status: 'upcoming' },
    { date: 'Q4 2025', milestone: 'Full production go-live', status: 'upcoming' },
  ],
  flows: [
    { name: 'Coverage Eligibility', status: 'ready', desc: 'Check patient insurance eligibility' },
    { name: 'Pre-Authorization', status: 'ready', desc: 'Submit and track pre-auth requests' },
    { name: 'Claims Submission', status: 'in_progress', desc: 'Submit final claims digitally' },
    { name: 'Payment Notice', status: 'pending', desc: 'Receive settlement notifications' },
    { name: 'Communication', status: 'pending', desc: 'Query and response exchange' },
  ],
});

const buildDefaultABDM = () => ({
  linkedRecords: [
    { id: 'abha-record-1', abhaId: '91-1234-5678-9012', name: 'Rajesh Kumar', dob: '1985-03-15', mobile: '9876543210', status: 'verified', linkedDate: '2025-06-10' },
    { id: 'abha-record-2', abhaId: '91-2345-6789-0123', name: 'Priya Singh', dob: '1990-07-22', mobile: '9876543211', status: 'verified', linkedDate: '2025-06-12' },
    { id: 'abha-record-3', abhaId: '91-3456-7890-1234', name: 'Amit Verma', dob: '1978-11-05', mobile: '9876543212', status: 'pending', linkedDate: '2025-06-18' },
  ],
  consents: [
    { id: 'consent-1', patient: 'Rajesh Kumar', purpose: 'Insurance Claim', hiu: 'Star Health', status: 'granted', expiry: '2025-12-31' },
    { id: 'consent-2', patient: 'Priya Singh', purpose: 'Pre-Authorization', hiu: 'ICICI Lombard', status: 'requested', expiry: '2025-09-30' },
    { id: 'consent-3', patient: 'Amit Verma', purpose: 'Treatment Follow-up', hiu: 'Self', status: 'granted', expiry: '2026-06-30' },
  ],
});

const buildDefaultTariff = () => ({
  insurers: ['Star Health', 'Medi Assist', 'Care Health', 'HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz', 'Niva Bupa', 'New India', 'United India', 'CGHS', 'ECHS'],
  tpas: ['Direct', 'Medi Assist', 'Vidal Health', 'Paramount', 'MDIndia', 'FHPL', 'Heritage', 'HealthIndia'],
  categories: ['Room Charges', 'ICU', 'Procedures', 'Nursing', 'OT Charges', 'Diagnostics', 'Pharmacy', 'Packages', 'Consumables'],
  uploads: [],
  items: [
    { id: 'tariff-1', payerName: 'Star Health', payerType: 'insurer', tpaName: 'Direct', agreementCode: 'SH-MOU-2026', category: 'Room Charges', serviceCode: 'ROOM-GEN', serviceName: 'General Ward', unit: 'per day', grossRate: 1800, discountType: 'percentage', discountValue: 10, contractedRate: 1620, gst: 0, validFrom: '2026-04-01', validTo: '2027-03-31', discountTerms: '10% discount on published room tariff as per MOU.', documentName: 'sample-rate-card.csv', uploadedAt: '2026-04-01T00:00:00.000Z', status: 'active' },
    { id: 'tariff-2', payerName: 'Star Health', payerType: 'insurer', tpaName: 'Direct', agreementCode: 'SH-MOU-2026', category: 'Procedures', serviceCode: 'PKG-CABG', serviceName: 'CABG Package', unit: 'per episode', grossRate: 300000, discountType: 'package', discountValue: 0, contractedRate: 280000, gst: 0, validFrom: '2026-04-01', validTo: '2027-03-31', discountTerms: 'Package includes OT, surgeon, routine consumables, and ward stay per payer terms.', documentName: 'sample-rate-card.csv', uploadedAt: '2026-04-01T00:00:00.000Z', status: 'active' },
    { id: 'tariff-3', payerName: 'Medi Assist', payerType: 'tpa', tpaName: 'Medi Assist', agreementCode: 'MA-PREF-2026', category: 'Diagnostics', serviceCode: 'MRI-BRAIN', serviceName: 'MRI Brain Plain', unit: 'per scan', grossRate: 8500, discountType: 'percentage', discountValue: 15, contractedRate: 7225, gst: 0, validFrom: '2026-01-01', validTo: '2026-12-31', discountTerms: 'Preferred tariff for cashless desk estimates and final bill scrutiny.', documentName: 'sample-rate-card.csv', uploadedAt: '2026-01-01T00:00:00.000Z', status: 'active' },
    { id: 'tariff-4', payerName: 'CGHS', payerType: 'government', tpaName: 'Direct', agreementCode: 'CGHS-2026', category: 'Room Charges', serviceCode: 'ROOM-GEN-CGHS', serviceName: 'General Ward', unit: 'per day', grossRate: 1500, discountType: 'none', discountValue: 0, contractedRate: 1500, gst: 0, validFrom: '2026-04-01', validTo: '2027-03-31', discountTerms: 'Government schedule applies. Do not override without updated circular.', documentName: 'sample-rate-card.csv', uploadedAt: '2026-04-01T00:00:00.000Z', status: 'active' },
  ],
  lastUpdated: '2026-04-01T00:00:00.000Z',
});

const buildDefaultEmpanelment = () => ({
  empanelments: [
    { id: 'empanelment-1', insurer: 'Star Health', type: 'TPL', status: 'active', mouDate: '2023-04-01', expiryDate: '2025-03-31', daysToExpiry: 110, panelCode: 'SH-MH-2023-1042', contactPerson: 'Ramesh Iyer', email: 'network@starhealth.in', phone: '044-28288800', accreditationStatus: 'NABH Verified', complianceScore: 94 },
    { id: 'empanelment-2', insurer: 'Care Health', type: 'TPL', status: 'active', mouDate: '2023-07-01', expiryDate: '2025-06-30', daysToExpiry: 200, panelCode: 'CH-MH-2023-0789', contactPerson: 'Priya Sharma', email: 'hospitals@carehealth.in', phone: '011-41515151', accreditationStatus: 'NABH Verified', complianceScore: 88 },
    { id: 'empanelment-3', insurer: 'HDFC ERGO', type: 'TPL', status: 'renewal_due', mouDate: '2022-01-01', expiryDate: '2024-12-31', daysToExpiry: 19, panelCode: 'HE-MH-2022-0234', contactPerson: 'Arun Kumar', email: 'provider@hdfcergo.com', phone: '022-66382222', accreditationStatus: 'JCI Accredited', complianceScore: 91 },
    { id: 'empanelment-4', insurer: 'CGHS', type: 'Government', status: 'active', mouDate: '2024-04-01', expiryDate: '2025-03-31', daysToExpiry: 110, panelCode: 'CGHS-CGO-MH-2024', contactPerson: 'CGHS Delhi', email: 'cghs.empanel@nic.in', phone: '011-23382453', accreditationStatus: 'NABH Mandatory', complianceScore: 100 },
    { id: 'empanelment-5', insurer: 'Bajaj Allianz', type: 'TPL', status: 'pending_renewal', mouDate: '2023-01-01', expiryDate: '2024-12-15', daysToExpiry: 3, panelCode: 'BA-MH-2023-0556', contactPerson: 'Sunil Mehta', email: 'network@bajajallianz.co.in', phone: '020-66026666', accreditationStatus: 'NABH Verified', complianceScore: 79 },
  ],
  complianceItems: [
    { id: 'compliance-1', category: 'Accreditation', item: 'NABH Accreditation Certificate', status: 'valid', expiry: '2026-04-01' },
    { id: 'compliance-2', category: 'Accreditation', item: 'Fire NOC from Municipal Authority', status: 'valid', expiry: '2025-08-15' },
    { id: 'compliance-3', category: 'Accreditation', item: 'Clinical Establishment Certificate', status: 'expiring', expiry: '2025-01-20' },
    { id: 'compliance-4', category: 'Staff', item: 'Medical Superintendent Registration', status: 'valid', expiry: '2027-06-01' },
    { id: 'compliance-5', category: 'Staff', item: 'Nursing Home License', status: 'valid', expiry: '2025-12-31' },
    { id: 'compliance-6', category: 'Billing', item: 'GST Registration', status: 'valid', expiry: null },
    { id: 'compliance-7', category: 'Billing', item: 'PAN of Hospital', status: 'valid', expiry: null },
    { id: 'compliance-8', category: 'Insurance', item: 'Medical Indemnity Insurance', status: 'expiring', expiry: '2025-02-01' },
  ],
});

const buildDefaultPortalWorkspace = () => ({
  payerManagement: buildDefaultPayerManagement(),
  hospitalProfile: buildDefaultHospitalProfile(),
  settings: buildDefaultSettings(),
  govtSchemes: buildDefaultGovtSchemes(),
  nhcx: buildDefaultNHCX(),
  abdm: buildDefaultABDM(),
  tariff: buildDefaultTariff(),
  empanelment: buildDefaultEmpanelment(),
  metadata: {},
});

const buildDefaultMessageThreads = () => ([
  {
    claimNo: 'CL-2024-5501',
    patientName: 'Rajesh Kumar',
    insurer: 'Star Health',
    tpa: 'Medi Assist',
    subject: 'Query: Surgical Notes Required',
    lastMessage: 'Kindly provide OT notes and surgeon certificate for the CABG procedure.',
    lastMessageAt: getRelativeDate({ hours: 1 }),
    unreadCount: 2,
    priority: 'high',
    status: 'query',
    messages: [
      { id: 'msg-1', from: 'tpa', sender: 'Medi Assist', text: 'Kindly provide OT notes and surgeon certificate for the CABG procedure.', time: getRelativeDate({ hours: 1 }).toISOString(), attachments: [] },
    ],
    metadata: {},
  },
  {
    claimNo: 'PA-5502',
    patientName: 'Meena Devi',
    insurer: 'Care Health',
    tpa: 'Vidal Health',
    subject: 'Pre-Auth: Additional Docs Requested',
    lastMessage: 'Please share recent lab reports (within 48h) and physician certificate.',
    lastMessageAt: getRelativeDate({ hours: 3 }),
    unreadCount: 1,
    priority: 'urgent',
    status: 'pending',
    messages: [
      { id: 'msg-2', from: 'tpa', sender: 'Vidal Health', text: 'Please share recent lab reports (within 48h) and physician certificate.', time: getRelativeDate({ hours: 3 }).toISOString(), attachments: [] },
    ],
    metadata: {},
  },
  {
    claimNo: 'CL-2024-5498',
    patientName: 'Sunita Rao',
    insurer: 'HDFC ERGO',
    tpa: 'Health India TPA',
    subject: 'Settled - Fund Transfer Confirmation',
    lastMessage: 'Settlement amount Rs 87,500 has been transferred. UTR: HDFC2024121200345',
    lastMessageAt: getRelativeDate({ days: 1 }),
    unreadCount: 0,
    priority: 'normal',
    status: 'settled',
    messages: [
      { id: 'msg-3', from: 'tpa', sender: 'Health India TPA', text: 'Settlement amount Rs 87,500 transferred. UTR: HDFC2024121200345', time: getRelativeDate({ days: 1 }).toISOString(), attachments: [] },
    ],
    metadata: {},
  },
]);

const buildDefaultNotifications = () => ([
  { type: 'claim', title: 'Pre-Auth Approved', message: 'PA-2025-0089 for Amit Verma has been approved by HDFC Ergo. Amount: Rs 1,50,000', priority: 'high', isRead: false, occurredAt: getRelativeDate({ hours: 1 }), actionRoute: '/pre-auth' },
  { type: 'query', title: 'Query on CLM-2025-0042', message: 'Star Health has raised a query regarding room rent charges. Respond within 24 hours.', priority: 'high', isRead: false, occurredAt: getRelativeDate({ hours: 2 }), actionRoute: '/messages' },
  { type: 'document', title: 'Missing Document Alert', message: 'Discharge summary pending for CLM-2025-0041 (Priya Singh). Upload before 6 PM today.', priority: 'medium', isRead: false, occurredAt: getRelativeDate({ hours: 3 }), actionRoute: '/documents' },
  { type: 'settlement', title: 'Settlement Received', message: 'Settlement of Rs 1,20,000 received for CLM-2025-0035 via UTR: UTIB202506180012345', priority: 'low', isRead: true, occurredAt: getRelativeDate({ hours: 5 }), actionRoute: '/reconciliation' },
  { type: 'escalation', title: 'Claim Escalated', message: 'CLM-2025-0028 (Meera Devi) has been auto-escalated due to 35-day settlement delay.', priority: 'high', isRead: true, occurredAt: getRelativeDate({ hours: 7 }), actionRoute: '/claims?status=query' },
  { type: 'deadline', title: 'Submission Deadline Tomorrow', message: '3 claim submissions due tomorrow. Review and submit before EOD.', priority: 'medium', isRead: true, occurredAt: getRelativeDate({ hours: 9 }), actionRoute: '/tasks' },
  { type: 'system', title: 'NHCX Maintenance Window', message: 'NHCX sandbox will be under maintenance on June 22, 2025 from 2 AM to 6 AM IST.', priority: 'low', isRead: true, occurredAt: getRelativeDate({ days: 1 }), actionRoute: '/nhcx' },
  { type: 'claim', title: 'New Pre-Auth Request', message: 'Pre-auth submitted for Suresh Patel - Total Knee Replacement - Rs 2,50,000', priority: 'low', isRead: true, occurredAt: getRelativeDate({ days: 1 }), actionRoute: '/pre-auth/new' },
]);

const mergeSectionDefaults = (sectionName, value) => {
  const defaultSections = buildDefaultPortalWorkspace();
  const fallback = defaultSections[sectionName] || {};
  return value && typeof value === 'object'
    ? { ...fallback, ...value }
    : fallback;
};

const formatPortalThread = (thread) => {
  const data = serializeModel(thread);
  return {
    ...data,
    lastMsg: data.lastMessage,
    unread: data.unreadCount,
    timestamp: data.lastMessageAt,
  };
};

const formatPortalNotification = (notification) => {
  const data = serializeModel(notification);
  return {
    ...data,
    read: Boolean(data.isRead),
    time: data.occurredAt,
  };
};

const ensurePortalTables = Promise.all([
  InsurancePortalWorkspace.sync(),
  InsurancePortalMessageThread.sync(),
  InsurancePortalNotification.sync(),
]).catch((error) => {
  console.error('Insurance portal table sync error:', error.message);
});

const ensurePortalWorkspace = async (scope) => {
  await ensurePortalTables;

  let workspace = await InsurancePortalWorkspace.findOne({
    where: { hospitalId: scope.hospitalId },
  });

  if (!workspace) {
    workspace = await InsurancePortalWorkspace.create({
      hospitalId: scope.hospitalId,
      organizationId: scope.organizationId,
      ...buildDefaultPortalWorkspace(),
    });
  }

  return workspace;
};

const ensurePortalMessages = async (scope) => {
  await ensurePortalTables;

  const existingCount = await InsurancePortalMessageThread.count({
    where: { hospitalId: scope.hospitalId },
  });

  if (!existingCount) {
    const seedThreads = buildDefaultMessageThreads().map((thread) => ({
      ...thread,
      hospitalId: scope.hospitalId,
      organizationId: scope.organizationId,
      createdBy: scope.userId,
      lastUpdatedBy: scope.userId,
    }));

    await InsurancePortalMessageThread.bulkCreate(seedThreads);
  }
};

const ensurePortalNotifications = async (scope) => {
  await ensurePortalTables;

  const existingCount = await InsurancePortalNotification.count({
    where: { hospitalId: scope.hospitalId },
  });

  if (!existingCount) {
    const seedNotifications = buildDefaultNotifications().map((notification) => ({
      ...notification,
      hospitalId: scope.hospitalId,
      organizationId: scope.organizationId,
      readAt: notification.isRead ? notification.occurredAt : null,
    }));

    await InsurancePortalNotification.bulkCreate(seedNotifications);
  }
};

const getPortalSectionPayload = async (scope, sectionField) => {
  const workspace = await ensurePortalWorkspace(scope);
  return mergeSectionDefaults(sectionField, serializeModel(workspace)[sectionField]);
};

const updatePortalSectionPayload = async (scope, sectionField, payload) => {
  const workspace = await ensurePortalWorkspace(scope);
  const nextValue = mergeSectionDefaults(sectionField, payload);
  await workspace.update({ [sectionField]: nextValue, organizationId: scope.organizationId });
  return nextValue;
};

const getDisplayPatientName = (patient) => {
  if (!patient) return null;
  return [patient.firstName, patient.lastName].filter(Boolean).join(' ').trim() || patient.email || null;
};

const getUploadedFiles = (files = {}) => Object.values(files)
  .flatMap((value) => Array.isArray(value) ? value : [value])
  .filter((value) => value && (value.data || value.tempFilePath || value.name));

const normalizeAgingBuckets = (agingReport) => {
  const labels = {
    '<7days': '< 7 days',
    '7-15days': '7-15 days',
    '15-30days': '15-30 days',
    '>30days': '> 30 days'
  };

  return Object.entries(agingReport || {}).map(([bucket, value]) => ({
    bucket: labels[bucket] || bucket,
    range: labels[bucket] || bucket,
    count: Number(value) || 0,
    amount: 0,
    value: 0,
  }));
};

const buildTrendTimeline = (claims, months) => {
  const totalMonths = Math.max(1, parseInt(months, 10) || 6);
  const monthMap = new Map();
  const cursor = new Date();
  cursor.setDate(1);

  for (let index = totalMonths - 1; index >= 0; index -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthMap.set(key, {
      month: date.toLocaleString('en-IN', { month: 'short' }),
      submitted: 0,
      approved: 0,
      rejected: 0,
      queries: 0,
    });
  }

  claims.forEach((claim) => {
    const dateValue = claim.createdAt || claim.submittedAt || claim.updatedAt;
    if (!dateValue) return;
    const date = new Date(dateValue);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bucket = monthMap.get(key);
    if (!bucket) return;

    bucket.submitted += 1;
    if (claim.status === 'approved' || claim.status === 'paid') bucket.approved += 1;
    if (claim.status === 'rejected') bucket.rejected += 1;
    if (claim.status === 'query') bucket.queries += 1;
  });

  return Array.from(monthMap.values());
};

const buildTatByInsurer = (claims) => {
  const aggregates = new Map();

  claims.forEach((claim) => {
    const submittedAt = claim.submittedAt || claim.createdAt;
    const resolvedAt = claim.approvedAt || claim.rejectedAt || claim.updatedAt;
    if (!submittedAt || !resolvedAt) return;

    const insurer = claim.insuranceProvider || 'Unknown';
    const tatHours = Math.max(0, (new Date(resolvedAt).getTime() - new Date(submittedAt).getTime()) / (1000 * 60 * 60));
    const current = aggregates.get(insurer) || { insurer, totalHours: 0, totalClaims: 0 };
    current.totalHours += tatHours;
    current.totalClaims += 1;
    aggregates.set(insurer, current);
  });

  return Array.from(aggregates.values())
    .map((item) => ({
      insurer: item.insurer,
      avgHrs: Math.round((item.totalHours / Math.max(1, item.totalClaims)) * 10) / 10,
      totalClaims: item.totalClaims,
    }))
    .sort((left, right) => right.totalClaims - left.totalClaims);
};

const buildReceivableSummaryByInsurer = (claims) => {
  const groups = new Map();

  claims.forEach((claim) => {
    const insurer = claim.insuranceProvider || 'Unknown';
    const billedAmount = Number(claim.claimAmount) || 0;
    const approvedAmount = Number(claim.approvedAmount) || 0;
    const settledAmount = Number(claim.settledAmount) || 0;
    const disallowance = Math.max(0, billedAmount - approvedAmount);
    const pendingAmount = Math.max(0, approvedAmount - settledAmount);
    const current = groups.get(insurer) || {
      insurer,
      claims: 0,
      billed: 0,
      approved: 0,
      nme: 0,
      discount: 0,
      tds: 0,
      disallowance: 0,
      settled: 0,
      outstanding: 0,
      settledClaims: 0,
      pendingClaims: 0,
    };

    current.claims += 1;
    current.billed += billedAmount;
    current.approved += approvedAmount;
    current.disallowance += disallowance;
    current.settled += settledAmount;
    current.outstanding += pendingAmount;
    if ((claim.settlementStatus || claim.status) === 'settled' || claim.status === 'paid') current.settledClaims += 1;
    else current.pendingClaims += 1;
    groups.set(insurer, current);
  });

  return Array.from(groups.values()).sort((left, right) => right.approved - left.approved);
};

// ==================== 1. DASHBOARD / HOME ====================

/**
 * GET /hospital/insurance/dashboard
 * High-level snapshot of claims work
 */
router.get('/dashboard', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const where = hospitalId ? { hospital_id: hospitalId } : {};

    // Try to get from cache first
    const cacheKey = `dashboard:stats:${hospitalId || 'all'}`;
    const cached = await cacheService.get(cacheKey);
    
    if (cached) {
      return res.json({
        success: true,
        dashboard: cached,
        cached: true
      });
    }

    // Get counts by status
    const [pending, approved, rejected, query_pending, totalAmount, approvedAmount, pendingAmount, recentClaims, insurerClaims, pendingDocuments, expiringSoon] = await withClaimsRls(req, async (transaction) => Promise.all([
      InsuranceClaim.count({ where: { ...where, status: 'pending' }, transaction }),
      InsuranceClaim.count({ where: { ...where, status: 'approved' }, transaction }),
      InsuranceClaim.count({ where: { ...where, status: 'rejected' }, transaction }),
      InsuranceClaim.count({ where: { ...where, status: 'query' }, transaction }),
      InsuranceClaim.sum('claimAmount', { where, transaction }),
      InsuranceClaim.sum('approvedAmount', { where, transaction }),
      InsuranceClaim.sum('claimAmount', { where: { ...where, status: 'pending' }, transaction }),
      InsuranceClaim.findAll({
        where,
        limit: 10,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'claimNumber', 'claimAmount', 'approvedAmount', 'status', 'submittedAt', 'createdAt', 'insuranceProvider'],
        include: InsuranceClaim.associations?.patient ? [{
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName']
        }] : [],
        transaction
      }),
      InsuranceClaim.findAll({
        where,
        attributes: ['insuranceProvider'],
        transaction
      }),
      InsuranceClaim.count({
        where: { ...where, documents_status: 'incomplete' },
        transaction
      }),
      PreAuthorization.count({
        where: {
          ...where,
          status: 'approved',
          expires_at: { [Op.lte]: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        },
        transaction
      })
    ]));

    // Alerts & action items
    const alerts = {
      queriesNeedingResponse: query_pending,
      pendingDocuments,
      expiringSoon
    };

    const dashboardData = {
      stats: {
        pending,
        approved,
        rejected,
        query: query_pending,
        total: pending + approved + rejected + query_pending,
        totalAmount: Number(totalAmount) || 0,
        approvedAmount: Number(approvedAmount) || 0,
        pendingAmount: Number(pendingAmount) || 0,
      },
      recentActivity: recentClaims.map((claim) => ({
        ...(claim.toJSON ? claim.toJSON() : claim),
        patientName: getDisplayPatientName(claim.patient),
        insurer: claim.insuranceProvider || null,
      })),
      alerts,
      insurerBreakdown: Array.from(
        insurerClaims.reduce((map, claim) => {
          const insurer = claim.insuranceProvider || 'Unknown';
          map.set(insurer, (map.get(insurer) || 0) + 1);
          return map;
        }, new Map())
      ).map(([name, value]) => ({ name, value })),
      charts: {
        statusBreakdown: { pending, approved, rejected, query: query_pending },
        monthlyTrend: [] // TODO: Add monthly trend data
      }
    };

    // Cache for 5 minutes
    await cacheService.set(cacheKey, dashboardData, 300);

    res.json({
      success: true,
      dashboard: dashboardData,
      cached: false
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    // Return empty dashboard instead of 500 — graceful degradation for demo/new hospitals
    res.json({
      success: true,
      dashboard: {
        stats: { pending: 0, approved: 0, rejected: 0, query: 0, total: 0 },
        recentActivity: [],
        alerts: { queriesNeedingResponse: 0, pendingDocuments: 0, expiringSoon: 0 },
        charts: { statusBreakdown: { pending: 0, approved: 0, rejected: 0, query: 0 }, monthlyTrend: [] }
      },
      cached: false,
      demo: true,
    });
  }
});

/**
 * POST /hospital/insurance/dashboard/search
 * Quick search - Find a claim by Claim ID, Policy No. or Member ID
 */
router.post('/dashboard/search', authUser, requireRole(['hospital', 'admin']), [
  body('searchTerm').notEmpty().withMessage('Search term required')
], async (req, res) => {
  try {
    const { searchTerm } = req.body;
    const searchTermAsInt = parseInt(searchTerm, 10);

    const claims = await withClaimsRls(req, (transaction) => InsuranceClaim.findAll({
      where: {
        [Op.or]: [
          { claimNumber: { [Op.like]: `%${searchTerm}%` } },
          { policyNumber: { [Op.like]: `%${searchTerm}%` } },
          // patientId is an integer column — comparing it against a
          // non-numeric search term throws a Postgres type error and 500s
          // the whole search, so only include this clause when it's numeric.
          ...(Number.isNaN(searchTermAsInt) ? [] : [{ patientId: searchTermAsInt }])
        ]
      },
      limit: 20,
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
        }
      ],
      transaction
    }));

    res.json({ success: true, results: claims });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 2. CLAIMS MANAGEMENT ====================

/**
 * GET /hospital/insurance/claims
 * List all claims with optional status filter, search, pagination
 */
router.get('/claims', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, status, search, insurer, page = 1, limit = 20 } = req.query;
    const where = {};

    if (hospitalId) where.hospital_id = hospitalId;
    if (status && status !== 'all') {
      const normalizedStatus = CLAIM_STATUS_ALIASES[status] || status;
      where.status = Array.isArray(normalizedStatus) ? { [Op.in]: normalizedStatus } : normalizedStatus;
    }
    if (insurer && insurer !== 'all') {
      where.insuranceProvider = { [Op.iLike]: `%${String(insurer).replace(/_/g, ' ')}%` };
    }
    if (search) {
      where[Op.or] = [
        { claimNumber: { [Op.iLike]: `%${search}%` } },
        { policyNumber: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await withClaimsRls(req, (transaction) => InsuranceClaim.findAndCountAll({
      where,
      attributes: [
        'id', 'claimNumber', 'claimAmount', 'approvedAmount', 'settledAmount', 'status', 'policyNumber',
        'claimType', 'submittedAt', 'createdAt', 'updatedAt', 'notes', 'insuranceProvider',
        'hospitalizationDetails', 'diagnosis', 'treatmentDetails', 'settlementStatus', 'documentsStatus'
      ],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      include: InsuranceClaim.associations?.patient ? [{
        model: User,
        as: 'patient',
        attributes: ['id', 'firstName', 'lastName']
      }] : [],
      transaction
    }));

    const claims = rows.map((claim) => {
      const plain = claim.toJSON ? claim.toJSON() : claim;
      return {
        ...plain,
        patientName: plain.patientName || getDisplayPatientName(plain.patient),
        insurerName: plain.insurerName || plain.insuranceProvider || null,
      };
    });

    res.json({
      success: true,
      claims,
      totalPages: Math.ceil(count / parseInt(limit)),
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Claims list error:', error);
    res.json({
      success: true,
      claims: [],
      totalPages: 0,
      pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
      degraded: true
    });
  }
});

/**
 * POST /hospital/insurance/claims/new
 * Create new claim submission
 */
router.post('/claims/new', authUser, requireRole(['hospital', 'admin']), [
  body('patientId').isInt(),
  body('policyNumber').notEmpty(),
  body('claimAmount').isFloat({ min: 0 }),
  body('hospitalizationDetails').isObject()
], async (req, res) => {
  try {
    const {
      patientId,
      policyNumber,
      insuranceProviderId,
      insuranceProvider,
      claimAmount,
      claimType,
      schemeName,
      hospitalizationDetails,
      documents,
      diagnosis,
      treatmentDetails,
      hospitalId,
      organizationId,
    } = req.body;
    const resolvedHospitalId = req.user.hospitalId || hospitalId || req.user.organizationId || organizationId;
    const resolvedOrganizationId = req.user.organizationId || organizationId || resolvedHospitalId;

    // Generate claim number
    const claimNumber = `CLM${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.create({
      claimNumber,
      patientId,
      hospitalId: resolvedHospitalId,
      organizationId: resolvedOrganizationId,
      policyNumber,
      insuranceProviderId,
      insuranceProvider: insuranceProvider || req.body.insurer || null,
      claimAmount,
      claimType: claimType || 'cashless',
      schemeName: claimType === 'government_scheme' ? (schemeName || null) : null,
      status: 'draft',
      hospitalizationDetails,
      documents: documents || [],
      diagnosis: diagnosis || hospitalizationDetails?.diagnosis || null,
      treatmentDetails: treatmentDetails || {
        procedureCode: hospitalizationDetails?.procedureCode || null,
        roomCategory: hospitalizationDetails?.roomCategory || hospitalizationDetails?.ward || null,
      },
      submittedBy: req.user.id,
      createdAt: new Date()
    }, { transaction }));

    res.status(201).json({
      success: true,
      message: 'Claim created successfully',
      claim
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/drafts
 * Access claims started but not submitted yet
 */
router.get('/claims/drafts', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'draft' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows: drafts } = await withClaimsRls(req, (transaction) => InsuranceClaim.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['updatedAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      transaction
    }));

    res.json({
      success: true,
      drafts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Drafts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/submitted
 * View claims already submitted to payer/TPA
 */
router.get('/claims/submitted', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, status, page = 1, limit = 20, startDate, endDate } = req.query;
    
    const where = {
      status: { [Op.in]: ['submitted', 'pending', 'approved', 'rejected', 'query'] }
    };
    
    if (hospitalId) where.hospitalId = hospitalId;
    if (status) where.status = status;
    if (startDate) where.submittedAt = { [Op.gte]: new Date(startDate) };
    if (endDate) {
      where.submittedAt = where.submittedAt 
        ? { ...where.submittedAt, [Op.lte]: new Date(endDate) }
        : { [Op.lte]: new Date(endDate) };
    }

    const offset = (page - 1) * limit;

    let result;
    const ClaimsModel = typeof InsuranceClaim.unscoped === 'function'
      ? InsuranceClaim.unscoped()
      : InsuranceClaim;
    const hasPatientAssociation = !!(InsuranceClaim.associations && InsuranceClaim.associations.patient);

    try {
      result = await withClaimsRls(req, (transaction) => ClaimsModel.findAndCountAll({
        where,
        attributes: ['id', 'claimNumber', 'claimAmount', 'status', 'submittedAt', 'createdAt'],
        limit: parseInt(limit),
        offset,
        order: [['submittedAt', 'DESC']],
        ...(hasPatientAssociation
          ? {
              include: [
                {
                  model: User,
                  as: 'patient',
                  attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
                }
              ]
            }
          : {}),
        transaction
      }));
    } catch (includeError) {
      console.warn('Submitted claims include fallback triggered:', includeError.message);
      result = await withClaimsRls(req, (transaction) => ClaimsModel.findAndCountAll({
        where,
        attributes: ['id', 'claimNumber', 'claimAmount', 'status', 'submittedAt', 'createdAt'],
        limit: parseInt(limit),
        offset,
        order: [['submittedAt', 'DESC']],
        transaction
      }));
    }

    const { count, rows: claims } = result;

    res.json({
      success: true,
      claims,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Submitted claims error:', error);
    if (/not associated/i.test(error.message || '')) {
      return res.json({
        success: true,
        claims: [],
        pagination: {
          total: 0,
          page: parseInt(req.query.page || 1),
          limit: parseInt(req.query.limit || 20),
          totalPages: 0
        }
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/submit
 * Submit claim to payer/TPA
 */
router.post('/claims/:claimId/submit', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    if (claim.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft claims can be submitted'
      });
    }

    // Rules engine: required-field + policy-limit checks (see
    // claims-rules-engine.service.js). A dry-run of the same check is
    // available at GET /claims/:claimId/validate for a live pre-submit checklist.
    const preAuth = claim.preAuthId ? await PreAuthorization.findByPk(claim.preAuthId) : null;
    const validation = validateClaimForSubmission(claim, { preAuth });
    if (!validation.canSubmit) {
      return res.status(400).json({
        success: false,
        message: 'This claim has issues that will likely cause the insurer to reject or query it.',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    await withClaimsRls(req, (transaction) => claim.update({
      status: 'submitted',
      submittedAt: new Date(),
      submittedBy: req.user.id
    }, { transaction }));

    // Invalidate cache
    await cacheService.invalidateClaimCaches(claim.hospital_id);

    // Send WebSocket notification
    socketService.emitClaimUpdate(claim.id, {
      status: 'submitted',
      claimNumber: claim.claimNumber,
      message: 'Claim submitted successfully',
      userId: claim.patientId,
      hospitalId: claim.hospital_id
    });

    // Patient-facing WhatsApp/SMS update — fire-and-forget, doesn't block the response
    notifyClaimStatusChange({ claimId: claim.id, hospitalId: claim.hospital_id, status: 'submitted', actor: req.user.name })
      .catch((e) => console.warn('[claims/submit] patient notify failed:', e.message));

    res.json({
      success: true,
      message: 'Claim submitted successfully',
      claim,
      warnings: validation.warnings
    });
  } catch (error) {
    console.error('Submit claim error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/:claimId/validate
 * Dry-run of the rules engine (see claims-rules-engine.service.js) so the
 * UI can show a live pre-submit checklist without actually submitting.
 */
router.get('/claims/:claimId/validate', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }
    const preAuth = claim.preAuthId ? await PreAuthorization.findByPk(claim.preAuthId) : null;
    const validation = validateClaimForSubmission(claim, { preAuth });
    res.json({ success: true, ...validation });
  } catch (error) {
    console.error('Claim validation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/enhance
 * Upload additional documents or provide clarification
 */
router.post('/claims/:claimId/enhance', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  body('additionalDocuments').optional().isArray(),
  body('queryResponse').optional().isString()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const { additionalDocuments, queryResponse, notes } = req.body;

    const updateData = {
      updatedAt: new Date(),
      lastModifiedBy: req.user.id
    };

    if (additionalDocuments && additionalDocuments.length > 0) {
      updateData.documents = [...(claim.documents || []), ...additionalDocuments];
      updateData.documentsStatus = 'complete';
    }

    if (queryResponse) {
      updateData.queryHistory = [
        ...(claim.queryHistory || []),
        {
          respondedAt: new Date(),
          respondedBy: req.user.id,
          response: queryResponse,
          notes
        }
      ];
      updateData.status = 'pending'; // Back to pending after query response
    }

    await withClaimsRls(req, (transaction) => claim.update(updateData, { transaction }));

    res.json({
      success: true,
      message: 'Claim enhanced successfully',
      claim
    });
  } catch (error) {
    console.error('Enhance claim error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/bulk-upload
 * Submit multiple claims via Excel template
 */
router.post('/claims/bulk-upload', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { claims } = req.body; // Array of claim data

    if (!Array.isArray(claims) || claims.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Claims array is required'
      });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const claimData of claims) {
      try {
        const claimNumber = `CLM${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        
        const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.create({
          ...claimData,
          claimNumber,
          status: 'draft',
          submittedBy: req.user.id,
          hospitalId: req.user.hospitalId || claimData.hospitalId,
          organizationId: req.user.organization_id || claimData.organizationId || req.user.hospitalId || claimData.hospitalId
        }, { transaction }));

        results.success.push({ claimNumber, id: claim.id });
      } catch (error) {
        results.failed.push({
          data: claimData,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk upload completed. Success: ${results.success.length}, Failed: ${results.failed.length}`,
      results
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/:claimId/history
 * Shows all events, queries, responses, and status changes
 */
function buildClaimTimeline(claim) {
  return [
    {
      event: 'Created',
      timestamp: claim.createdAt,
      status: 'draft',
      user: claim.submittedBy
    },
    ...(claim.submittedAt ? [{
      event: 'Submitted',
      timestamp: claim.submittedAt,
      status: 'submitted',
      user: claim.submittedBy
    }] : []),
    ...(claim.queryHistory || []).map(q => ({
      event: 'Query Response',
      timestamp: q.respondedAt,
      details: q.response,
      user: q.respondedBy
    })),
    ...(claim.approvedAt ? [{
      event: 'Approved',
      timestamp: claim.approvedAt,
      approvedAmount: claim.approvedAmount,
      status: 'approved'
    }] : []),
    ...(claim.rejectedAt ? [{
      event: 'Rejected',
      timestamp: claim.rejectedAt,
      reason: claim.rejectionReason,
      status: 'rejected'
    }] : [])
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

router.get('/claims/:claimId/history', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, {
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      transaction
    }));

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    res.json({
      success: true,
      claim,
      timeline: buildClaimTimeline(claim)
    });
  } catch (error) {
    console.error('Claim history error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/:claimId/detail
 * Unified single-screen view: claim header, timeline, courier shipments,
 * patient-notification log, and any reconciliation postings linked to this
 * claim — consolidates what was previously spread across Claims/Documents/
 * Messages/Reconciliation into one call (ClaimBook-parity gap).
 */
router.get('/claims/:claimId/detail', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, {
      include: [
        { model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }
      ],
      transaction
    }));

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const hospitalId = req.user.hospital_id || req.user.tenant_id || req.user.id;
    const eraService = (await import('../services/hospital-era.service.js')).default;
    const postings = await eraService.listEraPostings(hospitalId, {
      claimId: claim.id,
      userId: req.user.id,
    }).catch(() => []);

    res.json({
      success: true,
      claim,
      timeline: buildClaimTimeline(claim),
      courierTracking: claim.courierTracking || [],
      notificationLog: claim.notificationLog || [],
      reconciliationPostings: postings,
    });
  } catch (error) {
    console.error('Claim detail error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/notify
 * Manually (re)send a WhatsApp/SMS status update to the patient for the
 * claim's current status.
 */
router.post('/claims/:claimId/notify', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const result = await notifyClaimStatusChange({
      claimId: claim.id,
      hospitalId: claim.hospital_id,
      status: claim.status,
      actor: req.user.name || 'insurance_desk_staff',
    });

    if (!result.success) {
      return res.status(200).json({ success: false, message: result.error || 'Could not send notification', channel: null });
    }

    res.json({ success: true, message: `Status update sent via ${result.channel}`, channel: result.channel });
  } catch (error) {
    console.error('Claim notify error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/:claimId/status-qr
 * QR code (data URL) linking to the public, unauthenticated patient
 * status-lookup page — for printing on discharge paperwork or displaying
 * at the insurance desk.
 */
router.get('/claims/:claimId/status-qr', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const { url, dataUrl } = await generateStatusQrCode(claim);
    res.json({ success: true, url, dataUrl });
  } catch (error) {
    console.error('Claim status QR error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Courier tracking — physical documents couriered to TPAs/insurers
 * (ClaimBook-parity gap: "Courier Tracking — Logs and monitors physical
 * documents sent to TPAs.")
 */
router.get('/claims/:claimId/courier', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }
    res.json({ success: true, shipments: claim.courierTracking || [] });
  } catch (error) {
    console.error('Courier list error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/claims/:claimId/courier', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  body('courierName').notEmpty().withMessage('Courier name is required'),
  body('trackingNumber').notEmpty().withMessage('Tracking/AWB number is required'),
  body('sentTo').notEmpty().withMessage('Recipient (TPA/insurer) is required'),
  body('documentType').optional().isString(),
  body('notes').optional().isString(),
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const { courierName, trackingNumber, sentTo, documentType, notes } = req.body;
    const shipment = {
      id: `courier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      courierName,
      trackingNumber,
      sentTo,
      documentType: documentType || 'claim_documents',
      notes: notes || '',
      status: 'in_transit',
      sentDate: new Date().toISOString(),
      deliveredDate: null,
      createdBy: req.user.id,
      createdByName: req.user.name || null,
    };

    await withClaimsRls(req, (transaction) => claim.update({
      courierTracking: [...(claim.courierTracking || []), shipment],
    }, { transaction }));

    res.json({ success: true, shipment });
  } catch (error) {
    console.error('Courier create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/claims/:claimId/courier/:entryId', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  body('status').isIn(['in_transit', 'delivered', 'returned']).withMessage('Invalid status'),
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const existing = claim.courierTracking || [];
    const idx = existing.findIndex((s) => s.id === req.params.entryId);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Courier shipment not found' });
    }

    const { status, notes } = req.body;
    const updatedEntry = {
      ...existing[idx],
      status,
      notes: notes !== undefined ? notes : existing[idx].notes,
      deliveredDate: status === 'delivered' ? new Date().toISOString() : existing[idx].deliveredDate,
    };
    // Build a new array (not a mutated copy of claim.courierTracking) —
    // Sequelize's changed-field detection compares by reference, so handing
    // back the same array object silently skips the UPDATE entirely.
    const shipments = existing.map((s, i) => (i === idx ? updatedEntry : s));

    await withClaimsRls(req, (transaction) => claim.update({ courierTracking: shipments }, { transaction }));

    res.json({ success: true, shipment: updatedEntry });
  } catch (error) {
    console.error('Courier update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/tpa/providers
 * Directory of integrated TPAs/insurers with their live-lookup capabilities.
 * Ring-fencing scopes hospital-role tokens to /api/hospital/*, so this proxies
 * tpaAggregator (mounted under /api/tpa, a different ring-fence key) rather
 * than having the frontend call /api/tpa directly.
 */
router.get('/tpa/providers', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const providers = tpaAggregator.getAvailableProviders();
    res.json({ success: true, providers });
  } catch (error) {
    console.error('TPA provider directory error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/tpa-status
 * Look up a claim's live status directly from its TPA/insurer, instead of
 * relying solely on Mediczy's own last-known status field. The 17 TPA
 * integrations in tpa-aggregator.service.js make real HTTP calls to real
 * partner endpoints, but need partner-issued credentials (env vars) per TPA;
 * without them this call fails honestly rather than returning fabricated data.
 */
router.post('/claims/:claimId/tpa-status', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findOne({
      where: { id: req.params.claimId, hospital_id: scope.hospitalId },
      transaction
    }));

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    if (!claim.insuranceProvider) {
      return res.json({
        success: true,
        supported: false,
        message: 'No insurer/TPA recorded on this claim yet.'
      });
    }

    let provider;
    try {
      provider = tpaAggregator.getProvider(claim.insuranceProvider);
    } catch {
      return res.json({
        success: true,
        supported: false,
        message: `"${claim.insuranceProvider}" is not one of Mediczy's ${Object.keys(tpaAggregator.providers).length} integrated TPA/insurer connections yet.`
      });
    }

    if (!provider.getClaimStatus) {
      return res.json({
        success: true,
        supported: false,
        message: `${claim.insuranceProvider} does not expose a live claim-status API in this integration.`
      });
    }

    try {
      const liveStatus = await provider.getClaimStatus({
        claimNumber: claim.claimNumber,
        policyNumber: claim.policyNumber
      });
      res.json({ success: true, supported: true, live: true, status: liveStatus });
    } catch (tpaError) {
      res.json({
        success: true,
        supported: true,
        live: false,
        message: `Could not reach ${claim.insuranceProvider}'s live claim-status API: ${tpaError.message}. Verify partner credentials are configured for this TPA.`
      });
    }
  } catch (error) {
    console.error('TPA claim status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/:claimId/pdf
 * Download claim PDF with attached documents
 */
router.get('/claims/:claimId/pdf', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, {
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber']
        }
      ],
      transaction
    }));

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    // Generate PDF using pdfkit, then stream it back directly — pdfPath
    // (e.g. "/pdfs/claims/x.pdf") was never mounted as a static route, and
    // mounting it as one would expose PHI-bearing claim PDFs with no auth
    // check. Streaming through this already-authenticated, RLS-scoped route
    // avoids ever creating a public path to these files.
    const pdfPath = await pdfGenerator.generateClaimPDF(claim, claim.patient);
    const filePath = path.join(__dirname, '..', 'public', pdfPath);
    res.download(filePath, `${claim.claimNumber}.pdf`, (err) => {
      if (err && !res.headersSent) {
        console.error('PDF download error:', err.message);
        res.status(500).json({ success: false, message: 'Could not send PDF file.' });
      }
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/pre-auth/:id/pdf
 * Generate TPA-specific pre-authorisation form PDF (auto-filled with all captured data)
 */
router.get('/pre-auth/:id/pdf', authUser, requireRole(['hospital', 'admin']), [
  param('id').notEmpty()
], async (req, res) => {
  try {
    const preAuth = await PreAuthorization.findOne({
      where: { id: req.params.id },
      include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'phoneNumber', 'dateOfBirth', 'gender', ['abhaHealthId', 'abhaId']] }]
    });
    if (!preAuth) return res.status(404).json({ success: false, message: 'Pre-auth not found' });

    // Load hospital profile for header
    const scope = resolvePortalScope(req);
    const hp = (await getPortalSectionPayload(scope, 'hospitalProfile')).basic || {};
    const hospital = {
      name:         hp.name || '',
      rohiniId:     hp.rohiniId || '',
      address:      hp.address || '',
      city:         [hp.city, hp.state].filter(Boolean).join(', '),
      phone:        hp.phone || '',
      providerCode: hp.providerCode || '',
    };

    const pdfPath = await pdfGenerator.generateTPAPreAuthFormPDF(preAuth.toJSON ? preAuth.toJSON() : preAuth, hospital);
    const filePath = path.join(__dirname, '..', 'public', pdfPath);
    res.download(filePath, `${preAuth.preAuthNumber}.pdf`, (err) => {
      if (err && !res.headersSent) {
        console.error('Pre-auth PDF download error:', err.message);
        res.status(500).json({ success: false, message: 'Could not send PDF file.' });
      }
    });
  } catch (error) {
    console.error('Pre-auth form PDF error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 3. PRE-AUTHORIZATION ====================

/**
 * POST /hospital/insurance/pre-auth/new
 * Request pre-approval for inpatient admission
 */
router.post('/pre-auth/new', authUser, requireRole(['hospital', 'admin']), [
  body('patientId').isInt(),
  body('policyNumber').notEmpty(),
  body('admissionDetails').isObject(),
  body('estimatedAmount').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const {
      patientId,
      policyNumber,
      insuranceProviderId,
      admissionDetails,
      estimatedAmount,
      diagnosis,
      plannedProcedures,
      procedureDetails,
      estimatedDuration,
      documents,
      remarks,
      organizationId,
      hospitalId
    } = req.body;
    const resolvedHospitalId = req.user.hospitalId || hospitalId || req.user.organizationId || organizationId;
    const resolvedOrganizationId = req.user.organizationId || organizationId || resolvedHospitalId;
    const normalizedAdmissionDetails = {
      ...(admissionDetails || {}),
      policyNumber,
    };
    const normalizedPlannedProcedures = plannedProcedures || procedureDetails || [];
    const normalizedDiagnosis = diagnosis || normalizedAdmissionDetails.diagnosis || 'Diagnosis not specified';
    const normalizedEstimatedDuration = estimatedDuration
      || normalizedAdmissionDetails.expectedDuration
      || normalizedAdmissionDetails.estimatedDuration
      || null;

    const preAuthNumber = `PA${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const preAuth = await PreAuthorization.create({
      preAuthNumber,
      patientId,
      hospitalId: resolvedHospitalId,
      organizationId: resolvedOrganizationId,
      policyNumber,
      insuranceProviderId,
      admissionDetails: normalizedAdmissionDetails,
      estimatedAmount,
      diagnosis: normalizedDiagnosis,
      plannedProcedures: normalizedPlannedProcedures,
      estimatedDuration: normalizedEstimatedDuration,
      status: 'pending',
      documents: documents || [],
      remarks: remarks || null,
      submittedBy: req.user.id,
      submittedAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Pre-authorization submitted successfully',
      preAuth
    });
  } catch (error) {
    console.error('Pre-auth creation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Attach a `patient` (id/firstName/lastName/email) field to each pre-auth row.
 * PreAuthorization declares a `patient` belongsTo(User) in its .associate(),
 * but that method is never invoked anywhere in the codebase (models/index.js
 * has no central association-wiring step for this model), so Sequelize's
 * `include: [{ model: User, as: 'patient' }]` always threw "User is not
 * associated to PreAuthorization!". A plain batch-fetch avoids depending on
 * that unregistered association entirely.
 */
async function attachPatients(preAuths) {
  const patientIds = [...new Set(preAuths.map((p) => p.patientId).filter(Boolean))];
  if (patientIds.length === 0) return preAuths.map((p) => ({ ...serializeModel(p), patient: null }));

  const patients = await User.findAll({
    where: { id: patientIds },
    attributes: ['id', 'firstName', 'lastName', 'email']
  });
  const byId = new Map(patients.map((u) => [u.id, u]));

  return preAuths.map((p) => ({ ...serializeModel(p), patient: byId.get(p.patientId) || null }));
}

/**
 * GET /hospital/insurance/pre-auth/pending
 * List of pre-auth requests waiting for insurer action
 */
router.get('/pre-auth/pending', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'pending' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows } = await PreAuthorization.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['submittedAt', 'DESC']]
      // insurance_provider_id is a plain provider-name string (see
      // services/insurance-provider.service.js's static `providers` config),
      // not a foreign key — there's no InsuranceProvider model to include.
    });
    const preAuths = await attachPatients(rows);

    res.json({
      success: true,
      preAuths,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Pending pre-auths error:', error);
    res.status(200).json({
      success: true,
      preAuths: [],
      pagination: {
        total: 0,
        page: parseInt(req.query.page || 1),
        limit: parseInt(req.query.limit || 20),
        totalPages: 0
      },
      degraded: true,
      message: 'Pre-authorization data temporarily unavailable'
    });
  }
});

/**
 * GET /hospital/insurance/pre-auth/approved
 * Track approved pre-authorization decisions
 */
router.get('/pre-auth/approved', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'approved' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows } = await PreAuthorization.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['approvedAt', 'DESC']]
    });
    const preAuths = await attachPatients(rows);

    res.json({
      success: true,
      preAuths,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Approved pre-auths error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/pre-auth/rejected
 * Track rejected pre-authorization decisions
 */
router.get('/pre-auth/rejected', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'rejected' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows } = await PreAuthorization.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['rejectedAt', 'DESC']]
    });
    const preAuths = await attachPatients(rows);

    res.json({
      success: true,
      preAuths,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Rejected pre-auths error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 4. DOCUMENTS CENTER ====================

/**
 * POST /hospital/insurance/documents/upload
 * Upload documents for claims
 */
router.post('/documents/upload', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { claimId, preAuthId, fileUrl, tags } = req.body;
    const documentType = req.body.documentType || req.body.docType || req.body.type;
    const uploadedFiles = getUploadedFiles(req.files || {});

    if (!documentType) {
      return res.status(400).json({ success: false, message: 'Document type is required' });
    }

    if (!fileUrl && uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, message: 'Document file or fileUrl is required' });
    }

    const documents = [];

    if (fileUrl) {
      documents.push({
        type: documentType,
        url: fileUrl,
        tags: tags || [],
        uploadedAt: new Date(),
        uploadedBy: req.user.id
      });
    }

    // Document-AI extraction runs only for the two document types the
    // rules engine actually checks fields against; extraction is never
    // written to the claim automatically — see /apply-extracted-fields.
    const extractableTypes = new Set(['discharge_summary', 'bills']);

    for (const file of uploadedFiles) {
      const uploadResult = await uploadToMinio({
        buffer: file.data,
        filePath: file.tempFilePath,
        originalName: file.name,
        mimeType: file.mimetype,
        keyPrefix: `hospital-insurance/${claimId ? `claim-${claimId}` : preAuthId ? `preauth-${preAuthId}` : 'documents'}`,
      });

      let extraction = null;
      if (extractableTypes.has(documentType)) {
        extraction = await extractClaimFields(file.data, file.mimetype, documentType);
      }

      documents.push({
        type: documentType,
        url: uploadResult.url,
        key: uploadResult.key,
        fileName: file.name,
        size: file.size,
        mimeType: file.mimetype,
        tags: tags || [],
        uploadedAt: new Date(),
        uploadedBy: req.user.id,
        ...(extraction ? { extraction } : {})
      });
    }

    if (claimId) {
      const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(claimId, { transaction }));
      if (!claim) {
        return res.status(404).json({ success: false, message: 'Claim not found' });
      }

      await withClaimsRls(req, (transaction) => claim.update({
        documents: [...(claim.documents || []), ...documents],
        documentsStatus: 'pending_verification'
      }, { transaction }));
    } else if (preAuthId) {
      const preAuth = await PreAuthorization.findByPk(preAuthId);
      if (!preAuth) {
        return res.status(404).json({ success: false, message: 'Pre-auth not found' });
      }
      
      await preAuth.update({
        documents: [...(preAuth.documents || []), ...documents]
      });
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      document: documents[0],
      documents
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/apply-extracted-fields
 * Human-reviewed apply step for document-AI extraction (see
 * insurance-document-ai.service.js). The frontend shows extracted fields
 * next to a checkbox per field; only what the reviewing staff member ticks
 * and submits here is ever written to the claim — nothing is auto-applied
 * at upload time.
 */
router.post('/claims/:claimId/apply-extracted-fields', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  body('fields').isObject()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const { fields } = req.body;
    const updateData = { lastModifiedBy: req.user.id, updatedAt: new Date() };

    if (fields.diagnosis) updateData.diagnosis = fields.diagnosis;
    if (fields.claimAmount != null && Number(fields.claimAmount) > 0) updateData.claimAmount = Number(fields.claimAmount);
    if (fields.hospitalizationDetails && typeof fields.hospitalizationDetails === 'object') {
      updateData.hospitalizationDetails = { ...(claim.hospitalizationDetails || {}), ...fields.hospitalizationDetails };
    }

    await withClaimsRls(req, (transaction) => claim.update(updateData, { transaction }));

    res.json({ success: true, message: 'Extracted fields applied to claim.', claim });
  } catch (error) {
    console.error('Apply extracted fields error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/documents/missing
 * Get alerts for missing documents
 */
router.get('/documents/missing', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const where = { documentsStatus: 'incomplete' };
    if (hospitalId) where.hospitalId = hospitalId;

    const claims = await withClaimsRls(req, (transaction) => InsuranceClaim.findAll({ where, transaction }));

    // Same unregistered-association gap as PreAuthorization — batch-fetch
    // patients by id instead of relying on InsuranceClaim's `patient` include.
    const patientIds = [...new Set(claims.map((c) => c.patientId).filter(Boolean))];
    const patients = patientIds.length
      ? await User.findAll({ where: { id: patientIds }, attributes: ['id', 'firstName', 'lastName'] })
      : [];
    const patientById = new Map(patients.map((p) => [p.id, p]));

    res.json({
      success: true,
      missingDocuments: claims.map(c => {
        const patient = patientById.get(c.patientId);
        return {
          claimId: c.id,
          claimNumber: c.claimNumber,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient',
          requiredDocuments: c.requiredDocuments || [],
          uploadedDocuments: (c.documents || []).map(d => d.type)
        };
      })
    });
  } catch (error) {
    console.error('Missing documents error:', error);
    res.status(200).json({
      success: true,
      missingDocuments: [],
      degraded: true,
      message: 'Missing documents data temporarily unavailable'
    });
  }
});

// ==================== 5. PATIENT / MEMBER SEARCH ====================

/**
 * POST /hospital/insurance/patient/search
 * Search patient by ABHA, mobile, name, policy
 */
router.post('/patient/search', authUser, requireRole(['hospital', 'admin']), [
  body('searchTerm').notEmpty()
], async (req, res) => {
  try {
    const { searchTerm, searchType } = req.body;

    let where = {};
    if (searchType === 'abha') {
      where.abhaHealthId = searchTerm;
    } else if (searchType === 'uhid') {
      const numericId = parseInt(String(searchTerm).replace(/^UH-?/i, ''), 10);
      where.id = Number.isNaN(numericId) ? -1 : numericId;
    } else if (searchType === 'mobile') {
      where.phoneNumber = searchTerm;
    } else if (searchType === 'policy') {
      // Prefer include-based fetch when association is available (or mocked in
      // tests), but gracefully fall back to plain claim fetch under missing
      // association wiring.
      let claims = [];
      try {
        claims = await withClaimsRls(req, (transaction) => InsuranceClaim.findAll({
          where: { policyNumber: searchTerm },
          include: [{ model: User, as: 'patient' }],
          transaction,
        }));
      } catch (includeError) {
        if (String(includeError?.message || '').toLowerCase().includes('association')) {
          claims = await withClaimsRls(req, (transaction) => InsuranceClaim.findAll({
            where: { policyNumber: searchTerm },
            transaction,
          }));
        } else {
          throw includeError;
        }
      }
      const claimPatientIds = [...new Set(claims.map((c) => c.patientId).filter(Boolean))];
      const claimPatients = claimPatientIds.length
        ? await User.findAll({ where: { id: claimPatientIds } })
        : [];
      const patientByClaimId = new Map(claimPatients.map((p) => [p.id, p]));

      const seenPatientIds = new Set();
      const patients = claims
        .map((claim) => {
          const patient = claim.patient || patientByClaimId.get(claim.patientId);
          if (!patient || seenPatientIds.has(patient.id)) {
            return null;
          }
          seenPatientIds.add(patient.id);
          return {
            ...patient.toJSON(),
            policyNumber: claim.policyNumber,
            insurerName: claim.insuranceProvider || null,
            insuranceProviderId: claim.insuranceProviderId || null,
          };
        })
        .filter(Boolean);
      return res.json({ success: true, patients, results: patients });
    } else {
      // Name search
      where[Op.or] = [
        { firstName: { [Op.like]: `%${searchTerm}%` } },
        { lastName: { [Op.like]: `%${searchTerm}%` } }
      ];
    }

    const patients = await User.findAll({ where, limit: 20 });

    res.json({ success: true, patients, results: patients });
  } catch (error) {
    console.error('Patient search error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/patient/:patientId/eligibility
 * Check policy validity and coverage
 */
router.get('/patient/:patientId/eligibility', authUser, requireRole(['hospital', 'admin']), [
  param('patientId').isInt(),
  query('policyNumber').notEmpty(),
  query('insuranceProvider').optional()
], async (req, res) => {
  try {
    const { policyNumber, insuranceProvider } = req.query;
    const patientId = req.params.patientId;

    // Check cache first
    const cacheKey = `eligibility:${policyNumber}`;
    const cached = await cacheService.get(cacheKey);
    
    if (cached) {
      return res.json({
        success: true,
        eligibility: cached,
        cached: true
      });
    }

    // Get patient details
    const patient = await User.findByPk(patientId);
    
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Check eligibility with insurance provider
    const provider = insuranceProvider || 'Star Health'; // Default provider
    const eligibility = await insuranceProvider.checkEligibility(
      policyNumber,
      provider,
      {
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        hospitalId: req.user.organizationId
      }
    );

    // Cache for 1 hour
    await cacheService.set(cacheKey, eligibility, 3600);

    res.json({
      success: true,
      eligibility,
      cached: false
    });
  } catch (error) {
    console.error('Eligibility check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/patient/:patientId/billing-summary
 * Pull the patient's real billing ledger (hospital_billing_charges — the same
 * table billing/pharmacy/lab post to) so a new claim's amount can be imported
 * from what was actually charged instead of typed in by hand. hospital_billing_charges
 * has no RLS (rowsecurity=false), so this is a plain scoped query.
 */
router.get('/patient/:patientId/billing-summary', authUser, requireRole(['hospital', 'admin']), [
  param('patientId').isInt(),
  query('admissionId').optional().isInt(),
], async (req, res) => {
  try {
    const { patientId } = req.params;
    const { admissionId } = req.query;
    const hospitalId = req.user.hospitalId || req.user.hospital_id;

    const replacements = { patientId, hospitalId };
    let admissionFilter = '';
    if (admissionId) {
      admissionFilter = 'AND admission_id = :admissionId';
      replacements.admissionId = admissionId;
    }

    const [charges] = await postgresSequelize.query(
      `SELECT id, charge_type, source_type, source_id, description, amount, currency, status, admission_id, posted_at
       FROM hospital_billing_charges
       WHERE patient_id = :patientId AND hospital_id = :hospitalId ${admissionFilter}
       ORDER BY posted_at DESC NULLS LAST, id DESC
       LIMIT 200`,
      { replacements }
    );

    const total = charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const byChargeType = Array.from(
      charges.reduce((map, c) => {
        const key = c.charge_type || 'other';
        map.set(key, (map.get(key) || 0) + (Number(c.amount) || 0));
        return map;
      }, new Map())
    ).map(([chargeType, amount]) => ({ chargeType, amount }));

    res.json({
      success: true,
      billingSummary: {
        total,
        chargeCount: charges.length,
        byChargeType,
        charges: charges.map((c) => ({
          id: c.id,
          chargeType: c.charge_type,
          sourceType: c.source_type,
          description: c.description,
          amount: Number(c.amount) || 0,
          status: c.status,
          admissionId: c.admission_id,
          postedAt: c.posted_at,
        })),
      },
    });
  } catch (error) {
    console.error('Billing summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 5.5. RECONCILIATION UPLOAD ====================

/**
 * POST /hospital/insurance/reconciliation/upload
 * Upload a reconciliation CSV for matching
 */
router.post('/reconciliation/upload', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id || req.user.tenant_id || req.user.id;
    const remittances = Array.isArray(req.body?.remittances) ? req.body.remittances : (req.body?.claimNumber ? [req.body] : []);
    if (remittances.length === 0) {
      return res.json({
        success: true,
        message: 'Reconciliation file received. No remittance rows in payload — upload CSV parser pending.',
        matched: 0, unmatched: 0, total: 0,
      });
    }
    const eraService = (await import('../services/hospital-era.service.js')).default;
    const results = [];
    for (const row of remittances) {
      try {
        const posted = await eraService.postEraRemittance(hospitalId, row, { id: req.user.id, name: req.user.name });
        results.push({ success: true, ...posted });
      } catch (e) {
        results.push({ success: false, claimNumber: row.claimNumber, message: e.message });
      }
    }
    const matched = results.filter((r) => r.success).length;
    res.json({
      success: true,
      message: `Posted ${matched} of ${remittances.length} ERA remittance(s)`,
      matched,
      unmatched: remittances.length - matched,
      total: remittances.length,
      results,
    });
  } catch (error) {
    console.error('Reconciliation upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/reconciliation/postings
 * List posted ERA/bank-statement remittances for this hospital
 */
router.get('/reconciliation/postings', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id || req.user.tenant_id || req.user.id;
    const eraService = (await import('../services/hospital-era.service.js')).default;
    const postings = await eraService.listEraPostings(hospitalId, {
      limit: parseInt(req.query.limit) || 50,
      claimId: req.query.claimId ? parseInt(req.query.claimId) : undefined,
      userId: req.user.id,
    });
    res.json({ success: true, postings });
  } catch (error) {
    console.error('Reconciliation postings list error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 6. REVENUE / FINANCIALS ====================

/**
 * GET /hospital/insurance/revenue/receivables
 * Shows unpaid/settled claims amounts
 */
router.get('/revenue/receivables', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const where = hospitalId ? { hospitalId } : {};

    const [approved, settled, pending, claims] = await withClaimsRls(req, async (transaction) => Promise.all([
      InsuranceClaim.sum('approvedAmount', {
        where: { ...where, status: 'approved', settlementStatus: 'pending' },
        transaction
      }),
      InsuranceClaim.sum('settledAmount', {
        where: { ...where, settlementStatus: 'settled' },
        transaction
      }),
      InsuranceClaim.sum('claimAmount', {
        where: { ...where, status: 'pending' },
        transaction
      }),
      InsuranceClaim.findAll({
        where,
        attributes: ['claimNumber', 'claimAmount', 'approvedAmount', 'settledAmount', 'status', 'settlementStatus', 'insuranceProvider', 'diagnosis', 'submittedAt', 'createdAt'],
        include: InsuranceClaim.associations?.patient ? [{
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName']
        }] : [],
        transaction
      })
    ]));

    const normalizedClaims = claims.map((claim) => {
      const plain = claim.toJSON ? claim.toJSON() : claim;
      const approvedAmount = Number(plain.approvedAmount) || 0;
      const settledAmount = Number(plain.settledAmount) || 0;
      const billedAmount = Number(plain.claimAmount) || 0;
      const status = plain.settlementStatus || plain.status || 'pending';
      const referenceDate = plain.submittedAt || plain.createdAt || new Date();
      return {
        claimNumber: plain.claimNumber,
        patientName: getDisplayPatientName(plain.patient),
        insurer: plain.insuranceProvider || 'Unknown',
        diagnosis: plain.diagnosis || '—',
        billedAmount,
        approvedAmount,
        settledAmount,
        nme: 0,
        discount: 0,
        tds: 0,
        disallowance: Math.max(0, billedAmount - approvedAmount),
        utr: null,
        settledDate: plain.settlementDate || null,
        status,
        ageDays: Math.max(0, Math.floor((Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24)))
      };
    });

    res.json({
      success: true,
      receivables: {
        approvedNotSettled: approved || 0,
        settled: settled || 0,
        pending: pending || 0,
        total: (approved || 0) + (settled || 0)
      },
      summaryByInsurer: buildReceivableSummaryByInsurer(claims),
      claims: normalizedClaims,
    });
  } catch (error) {
    console.error('Receivables error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/revenue/settlement-status
 * Track settlement status of claims
 */
router.get('/revenue/settlement-status', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'approved' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows: claims } = await withClaimsRls(req, (transaction) => InsuranceClaim.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['approvedAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      transaction
    }));

    res.json({
      success: true,
      settlements: claims.map(c => ({
        claimNumber: c.claimNumber,
        patientName: c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : 'Unknown',
        insurer: c.insuranceProvider || 'Unknown',
        billedAmount: Number(c.claimAmount) || 0,
        approvedAmount: c.approvedAmount,
        settledAmount: c.settledAmount,
        status: c.settlementStatus || c.status,
        settlementStatus: c.settlementStatus,
        settlementDate: c.settlementDate,
        diagnosis: c.diagnosis || '—',
        pendingAmount: (c.approvedAmount || 0) - (c.settledAmount || 0)
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Settlement status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 7. REPORTS / ANALYTICS ====================

/**
 * GET /hospital/insurance/reports/claims-aging
 * Claims aging report - TAT analysis
 */
router.get('/reports/claims-aging', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const where = { status: { [Op.in]: ['pending', 'query'] } };
    if (hospitalId) where.hospitalId = hospitalId;

    const claims = await withClaimsRls(req, (transaction) => InsuranceClaim.findAll({ where, attributes: ['claimAmount', 'approvedAmount', 'submittedAt', 'createdAt'], transaction }));

    const now = new Date();
    const aging = {
      '<7days': 0,
      '7-15days': 0,
      '15-30days': 0,
      '>30days': 0
    };

    const agingBuckets = normalizeAgingBuckets(aging);

    claims.forEach(claim => {
      const referenceDate = claim.submittedAt || claim.createdAt;
      if (!referenceDate) return;
      const days = Math.floor((now - new Date(referenceDate)) / (1000 * 60 * 60 * 24));
      const amount = Number(claim.approvedAmount) || Number(claim.claimAmount) || 0;
      const key = days < 7 ? '<7days' : days < 15 ? '7-15days' : days < 30 ? '15-30days' : '>30days';
      aging[key] += 1;
      const bucket = agingBuckets.find((item) => item.bucket === normalizeAgingBuckets({ [key]: 0 })[0].bucket);
      if (bucket) {
        bucket.amount += amount;
        bucket.value += amount;
        bucket.count = aging[key];
      }
    });

    res.json({ success: true, agingReport: aging, agingBuckets });
  } catch (error) {
    console.error('Aging report error:', error);
    res.status(200).json({
      success: true,
      agingReport: {
        '<7days': 0,
        '7-15days': 0,
        '15-30days': 0,
        '>30days': 0
      },
      agingBuckets: normalizeAgingBuckets({
        '<7days': 0,
        '7-15days': 0,
        '15-30days': 0,
        '>30days': 0
      }),
      degraded: true,
      message: 'Claims aging report temporarily unavailable'
    });
  }
});

/**
 * GET /hospital/insurance/reports/tat
 * Turnaround time reports
 */
router.get('/reports/tat', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, startDate, endDate } = req.query;
    const where = { status: { [Op.in]: ['approved', 'rejected'] } };
    
    if (hospitalId) where.hospitalId = hospitalId;
    if (startDate) where.submittedAt = { [Op.gte]: new Date(startDate) };
    if (endDate) {
      where.submittedAt = where.submittedAt 
        ? { ...where.submittedAt, [Op.lte]: new Date(endDate) }
        : { [Op.lte]: new Date(endDate) };
    }

    const claims = await withClaimsRls(req, (transaction) => InsuranceClaim.findAll({ where, attributes: ['claimNumber', 'status', 'submittedAt', 'approvedAt', 'rejectedAt', 'updatedAt', 'insuranceProvider'], transaction }));

    const tatData = claims.map(claim => {
      const submittedAt = new Date(claim.submittedAt);
      const resolvedAt = new Date(claim.approvedAt || claim.rejectedAt);
      const tatDays = Math.floor((resolvedAt - submittedAt) / (1000 * 60 * 60 * 24));
      
      return {
        claimNumber: claim.claimNumber,
        insurer: claim.insuranceProvider || 'Unknown',
        status: claim.status,
        tatDays
      };
    });

    const avgTAT = tatData.reduce((sum, item) => sum + item.tatDays, 0) / tatData.length || 0;
    const report = buildTatByInsurer(claims);

    res.json({
      success: true,
      report,
      tatReport: {
        averageTAT: Math.round(avgTAT * 10) / 10,
        totalClaims: claims.length,
        details: tatData,
        byInsurer: report,
      }
    });
  } catch (error) {
    console.error('TAT report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/reports/query-rejection-trends
 * Analyze query and rejection patterns
 */
router.get('/reports/query-rejection-trends', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, months = 6 } = req.query;
    const where = {};
    if (hospitalId) where.hospitalId = hospitalId;

    // Get last N months data
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    where.createdAt = { [Op.gte]: startDate };

    const claims = await withClaimsRls(req, (transaction) => InsuranceClaim.findAll({ where, attributes: ['status', 'rejectionReason', 'createdAt', 'submittedAt', 'updatedAt'], transaction }));

    const trends = {
      queries: claims.filter(c => c.status === 'query').length,
      rejections: claims.filter(c => c.status === 'rejected').length,
      approvals: claims.filter(c => c.status === 'approved').length,
      rejectionReasons: {}
    };

    claims.filter(c => c.status === 'rejected').forEach(claim => {
      const reason = claim.rejectionReason || 'Unknown';
      trends.rejectionReasons[reason] = (trends.rejectionReasons[reason] || 0) + 1;
    });

    res.json({ success: true, trends, timeline: buildTrendTimeline(claims, months) });
  } catch (error) {
    console.error('Trends report error:', error);
    res.status(200).json({
      success: true,
      trends: {
        queries: 0,
        rejections: 0,
        approvals: 0,
        rejectionReasons: {}
      },
      timeline: [],
      degraded: true,
      message: 'Query/rejection trends temporarily unavailable'
    });
  }
});

// ==================== 8. IHX PARITY MVP (TASKS, SLA, APPEALS) ====================

const getAgeInDays = (dateValue) => {
  if (!dateValue) return 0;
  const ageMs = Date.now() - new Date(dateValue).getTime();
  return Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
};

/**
 * GET /hospital/insurance/tasks/inbox
 * Unified task inbox for claim coordinators (queries, missing docs, denials, SLA followups)
 */
router.get('/tasks/inbox', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, thresholdDays = 3 } = req.query;
    const slaThreshold = parseInt(thresholdDays);

    const claimWhere = {
      [Op.or]: [
        { status: { [Op.in]: ['query', 'rejected', 'pending'] } },
        { documentsStatus: 'incomplete' }
      ]
    };

    if (hospitalId) claimWhere.hospitalId = hospitalId;

    const preAuthWhere = { status: 'pending' };
    if (hospitalId) preAuthWhere.hospitalId = hospitalId;

    const [claims, preAuths] = await withClaimsRls(req, async (transaction) => Promise.all([
      InsuranceClaim.findAll({
        where: claimWhere,
        order: [['updatedAt', 'DESC']],
        include: [
          {
            model: User,
            as: 'patient',
            attributes: ['id', 'firstName', 'lastName']
          }
        ],
        limit: 200,
        transaction
      }),
      PreAuthorization.findAll({
        where: preAuthWhere,
        order: [['submittedAt', 'ASC']],
        include: [
          {
            model: User,
            as: 'patient',
            attributes: ['id', 'firstName', 'lastName']
          }
        ],
        limit: 100,
        transaction
      })
    ]));

    const claimTasks = [];

    claims.forEach((claim) => {
      const ageDays = getAgeInDays(claim.submittedAt || claim.createdAt);
      const patientName = claim.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : 'Unknown';

      if (claim.status === 'query') {
        claimTasks.push({
          taskType: 'query-response',
          taskLabel: 'Respond to insurer query',
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientName,
          status: claim.status,
          ageDays,
          priority: ageDays >= slaThreshold ? 'high' : 'normal',
          slaFlag: ageDays >= slaThreshold ? 'breached' : 'within-sla'
        });
      }

      if (claim.documentsStatus === 'incomplete') {
        claimTasks.push({
          taskType: 'missing-documents',
          taskLabel: 'Upload required documents',
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientName,
          status: claim.status,
          ageDays,
          priority: 'high',
          slaFlag: ageDays >= slaThreshold ? 'breached' : 'within-sla'
        });
      }

      if (claim.status === 'rejected') {
        claimTasks.push({
          taskType: 'denial-appeal',
          taskLabel: 'Review rejection and file appeal',
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientName,
          status: claim.status,
          rejectionReason: claim.rejectionReason,
          ageDays,
          priority: 'high',
          slaFlag: ageDays >= slaThreshold ? 'breached' : 'within-sla'
        });
      }

      if (claim.status === 'pending' && ageDays >= slaThreshold) {
        claimTasks.push({
          taskType: 'claim-followup',
          taskLabel: 'Follow up pending claim',
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientName,
          status: claim.status,
          ageDays,
          priority: ageDays >= slaThreshold + 2 ? 'high' : 'normal',
          slaFlag: 'breached'
        });
      }
    });

    const preAuthTasks = preAuths.map((preAuth) => {
      const ageDays = getAgeInDays(preAuth.submittedAt || preAuth.createdAt);
      const patientName = preAuth.patient ? `${preAuth.patient.firstName} ${preAuth.patient.lastName}` : 'Unknown';

      return {
        taskType: 'preauth-followup',
        taskLabel: 'Follow up pending pre-authorization',
        preAuthId: preAuth.id,
        preAuthNumber: preAuth.preAuthNumber,
        patientName,
        status: preAuth.status,
        ageDays,
        priority: ageDays >= slaThreshold ? 'high' : 'normal',
        slaFlag: ageDays >= slaThreshold ? 'breached' : 'within-sla'
      };
    });

    const tasks = [...claimTasks, ...preAuthTasks]
      .sort((a, b) => {
        if (a.priority === b.priority) return b.ageDays - a.ageDays;
        return a.priority === 'high' ? -1 : 1;
      });

    res.json({
      success: true,
      taskInbox: tasks,
      summary: {
        total: tasks.length,
        highPriority: tasks.filter(t => t.priority === 'high').length,
        slaBreached: tasks.filter(t => t.slaFlag === 'breached').length
      }
    });
  } catch (error) {
    console.error('Task inbox error:', error);
    res.status(200).json({
      success: true,
      taskInbox: [],
      summary: {
        total: 0,
        highPriority: 0,
        slaBreached: 0
      },
      degraded: true,
      message: 'Task inbox temporarily unavailable'
    });
  }
});

/**
 * GET /hospital/insurance/claims/escalations
 * SLA breach flags for pending/query/rejected claims
 */
router.get('/claims/escalations', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, thresholdDays = 7 } = req.query;
    const slaThreshold = parseInt(thresholdDays);

    const where = {
      status: { [Op.in]: ['pending', 'query', 'submitted', 'rejected'] }
    };

    if (hospitalId) where.hospitalId = hospitalId;

    const claims = await withClaimsRls(req, (transaction) => InsuranceClaim.findAll({
      where,
      order: [['submittedAt', 'ASC']],
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      limit: 300,
      transaction
    }));

    const escalations = claims
      .map((claim) => {
        const ageDays = getAgeInDays(claim.submittedAt || claim.createdAt);
        const isBreached = ageDays >= slaThreshold || (claim.status === 'query' && ageDays >= 3);
        const patientName = claim.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : 'Unknown';

        return {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientName,
          status: claim.status,
          ageDays,
          slaThreshold,
          slaFlag: isBreached ? 'breached' : 'within-sla',
          escalationLevel: isBreached ? (ageDays >= slaThreshold + 3 ? 'critical' : 'warning') : 'normal'
        };
      })
      .filter(item => item.slaFlag === 'breached')
      .sort((a, b) => b.ageDays - a.ageDays);

    res.json({
      success: true,
      escalations,
      summary: {
        totalBreached: escalations.length,
        critical: escalations.filter(e => e.escalationLevel === 'critical').length,
        warning: escalations.filter(e => e.escalationLevel === 'warning').length
      }
    });
  } catch (error) {
    console.error('Escalations error:', error);
    res.status(200).json({
      success: true,
      escalations: [],
      summary: {
        totalBreached: 0,
        critical: 0,
        warning: 0
      },
      degraded: true,
      message: 'Escalation data temporarily unavailable'
    });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/appeal
 * Denial appeal workflow (capture reason and move back to pending)
 */
/**
 * POST /hospital/insurance/claims/:claimId/copilot/draft-appeal
 * AI co-pilot: drafts an editable appeal letter from the claim's denial/query
 * reason. This never submits anything itself — the draft is meant to be
 * reviewed/edited and then sent via the existing POST /claims/:claimId/appeal.
 */
router.post('/claims/:claimId/copilot/draft-appeal', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  body('rejectionReason').optional().isString(),
  body('additionalContext').optional().isString(),
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const draft = await draftAppealLetter(claim, {
      rejectionReason: req.body.rejectionReason,
      additionalContext: req.body.additionalContext,
    });
    res.json({ success: true, draft });
  } catch (error) {
    console.error('AI appeal draft error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/copilot/check-gaps
 * AI co-pilot: semantic coherence check across the claim's stated
 * diagnosis/treatment vs whatever insurance-document-ai.service.js already
 * extracted from uploaded documents — catches things
 * claims-rules-engine.service.js's deterministic checks can't (e.g. a
 * surgery diagnosis with no OT charges on the bill).
 */
router.post('/claims/:claimId/copilot/check-gaps', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const result = await checkDocumentationGaps(claim);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('AI documentation gap check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/claims/:claimId/appeal', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  body('appealReason').notEmpty().withMessage('Appeal reason is required'),
  body('supportingNotes').optional().isString()
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const { appealReason, supportingNotes } = req.body;

    const appealEntry = {
      type: 'appeal',
      appealedAt: new Date(),
      appealedBy: req.user.id,
      appealReason,
      supportingNotes: supportingNotes || ''
    };

    await withClaimsRls(req, (transaction) => claim.update({
      status: 'pending',
      queryHistory: [...(claim.queryHistory || []), appealEntry],
      notes: `${claim.notes || ''}\n[APPEAL ${new Date().toISOString()}] ${appealReason}`.trim(),
      updatedAt: new Date(),
      lastModifiedBy: req.user.id
    }, { transaction }));

    // Two-way sync: if this claim already has a claim_denials record (created
    // via the /denials endpoints below, or from the Accounts/billing module),
    // keep it in step instead of letting the two views silently diverge.
    try {
      const linkedDenial = await ClaimDenial.findOne({ where: { claimId: claim.id }, order: [['createdAt', 'DESC']] });
      if (linkedDenial && linkedDenial.status !== 'resolved') {
        await linkedDenial.update({
          status: 'appealed',
          appealLetter: linkedDenial.appealLetter || `${appealReason}\n\n${supportingNotes || ''}`.trim(),
          appealedAt: new Date(),
          appealedBy: req.user.id,
        });
      }
    } catch (syncError) {
      console.warn('claim_denials sync on appeal skipped:', syncError.message);
    }

    res.json({
      success: true,
      message: 'Appeal submitted successfully. Claim moved to pending review.',
      claim
    });
  } catch (error) {
    console.error('Appeal submission error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Denial management (claim_denials) — surfaced in the insurance-desk module
 * for the first time 2026-08-15. Previously only reachable via the Accounts
 * /hospital/billing/denials endpoints; these wrap the same
 * denial-management.service.js functions so both modules share one system
 * of record instead of two.
 */
router.get('/claims/:claimId/denials', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

    const all = await denialService.listDenials(claim.hospitalId || claim.organizationId, { limit: 20 });
    const denials = all.filter((d) => d.claimId === claim.id || d.claimNumber === claim.claimNumber);
    res.json({ success: true, denials });
  } catch (error) {
    console.error('List claim denials error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/claims/:claimId/denials', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  body('denialCode').optional().isString(),
  body('denialReason').notEmpty().withMessage('Denial reason is required'),
  body('deniedAmount').optional().isNumeric(),
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

    const denial = await denialService.createDenial(claim.hospitalId || claim.organizationId, {
      organizationId: claim.organizationId,
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      patientId: claim.patientId,
      denialCode: req.body.denialCode,
      denialReason: req.body.denialReason,
      deniedAmount: req.body.deniedAmount,
    }, req.user.id);

    res.status(201).json({ success: true, denial });
  } catch (error) {
    console.error('Create claim denial error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/claims/:claimId/denials/:denialId/appeal', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  param('denialId').isInt(),
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

    const result = await denialService.draftAppeal(claim.hospitalId || claim.organizationId, parseInt(req.params.denialId), req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Draft denial appeal error:', error);
    res.status(error.message === 'Denial not found' ? 404 : 500).json({ success: false, message: error.message });
  }
});

router.post('/claims/:claimId/denials/:denialId/resolve', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  param('denialId').isInt(),
  body('resolution').optional().isString(),
  body('notes').optional().isString(),
], async (req, res) => {
  try {
    const claim = await withClaimsRls(req, (transaction) => InsuranceClaim.findByPk(req.params.claimId, { transaction }));
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

    const result = await denialService.resolveDenial(
      claim.hospitalId || claim.organizationId,
      parseInt(req.params.denialId),
      { resolution: req.body.resolution, notes: req.body.notes },
      req.user.id
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Resolve claim denial error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/appeals
 * List claims with appeal events for denial management tracking
 */
router.get('/claims/appeals', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 30 } = req.query;
    const where = {
      status: { [Op.in]: ['rejected', 'pending', 'query'] }
    };

    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: claims } = await withClaimsRls(req, (transaction) => InsuranceClaim.findAndCountAll({
      where,
      order: [['updatedAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      offset,
      limit: parseInt(limit),
      transaction
    }));

    const appealedClaims = claims
      .map((claim) => {
        const history = Array.isArray(claim.queryHistory) ? claim.queryHistory : [];
        const appealEvents = history.filter(item => item?.type === 'appeal');
        const latestAppeal = appealEvents.length > 0 ? appealEvents[appealEvents.length - 1] : null;

        if (!latestAppeal && claim.status !== 'rejected') {
          return null;
        }

        return {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientName: claim.patient ? `${claim.patient.firstName} ${claim.patient.lastName}` : 'Unknown',
          status: claim.status,
          rejectionReason: claim.rejectionReason,
          appealCount: appealEvents.length,
          latestAppeal
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      appeals: appealedClaims,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Appeals list error:', error);
    res.status(200).json({
      success: true,
      appeals: [],
      pagination: {
        total: 0,
        page: parseInt(req.query.page || 1),
        limit: parseInt(req.query.limit || 30),
        totalPages: 0
      },
      degraded: true,
      message: 'Appeals list temporarily unavailable'
    });
  }
});

// ==================== 9. ADMISSION & DISCHARGE MANAGEMENT ====================

/**
 * GET /hospital/insurance/admissions
 * List currently admitted patients (approved pre-auths)
 */
router.get('/admissions', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 50 } = req.query;
    const where = { status: 'approved' };
    if (hospitalId) where.hospitalId = hospitalId;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: preAuths } = await PreAuthorization.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'phone'] }],
      offset,
      limit: parseInt(limit)
    });

    const admissions = preAuths.map(pa => ({
      id: pa.id,
      preAuthNo: pa.preAuthNumber,
      preAuthId: pa.id,
      uhid: `UH-${String(pa.patientId).padStart(8, '0')}`,
      name: pa.patient ? `${pa.patient.firstName} ${pa.patient.lastName}` : 'Unknown',
      phone: pa.patient?.phone || '',
      policy: pa.policyNumber,
      insurer: pa.insuranceProvider?.name || pa.admissionDetails?.insurer || pa.insuranceProviderId || 'Unknown',
      ward: pa.admissionDetails?.roomType || pa.admissionDetails?.ward || 'General',
      admDate: pa.admissionDetails?.admissionDate || pa.createdAt,
      diagnosis: pa.diagnosis,
      approvedAmt: parseFloat(pa.approvedAmount) || 0,
      estimatedDays: pa.estimatedDuration || 0,
      approvalNo: pa.approvalNumber,
      status: 'admitted'
    }));

    res.json({ success: true, admissions, total: count });
  } catch (error) {
    console.error('Admissions list error:', error);
    res.status(200).json({ success: true, admissions: [], total: 0, degraded: true, message: 'Admissions list temporarily unavailable' });
  }
});

/**
 * POST /hospital/insurance/admissions
 * Register new admission + create pre-auth
 */
router.post('/admissions', authUser, requireRole(['hospital', 'admin']), [
  body('policyNo').notEmpty().withMessage('Policy number is required'),
  body('uhid').notEmpty().withMessage('Patient UHID is required'),
  body('diagnosis').notEmpty().withMessage('Diagnosis is required'),
], async (req, res) => {
  try {
    const { uhid, policyNo, insurer, admDate, ward, preAuthNo, diagnosis, attendingDoctor, estimatedDays, estimatedAmount } = req.body;
    const hospitalId = req.user.hospitalId || req.user.organizationId;
    const organizationId = req.user.organizationId || hospitalId;

    // Try to find or create patient record
    let patient = await User.findOne({ where: { uhid: uhid } }).catch(() => null);
    const patientId = patient?.id || req.user.id;

    const preAuthNumber = preAuthNo || `PA-${Date.now()}`;

    const pa = await PreAuthorization.create({
      preAuthNumber,
      patientId,
      hospitalId,
      organizationId,
      policyNumber: policyNo,
      admissionDetails: {
        uhid,
        insurer,
        ward: ward || 'General',
        roomType: ward || 'General',
        admissionDate: admDate || new Date().toISOString(),
        admissionType: 'planned',
        attendingDoctor
      },
      estimatedAmount: estimatedAmount || 50000,
      diagnosis,
      estimatedDuration: parseInt(estimatedDays) || 3,
      status: 'approved',
      submittedAt: new Date(),
      submittedBy: req.user.id
    });

    res.json({ success: true, message: 'Patient admitted successfully. Insurer notified.', preAuth: pa });
  } catch (error) {
    console.error('Admission create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/discharge/:preAuthId
 * Process discharge and submit final claim
 */
/**
 * GET /hospital/insurance/pre-auth/:preAuthId/discharge-audit
 * Dry-run of the pre-discharge audit (see insurance-pre-discharge-audit.service.js):
 * advance paid, non-medical expenses cleared, excess-over-approval cleared,
 * within hospital credit limit, and claim admissibility — the five things
 * an insurance desk has to confirm before telling the ward it's OK to
 * discharge a cashless patient.
 */
router.get('/pre-auth/:preAuthId/discharge-audit', authUser, requireRole(['hospital', 'admin']), [
  param('preAuthId').isInt(),
], async (req, res) => {
  try {
    const preAuth = await PreAuthorization.findByPk(req.params.preAuthId);
    if (!preAuth) return res.status(404).json({ success: false, message: 'Pre-auth not found' });

    const hospitalId = preAuth.hospitalId || req.user.hospitalId || req.user.organizationId;
    const audit = await runPreDischargeAudit(hospitalId, preAuth);
    res.json({ success: true, audit });
  } catch (error) {
    console.error('Pre-discharge audit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/pre-auth/:preAuthId/discharge-clearance
 * Issues (or records an overridden) discharge clearance for the ward, based
 * on the audit above. Stored on the pre-auth record itself so it's visible
 * to whoever looks the pre-auth up next — this is the actual sign-off, not
 * just a read-only check.
 */
router.post('/pre-auth/:preAuthId/discharge-clearance', authUser, requireRole(['hospital', 'admin']), [
  param('preAuthId').isInt(),
  body('override').optional().isBoolean(),
  body('overrideReason').optional().isString(),
], async (req, res) => {
  try {
    const preAuth = await PreAuthorization.findByPk(req.params.preAuthId);
    if (!preAuth) return res.status(404).json({ success: false, message: 'Pre-auth not found' });

    const hospitalId = preAuth.hospitalId || req.user.hospitalId || req.user.organizationId;
    const audit = await runPreDischargeAudit(hospitalId, preAuth);
    const { override, overrideReason } = req.body;

    if (!audit.canClearDischarge && !override) {
      return res.status(400).json({
        success: false,
        message: 'Discharge cannot be cleared — one or more audit checks failed. Resolve them, or resubmit with override + a documented reason.',
        audit
      });
    }
    if (!audit.canClearDischarge && override && !overrideReason?.trim()) {
      return res.status(400).json({ success: false, message: 'An override reason is required when clearing discharge over failed audit checks.' });
    }

    const clearance = {
      clearedBy: req.user.id,
      clearedByName: req.user.name || req.user.fullName || req.user.email || null,
      clearedAt: new Date().toISOString(),
      canClearDischarge: audit.canClearDischarge,
      overridden: !audit.canClearDischarge && !!override,
      overrideReason: !audit.canClearDischarge && override ? overrideReason.trim() : null,
      checks: audit.checks,
    };

    await preAuth.update({
      admissionDetails: { ...(preAuth.admissionDetails || {}), dischargeClearance: clearance }
    });

    res.json({ success: true, message: 'Discharge clearance recorded.', clearance });
  } catch (error) {
    console.error('Discharge clearance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/discharge/:preAuthId', authUser, requireRole(['hospital', 'admin']), [
  param('preAuthId').isInt(),
], async (req, res) => {
  try {
    const preAuth = await PreAuthorization.findByPk(req.params.preAuthId, {
      include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName'] }]
    });
    if (!preAuth) return res.status(404).json({ success: false, message: 'Pre-auth not found' });

    if (preAuth.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Only approved pre-authorizations can be converted to a claim (current status: ${preAuth.status}).`
      });
    }

    const { billItems, totalAmount, dischargeNote, dischargeDate } = req.body;
    const hospitalId = req.user.hospitalId || req.user.organizationId;
    const organizationId = req.user.organization_id || req.user.organizationId || hospitalId;

    // Create the final claim from this pre-auth, carrying over patient/policy/
    // amount/diagnosis already on file instead of a second manual entry.
    const claimNumber = `CL-${Date.now()}`;
    const claim = await withClaimsRls(req, async (transaction) => {
      const created = await InsuranceClaim.create({
        claimNumber,
        patientId: preAuth.patientId,
        hospitalId,
        organizationId,
        preAuthId: preAuth.id,
        policyNumber: preAuth.policyNumber,
        insuranceProvider: preAuth.admissionDetails?.insurer || null,
        claimAmount: totalAmount || parseFloat(preAuth.approvedAmount) || parseFloat(preAuth.estimatedAmount) || 0,
        diagnosis: preAuth.diagnosis,
        status: 'submitted',
        submittedAt: new Date(),
        notes: dischargeNote || '',
        hospitalizationDetails: {
          ...(preAuth.admissionDetails || {}),
          billItems: billItems || [],
          dischargeDate: dischargeDate || new Date().toISOString(),
        },
        submittedBy: req.user.id
      }, { transaction });

      // Mark pre-auth as complete in the same transaction so a failure here
      // rolls back the claim too, instead of leaving a duplicate on retry.
      await preAuth.update({
        status: 'cancelled',
        notes: `Discharged ${dischargeDate || new Date().toISOString()} — converted to claim ${claimNumber}`
      }, { transaction });

      return created;
    });

    res.json({ success: true, message: 'Discharge processed. Claim submitted to insurer.', claim });
  } catch (error) {
    console.error('Discharge error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 17. INSURANCE PORTAL PERSISTENCE ====================

router.get('/portal/messages', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    await ensurePortalMessages(scope);

    const where = { hospitalId: scope.hospitalId };
    const { search = '', priority = 'all' } = req.query;
    if (priority !== 'all') where.priority = priority;

    const threads = await InsurancePortalMessageThread.findAll({
      where,
      order: [['lastMessageAt', 'DESC']],
    });

    const normalizedSearch = String(search).trim().toLowerCase();
    const filteredThreads = threads.filter((thread) => {
      if (!normalizedSearch) return true;
      const data = serializeModel(thread);
      return [data.patientName, data.claimNo, data.insurer, data.subject, data.tpa]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });

    res.json({
      success: true,
      threads: filteredThreads.map(formatPortalThread),
    });
  } catch (error) {
    console.error('Portal messages fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/portal/messages/:threadId/read', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const thread = await InsurancePortalMessageThread.findOne({
      where: { id: req.params.threadId, hospitalId: scope.hospitalId },
    });

    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    await thread.update({ unreadCount: 0, lastUpdatedBy: scope.userId });

    res.json({ success: true, thread: formatPortalThread(thread) });
  } catch (error) {
    console.error('Portal thread read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/portal/messages/:threadId/reply', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const { text, attachments = [] } = req.body || {};
    if (!String(text || '').trim()) {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }

    const thread = await InsurancePortalMessageThread.findOne({
      where: { id: req.params.threadId, hospitalId: scope.hospitalId },
    });
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    const message = {
      id: buildPortalId('msg'),
      from: 'hospital',
      sender: scope.senderName,
      text: String(text).trim(),
      time: new Date().toISOString(),
      attachments: Array.isArray(attachments) ? attachments : [],
    };

    const existingMessages = Array.isArray(thread.messages) ? thread.messages : [];
    await thread.update({
      messages: [...existingMessages, message],
      lastMessage: message.text,
      lastMessageAt: new Date(),
      unreadCount: 0,
      lastUpdatedBy: scope.userId,
    });

    res.json({ success: true, thread: formatPortalThread(thread), message });
  } catch (error) {
    console.error('Portal thread reply error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/portal/messages/:threadId/escalate', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const thread = await InsurancePortalMessageThread.findOne({
      where: { id: req.params.threadId, hospitalId: scope.hospitalId },
    });
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    const metadata = serializeModel(thread).metadata || {};
    await thread.update({
      metadata: {
        ...metadata,
        escalatedAt: new Date().toISOString(),
        escalatedBy: scope.userId,
      },
      priority: 'urgent',
      lastUpdatedBy: scope.userId,
    });

    res.json({ success: true, thread: formatPortalThread(thread) });
  } catch (error) {
    console.error('Portal thread escalation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/portal/notifications', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    await Promise.all([ensurePortalNotifications(scope), ensurePortalMessages(scope)]);

    const notifications = await InsurancePortalNotification.findAll({
      where: { hospitalId: scope.hospitalId },
      order: [['occurredAt', 'DESC']],
    });
    const threads = await InsurancePortalMessageThread.findAll({
      where: { hospitalId: scope.hospitalId },
      order: [['lastMessageAt', 'DESC']],
    });

    const unreadThreads = threads.filter((thread) => Number(thread.unreadCount) > 0).length;
    const urgentThreads = threads.filter((thread) => ['urgent', 'high'].includes(String(thread.priority))).length;
    const pendingReply = threads.filter((thread) => ['query', 'pending'].includes(String(thread.status))).length;

    res.json({
      success: true,
      notifications: notifications.map(formatPortalNotification),
      tpaSummary: {
        unreadThreads,
        urgentThreads,
        pendingReply,
      },
      tpaThreads: threads.slice(0, 3).map(formatPortalThread),
    });
  } catch (error) {
    console.error('Portal notifications fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/portal/notifications/mark-all-read', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    await ensurePortalNotifications(scope);

    const notifications = await InsurancePortalNotification.findAll({
      where: { hospitalId: scope.hospitalId, isRead: false },
    });

    await Promise.all(notifications.map((notification) => notification.update({
      isRead: true,
      readAt: new Date(),
    })));

    res.json({ success: true, updated: notifications.length });
  } catch (error) {
    console.error('Portal notifications mark-all-read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/portal/notifications/:notificationId/read', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const notification = await InsurancePortalNotification.findOne({
      where: { id: req.params.notificationId, hospitalId: scope.hospitalId },
    });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    await notification.update({ isRead: true, readAt: new Date() });

    res.json({ success: true, notification: formatPortalNotification(notification) });
  } catch (error) {
    console.error('Portal notification read error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/portal/:section(payer-management|hospital-profile|settings)', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const field = PORTAL_SECTION_FIELD_MAP[req.params.section];
    const data = await getPortalSectionPayload(scope, field);

    res.json({ success: true, data });
  } catch (error) {
    console.error('Portal section fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/portal/:section(payer-management|hospital-profile|settings)', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const field = PORTAL_SECTION_FIELD_MAP[req.params.section];
    const data = await updatePortalSectionPayload(scope, field, req.body?.data || req.body || {});

    res.json({ success: true, data });
  } catch (error) {
    console.error('Portal section update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/portal/compliance/:section(govt-schemes|nhcx|abdm|tariff|empanelment)', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const field = PORTAL_SECTION_FIELD_MAP[`compliance/${req.params.section}`];
    const data = await getPortalSectionPayload(scope, field);

    res.json({ success: true, data });
  } catch (error) {
    console.error('Portal compliance fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/portal/compliance/:section(govt-schemes|nhcx|abdm|tariff|empanelment)', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const field = PORTAL_SECTION_FIELD_MAP[`compliance/${req.params.section}`];
    const data = await updatePortalSectionPayload(scope, field, req.body?.data || req.body || {});

    res.json({ success: true, data });
  } catch (error) {
    console.error('Portal compliance update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * NHCX (National Health Claims Exchange) integration — 2026-08-15. Real FHIR
 * bundle construction + gateway call when NHCX_CLIENT_ID/SECRET are set;
 * an honest "not configured" result otherwise (see nhcx-client.service.js).
 * Every call is logged to nhcx_activity_log so the compliance page shows
 * genuine activity instead of a static tracker.
 */
const logNhcxActivity = async (organizationId, workflow, result, userId) => {
  await pgPool.query(
    `INSERT INTO nhcx_activity_log (organization_id, workflow, correlation_id, configured, sent, error, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [organizationId, workflow, result.correlationId || null, Boolean(result.configured), Boolean(result.sent), result.error || null, userId || null]
  ).catch((e) => console.warn('nhcx_activity_log insert skipped:', e.message));
};

router.post('/nhcx/eligibility-check', authUser, requireRole(['hospital', 'admin']), [
  body('patientName').notEmpty(),
  body('policyNumber').notEmpty(),
  body('insurerCode').notEmpty(),
], async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const result = await nhcxClient.submitEligibilityCheck({ ...req.body, hospitalId: scope.hospitalId });
    await logNhcxActivity(scope.organizationId, 'eligibility-check', result, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('NHCX eligibility check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/nhcx/preauth-submit', authUser, requireRole(['hospital', 'admin']), [
  body('preAuthNumber').notEmpty(),
  body('patientName').notEmpty(),
  body('policyNumber').notEmpty(),
  body('insurerCode').notEmpty(),
], async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const result = await nhcxClient.submitPreAuth({ ...req.body, hospitalId: scope.hospitalId });
    await logNhcxActivity(scope.organizationId, 'preauth-submit', result, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('NHCX pre-auth submit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/nhcx/claim-submit', authUser, requireRole(['hospital', 'admin']), [
  body('claimNumber').notEmpty(),
  body('patientName').notEmpty(),
  body('policyNumber').notEmpty(),
  body('insurerCode').notEmpty(),
], async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const result = await nhcxClient.submitClaim({ ...req.body, hospitalId: scope.hospitalId });
    await logNhcxActivity(scope.organizationId, 'claim-submit', result, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('NHCX claim submit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * TPA/insurer credential-readiness — 2026-08-15. Turns "nobody knows what's
 * missing" into a live checklist: which of the 17 coded TPA connectors and
 * 4 insurer eligibility clients actually have credentials configured, and
 * exactly which env var to set to turn each one on. No secrets are returned.
 */
const TPA_CREDENTIAL_ENV_VARS = {
  heritage:    ['HERITAGE_TPA_AUTH_ID'],
  mdindia:     ['MDINDIA_TPA_USERNAME', 'MDINDIA_TPA_PASSWORD'],
  healthindia: ['HEALTHINDIA_TPA_AUTH_TOKEN', 'HEALTHINDIA_TPA_CLIENT_ID'],
  care:        ['CARE_TPA_PARTNER_ID', 'CARE_TPA_PARTNER_KEY'],
  fgi:         ['FGI_TPA_CLIENT_ID', 'FGI_TPA_CLIENT_SECRET', 'FGI_TPA_API_KEY'],
  godigit:     ['GODIGIT_TPA_CLIENT_ID', 'GODIGIT_TPA_CLIENT_SECRET'],
  icici:       ['ICICI_TPA_USERNAME', 'ICICI_TPA_PASSWORD'],
  mediassist:  ['MEDIASSIST_TPA_CLIENT_ID', 'MEDIASSIST_TPA_USERNAME', 'MEDIASSIST_TPA_PASSWORD'],
  starhealth:  ['STARHEALTH_TPA_USERNAME', 'STARHEALTH_TPA_PASSWORD', 'STARHEALTH_TPA_PARTNER_ID'],
  fhpl:        ['FHPL_TPA_USERNAME', 'FHPL_TPA_PASSWORD', 'FHPL_TPA_CLIENT_ID'],
  medsave:     ['MEDSAVE_TPA_CLIENT_ID', 'MEDSAVE_TPA_SECRET', 'MEDSAVE_TPA_API_KEY'],
  nivabupa:    ['NIVABUPA_TPA_USERNAME', 'NIVABUPA_TPA_PASSWORD', 'NIVABUPA_TPA_API_KEY'],
  paramount:   ['PARAMOUNT_TPA_USERNAME', 'PARAMOUNT_TPA_PASSWORD', 'PARAMOUNT_TPA_CLIENT_ID'],
  raksha:      ['RAKSHA_TPA_API_KEY', 'RAKSHA_TPA_SECRET'],
  vidal:       ['VIDAL_TPA_CLIENT_ID', 'VIDAL_TPA_SECRET', 'VIDAL_TPA_API_KEY'],
  volo:        ['VOLO_TPA_USERNAME', 'VOLO_TPA_PASSWORD', 'VOLO_TPA_PARTNER_ID'],
  ewat:        ['EWAT_TPA_API_KEY', 'EWAT_TPA_PARTNER_ID'],
};

const INSURER_CREDENTIAL_ENV_VARS = {
  'Star Health':    ['STAR_HEALTH_API_KEY'],
  'HDFC ERGO':      ['HDFC_ERGO_API_KEY'],
  'ICICI Lombard':  ['ICICI_LOMBARD_API_KEY'],
  'Bajaj Allianz':  ['BAJAJ_ALLIANZ_API_KEY'],
};

router.get('/tpa/readiness', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const providers = tpaAggregator.getAvailableProviders().map((p) => {
      const envVarsNeeded = TPA_CREDENTIAL_ENV_VARS[p.id] || [];
      return {
        ...p,
        envVarsNeeded,
        configured: envVarsNeeded.length > 0 && envVarsNeeded.every((v) => Boolean(process.env[v])),
      };
    });

    const insurers = Object.entries(INSURER_CREDENTIAL_ENV_VARS).map(([name, envVarsNeeded]) => ({
      name,
      envVarsNeeded,
      configured: envVarsNeeded.every((v) => Boolean(process.env[v])),
    }));

    res.json({
      success: true,
      summary: {
        tpasConfigured: providers.filter((p) => p.configured).length,
        tpasTotal: providers.length,
        insurersConfigured: insurers.filter((i) => i.configured).length,
        insurersTotal: insurers.length,
      },
      providers,
      insurers,
    });
  } catch (error) {
    console.error('TPA readiness fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/nhcx/activity', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const scope = resolvePortalScope(req);
    const { rows } = await pgPool.query(
      `SELECT id, workflow, correlation_id, configured, sent, error, created_at
       FROM nhcx_activity_log WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [scope.organizationId]
    );
    res.json({ success: true, activity: rows, configured: isNhcxConfigured() });
  } catch (error) {
    console.error('NHCX activity fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
