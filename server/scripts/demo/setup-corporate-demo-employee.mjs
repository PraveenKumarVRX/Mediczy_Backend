/**
 * Sales demo login: a corporate employee of "My SmartHealth" (corporate 4) holding everything a real
 * employee can hold — the corporate plan, an annual health check-up, all seven group policy types for a
 * family of five, and family records — so a prospective client can try every employee function.
 *
 * The account is marked `metadata.demoAccount = true`; the demo guard (services/demo-account.service.js)
 * keeps everything it does inside the app: no partner, Team member, payment gateway or outside contact
 * acts on it. Do not share the login until that guard is deployed.
 *
 * Built through the same admin APIs HR and Team use (employee upload, network, package, tagging) and the
 * employee's own family API, so the account is exactly what a real employee gets. Only the password,
 * the demo flag and the policy-family copy are written directly.
 *
 *   node scripts/ssm-env-loader.mjs scripts/demo/setup-corporate-demo-employee.mjs                # report
 *   node scripts/ssm-env-loader.mjs scripts/demo/setup-corporate-demo-employee.mjs --apply --password='…'
 *
 * Talks to the local server (http://localhost:8888), never the public app host.
 */
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../db/pgPool.js';

const BASE = 'http://localhost:8888';
const CORPORATE_ID = 4;            // My SmartHealth (CMSHT1)
const EMAIL = 'demo@mysmarthealth.in';
const EMPLOYEE_CODE = 'DEMO-001';
const POLICY_TEMPLATE_USER_EMAIL = 'test.policy.employee@example.invalid'; // the seeded policy family to mirror
const PACKAGE_NAME = 'Annual Health Check — Demo';
const APPLY = process.argv.includes('--apply');
const PASSWORD = (process.argv.find((a) => a.startsWith('--password=')) || '').slice('--password='.length);

const FAMILY = [
  { relationship: 'spouse', firstName: 'Asha', lastName: 'Demo', dateOfBirth: '1991-03-08', gender: 'Female' },
  { relationship: 'son', firstName: 'Arjun', lastName: 'Demo', dateOfBirth: '2017-01-22', gender: 'Male' },
  { relationship: 'father', firstName: 'Ramesh', lastName: 'Demo', dateOfBirth: '1958-06-30', gender: 'Male' },
  { relationship: 'mother', firstName: 'Lakshmi', lastName: 'Demo', dateOfBirth: '1961-11-15', gender: 'Female' },
];
const NAME_BY_RELATION = Object.fromEntries(FAMILY.map((f) => [f.relationship, `${f.firstName} ${f.lastName}`]));

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const sign = (claims) => jwt.sign({ tokenType: 'access', ...claims }, process.env.JWT_SECRET, { expiresIn: 900 });
async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  });
  let json = {}; try { json = await res.json(); } catch { /* empty body */ }
  if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${json.message || JSON.stringify(json).slice(0, 300)}`);
  return json;
}
const step = (msg) => console.log(`${APPLY ? '•' : '(dry run)'} ${msg}`);

try {
  if (APPLY && PASSWORD.length < 12) throw new Error('--password= (12+ characters) is required with --apply');
  const [corporate] = await q(`SELECT id, "companyName", status FROM corporates WHERE id=$1`, [CORPORATE_ID]);
  if (corporate?.status !== 'Active') throw new Error(`corporate ${CORPORATE_ID} is not active`);
  const [admin] = await q(`SELECT id FROM users WHERE "isAdmin"=true AND status='active' ORDER BY id LIMIT 1`);
  const adminToken = sign({ id: admin.id, userId: admin.id, role: 'admin', userType: 'admin', isAdmin: true });
  console.log(`corporate: ${corporate.companyName} (${CORPORATE_ID}); acting as admin #${admin.id}`);

  // 1. The employee, through the Team/Admin upload (assigns the corporate plan; no welcome email).
  let [user] = await q(`SELECT id, metadata FROM users WHERE lower(email)=$1`, [EMAIL]);
  if (user) console.log(`account exists: #${user.id}`);
  else {
    step(`create employee ${EMAIL} (${EMPLOYEE_CODE}) via POST /api/admin/corporate-employees, no welcome email`);
    if (APPLY) {
      const r = await call('POST', `/api/admin/corporate-employees?corporateId=${CORPORATE_ID}`, adminToken, {
        corporateId: CORPORATE_ID, sendWelcomeEmail: false,
        employees: [{ firstName: 'Demo', lastName: 'Employee', email: EMAIL, employeeId: EMPLOYEE_CODE,
          department: 'Product Demo', designation: 'Demo Employee', gender: 'Other', dateOfBirth: '1988-04-12',
          joiningDate: '2025-04-01', city: 'Bengaluru', state: 'Karnataka' }],
      });
      const failed = r.data?.failed || r.failed || [];
      if (failed.length) throw new Error(`upload refused: ${JSON.stringify(failed)}`);
      [user] = await q(`SELECT id, metadata FROM users WHERE lower(email)=$1`, [EMAIL]);
    }
  }

  // 2. Password, and the demo flag. doNotDelete keeps the nightly membership sync and erasure off it.
  step('set the shared password, mark metadata.demoAccount, clear the forced password change');
  if (APPLY) {
    const hash = await bcrypt.hash(PASSWORD, 10);
    await q(`UPDATE users SET password=$2, "emailVerified"=true, status='active',
               metadata = COALESCE(metadata,'{}'::jsonb) - 'requirePasswordChange'
                          || jsonb_build_object('demoAccount', true, 'doNotDelete', true, 'purpose', 'sales-demo'),
               "updatedAt"=NOW() WHERE id=$1`, [user.id, hash]);
  }

  // 3. Family records, through the employee's own API (membership-gated; the employer sponsors it).
  const userToken = user && sign({ id: user.id, userId: user.id, role: 'user', userType: 'user' });
  const existingFamily = user ? await q(`SELECT relationship FROM family_members WHERE "userId"=$1`, [user.id]) : [];
  for (const member of FAMILY) {
    if (existingFamily.some((f) => f.relationship === member.relationship)) continue;
    step(`add family member ${member.firstName} ${member.lastName} (${member.relationship}) via POST /api/family-members`);
    if (APPLY) await call('POST', '/api/family-members', userToken, member);
  }

  // 4. All seven group policies: copy the seeded test family's cover onto the demo family.
  const [template] = await q(`SELECT id FROM users WHERE email=$1`, [POLICY_TEMPLATE_USER_EMAIL]);
  const templateRows = template ? await q(`SELECT count(*)::int n FROM policy_members WHERE "primaryMemberUserId"=$1`, [template.id]) : [{ n: 0 }];
  const haveRows = user ? await q(`SELECT count(*)::int n FROM policy_members WHERE "primaryMemberUserId"=$1`, [user.id]) : [{ n: 0 }];
  if (!templateRows[0].n) throw new Error('no seeded group policies to mirror on corporate 4 (run scripts/seed-test-group-policies.mjs --corporate=4 --apply)');
  if (!haveRows[0].n) {
    step(`enrol the demo family on the seven group policies (${templateRows[0].n} member rows)`);
    if (APPLY) {
      await q(`INSERT INTO policy_members ("policyId","userId",relationship,"isActive","coverageStartDate","coverageEndDate",
                 "individualSumInsured","preExistingDiseases","sumInsuredUsed","sumInsuredRemaining",metadata,
                 "primaryMemberUserId","memberName","dateOfBirth","nomineeName","nomineeRelation","memberCardNumber","createdAt","updatedAt")
               SELECT pm."policyId", CASE WHEN pm.relationship='self' THEN $2::int END, pm.relationship, pm."isActive",
                 pm."coverageStartDate", pm."coverageEndDate", pm."individualSumInsured", pm."preExistingDiseases",
                 pm."sumInsuredUsed", pm."sumInsuredRemaining",
                 jsonb_build_object('person', pm.metadata->>'person', 'demoAccount', true, 'seededBy', 'setup-corporate-demo-employee'),
                 $2::int, CASE WHEN pm.relationship='self' THEN NULL ELSE ($3::jsonb)->>pm.relationship END,
                 pm."dateOfBirth", CASE WHEN pm."nomineeName" IS NOT NULL THEN ($3::jsonb)->>'spouse' END, pm."nomineeRelation",
                 replace(pm."memberCardNumber", 'TEST-CARD', 'DEMO-CARD'), NOW(), NOW()
                 FROM policy_members pm WHERE pm."primaryMemberUserId"=$1`, [template.id, user.id, JSON.stringify(NAME_BY_RELATION)]);
    }
  }

  // 5. Network labs for My SmartHealth, so the check-up has venues (Karnataka labs from an existing network).
  const [{ n: networkLabs }] = await q(`SELECT count(*)::int n FROM corporate_network_assignments WHERE corporate_id=$1`, [CORPORATE_ID]);
  if (!networkLabs) {
    const labs = await q(`SELECT DISTINCT l.id FROM corporate_network_assignments n JOIN labs l ON l.id=n.partner_id
                           WHERE n.partner_type='lab' AND l.status='active' AND l.address->>'state' ILIKE 'karnataka' ORDER BY l.id LIMIT 6`);
    step(`add ${labs.length} Karnataka network labs to corporate ${CORPORATE_ID} via POST /api/admin/corporate-network-assignments`);
    if (APPLY) await call('POST', '/api/admin/corporate-network-assignments', adminToken,
      { corporateId: CORPORATE_ID, partners: labs.map((l) => ({ partnerId: l.id, partnerType: 'lab' })) });
  }

  // 6. An annual health check-up package, tagged to the demo employee (tagging sends nothing).
  let [pkg] = await q(`SELECT id FROM corporate_health_package_catalog WHERE corporate_id=$1 AND name=$2`, [CORPORATE_ID, PACKAGE_NAME]);
  if (!pkg) {
    step(`create package "${PACKAGE_NAME}" via POST /api/admin/health-packages`);
    if (APPLY) {
      const r = await call('POST', '/api/admin/health-packages', adminToken, {
        corporateId: CORPORATE_ID, packageName: PACKAGE_NAME, status: 'Active', frequency: 'Annual', validityPeriod: '1 Year',
        costPerEmployee: 0, maxEmployees: 10, eligibleRelations: ['self', 'spouse'], workflowClass: 'annual_benefit',
        description: 'Demonstration package for the sales demo login.',
        tests: ['Complete Blood Count', 'Fasting Blood Sugar', 'HbA1c', 'Lipid Profile', 'Liver Function Test',
          'Kidney Function Test', 'Thyroid Profile (T3, T4, TSH)', 'Urine Routine', 'Vitamin D', 'Vitamin B12', 'ECG',
          'Chest X-Ray', 'Physician Consultation'],
      });
      pkg = { id: r.data?.id };
    }
  }
  const tagged = user && pkg?.id ? await q(`SELECT 1 FROM user_health_packages WHERE "userId"=$1 AND "packageId"=$2 AND status='active'`, [user.id, String(pkg.id)]) : [];
  if (!tagged.length) {
    step('assign the package to the demo employee via POST /api/admin/health-packages/:id/tag-employees');
    if (APPLY) await call('POST', `/api/admin/health-packages/${encodeURIComponent(pkg.id)}/tag-employees`, adminToken, { employeeIds: [user.id] });
  }

  if (APPLY) {
    const [s] = await q(`SELECT u.id, u.unique_id, u.status, u.metadata->>'demoAccount' demo,
        (SELECT count(*) FROM user_subscriptions WHERE user_id=u.id AND status='ACTIVE')::int plans,
        (SELECT count(*) FROM user_health_packages WHERE "userId"=u.id AND status='active')::int packages,
        (SELECT count(*) FROM family_members WHERE "userId"=u.id)::int family,
        (SELECT count(DISTINCT "policyId") FROM policy_members WHERE "primaryMemberUserId"=u.id)::int policies,
        (SELECT count(*) FROM policy_members WHERE "primaryMemberUserId"=u.id)::int policy_members
      FROM users u WHERE u.id=$1`, [user.id]);
    console.log('result', s);
  }
} catch (error) {
  console.error('STOPPED:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
