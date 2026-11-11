import express from 'express';
import { QueryTypes } from 'sequelize';
import request from 'supertest';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import tpaRouter from '../routes/tpa.route.js';

const email = process.env.TPA_SMOKE_EMAIL || process.argv[2] || 'tpa@mediczy.com';
const password = process.env.TPA_SMOKE_PASSWORD || process.argv[3];

if (!password) {
  console.error('Usage: TPA_SMOKE_PASSWORD=<password> node server/scripts/smoke-tpa-login.mjs [email]');
  process.exit(2);
}

// This smoke pass does not only read: it POSTs enrolments, claims, documents
// and shortfalls, and approves them. Run against production under
// ssm-env-loader it leaves that behind as real rows — three "Enrollment Smoke
// Member" memberships of "Mediqzy QA Corporate" were found in the production
// TPA tables on 2026-11-11, alongside the three the service used to seed.
// They are indistinguishable from a real membership to every screen that reads
// them, including the member-facing e-card.
const [{ db }] = await postgresSequelize.query('SELECT current_database() AS db', { type: QueryTypes.SELECT });
if (/prod/i.test(db) && !process.argv.includes('--allow-production')) {
  console.error(`Refusing to run the TPA smoke pass against "${db}": it writes enrolments and claims.`);
  console.error('Point it at a non-production database, or pass --allow-production if that is genuinely what you want.');
  await postgresSequelize.close().catch(() => {});
  process.exit(2);
}

const app = express();
app.use(express.json());
app.use('/api/tpa', tpaRouter);

const login = await request(app)
  .post('/api/tpa/login')
  .send({ email, password });

const token = login.body?.token;
let dashboardStatus = null;
let dashboardKeys = [];
const menuStatuses = {};
const lifecycleStatuses = {};

if (token) {
  const dashboard = await request(app)
    .get('/api/tpa/dashboard')
    .set('Authorization', `Bearer ${token}`);
  dashboardStatus = dashboard.status;
  dashboardKeys = Object.keys(dashboard.body || {}).slice(0, 10);

  const menuEndpoints = [
    '/api/tpa/functions',
    '/api/tpa/claims',
    '/api/tpa/corporates',
    '/api/tpa/members',
    '/api/tpa/network-hospitals',
    '/api/tpa/underwriting/cases',
    '/api/tpa/member-enrollments',
    '/api/tpa/provider-contracts',
    '/api/tpa/cashless/forms',
    '/api/tpa/cashless/requests',
    '/api/tpa/policies',
    '/api/tpa/pre-auth',
    '/api/tpa/approvals',
    '/api/tpa/hospitalization-intimations',
    '/api/tpa/documents/intelligence',
    '/api/tpa/fraud-guard',
    '/api/tpa/mis/weekly',
    '/api/tpa/grievances',
    '/api/tpa/analytics',
    '/api/tpa/reports',
    '/api/tpa/settings',
    '/api/tpa/support',
    '/api/tpa/profile',
    '/api/tpa/communication/config',
  ];

  for (const endpoint of menuEndpoints) {
    const response = await request(app)
      .get(endpoint)
      .set('Authorization', `Bearer ${token}`);
    menuStatuses[endpoint] = response.status;
  }

  // Reference-data member IDs/e-card codes are namespaced per tenant
  // (MEM-<tpaId>-001, ECARD-MEM-<tpaId>-001-2026) so they can't collide
  // across TPAs — look them up rather than hardcoding a global ID.
  const membersList = await request(app)
    .get('/api/tpa/members')
    .set('Authorization', `Bearer ${token}`);
  const firstMember = membersList.body?.members?.[0];
  if (firstMember?.memberId) {
    const eligibility = await request(app)
      .get(`/api/tpa/members/${firstMember.memberId}/eligibility`)
      .set('Authorization', `Bearer ${token}`);
    menuStatuses[`/api/tpa/members/${firstMember.memberId}/eligibility`] = eligibility.status;

    const ecard = await request(app)
      .get(`/api/tpa/members/${firstMember.memberId}/ecard`)
      .set('Authorization', `Bearer ${token}`);
    menuStatuses[`/api/tpa/members/${firstMember.memberId}/ecard`] = ecard.status;

    if (firstMember.ecardVerificationCode) {
      const ecardVerify = await request(app)
        .get(`/api/tpa/ecard/verify/${firstMember.ecardVerificationCode}`)
        .set('Authorization', `Bearer ${token}`);
      menuStatuses[`/api/tpa/ecard/verify/${firstMember.ecardVerificationCode}`] = ecardVerify.status;
    }
  }

  const estimator = await request(app)
    .post('/api/tpa/benefits/estimate')
    .set('Authorization', `Bearer ${token}`)
    .send({
      memberId: 'MEM-001',
      policyNumber: 'POL-2025-001',
      hospitalName: 'Apollo Hospital',
      treatmentType: 'Hospitalization',
      estimatedAmount: 125000,
      roomCategory: 'single'
    });
  menuStatuses['POST /api/tpa/benefits/estimate'] = estimator.status;


  const claimNumber = `CLM-SMOKE-${Date.now()}`;
  const createdClaim = await request(app)
    .post('/api/tpa/claims')
    .set('Authorization', `Bearer ${token}`)
    .send({
      claimNumber,
      memberId: 'MEM-SMOKE',
      employeeId: 'EMP-SMOKE',
      employeeName: 'Smoke Test Member',
      corporateName: 'Mediqzy QA Corporate',
      policyNumber: 'POL-SMOKE-001',
      claimType: 'reimbursement',
      treatmentType: 'Hospitalization',
      hospitalName: 'QA Network Hospital',
      diagnosis: 'Smoke test diagnosis',
      claimedAmount: 25000
    });
  lifecycleStatuses['POST /api/tpa/claims'] = createdClaim.status;

  const claimDetail = await request(app)
    .get(`/api/tpa/claims/${claimNumber}`)
    .set('Authorization', `Bearer ${token}`);
  lifecycleStatuses['GET /api/tpa/claims/:claimNumber'] = claimDetail.status;

  const documentUpload = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/documents`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      documentType: 'hospital_bill',
      fileName: 'smoke-hospital-bill.pdf',
      completenessScore: 88,
      extractedFields: { billAmount: 25000, hospitalName: 'QA Network Hospital' }
    });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/documents'] = documentUpload.status;

  const shortfall = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/shortfalls`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      reason: 'Smoke test query for original discharge summary',
      requiredDocuments: ['discharge_summary']
    });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/shortfalls'] = shortfall.status;

  const decision = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/decision`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      decision: 'approved',
      approvedAmount: 23000,
      notes: 'Smoke test approval'
    });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/decision'] = decision.status;

  const fwaScore = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/fwa-score`)
    .set('Authorization', `Bearer ${token}`);
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/fwa-score'] = fwaScore.status;


  const fileUpload = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/files`)
    .set('Authorization', `Bearer ${token}`)
    .field('documentType', 'hospital_bill')
    .field('completenessScore', '76')
    .attach('file', Buffer.from('smoke claim file vault payload'), 'smoke-hospital-bill.txt');
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/files'] = fileUpload.status;

  const documentIntelligence = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/document-intelligence`)
    .set('Authorization', `Bearer ${token}`)
    .send({ requiredDocuments: ['hospital_bill', 'discharge_summary', 'bank_proof'] });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/document-intelligence'] = documentIntelligence.status;

  const payableEstimate = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/payable-estimate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ roomDays: 2, roomRentClaimed: 12000 });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/payable-estimate'] = payableEstimate.status;

  const approvalRequest = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/approval-requests`)
    .set('Authorization', `Bearer ${token}`)
    .send({ actionType: 'claim_approval', requestedPayload: { approvedAmount: 23000 } });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/approval-requests'] = approvalRequest.status;

  const approvalNumber = approvalRequest.body?.approvalRequest?.approval_number;
  if (approvalNumber) {
    const approvalDecision = await request(app)
      .post(`/api/tpa/approval-requests/${approvalNumber}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approved', notes: 'Smoke checker approval' });
    lifecycleStatuses['POST /api/tpa/approval-requests/:approvalNumber/decision'] = approvalDecision.status;
  } else {
    lifecycleStatuses['POST /api/tpa/approval-requests/:approvalNumber/decision'] = 500;
  }

  const notification = await request(app)
    .post(`/api/tpa/claims/${claimNumber}/notifications`)
    .set('Authorization', `Bearer ${token}`)
    .send({ channel: 'whatsapp', recipient: '+919999999999', templateCode: 'claim_status_update' });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/notifications'] = notification.status;

  const providerCase = await request(app)
    .post('/api/tpa/provider-cases')
    .set('Authorization', `Bearer ${token}`)
    .send({ claimNumber, hospitalCode: 'HOSP-QA-NET', hospitalName: 'QA Network Hospital', memberId: 'MEM-SMOKE', caseType: 'discharge_final', finalBillAmount: 25000 });
  lifecycleStatuses['POST /api/tpa/provider-cases'] = providerCase.status;

  const providerCaseNumber = providerCase.body?.providerCase?.case_number;
  if (providerCaseNumber) {
    const providerUpdate = await request(app)
      .post(`/api/tpa/provider-cases/${providerCaseNumber}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'final_bill_review', finalBillAmount: 25000, queryPayload: { dischargeSummary: 'pending' } });
    lifecycleStatuses['POST /api/tpa/provider-cases/:caseNumber/status'] = providerUpdate.status;
  } else {
    lifecycleStatuses['POST /api/tpa/provider-cases/:caseNumber/status'] = 500;
  }

  const providerCases = await request(app)
    .get('/api/tpa/provider-cases')
    .set('Authorization', `Bearer ${token}`);
  lifecycleStatuses['GET /api/tpa/provider-cases'] = providerCases.status;

  const interopEvent = await request(app)
    .post('/api/tpa/interop/events')
    .set('Authorization', `Bearer ${token}`)
    .send({ claimNumber, eventType: 'claim_status_update', targetSystem: 'nhcx_gateway', idempotencyKey: `smoke-${claimNumber}` });
  lifecycleStatuses['POST /api/tpa/interop/events'] = interopEvent.status;

  const interopEvents = await request(app)
    .get('/api/tpa/interop/events')
    .set('Authorization', `Bearer ${token}`);
  lifecycleStatuses['GET /api/tpa/interop/events'] = interopEvents.status;

  const enterpriseControls = await request(app)
    .get(`/api/tpa/claims/${claimNumber}/enterprise-controls`)
    .set('Authorization', `Bearer ${token}`);
  lifecycleStatuses['GET /api/tpa/claims/:claimNumber/enterprise-controls'] = enterpriseControls.status;

  const opsStamp = Date.now();
  const underwritingCaseNumber = `UW-SMOKE-${opsStamp}`;
  const underwritingCase = await request(app)
    .post('/api/tpa/underwriting/cases')
    .set('Authorization', `Bearer ${token}`)
    .send({
      caseNumber: underwritingCaseNumber,
      corporateName: 'Mediqzy QA Corporate',
      policyNumber: 'POL-SMOKE-OPS-001',
      livesCount: 125,
      sumInsured: 500000,
      riskScore: 18,
      decisionNotes: 'Smoke underwriting intake'
    });
  lifecycleStatuses['POST /api/tpa/underwriting/cases'] = underwritingCase.status;

  const underwritingDecision = await request(app)
    .post(`/api/tpa/underwriting/cases/${underwritingCaseNumber}/decision`)
    .set('Authorization', `Bearer ${token}`)
    .send({ decision: 'approved', premiumAmount: 875000, notes: 'Smoke underwriting approval' });
  lifecycleStatuses['POST /api/tpa/underwriting/cases/:caseNumber/decision'] = underwritingDecision.status;

  const enrollmentNumber = `ENR-SMOKE-${opsStamp}`;
  const memberEnrollment = await request(app)
    .post('/api/tpa/member-enrollments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      enrollmentNumber,
      employeeId: `EMP-ENR-SMOKE-${opsStamp}`,
      employeeName: 'Enrollment Smoke Member',
      corporateName: 'Mediqzy QA Corporate',
      policyNumber: 'POL-SMOKE-OPS-001',
      coverageAmount: 500000
    });
  lifecycleStatuses['POST /api/tpa/member-enrollments generates member ID'] = memberEnrollment.status;

  const enrollmentDecision = await request(app)
    .post(`/api/tpa/member-enrollments/${enrollmentNumber}/decision`)
    .set('Authorization', `Bearer ${token}`)
    .send({ decision: 'approved', notes: 'Smoke enrollment approval' });
  lifecycleStatuses['POST /api/tpa/member-enrollments/:enrollmentNumber/decision activates member'] = enrollmentDecision.status;

  const enrolledMemberId = enrollmentDecision.body?.memberId || memberEnrollment.body?.memberId || memberEnrollment.body?.enrollment?.member_id;
  const enrolledECard = await request(app)
    .post(`/api/tpa/members/${enrolledMemberId}/ecard/generate`)
    .set('Authorization', `Bearer ${token}`);
  lifecycleStatuses['POST /api/tpa/members/:memberId/ecard/generate'] = enrolledECard.status;

  const providerCode = `PROV-SMOKE-${opsStamp}`;
  const providerContract = await request(app)
    .post('/api/tpa/provider-contracts')
    .set('Authorization', `Bearer ${token}`)
    .send({
      providerCode,
      providerName: 'Smoke Network Hospital',
      providerType: 'hospital',
      city: 'Chennai',
      state: 'Tamil Nadu',
      contractNumber: `MOU-SMOKE-${opsStamp}`,
      mouUrl: `https://example.invalid/mou/${providerCode}.pdf`,
      cashlessEnabled: true,
      validFrom: '2026-09-01',
      validTo: '2027-08-31'
    });
  lifecycleStatuses['POST /api/tpa/provider-contracts'] = providerContract.status;

  const providerSOC = await request(app)
    .post(`/api/tpa/provider-contracts/${providerCode}/soc`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      socCode: `SOC-SMOKE-${opsStamp}`,
      versionNumber: 'v1',
      tariffName: 'Smoke Corporate SOC',
      validFrom: '2026-09-01',
      validTo: '2027-08-31',
      roomRentLimit: 4500,
      icuLimit: 9500,
      procedureTariffs: { appendectomy: 45000, dialysis: 7000 }
    });
  lifecycleStatuses['POST /api/tpa/provider-contracts/:providerCode/soc'] = providerSOC.status;

  const cashlessForm = await request(app)
    .post('/api/tpa/cashless/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      formCode: `FORM-SMOKE-${opsStamp}`,
      formName: 'Smoke Cashless Preauth Form',
      formType: 'preauth',
      requiredFields: ['memberId', 'diagnosis', 'estimatedAmount'],
      requiredDocuments: ['doctor_advice', 'estimate']
    });
  lifecycleStatuses['POST /api/tpa/cashless/forms'] = cashlessForm.status;

  const cashlessOutcomes = [
    ['approved', `CLR-SMOKE-A-${opsStamp}`],
    ['query_raised', `CLR-SMOKE-Q-${opsStamp}`],
    ['denied', `CLR-SMOKE-D-${opsStamp}`],
  ];
  for (const [outcome, requestNumber] of cashlessOutcomes) {
    const cashlessRequest = await request(app)
      .post('/api/tpa/cashless/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requestNumber,
        providerCode,
        providerName: 'Smoke Network Hospital',
        memberId: enrolledMemberId,
        employeeName: 'Enrollment Smoke Member',
        corporateName: 'Mediqzy QA Corporate',
        policyNumber: 'POL-SMOKE-OPS-001',
        diagnosis: 'Smoke fever admission',
        estimatedAmount: 42000,
        requestedAmount: 42000
      });
    lifecycleStatuses[`POST /api/tpa/cashless/requests ${outcome}`] = cashlessRequest.status;

    const cashlessDecision = await request(app)
      .post(`/api/tpa/cashless/requests/${requestNumber}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        decision: outcome,
        approvedAmount: outcome === 'approved' ? 39000 : 0,
        queryText: outcome === 'query_raised' ? 'Upload latest vitals and estimate breakup' : null,
        denialReason: outcome === 'denied' ? 'Smoke denial branch validation' : null,
        notes: `Smoke ${outcome} branch`
      });
    lifecycleStatuses[`POST /api/tpa/cashless/requests/:requestNumber/decision ${outcome}`] = cashlessDecision.status;
  }

  const blacklistProvider = await request(app)
    .post(`/api/tpa/provider-contracts/${providerCode}/blacklist`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'Smoke blacklist verification', severity: 'watchlist' });
  lifecycleStatuses['POST /api/tpa/provider-contracts/:providerCode/blacklist'] = blacklistProvider.status;

  const providerClaimNumber = `CLM-PROV-SMOKE-${opsStamp}`;
  const providerClaim = await request(app)
    .post('/api/tpa/provider-claims')
    .set('Authorization', `Bearer ${token}`)
    .send({
      claimNumber: providerClaimNumber,
      providerCode,
      providerName: 'Smoke Network Hospital',
      memberId: enrolledMemberId,
      employeeName: 'Enrollment Smoke Member',
      corporateName: 'Mediqzy QA Corporate',
      policyNumber: 'POL-SMOKE-OPS-001',
      diagnosis: 'Smoke discharge claim',
      finalBillAmount: 82000,
      documentsCount: 5
    });
  lifecycleStatuses['POST /api/tpa/provider-claims'] = providerClaim.status;

  const scanClaim = await request(app)
    .post(`/api/tpa/claims/${providerClaimNumber}/scan`)
    .set('Authorization', `Bearer ${token}`)
    .send({ batchNumber: `SCAN-SMOKE-${opsStamp}`, pageCount: 18, qualityScore: 91 });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/scan'] = scanClaim.status;

  const billEntry = await request(app)
    .post(`/api/tpa/claims/${providerClaimNumber}/bill-entry`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      billNumber: `BILL-SMOKE-${opsStamp}`,
      billDate: '2026-09-06',
      grossAmount: 82000,
      deductions: 7000,
      payableAmount: 75000,
      lineItems: [
        { itemCode: 'ROOM', description: 'Room rent', quantity: 3, rate: 4500, grossAmount: 13500, deductionAmount: 0, allowedAmount: 13500 },
        { itemCode: 'PROC', description: 'Procedure package', quantity: 1, rate: 68500, grossAmount: 68500, deductionAmount: 7000, allowedAmount: 61500 }
      ]
    });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/bill-entry'] = billEntry.status;

  const adjudication = await request(app)
    .post(`/api/tpa/claims/${providerClaimNumber}/adjudication`)
    .set('Authorization', `Bearer ${token}`)
    .send({ grossAmount: 82000, nonPayableAmount: 7000, approvedAmount: 75000, coPayAmount: 0, tdsAmount: 7500, netPayableAmount: 67500, notes: 'Smoke adjudication' });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/adjudication'] = adjudication.status;

  const chargeEntry = await request(app)
    .post(`/api/tpa/claims/${providerClaimNumber}/charge-entry`)
    .set('Authorization', `Bearer ${token}`)
    .send({ chargeCode: 'TPA-FEE', chargeDescription: 'TPA processing fee', chargeAmount: 950, taxAmount: 171, netAmount: 1121 });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/charge-entry'] = chargeEntry.status;

  const paymentAdvice = await request(app)
    .post(`/api/tpa/claims/${providerClaimNumber}/payment-advice`)
    .set('Authorization', `Bearer ${token}`)
    .send({ payableTo: 'Smoke Network Hospital', payableAmount: 67500, paymentMode: 'neft', utrNumber: `UTR${opsStamp}`, status: 'paid' });
  lifecycleStatuses['POST /api/tpa/claims/:claimNumber/payment-advice'] = paymentAdvice.status;

  const claimOperations = await request(app)
    .get(`/api/tpa/claims/${providerClaimNumber}/operations`)
    .set('Authorization', `Bearer ${token}`);
  lifecycleStatuses['GET /api/tpa/claims/:claimNumber/operations'] = claimOperations.status;
}

console.log(JSON.stringify({
  email,
  loginStatus: login.status,
  loginSuccess: login.body?.success === true,
  loginMessage: login.body?.message || login.body?.error?.message || null,
  hasToken: Boolean(token),
  role: login.body?.user?.role || login.body?.tpa?.role || null,
  dashboardStatus,
  dashboardKeys,
  menuStatuses,
  lifecycleStatuses,
}, null, 2));

const allMenuOk = Object.values(menuStatuses).every((status) => status === 200);
const allLifecycleOk = Object.values(lifecycleStatuses).every((status) => status === 200 || status === 201);
process.exit(login.status === 200 && token && dashboardStatus === 200 && allMenuOk && allLifecycleOk ? 0 : 1);
