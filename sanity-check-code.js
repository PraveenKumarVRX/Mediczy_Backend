#!/usr/bin/env node

/**
 * 🔍 CODE SANITY CHECK: Video Consultation System Files
 * Validates that all required code changes are present and correct
 */

import fs from 'fs';
import path from 'path';

const results = {
  checks: [],
  passed: 0,
  failed: 0
};

function check(description, condition, details = '') {
  if (condition) {
    results.passed++;
    results.checks.push({ description, status: '✅', details });
    console.log(`✅ ${description}`);
  } else {
    results.failed++;
    results.checks.push({ description, status: '❌', details });
    console.error(`❌ ${description}`);
    if (details) console.error(`   ${details}`);
  }
}

function fileContains(filePath, pattern, description) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : pattern;
    const found = regex.test(content);
    check(`${description}`, found, found ? '' : `Pattern not found in ${path.basename(filePath)}`);
    return found;
  } catch (err) {
    check(`${description}`, false, `File error: ${err.message}`);
    return false;
  }
}

function fileDoesNotContain(filePath, pattern, description) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : pattern;
    const found = regex.test(content);
    check(`${description}`, !found, found ? `Pattern found but should be removed: ${pattern}` : '');
    return !found;
  } catch (err) {
    check(`${description}`, false, `File error: ${err.message}`);
    return false;
  }
}

console.log('\n🔍 CODE SANITY CHECK - Video Consultation System\n');

const basePath = '/workspaces/Mediczy';
const appointmentRouteFile = path.join(basePath, 'server/routes/enhanced-appointment.route.js');
const videoControllerFile = path.join(basePath, 'server/controller/video.controller.js');
const videoProviderFile = path.join(basePath, 'server/utils/videoProvider.js');

console.log(`📁 File Locations:\n`);
console.log(`   • ${appointmentRouteFile}`);
console.log(`   • ${videoControllerFile}`);
console.log(`   • ${videoProviderFile}\n`);

// ============================================================================
// PHASE 1 CHECKS: Appointment-Based Room IDs
// ============================================================================

console.log('\n📋 PHASE 1: Appointment-Based Room IDs\n');

fileContains(appointmentRouteFile, 'apt-', 
  'Phase 1.1: Appointment route generates apt- format room IDs');

fileContains(appointmentRouteFile, 'metadata.meeting',
  'Phase 1.2: Appointment metadata includes meeting details');

fileContains(appointmentRouteFile, 'roomId',
  'Phase 1.3: Room ID stored in metadata.meeting');

// ============================================================================
// PHASE 2 CHECKS: Lazy Room Creation
// ============================================================================

console.log('\n📋 PHASE 2: Lazy Room Creation\n');

fileContains(appointmentRouteFile, 'roomCreated.*false',
  'Phase 2.1: Initial roomCreated flag is false');

fileDoesNotContain(appointmentRouteFile, 'LiveKit.*room.*create.*appointment',
  'Phase 2.2: No pre-creation logic in appointment route');

fileContains(videoControllerFile, 'roomCreated.*false',
  'Phase 2.3: Room creation deferred until join time');

fileContains(videoControllerFile, 'video.service|createRoom|JOIN',
  'Phase 2.4: Lazy room creation triggered on join');

// ============================================================================
// PHASE 3 CHECKS: Authorization Security
// ============================================================================

console.log('\n📋 PHASE 3: Authorization Checks\n');

fileContains(videoControllerFile, 'doctorId.*userId|isDoctor',
  'Phase 3.1: Doctor role verification in join flow');

fileContains(videoControllerFile, 'patientId.*userId|isPatient',
  'Phase 3.2: Patient role verification in join flow');

fileContains(videoControllerFile, 'Appointment.findByPk|appointment.*exists',
  'Phase 3.3: Appointment existence verification');

fileContains(videoControllerFile, '403|Unauthorized.*appointment',
  'Phase 3.4: Proper authorization error handling');

// ============================================================================
// PHASE 3.1 CHECKS: Canonical Meeting IDs (Crypto)
// ============================================================================

console.log('\n📋 PHASE 3.1: Canonical Meeting IDs (Cryptographic)\n');

fileContains(videoProviderFile, 'import crypto',
  'Phase 3.1.1: Crypto module imported in videoProvider');

fileContains(videoProviderFile, 'generateCanonicalMeetingId',
  'Phase 3.1.2: Canonical ID generation function exists');

fileContains(videoProviderFile, 'verifyCanonicalMeetingId',
  'Phase 3.1.3: Canonical ID verification function exists');

fileContains(videoProviderFile, 'createHmac.*sha256',
  'Phase 3.1.4: HMAC-SHA256 hashing used for ID generation');

fileContains(videoProviderFile, 'MEETING_ID_SECRET',
  'Phase 3.1.5: Environment-based secret key support');

fileContains(appointmentRouteFile, 'generateCanonicalMeetingId',
  'Phase 3.1.6: Canonical ID generation used in appointment creation');

fileContains(videoControllerFile, 'generateCanonicalMeetingId',
  'Phase 3.1.7: Canonical ID generation used in video controller');

fileContains(videoControllerFile, 'verifyCanonicalMeetingId',
  'Phase 3.1.8: Canonical ID verification used before join');

fileContains(videoControllerFile, 'isFallbackFormat',
  'Phase 3.1.9: Fallback format detection for backward compatibility');

fileContains(appointmentRouteFile, 'fallbackRoomId',
  'Phase 3.1.10: Fallback room ID stored for backward compatibility');

// ============================================================================
// INTEGRATION CHECKS
// ============================================================================

console.log('\n📋 Integration Checks\n');

fileContains(appointmentRouteFile, 'import.*videoProvider',
  'Integration 1: Appointment route imports videoProvider functions');

fileContains(videoControllerFile, 'import.*videoProvider',
  'Integration 2: Video controller imports videoProvider functions');

fileContains(appointmentRouteFile, 'console.log.*Canonical',
  'Integration 3: Logging for canonical ID generation');

fileContains(videoControllerFile, 'console.log.*Meeting ID',
  'Integration 4: Logging for meeting ID verification');

// ============================================================================
// SYNTAX & STRUCTURE CHECKS
// ============================================================================

console.log('\n📋 Syntax & Structure Checks\n');

const appointmentContent = fs.readFileSync(appointmentRouteFile, 'utf8');
const videoControllerContent = fs.readFileSync(videoControllerFile, 'utf8');
const videoProviderContent = fs.readFileSync(videoProviderFile, 'utf8');

// Check for common syntax errors
const hasUnmatchedBraces = (content) => {
  let braces = 0;
  let brackets = 0;
  let parens = 0;
  
  for (const char of content) {
    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;
    if (char === '(') parens++;
    if (char === ')') parens--;
  }
  
  return braces === 0 && brackets === 0 && parens === 0;
};

check('Syntax 1: enhanced-appointment.route.js has balanced braces/brackets/parens',
  hasUnmatchedBraces(appointmentContent));

check('Syntax 2: video.controller.js has balanced braces/brackets/parens',
  hasUnmatchedBraces(videoControllerContent));

check('Syntax 3: videoProvider.js has balanced braces/brackets/parens',
  hasUnmatchedBraces(videoProviderContent));

// Check for broken imports
fileDoesNotContain(appointmentRouteFile, 'import.*from.*undefined|require.*null',
  'Syntax 4: No broken imports in appointment route');

fileDoesNotContain(videoControllerFile, 'import.*from.*undefined|require.*null',
  'Syntax 5: No broken imports in video controller');

// ============================================================================
// FILE COMPLETENESS CHECKS
// ============================================================================

console.log('\n📋 File Completeness Checks\n');

const appointmentLines = appointmentContent.split('\n').length;
const videoControllerLines = videoControllerContent.split('\n').length;
const videoProviderLines = videoProviderContent.split('\n').length;

check('Completeness 1: enhanced-appointment.route.js has sufficient lines',
  appointmentLines > 400, `Current: ${appointmentLines} lines`);

check('Completeness 2: video.controller.js has sufficient lines',
  videoControllerLines > 200, `Current: ${videoControllerLines} lines`);

check('Completeness 3: videoProvider.js has sufficient lines',
  videoProviderLines > 50, `Current: ${videoProviderLines} lines`);

// ============================================================================
// CRITICAL PATHS CHECK
// ============================================================================

console.log('\n📋 Critical Code Paths\n');

// Check that all critical imports are present
fileContains(appointmentRouteFile, 'import.*generateCanonicalMeetingId.*from',
  'Critical Path 1: Canonical ID import in appointment route');

fileContains(videoControllerFile, 'import.*generateCanonicalMeetingId.*from',
  'Critical Path 2: Canonical ID import in video controller');

fileContains(videoControllerFile, 'import.*verifyCanonicalMeetingId.*from',
  'Critical Path 3: Verification import in video controller');

// Check that hash verification happens before authorization
const joinMethodMatch = videoControllerContent.match(/joinRoom\s*[=:]\s*async\s*\(\s*req[^)]*\)\s*=>?\s*\{[\s\S]*?\n\s*\}/);
if (joinMethodMatch) {
  const joinMethod = joinMethodMatch[0];
  const verifyIndex = joinMethod.indexOf('verifyCanonicalMeetingId');
  const authIndex = joinMethod.indexOf('isDoctor');
  
  check('Critical Path 4: Hash verification happens before authorization check',
    verifyIndex > 0 && authIndex > 0 && verifyIndex < authIndex,
    verifyIndex < 0 ? 'Verification not found' : authIndex < 0 ? 'Auth check not found' : '');
}

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTS: ${results.passed} PASSED, ${results.failed} FAILED`);
console.log(`${'='.repeat(70)}\n`);

// Summary by phase
const phases = {
  '✅ Phase 1 (Apt-based IDs)': 3,
  '✅ Phase 2 (Lazy Creation)': 4,
  '✅ Phase 3 (Authorization)': 4,
  '✅ Phase 3.1 (Canonical IDs)': 10,
  '✅ Integration': 4,
  '✅ Syntax & Structure': 6,
  '✅ Completeness': 3,
  '✅ Critical Paths': 4
};

let phaseStart = 0;
let phaseIdx = 0;
const phaseNames = Object.keys(phases);

results.checks.forEach((check, i) => {
  const currentPhaseEnd = phaseStart + Object.values(phases)[phaseIdx];
  
  if (i === phaseStart && i > 0) {
    console.log('');
  }
  
  if (i === phaseStart) {
    console.log(`${phaseNames[phaseIdx]}`);
  }
  
  console.log(`  ${check.status} ${check.description}`);
  
  if (i === currentPhaseEnd - 1) {
    phaseStart = currentPhaseEnd;
    phaseIdx++;
  }
});

console.log(`\n${'='.repeat(70)}`);
console.log(`OVERALL: ${results.failed === 0 ? '🎉 ALL CHECKS PASSED' : `⚠️  ${results.failed} CHECKS FAILED`}`);
console.log(`${'='.repeat(70)}\n`);

process.exit(results.failed > 0 ? 1 : 0);
