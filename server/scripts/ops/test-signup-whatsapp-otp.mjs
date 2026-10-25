// Usage: node server/scripts/ssm-env-loader.mjs server/scripts/ops/test-signup-whatsapp-otp.mjs <destination-10digit>
import signupVerification from '../../services/signup-verification.service.js';
const phoneNumber = process.argv[process.argv.length - 1];
try {
  const result = await signupVerification.sendOTPViaWhatsApp({ phoneNumber, firstName: 'Test' }, '654321');
  console.log('✅ Result:', result);
} catch (err) {
  console.error('❌ Failed:', err.message);
}
process.exit(0);
