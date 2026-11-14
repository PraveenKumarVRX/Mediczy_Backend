/**
 * NHCX (National Health Claims Exchange) client — sandbox-ready scaffold.
 *
 * NHCX is the NHA's FHIR-based claims-exchange gateway (live since June 2024):
 * a hospital submits one standardized FHIR bundle, NHCX validates and routes
 * it to the correct payer, then routes the response back. This service builds
 * those bundles and calls the gateway when real credentials are configured;
 * otherwise it returns a structured "not configured" result — same honesty
 * contract as tpa-aggregator.service.js, never a fabricated response.
 *
 * Formal NHCX certification (Level 1/2 with the NHA) is a business/compliance
 * process this code doesn't perform — see docs/ai/... and the RAG analysis.
 * This is the technical integration that process will exercise once live.
 */
import { createVendorAxios } from '../integrations/axios.js';
const axios = createVendorAxios('nhcx');
import crypto from 'crypto';

export function isNhcxConfigured() {
  return Boolean(process.env.NHCX_CLIENT_ID && process.env.NHCX_CLIENT_SECRET);
}

function nhcxBaseUrl() {
  return process.env.NHCX_ENDPOINT || 'https://nhcx.abdm.gov.in/api/v1';
}

function fhirMeta() {
  return { lastUpdated: new Date().toISOString() };
}

/**
 * Builds a CoverageEligibilityRequest FHIR R4 resource per the NHCX HCX
 * Implementation Guide (nrces.in/ndhm/fhir/r4/hcx-profile.html).
 */
export function buildEligibilityRequestBundle({ patientName, policyNumber, insurerCode, hospitalId }) {
  return {
    resourceType: 'CoverageEligibilityRequest',
    meta: fhirMeta(),
    status: 'active',
    purpose: ['validation', 'benefits'],
    patient: { display: patientName },
    insurer: { identifier: { value: insurerCode } },
    insurance: [{ coverage: { identifier: { value: policyNumber } } }],
    provider: { identifier: { value: String(hospitalId) } },
    created: new Date().toISOString(),
  };
}

/** Builds a Claim resource with use='preauthorization' per the NHCX pre-auth workflow. */
export function buildPreAuthBundle({ preAuthNumber, patientName, policyNumber, insurerCode, hospitalId, diagnosis, estimatedAmount }) {
  return {
    resourceType: 'Claim',
    meta: fhirMeta(),
    identifier: [{ value: preAuthNumber }],
    status: 'active',
    use: 'preauthorization',
    patient: { display: patientName },
    insurer: { identifier: { value: insurerCode } },
    provider: { identifier: { value: String(hospitalId) } },
    insurance: [{ sequence: 1, coverage: { identifier: { value: policyNumber } } }],
    diagnosis: diagnosis ? [{ diagnosisCodeableConcept: { text: diagnosis } }] : [],
    total: { value: Number(estimatedAmount) || 0, currency: 'INR' },
    created: new Date().toISOString(),
  };
}

/** Builds a Claim resource with use='claim' for final claim submission. */
export function buildClaimSubmissionBundle({ claimNumber, patientName, policyNumber, insurerCode, hospitalId, diagnosis, claimAmount }) {
  return {
    resourceType: 'Claim',
    meta: fhirMeta(),
    identifier: [{ value: claimNumber }],
    status: 'active',
    use: 'claim',
    patient: { display: patientName },
    insurer: { identifier: { value: insurerCode } },
    provider: { identifier: { value: String(hospitalId) } },
    insurance: [{ sequence: 1, coverage: { identifier: { value: policyNumber } } }],
    diagnosis: diagnosis ? [{ diagnosisCodeableConcept: { text: diagnosis } }] : [],
    total: { value: Number(claimAmount) || 0, currency: 'INR' },
    created: new Date().toISOString(),
  };
}

async function sendToGateway(bundle, workflowPath) {
  if (!isNhcxConfigured()) {
    return {
      configured: false,
      sent: false,
      message: 'NHCX not configured — set NHCX_CLIENT_ID/NHCX_CLIENT_SECRET to enable live submission.',
      bundle,
    };
  }

  const correlationId = crypto.randomUUID();
  try {
    const response = await axios.post(
      `${nhcxBaseUrl()}/${workflowPath}`,
      { bundle, correlationId },
      {
        headers: {
          'X-CM-ID': process.env.NHCX_CLIENT_ID,
          Authorization: `Bearer ${process.env.NHCX_CLIENT_SECRET}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );
    return { configured: true, sent: true, correlationId, response: response.data };
  } catch (error) {
    return {
      configured: true,
      sent: false,
      correlationId,
      error: error.response?.data?.message || error.message,
    };
  }
}

export async function submitEligibilityCheck(params) {
  const bundle = buildEligibilityRequestBundle(params);
  return sendToGateway(bundle, 'coverage-eligibility/check');
}

export async function submitPreAuth(params) {
  const bundle = buildPreAuthBundle(params);
  return sendToGateway(bundle, 'preauth/submit');
}

export async function submitClaim(params) {
  const bundle = buildClaimSubmissionBundle(params);
  return sendToGateway(bundle, 'claim/submit');
}

export default { isNhcxConfigured, buildEligibilityRequestBundle, buildPreAuthBundle, buildClaimSubmissionBundle, submitEligibilityCheck, submitPreAuth, submitClaim };
