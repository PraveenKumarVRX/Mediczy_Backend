/**
 * Verifies the WhatsApp Business webhook signature handling end-to-end over
 * real HTTP, using a locally generated app secret — no Meta credentials and no
 * outbound calls. Run with a dummy secret and a LOCAL database (importing the
 * controller loads the DB pool):
 *
 *   FACEBOOK_APP_SECRET=local-test-secret JWT_SECRET=x node scripts/testing/verify-waba-webhook.mjs
 */
import crypto from 'crypto';
import express from '../../server/node_modules/express/index.js';

process.env.FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || 'local-test-secret';
const SECRET = process.env.FACEBOOK_APP_SECRET;
const { handleWebhook } = await import('../../server/controller/whatsapp.business.controller.js');

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    if (req.originalUrl.split('?')[0] === '/api/whatsapp-business/webhook') req.rawBody = buf.toString('utf8');
  },
}));
app.post('/api/whatsapp-business/webhook', handleWebhook);
const server = app.listen(0);
const url = `http://127.0.0.1:${server.address().port}/api/whatsapp-business/webhook`;

const sign = (raw) => 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
// Meta-style raw payload: compact, with non-ASCII text escaped as \uXXXX (this is
// what JSON.stringify of the parsed body would NOT reproduce).
const metaRaw = '{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages","value":{"messages":[{"from":"919999999999","type":"text","text":{"body":"\\u0c28\\u0c2e\\u0c38\\u0c4d\\u0c15\\u0c3e\\u0c30\\u0c02 \\ud83d\\ude4f"}}]}}]}]}';

const post = async (raw, sig) => (await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) },
  body: raw,
})).status;

const cases = [
  ['valid signature, non-ASCII payload (Meta style)', await post(metaRaw, sign(metaRaw)), 200],
  ['valid signature, plain ASCII payload', await post('{"object":"other"}', sign('{"object":"other"}')), 200],
  ['missing signature header', await post(metaRaw, null), 401],
  ['wrong signature', await post(metaRaw, sign('something else')), 401],
  ['tampered body, original signature', await post(metaRaw.replace('919999999999', '910000000000'), sign(metaRaw)), 401],
];
let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, want ${want})`);
}
server.close();
process.exit(failed ? 1 : 0);
