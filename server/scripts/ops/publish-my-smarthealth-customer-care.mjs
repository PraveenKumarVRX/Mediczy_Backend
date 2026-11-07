/**
 * Deployment-managed bootstrap content for My SmartHealth customer care.
 * Run with --apply only after the customer-care migrations are present.
 * The documents are deliberately non-clinical and are also maintained in
 * docs/support/MY_SMARTHEALTH_CUSTOMER_CARE_V1_2026-11-07.md.
 */
import pool from '../../db/pgPool.js';
import { createCustomerCareService } from '../../services/customer-care.service.js';

const TENANT_ID = 7;
const SOURCE_URI = 'mediqzy://support/my-smarthealth/customer-care-v1-2026-11-07';
const REVIEW_DUE_AT = '2027-02-05T00:00:00.000Z';
const OWNER = 'My SmartHealth admin';

const documents = [
  {
    id: 'c50ae21b-2c91-4d55-8f19-bcaf02a90101',
    title: 'What My SmartHealth customer care can help with',
    tags: ['customer-care', 'support-scope', 'human-handoff'],
    body: 'My SmartHealth customer care can help with verified appointment, laboratory-order, pharmacy-order and membership status; verified appointment availability; and appointment cancellation or rescheduling after explicit confirmation. Customer care does not provide diagnosis, treatment, medication, clinical-document interpretation, payment, refund, claim or insurance decisions, or another person’s account information. Requests outside that scope are handed to a human support specialist.',
  },
  {
    id: 'c50ae21b-2c91-4d55-8f19-bcaf02a90102',
    title: 'Appointment status and verified availability',
    tags: ['appointment', 'status', 'availability'],
    body: 'After signing in, a customer can view the status of their own appointments. Appointment availability is returned only from the current provider schedule and booked-slot data. A displayed slot is an option to consider, not a completed booking. The customer must complete the normal booking flow to create a new appointment.',
  },
  {
    id: 'c50ae21b-2c91-4d55-8f19-bcaf02a90103',
    title: 'Cancelling or rescheduling an appointment',
    tags: ['appointment', 'cancel', 'reschedule', 'confirmation'],
    body: 'An authenticated customer may ask to cancel or reschedule their own appointment. Customer care first creates a proposal that shows the requested change. Nothing changes until the customer explicitly confirms the proposal. Immediately before completion, the system checks the current appointment state and, for rescheduling, confirms that the requested slot is still available. If the appointment or slot changed, the customer must request a new proposal.',
  },
  {
    id: 'c50ae21b-2c91-4d55-8f19-bcaf02a90104',
    title: 'Lab-order status',
    tags: ['lab', 'laboratory', 'order', 'status'],
    body: 'After signing in, a customer can view the status of their own laboratory order, including whether it is pending, sample collected, in progress, completed or cancelled when that status is available. Customer care does not interpret laboratory results or provide medical advice. Questions about results are routed to an appropriate human care team.',
  },
  {
    id: 'c50ae21b-2c91-4d55-8f19-bcaf02a90105',
    title: 'Pharmacy-order status',
    tags: ['pharmacy', 'order', 'delivery', 'status'],
    body: 'After signing in, a customer can view the delivery status of their own pharmacy order. Customer care does not prescribe, change a medication, assess a prescription, or make payment or refund decisions. A request outside order tracking is handed to a human support specialist.',
  },
  {
    id: 'c50ae21b-2c91-4d55-8f19-bcaf02a90106',
    title: 'Membership status and account privacy',
    tags: ['membership', 'privacy', 'account-access'],
    body: 'After signing in, a customer can view their own active membership plan and renewal status. Customer care does not decide benefits, insurance eligibility, coverage, claims, refunds or payments. It does not disclose account, appointment, order or membership information to an employer, family member or any other third party without an approved, authenticated workflow.',
  },
  {
    id: 'c50ae21b-2c91-4d55-8f19-bcaf02a90107',
    title: 'Human support and urgent safety',
    tags: ['human-handoff', 'urgent-safety', 'support'],
    body: 'A customer can request a human support specialist at any time. If approved support guidance cannot verify an answer, customer care creates a human handoff rather than guessing. For urgent symptoms, self-harm, abuse, or immediate danger, customer care does not provide clinical triage; it creates an urgent handoff and directs the customer to local emergency services when there is immediate danger.',
  },
];

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ dryRun: true, tenantId: TENANT_ID, documents: documents.map(({ id, title }) => ({ id, title })), reviewDueAt: REVIEW_DUE_AT, owner: OWNER }));
  process.exit(0);
}

try {
  const tenant = await pool.query(`SELECT id, name, slug, status::text AS status FROM tenants WHERE id = $1`, [TENANT_ID]);
  if (tenant.rows[0]?.slug !== 'my-smarthealth' || tenant.rows[0]?.status !== 'active') {
    throw new Error('My SmartHealth tenant is not an active tenant');
  }
  const service = createCustomerCareService({ database: pool });
  const published = [];
  for (const document of documents) {
    published.push(await service.saveKnowledge(TENANT_ID, null, {
      ...document,
      sourceUri: SOURCE_URI,
      reviewDueAt: REVIEW_DUE_AT,
      ownerLabel: OWNER,
      language: 'en',
      status: 'published',
      global: false,
    }));
  }
  console.log(JSON.stringify({ tenant: tenant.rows[0], published: published.map(({ id, title, version, status, review_due_at, content_owner }) => ({ id, title, version, status, reviewDueAt: review_due_at, contentOwner: content_owner })) }));
} finally {
  await pool.end();
}
