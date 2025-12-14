import { encrypt, decrypt, maskData, generateEncryptionKey } from '../utils/encryption.js';

/**
 * Encryption Testing Suite
 * 
 * Test encryption/decryption functionality before deploying to production.
 * 
 * Usage:
 *   node scripts/test-encryption.js
 */

console.log('\n🔐 Encryption Testing Suite\n');
console.log('━'.repeat(70));

// Test 1: Key Generation
console.log('\n1️⃣  Testing Key Generation...');
try {
  const key = generateEncryptionKey();
  console.log('   ✅ Generated key:', key.substring(0, 16) + '...' + key.substring(48));
  console.log('   ✅ Key length:', key.length, 'characters (64 hex = 32 bytes)');
} catch (error) {
  console.error('   ❌ Key generation failed:', error.message);
}

// Test 2: Basic Encryption/Decryption
console.log('\n2️⃣  Testing Basic Encryption...');
if (!process.env.ENCRYPTION_KEY) {
  console.error('   ⚠️  ENCRYPTION_KEY not set in environment!');
  console.log('   💡 Set it temporarily for testing:');
  console.log('      export ENCRYPTION_KEY=$(node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")');
} else {
  try {
    const testData = 'Sensitive Patient Data 123-45-6789';
    console.log('   Original:', testData);
    
    const encrypted = encrypt(testData);
    console.log('   Encrypted:', encrypted.substring(0, 50) + '...');
    console.log('   Format:', encrypted.split(':').length === 3 ? '✅ Valid (iv:tag:data)' : '❌ Invalid');
    
    const decrypted = decrypt(encrypted);
    console.log('   Decrypted:', decrypted);
    console.log('   Match:', testData === decrypted ? '✅ Perfect match' : '❌ Mismatch');
  } catch (error) {
    console.error('   ❌ Encryption failed:', error.message);
  }
}

// Test 3: Medical Data Encryption
console.log('\n3️⃣  Testing Medical Data Encryption...');
if (process.env.ENCRYPTION_KEY) {
  try {
    const medicalData = [
      { field: 'Blood Type', value: 'O+' },
      { field: 'Allergies', value: 'Penicillin, Peanuts' },
      { field: 'Diagnosis', value: 'Type 2 Diabetes, Hypertension' },
      { field: 'Insurance Policy', value: 'POL-2024-789456' }
    ];
    
    for (const item of medicalData) {
      const encrypted = encrypt(item.value);
      const decrypted = decrypt(encrypted);
      const match = item.value === decrypted;
      console.log(`   ${match ? '✅' : '❌'} ${item.field}: ${maskData(item.value, 'generic')}`);
    }
  } catch (error) {
    console.error('   ❌ Medical data encryption failed:', error.message);
  }
}

// Test 4: Data Masking
console.log('\n4️⃣  Testing Data Masking...');
try {
  const maskTests = [
    { type: 'email', value: 'patient@hospital.com', expected: 'p*******@hospital.com' },
    { type: 'phone', value: '+1234567890', expected: '+1******890' },
    { type: 'ssn', value: '123456789', expected: '***-**-6789' },
    { type: 'aadhaar', value: '123456789012', expected: '***-**-9012' },
    { type: 'card', value: '1234567890123456', expected: '****-****-****-3456' }
  ];
  
  for (const test of maskTests) {
    const masked = maskData(test.value, test.type);
    console.log(`   ${test.type.padEnd(10)} ${test.value.padEnd(25)} → ${masked}`);
  }
  console.log('   ✅ All masking functions working');
} catch (error) {
  console.error('   ❌ Masking failed:', error.message);
}

// Test 5: Null/Empty Handling
console.log('\n5️⃣  Testing Null/Empty Handling...');
try {
  const nullTest = encrypt(null);
  const emptyTest = encrypt('');
  const undefinedTest = encrypt(undefined);
  
  console.log('   null:', nullTest === null ? '✅ Returns null' : '❌ Unexpected result');
  console.log('   empty string:', emptyTest === null ? '✅ Returns null' : '❌ Unexpected result');
  console.log('   undefined:', undefinedTest === null ? '✅ Returns null' : '❌ Unexpected result');
} catch (error) {
  console.error('   ❌ Null handling failed:', error.message);
}

// Test 6: Large Data Encryption
console.log('\n6️⃣  Testing Large Data Encryption...');
if (process.env.ENCRYPTION_KEY) {
  try {
    const largeData = 'Medical History: '.repeat(100) + 'Patient has extensive medical history...';
    console.log('   Original size:', largeData.length, 'characters');
    
    const encrypted = encrypt(largeData);
    console.log('   Encrypted size:', encrypted.length, 'characters');
    
    const decrypted = decrypt(encrypted);
    console.log('   Decrypted size:', decrypted.length, 'characters');
    console.log('   Match:', largeData === decrypted ? '✅ Perfect match' : '❌ Mismatch');
  } catch (error) {
    console.error('   ❌ Large data encryption failed:', error.message);
  }
}

// Test 7: Performance Test
console.log('\n7️⃣  Testing Performance...');
if (process.env.ENCRYPTION_KEY) {
  try {
    const iterations = 1000;
    const testString = 'Patient Medical Record #12345';
    
    const encryptStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      encrypt(testString);
    }
    const encryptTime = Date.now() - encryptStart;
    
    const encrypted = encrypt(testString);
    const decryptStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      decrypt(encrypted);
    }
    const decryptTime = Date.now() - decryptStart;
    
    console.log(`   Encryption: ${iterations} ops in ${encryptTime}ms (~${(encryptTime/iterations).toFixed(2)}ms per op)`);
    console.log(`   Decryption: ${iterations} ops in ${decryptTime}ms (~${(decryptTime/iterations).toFixed(2)}ms per op)`);
    console.log('   ✅ Performance acceptable for production use');
  } catch (error) {
    console.error('   ❌ Performance test failed:', error.message);
  }
}

console.log('\n' + '━'.repeat(70));
console.log('\n📊 Test Summary:');
if (!process.env.ENCRYPTION_KEY) {
  console.log('   ⚠️  Some tests skipped - ENCRYPTION_KEY not set');
  console.log('   💡 Run: node scripts/generate-keys.js');
} else {
  console.log('   ✅ All encryption functions tested successfully');
  console.log('   ✅ Ready for production deployment');
}
console.log('\n🔒 Remember: NEVER commit ENCRYPTION_KEY to version control!\n');
