/**
 * Shared OpenAPI components for the app-facing contract.
 *
 * Shapes were taken from live responses of the running server (2026-11-14,
 * QA employee 7646) and from the route code, not written from memory. A field
 * the server may omit is not `required`; a field that can be null says
 * `nullable: true`. Objects are open (`additionalProperties` allowed) unless a
 * closed shape is part of the promise — adding a field is never a breaking
 * change for the app, removing or retyping one is.
 */
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema) => ({ ...schema, nullable: true });
const str = { type: 'string' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const strArr = { type: 'array', items: str };
const date = { type: 'string', format: 'date' };

export const schemas = {
  // ── Errors ────────────────────────────────────────────────────────────────
  Error: {
    type: 'object', required: ['success'],
    properties: { success: { type: 'boolean', enum: [false] }, message: str, code: str },
  },
  IntegrationError: {
    type: 'object', required: ['success', 'code', 'message', 'retryable'],
    description: 'A third-party API Mediqzy depends on is unavailable, switched off, not configured or answered badly. `retryable` says whether trying again later can help.',
    properties: {
      success: { type: 'boolean', enum: [false] },
      code: { type: 'string', enum: ['INTEGRATION_DISABLED', 'INTEGRATION_NOT_CONFIGURED', 'INTEGRATION_CIRCUIT_OPEN', 'INTEGRATION_TIMEOUT', 'INTEGRATION_UNAVAILABLE', 'INTEGRATION_UPSTREAM_ERROR', 'INTEGRATION_BAD_RESPONSE', 'INTEGRATION_REJECTED', 'INTEGRATION_HOST_NOT_ALLOWED'] },
      message: str,
      retryable: bool,
    },
  },
  SmartCrmError: {
    type: 'object', required: ['success', 'code', 'message'],
    properties: {
      success: { type: 'boolean', enum: [false] },
      code: { type: 'string', example: 'NOT_LINKED' },
      message: str,
      details: { type: 'object', additionalProperties: true },
    },
  },

  // ── Corporate context ─────────────────────────────────────────────────────
  CorporateRef: { type: 'object', required: ['id', 'name'], properties: { id: num, name: str } },
  EmployeeRef: { type: 'object', properties: { employeeId: str, department: nullable(str), designation: nullable(str) } },
  MyCorporate: {
    type: 'object', required: ['success', 'isCorporateEmployee'],
    properties: { success: bool, isCorporateEmployee: bool, corporate: nullable(ref('CorporateRef')) },
  },
  EmployeeContext: {
    type: 'object', required: ['success', 'isCorporateEmployee'],
    properties: { success: bool, audience: str, isCorporateEmployee: bool, corporate: nullable(ref('CorporateRef')), employee: nullable(ref('EmployeeRef')) },
  },
  EmployeeHome: {
    type: 'object', required: ['success'],
    properties: {
      success: bool, audience: str,
      context: { type: 'object', properties: { corporate: nullable(ref('CorporateRef')), employee: nullable(ref('EmployeeRef')) } },
      benefits: { type: 'object', properties: {
        wallets: { type: 'array', items: { type: 'object' } },
        annualHealthCheckups: { type: 'array', items: { type: 'object' } },
        sponsoredPlans: { type: 'array', items: { type: 'object' } },
        networkProviders: { type: 'array', items: { type: 'object' } },
      } },
      upcomingAppointment: nullable({ type: 'object' }),
      wellness: { type: 'object', properties: { events: { type: 'array', items: { type: 'object' } }, challenges: { type: 'array', items: { type: 'object' } } } },
      privacyNotice: str,
    },
  },

  // ── Network providers ─────────────────────────────────────────────────────
  NetworkProvider: {
    type: 'object', required: ['id', 'name'],
    properties: {
      id: str, name: str,
      address: { type: 'object', additionalProperties: true },
      services: { type: 'array', items: {} },
      rating: num, accreditation: nullable({}), facilities: { type: 'array', items: {} },
      isCorpAssigned: bool, corporateId: num, corporateName: str, corpDiscount: num,
    },
  },

  // ── Claims ────────────────────────────────────────────────────────────────
  Claim: {
    type: 'object', required: ['id', 'claimNumber', 'status', 'amount'],
    properties: {
      id: str, claimNumber: str, type: str, benefitCategory: { type: 'string', enum: ['insurance', 'wellness'] },
      amount: num, approvedAmount: num,
      status: { type: 'string', enum: ['submitted', 'under_review', 'info_needed', 'approved', 'rejected', 'settled'] },
      hospital: str, date: date, member: str, documents: strArr, timeline: { type: 'array', items: { type: 'object' } },
    },
  },
  ClaimCreate: {
    type: 'object', required: ['claimType', 'hospital', 'date', 'amount', 'documents'],
    properties: {
      claimType: { type: 'string', enum: ['Cashless', 'Reimbursement'] },
      type: { type: 'string', description: 'Category, e.g. opd, pharmacy, dental, hospitalization, maternity.' },
      hospital: { type: 'string', maxLength: 200 },
      date: date,
      amount: { type: 'number', minimum: 0, exclusiveMinimum: true },
      diagnosis: str, notes: str,
      documents: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', pattern: '^report:\\d+$' }, description: 'The member\'s own uploaded reports, as report:<id>.' },
      memberId: { type: 'string', default: 'self', description: '"self" or the id of one of the member\'s own family members.' },
    },
  },

  // ── Policy wallet ─────────────────────────────────────────────────────────
  PolicyMember: {
    type: 'object', required: ['memberId', 'relation', 'isSelf'],
    properties: {
      memberId: str, name: nullable(str), relation: str, relationGroup: str, dob: nullable(str),
      sumInsured: nullable(num), used: nullable(num), remaining: nullable(num), isSelf: bool, cardNumber: nullable(str),
    },
  },
  Enrolment: {
    type: 'object', required: ['open', 'status', 'mode'],
    description: 'How and whether the member can enrol on this policy (ADR-001 phase 1).',
    properties: {
      from: nullable(date), to: nullable(date), open: bool,
      status: { type: 'string', enum: ['open', 'upcoming', 'closed', 'not_set', 'live_check'], description: 'live_check: SmartCRM owns the window; ask GET /api/employee/enrolment/window.' },
      mode: { type: 'string', enum: ['in_app', 'web', 'off'] },
      webUrl: nullable({ type: 'string', format: 'uri' }),
      submission: nullable({
        type: 'object', required: ['state'],
        properties: { state: { type: 'string', enum: ['saved', 'pending_hr', 'payment_pending', 'rejected'] }, requestId: nullable(str), detail: nullable({}), at: nullable(str) },
      }),
      requestId: nullable(str),
    },
  },
  Policy: {
    type: 'object', required: ['id', 'source', 'name', 'status', 'members', 'enrolment', 'missing'],
    properties: {
      id: str,
      source: { type: 'string', enum: ['insurance_policies', 'smartcrm'], description: 'smartcrm = projected from SmartCRM, the system of record.' },
      policyType: nullable(str), policyTypeRecognised: bool, group: str, typeLabel: nullable(str), typeBadge: nullable(str),
      protects: nullable(str), name: str, policyNumber: nullable(str), insurer: nullable(str), status: str,
      validFrom: nullable(str), validTo: nullable(str), keyNumberField: nullable(str),
      sumInsured: nullable(num), utilized: nullable(num), remaining: nullable(num), coverAmount: nullable(num),
      floater: nullable(bool), deductible: nullable(num), baseSumInsured: nullable(num), linkedBasePolicyId: nullable(str),
      copayPercent: nullable(num), roomRentLimit: nullable(num), maternity: nullable(bool),
      waitingPeriods: nullable({ type: 'object', additionalProperties: true }),
      exclusions: strArr, benefitSchedule: { type: 'array', items: { type: 'object' } }, opLimits: { type: 'array', items: { type: 'object' } },
      nominee: nullable({ type: 'object' }),
      members: { type: 'array', items: ref('PolicyMember') },
      familyCovered: num, hasECard: bool, hasNominee: bool, sections: strArr, actions: strArr,
      voluntary: bool, premiumPerYear: nullable(num),
      enrolment: ref('Enrolment'),
      policyDocumentUrl: nullable(str), claimFormUrl: nullable(str),
      missing: { ...strArr, description: 'Terms the employer never supplied — shown as missing, never defaulted.' },
      tpa: nullable({ type: 'object' }),
    },
  },
  PolicyGroup: { type: 'object', required: ['key', 'label', 'policies'], properties: { key: str, label: str, emptyLine: nullable(str), policies: strArr } },
  PolicyLadder: {
    type: 'object',
    properties: {
      unit: str, basePolicyId: nullable(str), basePolicyName: nullable(str), baseSumInsured: nullable(num), baseUsed: nullable(num),
      topUpPolicyId: str, topUpPolicyName: str, topUpSumInsured: nullable(num), deductible: num, startsPayingAfter: num,
      copayPercent: nullable(num), roomRentLimit: nullable(num),
    },
  },
  PolicySummary: {
    type: 'object',
    additionalProperties: { type: 'object', properties: { total: nullable(num), group: str } },
  },
  InsuranceLinkState: {
    type: 'object', required: ['linked'],
    description: 'Whether this member\'s insurance is linked to SmartCRM (ADR-001).',
    properties: {
      linked: bool, status: { type: 'string', enum: ['active', 'unlinked', 'mismatch'] }, source: str,
      employeeCodeHint: nullable(str), linkedAt: nullable(str), syncedAt: nullable(str), stale: bool,
      lastError: nullable(str), readEnabled: bool,
      canLink: nullable({ type: 'object', properties: { eligible: bool, reason: str, consentPolicyVersion: str } }),
    },
  },
  PolicyWallet: {
    type: 'object', required: ['success', 'policies', 'groups', 'summary', 'ladders', 'insurance'],
    properties: {
      success: bool,
      policies: { type: 'array', items: ref('Policy') },
      groups: { type: 'array', items: ref('PolicyGroup') },
      summary: ref('PolicySummary'),
      ladders: { type: 'array', items: ref('PolicyLadder') },
      insurance: ref('InsuranceLinkState'),
    },
  },
  PolicyTypeSpec: {
    type: 'object',
    properties: { label: str, shortLabel: str, group: str, protects: str, keyNumberField: str, hasECard: bool, hasNominee: bool, sections: strArr, actions: strArr },
  },
  CoverageMatrix: {
    type: 'object', required: ['success', 'columns', 'rows'],
    properties: {
      success: bool,
      columns: { type: 'array', items: { type: 'object', properties: { policyId: str, policyType: nullable(str), label: nullable(str), group: str, hasECard: bool } } },
      rows: { type: 'array', items: { type: 'object', properties: {
        key: str, name: nullable(str), relation: str, relationGroup: str, dob: nullable(str), isSelf: bool,
        cover: { type: 'object', additionalProperties: { type: 'object', properties: { covered: bool, shared: bool, sumInsured: nullable(num), memberId: nullable(str), hasCard: bool } } },
      } } },
    },
  },
  ECard: {
    type: 'object', required: ['success', 'ecard'],
    properties: {
      success: bool,
      ecard: { type: 'object', properties: {
        cardNumber: nullable(str), policyId: str, policyType: nullable(str), policyNumber: nullable(str), planName: nullable(str),
        insurer: nullable(str), memberId: str, memberName: nullable(str), relation: str, relationGroup: str, dob: nullable(str),
        validFrom: nullable(str), validTill: nullable(str), sumInsured: nullable(num), shared: bool, copayPercent: nullable(num),
        roomRentLimit: nullable(num), tpa: nullable({ type: 'object' }), missing: strArr,
        download: nullable({ type: 'object', description: 'The insurer\'s card document (SmartCRM policies): GET this url with the member\'s token.', properties: { url: str, format: { type: 'string', enum: ['pdf'] } } }),
      } },
      topUp: nullable({ type: 'object', properties: { policyId: str, startsPayingAfter: num } }),
    },
  },
  Benefits: {
    type: 'object', required: ['success', 'isCorporateEmployee', 'policies', 'insuranceLink'],
    properties: {
      success: bool, isCorporateEmployee: bool, corporateId: num, corporateName: str,
      plans: { type: 'array', items: { type: 'object' } }, healthCheckups: { type: 'array', items: { type: 'object' } },
      policies: { type: 'array', items: ref('Policy') }, policyGroups: { type: 'array', items: ref('PolicyGroup') },
      policySummary: nullable(ref('PolicySummary')), policyLadders: { type: 'array', items: ref('PolicyLadder') },
      insuranceLink: ref('InsuranceLinkState'),
      policiesUnavailable: nullable({ type: 'string', description: 'Set when the policy wallet could not be read; the rest of the response still stands.' }),
    },
  },

  // ── Addresses ─────────────────────────────────────────────────────────────
  AddressPrediction: { type: 'object', required: ['placeId', 'description'], properties: { placeId: str, description: str, mainText: str, secondaryText: str, types: strArr } },
  PlaceDetails: {
    type: 'object', required: ['placeId', 'formattedAddress'],
    properties: {
      placeId: str, formattedAddress: str, street: nullable(str), city: nullable(str), state: nullable(str), zipCode: nullable(str),
      country: nullable(str), countryCode: nullable(str), latitude: nullable(num), longitude: nullable(num),
      placeData: { type: 'object', additionalProperties: true },
    },
  },

  // ── Admin: integrations ───────────────────────────────────────────────────
  IntegrationStatus: {
    type: 'object', required: ['id', 'name', 'category', 'dataClass', 'managed', 'enabled', 'configured', 'circuit'],
    properties: {
      id: str, name: str, category: str,
      dataClass: { type: 'string', enum: ['phi', 'pii', 'none'] },
      managed: { type: 'string', enum: ['core', 'own-client', 'unmanaged'] },
      enabled: bool, killSwitch: str, configured: bool, missingEnv: strArr, allowedHosts: strArr, timeoutMs: num,
      circuit: { type: 'string', enum: ['CLOSED', 'HALF-OPEN', 'OPEN'] },
      metrics: { type: 'object', properties: {
        calls: num, ok: num, failed: num, refused: num, retries: num, p50Ms: nullable(num), p95Ms: nullable(num),
        lastSuccessAt: nullable(str), lastFailureAt: nullable(str), lastErrorCode: nullable(str),
      } },
      notes: nullable(str),
      health: { type: 'object', additionalProperties: true },
    },
  },
};

export const securitySchemes = {
  bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'The token returned by sign-in.' },
};

const json = (schemaName) => ({ content: { 'application/json': { schema: ref(schemaName) } } });
export const responses = {
  Unauthorized: { description: 'Missing, expired or invalid token.', ...json('Error') },
  Forbidden: { description: 'The caller\'s account type may not use this endpoint.', ...json('Error') },
  NotFound: { description: 'Not found, or not the caller\'s.', ...json('Error') },
  ServerError: { description: 'Unexpected server error.', ...json('Error') },
  IntegrationUnavailable: { description: 'A third-party API this endpoint depends on is unavailable. See `retryable`.', ...json('IntegrationError') },
  SmartCrmRefusal: { description: 'Refused by the SmartCRM integration (not linked, switched off, window closed, …). Branch on `code`.', ...json('SmartCrmError') },
};

export { ref };
export default { schemas, securitySchemes, responses };
