/**
 * Recreate 3 membership WhatsApp templates as twilio/text type
 * with proper example variable values for Meta approval.
 * Root cause of previous rejection: BODY missing (example) field.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

async function twilioPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const templates = [
  {
    envKey: 'WHATSAPP_TEMPLATE_MEMBERSHIP_RENEWAL_REMINDER',
    content: {
      friendly_name: 'mediczy_membership_renewal_reminder',
      language: 'en',
      // variables at top level = example values passed to Meta as required examples
      variables: { '1': 'Isha', '2': 'Silver', '3': '27 May 2026', '4': '30', '5': 'https://rzp.io/rzp/WPeJWNBN' },
      types: {
        'twilio/text': {
          body:
            'Dear {{1}},\n\n' +
            'Your *{{2}}* membership with SmartHealth expires on *{{3}}* — only *{{4}} days* remaining.\n\n' +
            'Renew now to continue uninterrupted access to all your health benefits:\n{{5}}\n\n' +
            '_Team SmartHealth_'
        }
      }
    },
    approval: { name: 'mediczy_membership_renewal_reminder', category: 'UTILITY' }
  },
  {
    envKey: 'WHATSAPP_TEMPLATE_MEMBERSHIP_RENEWAL_PAYMENT',
    content: {
      friendly_name: 'mediczy_membership_renewal_payment',
      language: 'en',
      variables: { '1': 'Isha', '2': 'Silver', '3': '199', '4': 'https://rzp.io/rzp/WPeJWNBN' },
      types: {
        'twilio/text': {
          body:
            'Hi {{1}},\n\n' +
            'Your *{{2}}* plan renewal payment of *Rs.{{3}}* is ready.\n\n' +
            'Click below to complete your payment and keep your SmartHealth membership active:\n{{4}}\n\n' +
            '_Team SmartHealth_'
        }
      }
    },
    approval: { name: 'mediczy_membership_renewal_payment', category: 'UTILITY' }
  },
  {
    envKey: 'WHATSAPP_TEMPLATE_MEMBERSHIP_PLAN_ACTIVATED',
    content: {
      friendly_name: 'mediczy_plan_activation_confirmation',
      language: 'en',
      variables: { '1': 'Isha', '2': 'Silver', '3': '27 Apr 2026', '4': '27 May 2026' },
      types: {
        'twilio/text': {
          body:
            'Membership Activated!\n\n' +
            'Dear {{1}},\n\n' +
            'Your *{{2}}* plan with SmartHealth has been successfully activated!\n\n' +
            'Valid From: *{{3}}*\n' +
            'Valid Till: *{{4}}*\n\n' +
            'Enjoy unlimited access to all your health benefits.\n\n' +
            '_Team SmartHealth_'
        }
      }
    },
    approval: { name: 'mediczy_plan_activation_confirmation', category: 'UTILITY' }
  }
];

const results = [];

for (const tpl of templates) {
  console.log(`\nCreating: ${tpl.content.friendly_name}`);

  let content;
  try {
    content = await twilioPost('https://content.twilio.com/v1/Content', tpl.content);
    console.log(`  Created SID: ${content.sid}`);
  } catch (e) {
    console.error(`  Create failed: ${e.message}`);
    results.push({ envKey: tpl.envKey, sid: null, error: e.message });
    continue;
  }

  try {
    const approval = await twilioPost(
      `https://content.twilio.com/v1/Content/${content.sid}/ApprovalRequests/whatsapp`,
      tpl.approval
    );
    console.log(`  Approval status: ${approval.status}`);
    results.push({ envKey: tpl.envKey, sid: content.sid, approvalStatus: approval.status });
  } catch (e) {
    console.error(`  Approval submit failed: ${e.message}`);
    results.push({ envKey: tpl.envKey, sid: content.sid, approvalStatus: 'APPROVAL_FAILED', error: e.message });
  }
}

console.log('\n=== Add to .env ===');
for (const r of results) {
  if (r.sid) console.log(`${r.envKey}=${r.sid}`);
}
console.log('\nResults:', JSON.stringify(results, null, 2));
process.exit(0);
