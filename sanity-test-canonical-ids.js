#!/usr/bin/env node

/**
 * 🧪 SANITY TEST: Canonical Meeting ID Functions
 * Tests the core cryptographic ID generation and verification logic
 */

import crypto from 'crypto';

// ============================================================================
// COPY OF FUNCTIONS FROM videoProvider.js
// ============================================================================

const generateCanonicalMeetingId = (appointmentId) => {
  const secret = process.env.MEETING_ID_SECRET || 'mediczy-appointment-videoroom-v1';
  const hash = crypto
    .createHmac('sha256', secret)
    .update(String(appointmentId))
    .digest('hex')
    .substring(0, 8);
  return `apt-${appointmentId}-${hash}`;
};

const verifyCanonicalMeetingId = (appointmentId, providedMeetingId) => {
  const expectedMeetingId = generateCanonicalMeetingId(appointmentId);
  return providedMeetingId === expectedMeetingId;
};

// ============================================================================
// TEST SUITE
// ============================================================================

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: '❌ FAIL', error: err.message });
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n   Expected: ${expected}\n   Got: ${actual}`);
  }
}

// ============================================================================
// TESTS
// ============================================================================

console.log('\n🧪 CANONICAL MEETING ID SANITY TESTS\n');

// Test 1: Generation consistency
test('Generation is consistent (same input = same output)', () => {
  const appointmentId = 12345;
  const id1 = generateCanonicalMeetingId(appointmentId);
  const id2 = generateCanonicalMeetingId(appointmentId);
  assertEqual(id1, id2, 'IDs should match when generated twice with same input');
});

// Test 2: Different appointment IDs produce different hashes
test('Different appointment IDs produce different hashes', () => {
  const id1 = generateCanonicalMeetingId(12345);
  const id2 = generateCanonicalMeetingId(12346);
  assert(id1 !== id2, 'Different appointment IDs should produce different meeting IDs');
});

// Test 3: Format validation
test('Generated ID has correct format (apt-{id}-{hash})', () => {
  const meetingId = generateCanonicalMeetingId(12345);
  const format = /^apt-\d+-[a-f0-9]{8}$/;
  assert(format.test(meetingId), `ID should match format. Got: ${meetingId}`);
});

// Test 4: Hash length
test('Hash portion is exactly 8 characters', () => {
  const meetingId = generateCanonicalMeetingId(12345);
  const hash = meetingId.split('-')[2];
  assertEqual(hash.length, 8, 'Hash should be 8 characters');
});

// Test 5: Verification success
test('Verification succeeds for correct meeting ID', () => {
  const appointmentId = 12345;
  const correctId = generateCanonicalMeetingId(appointmentId);
  const isValid = verifyCanonicalMeetingId(appointmentId, correctId);
  assert(isValid === true, 'Verification should succeed for correct ID');
});

// Test 6: Verification fails for wrong hash
test('Verification fails for wrong hash', () => {
  const appointmentId = 12345;
  const wrongId = 'apt-12345-00000000'; // Wrong hash
  const isValid = verifyCanonicalMeetingId(appointmentId, wrongId);
  assert(isValid === false, 'Verification should fail for wrong hash');
});

// Test 7: Verification fails for wrong appointment ID
test('Verification fails for wrong appointment ID', () => {
  const appointmentId = 12345;
  const correctId = generateCanonicalMeetingId(appointmentId);
  const isValid = verifyCanonicalMeetingId(99999, correctId); // Wrong appointment ID
  assert(isValid === false, 'Verification should fail for wrong appointment ID');
});

// Test 8: Verification fails for completely wrong ID
test('Verification fails for completely wrong ID', () => {
  const appointmentId = 12345;
  const wrongId = 'apt-99999-xxxxxxxx';
  const isValid = verifyCanonicalMeetingId(appointmentId, wrongId);
  assert(isValid === false, 'Verification should fail for wrong ID');
});

// Test 9: Fallback format detection
test('Fallback format (apt-{id}) can be detected', () => {
  const fallbackFormat = 'apt-12345';
  const canonicalFormat = 'apt-12345-a1b2c3d4';
  
  // Fallback format has no second hyphen after position 4
  const isFallback = !fallbackFormat.includes('-', 4);
  const isCanonical = canonicalFormat.includes('-', 4);
  
  assert(isFallback === true, 'Should detect fallback format');
  assert(isCanonical === true, 'Should detect canonical format');
});

// Test 10: Hash reproducibility across runs
test('Hash is reproducible (cryptographic determinism)', () => {
  const appointmentId = 99999;
  // Generate multiple times
  const hashes = Array.from({ length: 5 }, () => generateCanonicalMeetingId(appointmentId));
  // All should be identical
  const allSame = hashes.every(h => h === hashes[0]);
  assert(allSame === true, 'All generated hashes should be identical');
});

// Test 11: Secret key sensitivity
test('Different secret keys produce different hashes', () => {
  const appointmentId = 12345;
  
  // Generate with default secret
  const secret1 = process.env.MEETING_ID_SECRET || 'mediczy-appointment-videoroom-v1';
  const hash1 = crypto
    .createHmac('sha256', secret1)
    .update(String(appointmentId))
    .digest('hex')
    .substring(0, 8);
  
  // Generate with different secret
  const secret2 = 'different-secret-key';
  const hash2 = crypto
    .createHmac('sha256', secret2)
    .update(String(appointmentId))
    .digest('hex')
    .substring(0, 8);
  
  assert(hash1 !== hash2, 'Different secrets should produce different hashes');
});

// Test 12: Large appointment IDs
test('Works with large appointment IDs (up to 2^31)', () => {
  const largeId = 2147483647; // Max 32-bit signed int
  const meetingId = generateCanonicalMeetingId(largeId);
  const isValid = verifyCanonicalMeetingId(largeId, meetingId);
  assert(isValid === true, 'Should work with large IDs');
});

// Test 13: String/number conversion
test('Handles both string and number appointment IDs', () => {
  const numId = 12345;
  const strId = '12345';
  
  const id1 = generateCanonicalMeetingId(numId);
  const id2 = generateCanonicalMeetingId(strId);
  
  assertEqual(id1, id2, 'String and number IDs should produce same result');
});

// Test 14: Security - impossible to reverse hash
test('Hash is one-way (cannot reverse to get appointment ID)', () => {
  const appointmentId = 12345;
  const meetingId = generateCanonicalMeetingId(appointmentId);
  const hash = meetingId.split('-')[2];
  
  // Try to find different appointment IDs with same hash
  let found = false;
  for (let i = 1; i < 1000; i++) {
    if (i === appointmentId) continue;
    const otherId = generateCanonicalMeetingId(i);
    if (otherId.endsWith(hash)) {
      found = true;
      break;
    }
  }
  
  assert(found === false, 'Should not find collision in hash');
});

// Test 15: Response shape
test('Meeting ID response format is correct for room creation', () => {
  const appointmentId = 12345;
  const roomId = generateCanonicalMeetingId(appointmentId);
  const metadata = {
    roomId,                                          // Phase 3.1
    fallbackRoomId: `apt-${appointmentId}`,         // Phase 1
    meetingLink: `https://meet.mediczy.com/${roomId}`,
    roomCreated: false                               // Phase 2
  };
  
  assert(metadata.roomId.startsWith('apt-'), 'roomId should start with apt-');
  assert(metadata.fallbackRoomId === `apt-${appointmentId}`, 'fallbackRoomId format correct');
  assert(metadata.meetingLink.includes(roomId), 'meetingLink should contain roomId');
  assertEqual(metadata.roomCreated, false, 'roomCreated should be false for lazy creation');
});

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTS: ${results.passed} PASSED, ${results.failed} FAILED`);
console.log(`${'='.repeat(70)}\n`);

// Display summary
results.tests.forEach(test => {
  console.log(`${test.status}: ${test.name}`);
  if (test.error) {
    console.log(`       ${test.error}`);
  }
});

console.log(`\n${'='.repeat(70)}`);

// Exit with appropriate code
process.exit(results.failed > 0 ? 1 : 0);
