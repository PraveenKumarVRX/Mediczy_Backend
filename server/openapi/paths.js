/**
 * Operations in the app-facing contract. Every operation listed here must
 * exist in the server (enforced by __tests__/openapi-contract.test.js), and
 * every route of a FULLY_DOCUMENTED router must be listed here.
 */
import { ref } from './components.js';

const json = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const R = (name) => ({ $ref: `#/components/responses/${name}` });
const body = (schema, required = true) => ({ required, content: { 'application/json': { schema } } });
const pathParam = (name, description) => ({ name, in: 'path', required: true, schema: { type: 'string' }, description });
const okWith = (properties, required = ['success']) => json({ type: 'object', required, properties: { success: { type: 'boolean' }, ...properties } });

const op = (tag, summary, { description, params, requestBody, responses, headers, security } = {}) => ({
  tags: [tag],
  summary,
  ...(description ? { description } : {}),
  ...(params || headers ? { parameters: [...(params || []), ...(headers || [])] } : {}),
  ...(requestBody ? { requestBody } : {}),
  ...(security ? { security } : {}),
  responses: { 401: R('Unauthorized'), 500: R('ServerError'), ...responses },
});

const providers = (key) => okWith({
  isCorporateEmployee: { type: 'boolean' }, corporateId: { type: 'number' }, corporateName: { type: 'string' },
  count: { type: 'number' }, [key]: { type: 'array', items: ref('NetworkProvider') },
}, ['success', 'isCorporateEmployee', key]);

// ── /api/employee — corporate employee context, network, claims, policy wallet
const employee = {
  '/api/employee/my-corporate': { get: op('Employee', 'The caller\'s corporate, if they are a corporate employee', { responses: { 200: json(ref('MyCorporate')) } }) },
  '/api/employee/context': { get: op('Employee', 'Corporate and employee context for the app shell', { responses: { 200: json(ref('EmployeeContext')) } }) },
  '/api/employee/home': { get: op('Employee', 'Home screen aggregate: context, benefits, next appointment, wellness', { responses: { 200: json(ref('EmployeeHome')) } }) },
  '/api/employee/my-labs': { get: op('Employee network', 'Labs assigned to the caller\'s corporate', { responses: { 200: providers('labs') } }) },
  '/api/employee/my-hospitals': { get: op('Employee network', 'Hospitals assigned to the caller\'s corporate', { responses: { 200: providers('hospitals') } }) },
  '/api/employee/my-clinics': { get: op('Employee network', 'Clinics assigned to the caller\'s corporate', { responses: { 200: providers('clinics') } }) },
  '/api/employee/benefits': {
    get: op('Benefits', 'Benefits hub: plans, health check-ups, typed group policies and the SmartCRM link state', {
      description: 'An individual (non-corporate) member gets the same keys with empty lists. If the policy wallet cannot be read, `policiesUnavailable` is set and the rest still returns.',
      responses: { 200: json(ref('Benefits')) },
    }),
  },
  '/api/employee/policies/types': {
    get: op('Policy wallet', 'The seven group policy types and their display groups', {
      responses: { 200: okWith({ types: { type: 'object', additionalProperties: ref('PolicyTypeSpec') }, groups: { type: 'array', items: { type: 'object' } } }, ['success', 'types', 'groups']) },
    }),
  },
  '/api/employee/policies': {
    get: op('Policy wallet', 'Every policy the caller\'s family is on, typed, with enrolment state', {
      description: 'Members are filtered to the caller\'s own family. Each policy carries `enrolment` (mode in_app/web/off, status, web URL, last submission). `insurance` is the SmartCRM link state.',
      responses: { 200: json(ref('PolicyWallet')), 503: json(ref('Error'), 'Policy tables not migrated in this environment.') },
    }),
  },
  '/api/employee/policies/coverage-matrix': { get: op('Policy wallet', 'Who in the family is covered by which policy', { responses: { 200: json(ref('CoverageMatrix')) } }) },
  '/api/employee/policies/{policyId}': {
    get: op('Policy wallet', 'One policy, with its top-up ladder', {
      params: [pathParam('policyId')],
      responses: { 200: okWith({ policy: ref('Policy'), ladder: { ...ref('PolicyLadder'), nullable: true } }, ['success', 'policy']), 404: R('NotFound') },
    }),
  },
  '/api/employee/policies/{policyId}/claims': {
    get: op('Policy wallet', 'Claims against one policy', {
      params: [pathParam('policyId')],
      responses: { 200: okWith({ policyId: { type: 'string' }, policyType: { type: 'string', nullable: true }, claims: { type: 'array', items: { type: 'object' } } }, ['success', 'claims']), 404: R('NotFound') },
    }),
  },
  '/api/employee/policies/{policyId}/members/{memberId}/e-card': {
    get: op('Policy wallet', 'E-card for one family member on one policy', {
      params: [pathParam('policyId'), pathParam('memberId')],
      responses: { 200: json(ref('ECard')), 404: R('NotFound') },
    }),
  },
  '/api/employee/claims': {
    get: op('Claims', 'The caller\'s claims, newest first (max 50)', {
      responses: { 200: okWith({ isCorporateEmployee: { type: 'boolean' }, corporateId: { type: 'number' }, corporateName: { type: 'string' }, claims: { type: 'array', items: ref('Claim') } }, ['success', 'claims']) },
    }),
    post: op('Claims', 'Submit a claim with the member\'s own uploaded reports as documents', {
      requestBody: body(ref('ClaimCreate')),
      responses: {
        201: okWith({ message: { type: 'string' }, claim: ref('Claim') }, ['success', 'claim']),
        400: json(ref('Error'), 'Missing provider/date/type, bad amount, or documents not the caller\'s.'),
        403: json(ref('Error'), 'The caller\'s plan does not include insurance claims.'),
      },
    }),
  },
  '/api/employee/claims/eligibility': {
    get: op('Claims', 'Whether the caller may submit a claim, and why not', {
      responses: { 200: okWith({ eligible: { type: 'boolean' }, reason: { type: 'string', nullable: true } }, ['success', 'eligible']), 503: json(ref('Error'), 'Eligibility could not be checked.') },
    }),
  },
};

// ── /api/employee — SmartCRM link and in-app enrolment (ADR-001)
const smartcrmTag = 'Insurance (SmartCRM)';
const passThrough = { type: 'object', additionalProperties: true, description: 'SmartCRM\'s own payload, passed through unchanged.' };
const idempotencyKey = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,128}$' }, description: 'Same key + same body replays the stored answer (header Idempotent-Replayed: true); same key + different body is 422.' };
const enrolmentRefusals = { 409: R('SmartCrmRefusal'), 503: R('SmartCrmRefusal') };
const enrol = (summary, { requestBody, idempotent, description, query } = {}) => op(smartcrmTag, summary, {
  description,
  requestBody,
  params: query,
  headers: idempotent ? [idempotencyKey] : undefined,
  responses: {
    200: json(passThrough, 'SmartCRM\'s answer'),
    ...(idempotent ? { 201: json(passThrough, 'Saved (submit)'), 202: json(passThrough, 'Pending HR approval, with request_id'), 402: json(passThrough, 'Payment pending'), 422: R('SmartCrmRefusal') } : {}),
    400: json(passThrough, 'Refused by SmartCRM (`detail`) or a missing Idempotency-Key'),
    ...enrolmentRefusals,
  },
});
const queryParam = (name) => ({ name, in: 'query', required: false, schema: { type: 'string', maxLength: 200 } });

const insurance = {
  '/api/employee/insurance/link': {
    get: op(smartcrmTag, 'Link state, and whether the caller can link', { responses: { 200: okWith({ data: ref('InsuranceLinkState') }, ['success', 'data']) } }),
    post: op(smartcrmTag, 'Link the caller\'s insurance membership (explicit consent required)', {
      description: 'The employee code comes from the corporate roster, never from the request. Records DATA_SHARING consent, then performs a first refresh; `data.sync` reports that refresh.',
      requestBody: body({ type: 'object', required: ['consent', 'policyVersion'], properties: { consent: { type: 'boolean', enum: [true] }, policyVersion: { type: 'string', example: 'smartcrm-insurance-link-2026-11' } } }),
      responses: { 201: okWith({ data: ref('InsuranceLinkState') }), 200: okWith({ data: ref('InsuranceLinkState') }), 400: R('SmartCrmRefusal'), 404: R('SmartCrmRefusal'), ...enrolmentRefusals },
    }),
    delete: op(smartcrmTag, 'Unlink: withdraw consent and hide SmartCRM-projected policies', {
      responses: { 200: okWith({ data: { type: 'object', properties: { unlinked: { type: 'boolean' }, membersHidden: { type: 'number' } } } }), 503: R('SmartCrmRefusal') },
    }),
  },
  '/api/employee/insurance/refresh': {
    post: op(smartcrmTag, 'Re-read the caller\'s policies from SmartCRM (throttled to once a minute)', {
      responses: { 200: okWith({ data: { type: 'object', additionalProperties: true } }), 404: R('SmartCrmRefusal'), 502: R('SmartCrmRefusal'), ...enrolmentRefusals },
    }),
  },
  '/api/employee/enrolment/window': { get: enrol('Enrolment window state (fails closed: only state "open" is open)') },
  '/api/employee/enrolment/session': { post: enrol('Start an enrolment session', { requestBody: body(passThrough, false) }) },
  '/api/employee/enrolment/draft': {
    get: enrol('Read the server-side draft'),
    put: enrol('Save the draft (refused while the window is closed)', { requestBody: body(passThrough) }),
    delete: enrol('Discard the draft'),
  },
  '/api/employee/enrolment/quote': { post: enrol('Price a selection (refused while the window is closed)', { requestBody: body(passThrough) }) },
  '/api/employee/enrolment/payment/initiate': { post: enrol('Start an online payment', { requestBody: body(passThrough), idempotent: true }) },
  '/api/employee/enrolment/payment/status': { get: enrol('Payment status', { query: ['payment_id', 'order_id', 'session_token'].map(queryParam) }) },
  '/api/employee/enrolment/submit': { post: enrol('Submit the enrolment', { requestBody: body(passThrough), idempotent: true, description: '201 saved · 202 pending HR with request_id · 402 payment pending · 400 with detail. Refused (409 ENROLMENT_CLOSED) while the window is not open.' }) },
  '/api/employee/enrolment/dependents': { post: enrol('Mid-term dependant addition (creates an HR approval request)', { requestBody: body(passThrough), idempotent: true }) },
};

// ── /api/addresses — address lookup (Google Places via the integration layer)
const addresses = {
  '/api/addresses/autocomplete': {
    get: op('Addresses', 'Address suggestions as the user types', {
      description: 'Never returns invented addresses in production: if Google is unavailable or not configured the answer is 503 with an IntegrationError, and the app should let the user type the address.',
      params: [{ name: 'input', in: 'query', required: true, schema: { type: 'string', minLength: 3 } }, { name: 'country', in: 'query', required: false, schema: { type: 'string', example: 'in' } }],
      responses: { 200: okWith({ data: { type: 'array', items: ref('AddressPrediction') } }, ['success', 'data']), 400: json(ref('Error')), 503: R('IntegrationUnavailable'), 502: R('IntegrationUnavailable') },
    }),
  },
  '/api/addresses/place/{placeId}': {
    get: op('Addresses', 'Full address for a suggestion the user picked', {
      params: [pathParam('placeId')],
      responses: { 200: okWith({ data: ref('PlaceDetails') }, ['success', 'data']), 404: R('IntegrationUnavailable'), 503: R('IntegrationUnavailable'), 502: R('IntegrationUnavailable') },
    }),
  },
};

// ── /api/auth — social sign-in hand-off (PKCE, audit M20)
const auth = {
  '/api/auth/oauth/exchange': {
    post: {
      tags: ['Sign-in'],
      summary: 'Redeem the one-time code from a Google/Facebook mobile sign-in for the tokens',
      description: [
        'Mobile flow: open /api/auth/google (or /facebook) with mobile_redirect_uri=mysmarthealth://oauth-callback, your own random `state`, and code_challenge = BASE64URL(SHA256(code_verifier)) with code_challenge_method=S256.',
        'The app is called back with `code` and your `state` (check it matches) — never a token. Post the code with the original code_verifier here within 60 seconds. A code works once; a wrong verifier consumes it.',
      ].join('\n\n'),
      security: [],
      requestBody: body({ type: 'object', required: ['code', 'code_verifier'], properties: {
        code: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
        code_verifier: { type: 'string', minLength: 43, maxLength: 128, pattern: '^[A-Za-z0-9\\-._~]{43,128}$' },
      } }),
      responses: {
        200: okWith({ token: { type: 'string' }, refreshToken: { type: 'string' }, userType: { type: 'string' }, provider: { type: 'string', enum: ['google', 'facebook'] }, tenantId: { type: 'string' } }, ['success', 'token', 'refreshToken']),
        400: json({ type: 'object', required: ['success', 'code'], properties: { success: { type: 'boolean' }, code: { type: 'string', enum: ['INVALID_GRANT', 'INVALID_VERIFIER'] }, message: { type: 'string' } } }, 'Expired, already used, or the verifier does not match.'),
        429: json(ref('Error'), 'Too many attempts.'),
        503: json(ref('Error'), 'Hand-off storage unavailable; sign in again.'),
      },
    },
  },
};

// ── /api/call-notification — the patient declines an incoming doctor call (audit M6)
const calls = {
  '/api/call-notification/decline': {
    post: op('Calls', 'Decline an incoming doctor call', {
      description: 'For the caller\'s own appointment only. Marks the incoming-call notification read and tells the doctor live (socket room doctor-<doctorId>, event `call-declined` with { appointmentId, declinedAt, reason }), so the doctor stops waiting. `notified` is false when the doctor is not connected; the decline is still recorded. Safe to repeat.',
      requestBody: body({ type: 'object', required: ['appointmentId'], properties: {
        appointmentId: { type: 'integer', minimum: 1 },
        reason: { type: 'string', maxLength: 120, description: 'Optional, shown to the doctor. Longer text is cut.' },
      } }),
      responses: {
        200: okWith({ notified: { type: 'boolean' } }, ['success', 'notified']),
        400: json(ref('Error'), 'appointmentId missing or not a positive integer.'),
        404: json(ref('Error'), 'No appointment with this id belongs to the caller.'),
      },
    }),
  },
};

// ── /api/reports — Scan & Share: a time-limited link to one of the caller's uploaded reports
const reports = {
  '/api/reports/{id}/share-link': {
    post: op('Reports', 'Create a time-limited share link for one of your reports', {
      description: 'Anyone holding `shareUrl` can open the report until `expiresAt`, without an account — share it only with the intended person. The link cannot be revoked early; keep the expiry short. Only the owner\'s reports.',
      params: [pathParam('id', 'Report id from GET /api/reports')],
      requestBody: body({ type: 'object', properties: {
        expiresInHours: { type: 'integer', minimum: 1, maximum: 720, default: 72, description: 'Clamped to 1–720 hours; missing or invalid means 72.' },
      } }, false),
      responses: {
        200: okWith({
          shareUrl: { type: 'string', description: 'https://…/api/reports/shared/{token} — open in a browser or hand to the OS share sheet.' },
          token: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
        }, ['success', 'shareUrl', 'token', 'expiresAt']),
        404: json(ref('Error'), 'No report with this id belongs to the caller.'),
      },
    }),
  },
  '/api/reports/shared/{token}': {
    get: {
      tags: ['Reports'],
      summary: 'Open a shared report (the recipient\'s side of Scan & Share)',
      description: 'No sign-in: the signed, expiring token is the authorisation. Streams the file inline (PDF or image) or redirects to it.',
      security: [],
      parameters: [pathParam('token', 'The token from POST /api/reports/{id}/share-link')],
      responses: {
        200: { description: 'The report file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } }, 'image/*': { schema: { type: 'string', format: 'binary' } } } },
        302: { description: 'Redirect to the stored file' },
        401: json(ref('Error'), 'Link invalid or expired.'),
        404: json(ref('Error'), 'The report was deleted.'),
        500: R('ServerError'),
      },
    },
  },
};

// ── /api/mental-health — the app's Mind & Mood sync (QA-09). Stored as the caller's own private
// health-diary rows, so web and app share one record. Assessments and AI coaching are deliberately
// not served (screening is a governed SaMD feature; coaching is an ungoverned LLM output): 404.
const moodIds = { type: 'string', enum: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'], description: 'Great=5, Good=4, Okay=3, Low=2, Struggling=1' };
const crisisSupport = { type: 'object', description: 'Present only when the saved text contains crisis language: helpline numbers to show. Nothing is flagged or reported to anyone.' };
const listParams = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
  { name: 'days', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 3650 }, description: 'Only entries from the last N days.' },
];
const moodItem = { type: 'object', required: ['id', 'intensity', 'recordedAt'], properties: { id: { type: 'integer' }, moodId: { ...moodIds, nullable: true }, label: { type: 'string', nullable: true }, intensity: { type: 'integer', minimum: 1, maximum: 5 }, note: { type: 'string', nullable: true }, recordedAt: { type: 'string', format: 'date-time' }, clientId: { type: 'string', nullable: true } } };
const journalItem = { type: 'object', required: ['id', 'text'], properties: { id: { type: 'integer' }, title: { type: 'string', nullable: true }, text: { type: 'string' }, moodId: { ...moodIds, nullable: true }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, clientId: { type: 'string', nullable: true } } };
const clientId = { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,80}$', description: 'The app\'s local id. Repeating a create with the same clientId returns the existing entry (duplicate: true) instead of a second one.' };
const journalBody = { type: 'object', required: ['text'], properties: { clientId, title: { type: 'string', maxLength: 200 }, text: { type: 'string', minLength: 1, maxLength: 20000 }, moodId: moodIds, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } };
const mind = {
  '/api/mental-health/moods/log': {
    post: op('Mind', 'Save a mood check-in', {
      requestBody: body({ type: 'object', properties: { clientId, moodId: moodIds, label: { type: 'string', maxLength: 120 }, intensity: { type: 'integer', minimum: 1, maximum: 5, description: 'Used only when moodId is absent.' }, note: { type: 'string', maxLength: 2000 }, recordedAt: { type: 'string', format: 'date-time' } } }),
      responses: {
        201: okWith({ data: moodItem, support: crisisSupport }, ['success', 'data']),
        200: okWith({ duplicate: { type: 'boolean' }, data: moodItem }, ['success', 'data']),
        400: json(ref('Error'), 'Unknown moodId and no valid intensity.'),
      },
    }),
  },
  '/api/mental-health/moods': {
    get: op('Mind', 'Your mood check-ins, newest first', { params: listParams, responses: { 200: okWith({ data: { type: 'array', items: moodItem } }, ['success', 'data']) } }),
  },
  '/api/mental-health/journal': {
    get: op('Mind', 'Your private journal, newest first', { params: listParams, responses: { 200: okWith({ data: { type: 'array', items: journalItem } }, ['success', 'data']) } }),
    post: op('Mind', 'Write a journal entry', {
      requestBody: body(journalBody),
      responses: {
        201: okWith({ data: journalItem, support: crisisSupport }, ['success', 'data']),
        200: okWith({ duplicate: { type: 'boolean' }, data: journalItem }, ['success', 'data']),
        400: json(ref('Error'), 'text missing or moodId unknown.'),
      },
    }),
  },
  '/api/mental-health/journal/{id}': {
    put: op('Mind', 'Edit one of your journal entries', {
      params: [pathParam('id')], requestBody: body(journalBody),
      responses: { 200: okWith({ data: journalItem, support: crisisSupport }, ['success', 'data']), 400: json(ref('Error'), 'text missing or moodId unknown.'), 404: json(ref('Error'), 'Not one of your journal entries.') },
    }),
    delete: op('Mind', 'Delete one of your journal entries', {
      description: 'Deleting an entry that is already gone succeeds with deleted: false, so a retried delete settles.',
      params: [pathParam('id')], responses: { 200: okWith({ deleted: { type: 'boolean' } }, ['success', 'deleted']) },
    }),
  },
  '/api/mental-health/crisis/resources': {
    get: op('Mind', 'Verified crisis helplines (adds to the app\'s built-in numbers)', {
      responses: { 200: okWith({ data: { type: 'array', items: { type: 'object', required: ['id', 'label', 'number'], properties: { id: { type: 'string' }, label: { type: 'string' }, number: { type: 'string' }, description: { type: 'string' }, operator: { type: 'string' }, verifiedOn: { type: 'string', format: 'date' } } } } }, ['success', 'data']) },
    }),
  },
};

// ── /api/family-members — the member's dependants (partly documented: the plan allowance and add/edit)
const relationValues = ['spouse', 'son', 'daughter', 'father', 'mother', 'father_in_law', 'mother_in_law', 'brother', 'sister', 'grandfather', 'grandmother', 'grandson', 'granddaughter', 'uncle', 'aunt', 'nephew', 'niece', 'cousin', 'guardian', 'other'];
const relationGroup = (extra = {}) => ({ type: 'object', required: ['max', 'current', 'remaining', 'relations'], properties: {
  max: { type: 'integer' }, current: { type: 'integer' }, remaining: { type: 'integer' },
  relations: { type: 'array', items: { type: 'string' }, description: 'Relationships that count against this group and may still be chosen.' }, ...extra,
} });
const familyLimits = { type: 'object', required: ['membershipType', 'source', 'maxMembers', 'unlimited', 'currentCount', 'remaining', 'canAddMore', 'allowedRelations', 'coverageMode', 'familyCoverage', 'relationLimits', 'addableRelations', 'inLawsAvailable'], properties: {
  membershipType: { type: 'string', description: '"corporate" for a corporate member, else the plan slug/name or membership type.' },
  source: { type: 'string', description: 'Where the allowance came from, e.g. corporate-plan-tier, corporate-plan-without-tier, corporate-without-plan, active-user-plan, active-subscription-plan.' },
  planSlug: { type: 'string', nullable: true }, planName: { type: 'string', nullable: true },
  componentBenefits: { type: 'object', nullable: true, description: 'Always null; kept for older app builds.' },
  maxMembers: { type: 'integer', nullable: true, description: 'null when unlimited.' },
  unlimited: { type: 'boolean' }, currentCount: { type: 'integer' }, currentMembers: { type: 'integer' },
  remaining: { type: 'integer', nullable: true, description: 'Dependants that can still be added; null when unlimited. For a tier, the sum of relationLimits remaining.' },
  canAddMore: { type: 'boolean' },
  allowedRelations: { type: 'array', items: { type: 'string' }, description: 'Every relationship the plan covers (count plans may include the legacy aliases partner and child).' },
  coverageMode: { type: 'string', enum: ['tier', 'count'], description: 'tier: corporate benefit plans (and any plan with a tier) cover by coverage tier; count: individual plans cover a number of members.' },
  familyCoverage: { type: 'string', nullable: true, enum: ['employee', 'employee_spouse_children', 'employee_spouse_children_parents', null], description: 'The plan\'s coverage tier; null for count plans. A corporate member whose plan has no tier gets employee (no dependants).' },
  familyCoverageLabel: { type: 'string', nullable: true },
  relationLimits: { type: 'object', nullable: true, description: 'Per-group allowance for a tier; null for count plans.', properties: {
    spouse: relationGroup(), children: relationGroup(),
    parents: relationGroup({
      side: { type: 'string', nullable: true, enum: ['parents', 'parents_in_law', null], description: 'Which side is already chosen: parents are taken from the employee\'s own parents OR the parents-in-law, never both.' },
      sides: { type: 'array', items: { type: 'string', enum: ['parents', 'parents_in_law'] } },
    }),
  } },
  addableRelations: { type: 'array', items: { type: 'string' }, description: 'Relationships that can be added right now.' },
  inLawsAvailable: { type: 'boolean', description: 'false until the server can store father_in_law/mother_in_law.' },
} };
const familyMemberBody = { type: 'object', properties: {
  firstName: { type: 'string', maxLength: 100 }, lastName: { type: 'string', maxLength: 100 },
  relationship: { type: 'string', description: `Stored values: ${relationValues.join(', ')}. Also accepted: partner/wife/husband (stored as spouse); child, parent, parent_in_law with a gender; "father-in-law" style spellings.` },
  relationshipHint: { type: 'string' }, gender: { type: 'string', enum: ['Male', 'Female', 'Other'] },
  dateOfBirth: { type: 'string', format: 'date' }, phoneNumber: { type: 'string', maxLength: 20 }, email: { type: 'string' },
  bloodType: { type: 'string', nullable: true }, abhaHealthId: { type: 'string' },
} };
const planRefusal = json(ref('Error'), 'The plan does not cover this dependant. `message` is written for the member, e.g. "Maximum children (2) reached for Corporate Basic Plus plan" or "... plan covers either your parents or your parents-in-law, not both".');
const family = {
  '/api/family-members/limits': {
    get: op('Family', 'What the caller\'s plan allows them to add', {
      description: 'Corporate members are covered by their benefit plan\'s coverage tier: employee (no dependants); employee_spouse_children (1 spouse, 2 children); employee_spouse_children_parents (additionally 2 parents, from the employee\'s parents OR the parents-in-law). Individual plans keep a member count unless the plan sets a tier.',
      responses: { 200: okWith({ limits: familyLimits }, ['success', 'limits']) },
    }),
  },
  '/api/family-members': {
    post: op('Family', 'Add a family member', {
      requestBody: body({ ...familyMemberBody, required: ['firstName', 'lastName', 'relationship'] }),
      responses: {
        201: okWith({ message: { type: 'string' }, data: { type: 'object' }, remaining: { type: 'integer', nullable: true }, aiInference: { type: 'object' } }, ['success', 'data']),
        400: json(ref('Error'), 'Invalid input, an unsupported relationship, or a parent-in-law before the server can store one.'),
        403: planRefusal,
        409: json(ref('Error'), 'ABHA Health ID already registered.'),
      },
    }),
  },
  '/api/family-members/{id}': {
    put: op('Family', 'Edit one of your family members', {
      description: 'Changing the relationship is checked against the plan exactly like an add (the member being edited is not counted).',
      params: [pathParam('id')], requestBody: body(familyMemberBody),
      responses: {
        200: okWith({ message: { type: 'string' }, data: { type: 'object' }, aiInference: { type: 'object' } }, ['success', 'data']),
        400: json(ref('Error'), 'Invalid input or unsupported relationship.'),
        403: planRefusal,
        404: json(ref('Error'), 'Not one of your family members.'),
        409: json(ref('Error'), 'ABHA Health ID already registered.'),
      },
    }),
  },
};

// ── /api/admin — operations for admins (internal)
const admin = {
  '/api/admin/integrations': {
    get: op('Admin', 'Every third-party API: managed?, enabled, configured, circuit, metrics', {
      responses: {
        200: okWith({ generatedAt: { type: 'string' }, summary: { type: 'object', additionalProperties: { type: 'number' } }, integrations: { type: 'array', items: ref('IntegrationStatus') } }, ['success', 'summary', 'integrations']),
        403: R('Forbidden'),
      },
    }),
  },
  '/api/admin/integrations/{id}': {
    get: op('Admin', 'One third-party API\'s status', { params: [pathParam('id', 'e.g. google-places')], responses: { 200: okWith({ integration: ref('IntegrationStatus') }), 403: R('Forbidden'), 404: R('NotFound') } }),
  },
  '/api/admin/openapi/app.json': {
    get: op('Admin', 'This contract, as JSON', { responses: { 200: json({ type: 'object' }), 403: R('Forbidden') } }),
  },
};

export const paths = { ...employee, ...insurance, ...addresses, ...auth, ...calls, ...reports, ...mind, ...family, ...admin };
export default paths;
