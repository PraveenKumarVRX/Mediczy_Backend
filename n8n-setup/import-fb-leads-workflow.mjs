/**
 * Facebook Lead Ads Automation Workflow — n8n DB Import
 *
 * Imports the "Mediczy - Facebook Lead Ads Automation" workflow directly
 * into the n8n PostgreSQL schema without needing n8n CLI.
 *
 * Workflow:
 *   Webhook (/webhook/fb-lead-intake)
 *     → Extract Fields
 *     → Twilio WhatsApp (Day 0 — immediate)
 *     → Wait 1 day
 *     → Twilio WhatsApp (Day 2 — follow-up)
 *     → Wait 2 days
 *     → Twilio WhatsApp (Day 4 — final nudge)
 *
 * Usage:
 *   node n8n-setup/import-fb-leads-workflow.mjs
 */

import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mediczy_ai',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper',
});

const OWNER_PROJECT_ID = 'shIRVPumrGyzs9Sc'; // Mediczy Admin personal project
const TWILIO_CRED_ID   = 'twilio_whatsapp_cred';
const TWILIO_ACCOUNT   = 'ACe60079054c0b9f2a7aac3a64a5aea744';
const TWILIO_FROM      = 'whatsapp:+918098998998';
const TWILIO_URL       = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT}/Messages.json`;

const WORKFLOW_NAME    = 'Mediczy - Facebook Lead Ads Automation';
const WEBHOOK_PATH     = 'fb-lead-intake';
const WEBHOOK_NODE_NAME = 'FB Lead Intake Webhook';

function genId(len = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Node positions ───────────────────────────────────────────────────────────
const POS = {
  webhook:    [240,  300],
  extract:    [480,  300],
  wa0:        [720,  300],
  wait1:      [960,  300],
  wa2:        [1200, 300],
  wait2:      [1440, 300],
  wa4:        [1680, 300],
};

// ─── Twilio WhatsApp HTTP Request node factory ─────────────────────────────────
function twilioWaNode(id, name, position, messageExpr) {
  return {
    parameters: {
      method: 'POST',
      url: TWILIO_URL,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendBody: true,
      contentType: 'form-urlencoded',
      bodyParameters: {
        parameters: [
          { name: 'From', value: TWILIO_FROM },
          { name: 'To',   value: "={{ 'whatsapp:' + $json.phone }}" },
          { name: 'Body', value: messageExpr },
        ],
      },
      options: { timeout: 10000 },
    },
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    continueOnFail: true,
    credentials: {
      httpBasicAuth: { id: TWILIO_CRED_ID, name: 'Twilio WhatsApp' },
    },
  };
}

// ─── Workflow definition ──────────────────────────────────────────────────────
const nodes = [
  // 1. Webhook trigger — receives parsed lead from fb-leads.route.js
  {
    parameters: {
      path: WEBHOOK_PATH,
      responseMode: 'onReceived',
      httpMethod: 'POST',
      options: {},
    },
    id: 'fb-lead-webhook',
    name: WEBHOOK_NODE_NAME,
    type: 'n8n-nodes-base.webhook',
    typeVersion: 1,
    position: POS.webhook,
    webhookId: WEBHOOK_PATH,
  },

  // 2. Extract & normalise lead fields from incoming body
  {
    parameters: {
      values: {
        string: [
          { name: 'name',  value: "={{ $json.body.name || $json.name || 'Lead' }}" },
          { name: 'phone', value: "={{ $json.body.phone || $json.phone }}" },
          { name: 'email', value: "={{ $json.body.email || $json.email }}" },
          { name: 'leadId', value: "={{ $json.body.leadId || $json.leadId || '' }}" },
        ],
      },
      options: {},
    },
    id: 'extract-fields',
    name: 'Extract Lead Fields',
    type: 'n8n-nodes-base.set',
    typeVersion: 2,
    position: POS.extract,
  },

  // 3. Immediate WhatsApp — Day 0
  twilioWaNode(
    'wa-day0',
    'WhatsApp Day 0 — Welcome',
    POS.wa0,
    "=Hi {{ $json.name }}! 👋 Thank you for your interest in Mediqzy Healthcare Platform.\n\nOur team will reach out to you within 24 hours. Feel free to reply here if you have any questions — we're happy to help!",
  ),

  // 4. Wait 1 day before follow-up
  {
    parameters: {
      amount: 1,
      unit: 'days',
    },
    id: 'wait-1d',
    name: 'Wait 1 Day',
    type: 'n8n-nodes-base.wait',
    typeVersion: 1,
    position: POS.wait1,
    webhookId: genId(),
  },

  // 5. Follow-up WhatsApp — Day 2
  twilioWaNode(
    'wa-day2',
    'WhatsApp Day 2 — Follow-up',
    POS.wa2,
    "=Hi {{ $json.name }}, this is a quick follow-up from Mediqzy! 🏥\n\nWe'd love to show you how our platform can streamline your healthcare operations. Can we schedule a quick 15-min demo call?\n\nReply YES and we'll send you a slot! 📅",
  ),

  // 6. Wait 2 more days before final nudge
  {
    parameters: {
      amount: 2,
      unit: 'days',
    },
    id: 'wait-2d',
    name: 'Wait 2 Days',
    type: 'n8n-nodes-base.wait',
    typeVersion: 1,
    position: POS.wait2,
    webhookId: genId(),
  },

  // 7. Final nudge — Day 4
  twilioWaNode(
    'wa-day4',
    'WhatsApp Day 4 — Final Nudge',
    POS.wa4,
    "=Hi {{ $json.name }}, last one from us! 🙏\n\nWe noticed we haven't connected yet. If you're still exploring options for your clinic/hospital, we'd love to help.\n\nVisit mediqzy.com or reply here to book a free demo. Have a great day! 😊",
  ),
];

const connections = {
  [WEBHOOK_NODE_NAME]: {
    main: [[{ node: 'Extract Lead Fields', type: 'main', index: 0 }]],
  },
  'Extract Lead Fields': {
    main: [[{ node: 'WhatsApp Day 0 — Welcome', type: 'main', index: 0 }]],
  },
  'WhatsApp Day 0 — Welcome': {
    main: [[{ node: 'Wait 1 Day', type: 'main', index: 0 }]],
  },
  'Wait 1 Day': {
    main: [[{ node: 'WhatsApp Day 2 — Follow-up', type: 'main', index: 0 }]],
  },
  'WhatsApp Day 2 — Follow-up': {
    main: [[{ node: 'Wait 2 Days', type: 'main', index: 0 }]],
  },
  'Wait 2 Days': {
    main: [[{ node: 'WhatsApp Day 4 — Final Nudge', type: 'main', index: 0 }]],
  },
};

const settings = { executionOrder: 'v1', saveManualExecutions: true };

// ─── Import ───────────────────────────────────────────────────────────────────
async function run() {
  try {
    console.log(`📦  Importing "${WORKFLOW_NAME}" into n8n...`);

    // Check for existing workflow
    const existing = await pool.query(
      'SELECT id FROM n8n.workflow_entity WHERE name = $1',
      [WORKFLOW_NAME],
    );

    let workflowId;

    if (existing.rows.length > 0) {
      workflowId = existing.rows[0].id;
      console.log(`⚠️   Workflow already exists (${workflowId}) — updating...`);

      await pool.query(
        `UPDATE n8n.workflow_entity
         SET nodes = $1, connections = $2, settings = $3, active = true,
             "updatedAt" = NOW(), "versionId" = $4
         WHERE id = $5`,
        [JSON.stringify(nodes), JSON.stringify(connections), JSON.stringify(settings), crypto.randomUUID(), workflowId],
      );
    } else {
      workflowId = genId();

      await pool.query(
        `INSERT INTO n8n.workflow_entity
           (id, name, active, nodes, connections, settings, "createdAt", "updatedAt", "versionId")
         VALUES ($1, $2, true, $3, $4, $5, NOW(), NOW(), $6)`,
        [workflowId, WORKFLOW_NAME, JSON.stringify(nodes), JSON.stringify(connections), JSON.stringify(settings), crypto.randomUUID()],
      );

      // Share with owner project
      await pool.query(
        `INSERT INTO n8n.shared_workflow ("workflowId", "projectId", role, "createdAt", "updatedAt")
         VALUES ($1, $2, 'workflow:owner', NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [workflowId, OWNER_PROJECT_ID],
      );
    }

    console.log(`✅  Workflow saved: ${workflowId}`);

    // Register webhook
    await pool.query(
      `INSERT INTO n8n.webhook_entity ("webhookPath", method, node, "webhookId", "workflowId")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("webhookPath", method) DO UPDATE
         SET node = EXCLUDED.node, "workflowId" = EXCLUDED."workflowId"`,
      [WEBHOOK_PATH, 'POST', WEBHOOK_NODE_NAME, null, workflowId],
    );

    console.log(`✅  Webhook registered: POST /webhook/${WEBHOOK_PATH}`);
    console.log('');
    console.log('🎉  Done! Workflow is active.');
    console.log('');
    console.log('   Internal webhook URL : http://localhost:5678/webhook/fb-lead-intake');
    console.log('   External webhook URL : https://app.mediqzy.com/webhook/fb-lead-intake');
    console.log('');
    console.log('   The fb-leads.route.js Express handler will POST here automatically');
    console.log('   whenever a new Facebook Lead Ad submission arrives.');
    console.log('');
    console.log('   Automation sequence:');
    console.log('     Day 0  → WhatsApp welcome message (immediate)');
    console.log('     Day 2  → WhatsApp follow-up');
    console.log('     Day 4  → WhatsApp final nudge');
    console.log('');
    console.log('   To edit messages or timing: open n8n UI → Facebook Lead Ads Automation');

  } catch (err) {
    console.error('❌  Import failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
