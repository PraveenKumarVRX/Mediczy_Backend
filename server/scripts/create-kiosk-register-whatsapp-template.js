#!/usr/bin/env node
/**
 * Create + submit Twilio Content template for kiosk registration invites.
 *
 * Usage (on a machine with Twilio prod env):
 *   cd server && node scripts/create-kiosk-register-whatsapp-template.js
 *   node scripts/create-kiosk-register-whatsapp-template.js --style=cta
 *   node scripts/create-kiosk-register-whatsapp-template.js --submit-only HXxxxxxxxx
 *
 * Then set on the API host:
 *   WHATSAPP_TEMPLATE_KIOSK_REGISTER=HXxxxxxxxx
 *   WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=text   # or cta
 *
 * Twilio Console (manual):
 *   https://console.twilio.com/us1/develop/sms/content-template-builder
 */
import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

const FRIENDLY = 'mediqzy_kiosk_registration';
const APP_BASE = (
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  'https://app.mediqzy.com'
).replace(/\/$/, '');

function parseArgs(argv) {
  const out = { style: 'text', submitOnly: null, list: false };
  for (const a of argv) {
    if (a === '--list') out.list = true;
    else if (a.startsWith('--style=')) out.style = a.split('=')[1];
    else if (a === '--style' ) {/* next */}
    else if (a === 'cta' || a === 'text') out.style = a;
    else if (a === '--submit-only') out.submitOnly = true;
    else if (out.submitOnly === true && a.startsWith('HX')) out.submitOnly = a;
  }
  return out;
}

async function listTemplates(client) {
  const templates = await client.content.v1.contents.list({ limit: 100 });
  const hits = templates.filter((t) =>
    String(t.friendlyName || '').toLowerCase().includes('kiosk')
  );
  console.log(`Found ${templates.length} content templates (${hits.length} kiosk-related)\n`);
  for (const t of hits.length ? hits : templates.slice(0, 15)) {
    console.log(`- ${t.friendlyName}`);
    console.log(`  SID: ${t.sid}`);
    console.log(`  types: ${t.types ? Object.keys(t.types).join(', ') : 'n/a'}`);
  }
}

function buildPayload(style) {
  if (style === 'cta') {
    return {
      friendlyName: `${FRIENDLY}_cta`,
      language: 'en',
      variables: {
        '1': 'City Care Hospital',
        '2': '30',
        '3': 'sampletoken0123456789abcdef0123456789abcdef01234567',
      },
      types: {
        'twilio/call-to-action': {
          body:
            'Mediqzy · Complete your registration for {{1}}. This secure link expires in {{2}} minutes. Do not share this link.',
          actions: [
            {
              type: 'URL',
              title: 'Register now',
              url: `${APP_BASE}/kiosk/register/{{3}}`,
            },
          ],
        },
      },
    };
  }

  return {
    friendlyName: FRIENDLY,
    language: 'en',
    variables: {
      '1': 'City Care Hospital',
      '2': '30',
      '3': `${APP_BASE}/kiosk/register/sampletoken0123456789abcdef0123456789abcdef01234567`,
    },
    types: {
      'twilio/text': {
        body:
          'Mediqzy · Complete your registration for {{1}}\n\n' +
          'Tap this secure link (expires in {{2}} min):\n{{3}}\n\n' +
          'Do not share this link. Reply STOP to opt out.',
      },
    },
  };
}

async function submitForWhatsAppApproval(client, contentSid, name) {
  // Twilio Node SDK: contents(sid).approvalCreate.create({ name, category })
  try {
    const ctx = client.content.v1.contents(contentSid);
    const approvalCreate = ctx.approvalCreate?.create
      ? ctx.approvalCreate
      : typeof ctx.approvalCreate === 'function'
        ? ctx.approvalCreate()
        : null;
    if (!approvalCreate?.create) {
      throw new Error('approvalCreate API missing in this Twilio SDK version');
    }
    const approval = await approvalCreate.create({
      name: name || FRIENDLY,
      category: 'UTILITY',
    });
    console.log('✅ Submitted for WhatsApp approval:', approval?.status || JSON.stringify(approval?.toJSON?.() || approval));
    return approval;
  } catch (e) {
    console.warn('⚠️  Could not auto-submit approval:', e.message);
    console.warn('   Submit manually: Content Template Builder → select template → Submit for WhatsApp (UTILITY).');
    console.warn(`   SID: ${contentSid}`);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid?.startsWith('AC') || !authToken) {
    console.error('❌ Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN first');
    process.exit(1);
  }

  const client = twilio(accountSid, authToken);

  if (args.list) {
    await listTemplates(client);
    return;
  }

  if (typeof args.submitOnly === 'string') {
    await submitForWhatsAppApproval(client, args.submitOnly, FRIENDLY);
    return;
  }

  // Reuse existing friendly name if present
  const existing = (await client.content.v1.contents.list({ limit: 100 })).find(
    (t) => t.friendlyName === (args.style === 'cta' ? `${FRIENDLY}_cta` : FRIENDLY)
  );
  if (existing) {
    console.log(`ℹ️  Template already exists: ${existing.friendlyName}`);
    console.log(`   SID: ${existing.sid}`);
    console.log('\nAdd to production .env / PM2 ecosystem:');
    console.log(`WHATSAPP_TEMPLATE_KIOSK_REGISTER=${existing.sid}`);
    console.log(`WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=${args.style}`);
    await submitForWhatsAppApproval(client, existing.sid, existing.friendlyName);
    return;
  }

  const payload = buildPayload(args.style);
  console.log(`Creating Content template (${args.style})…`);
  const created = await client.content.v1.contents.create(payload);
  console.log('✅ Created');
  console.log(`   friendlyName: ${created.friendlyName || payload.friendlyName}`);
  console.log(`   SID: ${created.sid}`);

  await submitForWhatsAppApproval(
    client,
    created.sid,
    created.friendlyName || payload.friendlyName
  );

  console.log('\n══════════════════════════════════════════════════════');
  console.log('ADD TO PRODUCTION ENV (then pm2 restart):');
  console.log('══════════════════════════════════════════════════════');
  console.log(`WHATSAPP_TEMPLATE_KIOSK_REGISTER=${created.sid}`);
  console.log(`WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=${args.style}`);
  console.log('══════════════════════════════════════════════════════');
  console.log('\nConsole: https://console.twilio.com/us1/develop/sms/content-template-builder');
  console.log('Wait for WhatsApp status = Approved, then retry kiosk Mobile number invite.');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
