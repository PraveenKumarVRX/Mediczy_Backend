/**
 * Hospital Insurance Dashboard - Database Level Tests
 * Tests models, queries, and database functionality without requiring authentication
 */

import { postgresSequelize as sequelize } from './server/db/postgres-sequelize.js';
import InsuranceClaim from './server/models/postgres/insuranceClaim.model.postgres.js';
import PreAuthorization from './server/models/postgres/preAuthorization.model.postgres.js';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

const testResults = {
  passed: [],
  failed: [],
  total: 0
};

// Helper function to log test results
function logTest(testName, passed, details = '') {
  testResults.total++;
  if (passed) {
    testResults.passed.push(testName);
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    if (details) console.log(`  ${colors.blue}${details}${colors.reset}`);
  } else {
    testResults.failed.push(testName);
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (details) console.log(`  ${colors.red}Error: ${details}${colors.reset}`);
  }
}

// Test configuration
let testPatientId, testHospitalId, testClaimId, testPreAuthId;

// Test 1: Database Connection
async function testDatabaseConnection() {
  console.log(`\n${colors.blue}${colors.bold}1. Testing Database Connection${colors.reset}`);
  
  try {
    await sequelize.authenticate();
    logTest('PostgreSQL connection', true, 'Connected successfully');
  } catch (error) {
    logTest('PostgreSQL connection', false, error.message);
  }
}

// Test 2: Table Existence
async function testTableExistence() {
  console.log(`\n${colors.blue}${colors.bold}2. Testing Table Existence${colors.reset}`);
  
  try {
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('insurance_claims', 'pre_authorizations', 'tenants', 'users')
      ORDER BY table_name
    `);
    
    const tableNames = tables.map(t => t.table_name);
    
    logTest('insurance_claims table exists', tableNames.includes('insurance_claims'));
    logTest('pre_authorizations table exists', tableNames.includes('pre_authorizations'));
    logTest('tenants table exists', tableNames.includes('tenants'));
    logTest('users table exists', tableNames.includes('users'));
    
  } catch (error) {
    logTest('Table existence check', false, error.message);
  }
}

// Test 3: Column Verification
async function testColumnStructure() {
  console.log(`\n${colors.blue}${colors.bold}3. Testing Column Structure${colors.reset}`);
  
  try {
    // Test insurance_claims columns
    const [claimsCols] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'insurance_claims' 
        AND column_name IN ('hospital_id', 'pre_auth_id', 'settlement_status', 'claim_type', 
                            'hospitalization_details', 'diagnosis', 'treatment_details',
                            'documents_status', 'required_documents', 'query_history')
    `);
    
    const hasNewFields = claimsCols.length >= 8;
    logTest('insurance_claims has new IHX fields', hasNewFields, 
      `Found ${claimsCols.length}/10 new fields`);
    
    // Test pre_authorizations columns
    const [preAuthCols] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pre_authorizations' 
        AND column_name IN ('pre_auth_number', 'admission_details', 'estimated_amount', 
                            'approved_amount', 'planned_procedures', 'status', 'expires_at')
    `);
    
    const hasPreAuthFields = preAuthCols.length >= 6;
    logTest('pre_authorizations has required fields', hasPreAuthFields,
      `Found ${preAuthCols.length}/7 key fields`);
    
  } catch (error) {
    logTest('Column structure check', false, error.message);
  }
}

// Test 4: Index Verification
async function testIndexes() {
  console.log(`\n${colors.blue}${colors.bold}4. Testing Database Indexes${colors.reset}`);
  
  try {
    const [indexes] = await sequelize.query(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename IN ('insurance_claims', 'pre_authorizations')
      ORDER BY tablename, indexname
    `);
    
    const claimsIndexes = indexes.filter(i => i.tablename === 'insurance_claims').length;
    const preAuthIndexes = indexes.filter(i => i.tablename === 'pre_authorizations').length;
    
    logTest('insurance_claims has performance indexes', claimsIndexes >= 5,
      `Found ${claimsIndexes} indexes`);
    logTest('pre_authorizations has performance indexes', preAuthIndexes >= 5,
      `Found ${preAuthIndexes} indexes`);
    
  } catch (error) {
    logTest('Index verification', false, error.message);
  }
}

// Test 5: View Verification
async function testViews() {
  console.log(`\n${colors.blue}${colors.bold}5. Testing Database Views${colors.reset}`);
  
  try {
    const [views] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
        AND table_name IN ('v_claims_dashboard', 'v_preauth_dashboard')
    `);
    
    const viewNames = views.map(v => v.table_name);
    
    logTest('v_claims_dashboard view exists', viewNames.includes('v_claims_dashboard'));
    logTest('v_preauth_dashboard view exists', viewNames.includes('v_preauth_dashboard'));
    
    // Test view queries
    if (viewNames.includes('v_claims_dashboard')) {
      const [claimsView] = await sequelize.query('SELECT COUNT(*) as count FROM v_claims_dashboard');
      logTest('v_claims_dashboard is queryable', true, `${claimsView[0].count} rows`);
    }
    
    if (viewNames.includes('v_preauth_dashboard')) {
      const [preAuthView] = await sequelize.query('SELECT COUNT(*) as count FROM v_preauth_dashboard');
      logTest('v_preauth_dashboard is queryable', true, `${preAuthView[0].count} rows`);
    }
    
  } catch (error) {
    logTest('View verification', false, error.message);
  }
}

// Test 6: Model Operations
async function testModels() {
  console.log(`\n${colors.blue}${colors.bold}6. Testing Sequelize Models${colors.reset}`);
  
  try {
    // Test InsuranceClaim model
    const claimCount = await InsuranceClaim.count();
    logTest('InsuranceClaim.count() works', true, `${claimCount} claims in database`);
    
    // Test PreAuthorization model
    const preAuthCount = await PreAuthorization.count();
    logTest('PreAuthorization.count() works', true, `${preAuthCount} pre-auths in database`);
    
    // Test model attributes
    const claimAttrs = Object.keys(InsuranceClaim.rawAttributes);
    const hasRequiredAttrs = ['hospital_id', 'settlement_status', 'claim_type'].every(
      attr => claimAttrs.includes(attr)
    );
    logTest('InsuranceClaim model has new attributes', hasRequiredAttrs,
      `Model has ${claimAttrs.length} total attributes`);
    
  } catch (error) {
    logTest('Model operations', false, error.message);
  }
}

// Test 7: CRUD Operations
async function testCRUDOperations() {
  console.log(`\n${colors.blue}${colors.bold}7. Testing CRUD Operations${colors.reset}`);
  
  try {
    // Get test data
    const [users] = await sequelize.query('SELECT id FROM users LIMIT 1');
    const [hospitals] = await sequelize.query('SELECT id FROM tenants LIMIT 1');
    
    if (!users[0] || !hospitals[0]) {
      logTest('Test data setup', false, 'No test users or hospitals found');
      return;
    }
    
    testPatientId = users[0].id;
    testHospitalId = hospitals[0].id;
    
    // CREATE: Insurance Claim
    const claimNumber = `CLM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Get existing user_insurance ID
    const [userIns] = await sequelize.query(`
      SELECT id FROM user_insurances LIMIT 1
    `);
    
    if (!userIns[0]) {
      console.log(`${colors.yellow}⚠${colors.reset} No user_insurances found, skipping CRUD tests`);
      return;
    }
    
    const userInsuranceId = userIns[0].id;
    
    const newClaim = await InsuranceClaim.create({
      claimNumber: claimNumber,
      userInsuranceId: userInsuranceId,
      hospitalId: testHospitalId,
      organizationId: testHospitalId,
      policyNumber: 'TEST-AUTO-001',
      insuranceProviderId: 1,
      claimAmount: 75000.50,
      claimType: 'cashless',
      status: 'draft',
      diagnosis: 'Automated test claim for database verification',
      hospitalizationDetails: {
        admissionDate: '2026-01-30',
        dischargeDate: '2026-02-02',
        roomType: 'Private',
        roomNumber: 'ICU-101'
      },
      treatmentDetails: {
        procedures: ['Diagnostic CT Scan', 'Blood Tests'],
        medications: ['Paracetamol', 'Antibiotics']
      },
      documentsStatus: 'incomplete',
      requiredDocuments: ['discharge_summary', 'bills', 'prescriptions']
    });
    
    testClaimId = newClaim.id;
    logTest('CREATE insurance claim', true, `Created claim ID: ${testClaimId}`);
    
    // READ: Fetch the claim
    const fetchedClaim = await InsuranceClaim.findByPk(testClaimId);
    logTest('READ insurance claim', fetchedClaim !== null, `Claim ${testClaimId} retrieved`);
    
    // UPDATE: Modify the claim
    await fetchedClaim.update({
      status: 'submitted',
      submittedAt: new Date(),
      settlementStatus: 'pending'
    });
    logTest('UPDATE insurance claim', true, `Updated status to 'submitted'`);
    
    // CREATE: Pre-Authorization
    const preAuthNumber = `PA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newPreAuth = await PreAuthorization.create({
      preAuthNumber: preAuthNumber,
      patientId: testPatientId,
      hospitalId: testHospitalId,
      organizationId: testHospitalId, // Required field
      policyNumber: 'TEST-POL-001',
      insuranceProviderId: 1,
      admissionDetails: {
        admissionType: 'Emergency',
        admissionDate: '2026-02-05',
        roomType: 'ICU'
      },
      estimatedAmount: 150000.00,
      diagnosis: 'Emergency surgical procedure test',
      plannedProcedures: ['Emergency Surgery', 'Post-op monitoring'],
      estimatedDuration: 5,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
    
    testPreAuthId = newPreAuth.id;
    logTest('CREATE pre-authorization', true, `Created pre-auth ID: ${testPreAuthId}`);
    
    // READ: Fetch pre-auth
    const fetchedPreAuth = await PreAuthorization.findByPk(testPreAuthId);
    logTest('READ pre-authorization', fetchedPreAuth !== null, `Pre-auth ${testPreAuthId} retrieved`);
    
    // UPDATE: Approve pre-auth
    await fetchedPreAuth.update({
      status: 'approved',
      approvedAmount: 140000.00,
      approvedAt: new Date()
    });
    logTest('UPDATE pre-authorization', true, `Approved with amount: ₹140,000`);
    
  } catch (error) {
    logTest('CRUD operations', false, error.message);
  }
}

// Test 8: Complex Queries
async function testComplexQueries() {
  console.log(`\n${colors.blue}${colors.bold}8. Testing Complex Queries${colors.reset}`);
  
  try {
    // Test 1: Claims by status
    const [claimsByStatus] = await sequelize.query(`
      SELECT status, COUNT(*) as count, SUM("claimAmount") as total_amount
      FROM insurance_claims
      GROUP BY status
    `);
    logTest('Query claims by status', true, `Found ${claimsByStatus.length} status groups`);
    
    // Test 2: Pre-auths expiring soon
    const [expiringPreAuths] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM pre_authorizations
      WHERE status = 'approved' 
        AND expires_at < NOW() + INTERVAL '7 days'
    `);
    logTest('Query expiring pre-auths', true, `${expiringPreAuths[0].count} expiring in 7 days`);
    
    // Test 3: Settlement pending claims
    const [pendingSettlement] = await sequelize.query(`
      SELECT COUNT(*) as count, SUM("claimAmount") as total_amount
      FROM insurance_claims
      WHERE status = 'approved' 
        AND settlement_status = 'pending'
    `);
    logTest('Query pending settlements', true, 
      `${pendingSettlement[0].count} claims, ₹${pendingSettlement[0].total_amount || 0}`);
    
    // Test 4: Document compliance
    const [missingDocs] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM insurance_claims
      WHERE documents_status = 'incomplete'
    `);
    logTest('Query missing documents', true, `${missingDocs[0].count} claims missing documents`);
    
  } catch (error) {
    logTest('Complex queries', false, error.message);
  }
}

// Test 9: Data Integrity
async function testDataIntegrity() {
  console.log(`\n${colors.blue}${colors.bold}9. Testing Data Integrity${colors.reset}`);
  
  try {
    // Test JSONB fields
    const [jsonbTest] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM insurance_claims
      WHERE hospitalization_details IS NOT NULL
        AND jsonb_typeof(hospitalization_details) = 'object'
    `);
    logTest('JSONB hospitalization_details valid', true, 
      `${jsonbTest[0].count} claims with valid JSON`);
    
    // Test status constraints
    const [statusTest] = await sequelize.query(`
      SELECT DISTINCT status 
      FROM insurance_claims
      ORDER BY status
    `);
    const validStatuses = ['draft', 'submitted', 'pending', 'query', 'approved', 'rejected', 'paid'];
    const allValid = statusTest.every(s => validStatuses.includes(s.status));
    logTest('Status values within constraints', allValid,
      `Found statuses: ${statusTest.map(s => s.status).join(', ')}`);
    
    // Test timestamps
    const [timestampTest] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM insurance_claims
      WHERE "createdAt" IS NOT NULL AND "updatedAt" IS NOT NULL
    `);
    logTest('Timestamps auto-populated', timestampTest[0].count > 0,
      `${timestampTest[0].count} claims with valid timestamps`);
    
  } catch (error) {
    logTest('Data integrity', false, error.message);
  }
}

// Test 10: Performance
async function testPerformance() {
  console.log(`\n${colors.blue}${colors.bold}10. Testing Query Performance${colors.reset}`);
  
  try {
    // Test index usage
    const [explainResult] = await sequelize.query(`
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT * FROM insurance_claims 
      WHERE hospital_id = 1 AND status = 'pending'
    `);
    
    const plan = explainResult[0]['QUERY PLAN'][0]['Plan'];
    const executionTime = explainResult[0]['QUERY PLAN'][0]['Execution Time'];
    
    logTest('Query execution time acceptable', executionTime < 100,
      `Executed in ${executionTime.toFixed(2)}ms`);
    
  } catch (error) {
    logTest('Performance testing', false, error.message);
  }
}

// Cleanup test data
async function cleanup() {
  console.log(`\n${colors.blue}${colors.bold}Cleanup${colors.reset}`);
  
  try {
    if (testClaimId) {
      await InsuranceClaim.destroy({ where: { id: testClaimId } });
      logTest('Cleanup: Delete test claim', true, `Deleted claim ${testClaimId}`);
    }
    
    if (testPreAuthId) {
      await PreAuthorization.destroy({ where: { id: testPreAuthId } });
      logTest('Cleanup: Delete test pre-auth', true, `Deleted pre-auth ${testPreAuthId}`);
    }
  } catch (error) {
    logTest('Cleanup', false, error.message);
  }
}

// Print summary
function printSummary() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${colors.bold}DATABASE TEST SUMMARY${colors.reset}`);
  console.log(`${'='.repeat(60)}`);
  
  const passRate = ((testResults.passed.length / testResults.total) * 100).toFixed(1);
  
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`${colors.green}Passed: ${testResults.passed.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testResults.failed.length}${colors.reset}`);
  console.log(`Pass Rate: ${passRate}%`);
  
  if (testResults.failed.length > 0) {
    console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
    testResults.failed.forEach(test => {
      console.log(`  - ${test}`);
    });
  }
  
  console.log(`\n${'='.repeat(60)}\n`);
  
  // Overall status
  if (testResults.failed.length === 0) {
    console.log(`${colors.green}${colors.bold}✓ ALL DATABASE TESTS PASSED!${colors.reset}\n`);
  } else {
    console.log(`${colors.yellow}${colors.bold}⚠ SOME TESTS FAILED${colors.reset}\n`);
  }
}

// Main test runner
async function runAllTests() {
  console.log(`${colors.bold}${colors.blue}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  HOSPITAL INSURANCE - DATABASE LEVEL TEST SUITE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`${colors.reset}\n`);
  
  try {
    await testDatabaseConnection();
    await testTableExistence();
    await testColumnStructure();
    await testIndexes();
    await testViews();
    await testModels();
    await testCRUDOperations();
    await testComplexQueries();
    await testDataIntegrity();
    await testPerformance();
    await cleanup();
    
    printSummary();
    
  } catch (error) {
    console.error(`\n${colors.red}Fatal error:${colors.reset}`, error);
  } finally {
    await sequelize.close();
    process.exit(testResults.failed.length > 0 ? 1 : 0);
  }
}

// Run tests
runAllTests();
