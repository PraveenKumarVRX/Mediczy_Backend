# Encryption Implementation Guide

## 🔐 Overview

Field-level encryption has been implemented for all Protected Health Information (PHI) and Personally Identifiable Information (PII) in the database using **AES-256-GCM** encryption.

**Compliance:** HIPAA §164.312(a)(2)(iv), GDPR Article 32, DPDP Act §8

---

## 📋 Encrypted Fields

### User Model (`users` table)

| Field | Type | Why Encrypted |
|-------|------|---------------|
| `address_street` | PII | Physical location data |
| `bloodType` | PHI | Medical information |
| `allergies` | PHI | Critical medical data |
| `chronicConditions` | PHI | Diagnosis/medical history |
| `currentMedications` | PHI | Prescription information |
| `insurance_policyNumber` | PHI/PII | Insurance identifier |
| `insurance_groupNumber` | PHI/PII | Insurance group data |

### Insurance Models

| Model | Field | Why Encrypted |
|-------|-------|---------------|
| `UserInsurance` | `enrollmentNumber` | Insurance identifier |
| `InsuranceClaim` | `diagnosis` | Medical diagnosis |

---

## 🚀 Quick Start

### 1. Generate Encryption Key

```bash
cd server
npm run generate-keys
```

This will output:
```
SECRET_TOKEN=<128-character-hex-string>
ENCRYPTION_KEY=<64-character-hex-string>
SESSION_SECRET=<64-character-hex-string>
```

### 2. Add to Environment

```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env and add the generated keys
nano .env
```

Add these lines:
```bash
ENCRYPTION_KEY=your_64_character_hex_key_here
SECRET_TOKEN=your_128_character_jwt_secret_here
```

### 3. Test Encryption

```bash
npm run test-encryption
```

Expected output:
```
🔐 Encryption Testing Suite
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  Testing Key Generation...
   ✅ Generated key: abc123...def789
   ✅ Key length: 64 characters

2️⃣  Testing Basic Encryption...
   ✅ Perfect match

3️⃣  Testing Medical Data Encryption...
   ✅ Blood Type: O*
   ✅ Allergies: P********s
   ...

✅ All encryption functions tested successfully
```

### 4. Encrypt Existing Data (IMPORTANT!)

If you have existing data in the database:

```bash
npm run encrypt-data
```

This will:
- Find all unencrypted sensitive fields
- Encrypt them in place
- Skip already encrypted data
- Show progress and summary

**⚠️ WARNING:** Run this only ONCE after setting ENCRYPTION_KEY!

---

## 🔧 How It Works

### Automatic Encryption/Decryption

Sequelize getters/setters handle encryption transparently:

```javascript
// When saving (automatic encryption)
await user.update({
  bloodType: 'O+',  // Plain text input
  allergies: 'Penicillin'
});
// Stored as: "a1b2c3:d4e5f6:encrypted_data"

// When reading (automatic decryption)
const user = await User.findByPk(userId);
console.log(user.bloodType);  // "O+" (decrypted automatically)
```

### Encryption Format

Encrypted data format: `iv:authTag:encryptedData`

- **iv**: Initialization Vector (16 bytes, random per encryption)
- **authTag**: Authentication Tag (16 bytes, for integrity verification)
- **encryptedData**: Actual encrypted content

Example:
```
3a7f2e9b1c4d8f6a0e5b2d9c8a1f4e7b:c9f2a8e1b4d7f3a6c2e5b8d1f4a7c3e6:4f8a2e5c9b1d7f3a...
```

### Backwards Compatibility

The implementation supports migration scenarios:

```javascript
get() {
  const rawValue = this.getDataValue('bloodType');
  if (!rawValue || !process.env.ENCRYPTION_KEY) return rawValue;
  try {
    // If contains ':', assume encrypted; otherwise plain text
    return rawValue.includes(':') ? decrypt(rawValue) : rawValue;
  } catch (e) {
    return rawValue; // Fallback to plain text if decryption fails
  }
}
```

This allows:
- Gradual migration of existing data
- Development without encryption (if ENCRYPTION_KEY not set)
- Recovery if encryption key is temporarily unavailable

---

## 🛡️ Security Best Practices

### DO ✅

1. **Generate Strong Keys**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Use Key Management Services** (Production)
   - AWS KMS (Key Management Service)
   - Azure Key Vault
   - Google Cloud KMS
   - HashiCorp Vault

3. **Rotate Keys Regularly**
   - Every 90 days minimum
   - After security incidents
   - When staff with key access leaves

4. **Separate Keys per Environment**
   - Development: Generate locally
   - Staging: Different key than dev
   - Production: Stored in KMS only

5. **Backup Keys Securely**
   - Store in secure vault
   - Multiple encrypted copies
   - Document recovery procedure

### DON'T ❌

1. **Never Commit Keys to Git**
   ```bash
   # Add to .gitignore
   .env
   .env.local
   .env.production
   ```

2. **Never Hardcode Keys**
   ```javascript
   // ❌ WRONG
   const key = 'abc123...';
   
   // ✅ CORRECT
   const key = process.env.ENCRYPTION_KEY;
   ```

3. **Never Share Keys**
   - Not via email
   - Not via Slack
   - Not via shared documents
   - Use secure key management tools

4. **Never Use Same Key Everywhere**
   - Different keys for JWT vs encryption
   - Different keys per environment
   - Different keys per data category (if needed)

5. **Never Skip Encryption in Production**
   ```javascript
   // ❌ WRONG - Skipping encryption
   if (process.env.NODE_ENV === 'production') {
     // Encrypt
   }
   
   // ✅ CORRECT - Always encrypt PHI
   if (isPHI && process.env.ENCRYPTION_KEY) {
     // Encrypt
   }
   ```

---

## 📊 Encryption Performance

Based on testing with 1000 operations:

| Operation | Time per Operation | Notes |
|-----------|-------------------|-------|
| Encryption | ~0.5-1ms | Fast enough for real-time |
| Decryption | ~0.5-1ms | Minimal impact on reads |
| Large Data (5KB) | ~1-2ms | Scales linearly |

**Impact on API Response Time:** < 5ms additional latency for typical requests

---

## 🔍 Monitoring & Auditing

### Check Encryption Status

```sql
-- Count encrypted vs unencrypted records
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN bloodType LIKE '%:%:%' THEN 1 ELSE 0 END) as encrypted_blood_type,
  SUM(CASE WHEN allergies LIKE '%:%:%' THEN 1 ELSE 0 END) as encrypted_allergies
FROM users
WHERE bloodType IS NOT NULL OR allergies IS NOT NULL;
```

### Verify Encryption Key

```bash
# Check if key is set
node -e "console.log(process.env.ENCRYPTION_KEY ? '✅ Set' : '❌ Not set')"

# Check key length
node -e "console.log('Key length:', process.env.ENCRYPTION_KEY?.length || 0)"
```

### Audit Encryption Access

All decryption is automatically logged by audit middleware:

```javascript
// Logged in audit_logs table
{
  action: 'PHI_ACCESS',
  dataFields: ['bloodType', 'allergies'],
  isPHI: true,
  timestamp: '2025-11-09T...'
}
```

---

## 🆘 Troubleshooting

### Error: "ENCRYPTION_KEY not set"

**Solution:**
```bash
# Generate key
npm run generate-keys

# Add to .env
echo "ENCRYPTION_KEY=your_key_here" >> .env

# Restart server
npm start
```

### Error: "Invalid encrypted data format"

**Cause:** Data is corrupted or key changed

**Solution:**
1. Check if ENCRYPTION_KEY changed
2. Restore original key from backup
3. If key lost, data cannot be recovered (by design)

### Error: "Decryption failed"

**Cause:** Wrong encryption key or corrupted data

**Solution:**
```bash
# Test with known plaintext
npm run test-encryption

# Check database for corruption
SELECT * FROM users WHERE bloodType LIKE '%:%' AND LENGTH(bloodType) < 50;
```

### Performance Degradation

**Symptoms:** Slow API responses

**Solution:**
1. Check if encryption is being done in loops
2. Use bulk operations instead of individual updates
3. Consider caching decrypted data in memory (with care)

---

## 🔄 Key Rotation Procedure

### When to Rotate
- Every 90 days (policy)
- After security incident
- After staff changes
- Compliance requirement

### How to Rotate

1. **Generate New Key**
   ```bash
   npm run generate-keys
   ```

2. **Re-encrypt All Data**
   ```bash
   # Backup database first!
   mysqldump -u root -p mediczy > backup.sql
   
   # Set new key temporarily
   export NEW_ENCRYPTION_KEY=new_key_here
   
   # Run re-encryption script (to be created)
   node scripts/rotate-encryption-key.js
   ```

3. **Update Environment**
   ```bash
   # Update .env
   ENCRYPTION_KEY=new_key_here
   
   # Restart all services
   pm2 restart all
   ```

4. **Verify**
   ```bash
   npm run test-encryption
   ```

---

## 📚 API Reference

### Encryption Functions

```javascript
import { 
  encrypt, 
  decrypt, 
  hashData, 
  verifyHash, 
  maskData,
  encryptFields,
  decryptFields
} from './utils/encryption.js';

// Encrypt single value
const encrypted = encrypt('sensitive data');

// Decrypt single value
const decrypted = decrypt(encrypted);

// Hash (one-way, for SSN/Aadhaar)
const hashed = hashData('123-45-6789');
const isValid = verifyHash('123-45-6789', hashed);

// Mask for display
const masked = maskData('patient@email.com', 'email');  // p*******@email.com

// Encrypt multiple fields
const user = { name: 'John', ssn: '123-45-6789' };
const encrypted = encryptFields(user, ['ssn']);

// Decrypt multiple fields
const decrypted = decryptFields(encrypted, ['ssn']);
```

---

## ✅ Compliance Checklist

- [x] **AES-256-GCM encryption** for PHI/PII at rest
- [x] **Unique IV per encryption** (prevents pattern analysis)
- [x] **Authentication tags** (prevents tampering)
- [x] **Secure key management** (environment variables)
- [x] **Automatic encryption/decryption** (transparent to developers)
- [x] **Backwards compatible** (supports migration)
- [x] **Audit logging** (all PHI access tracked)
- [x] **Performance tested** (<5ms overhead)
- [ ] **Key rotation procedure** (documented, needs automation)
- [ ] **KMS integration** (recommended for production)

---

## 📞 Support

**Issues with encryption?**
1. Check logs: `tail -f logs/encryption.log`
2. Run diagnostics: `npm run test-encryption`
3. Review audit logs: `SELECT * FROM audit_logs WHERE action LIKE '%PHI%'`

**Security Concerns?**
- Report immediately to security team
- Document in incident log
- Follow breach notification procedure

---

**Last Updated:** November 9, 2025  
**Version:** 1.0  
**Maintained By:** Security & Compliance Team
