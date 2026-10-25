// Usage: node server/scripts/ssm-env-loader.mjs server/scripts/ops/test-gupshup-otp-template.mjs <destination-phone>
import { GupshupWhatsAppService } from '../../services/gupshup-whatsapp.service.js';
const gupshup = new GupshupWhatsAppService();
const destination = process.argv[process.argv.length - 1];
try {
  const result = await gupshup.sendTemplate({
    to: destination,
    templateId: process.env.GUPSHUP_TEMPLATE_OTP,
    params: ['123456'],
  });
  console.log('✅ Template send accepted:', result);
} catch (err) {
  console.error('❌ Template send failed:', err.message, err.code || '');
}
process.exit(0);
