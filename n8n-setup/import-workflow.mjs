/**
 * n8n Workflow Import Script
 * Bypasses n8n CLI constraints by directly inserting workflow
 */
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mediczy_ai',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper'
});

// Generate a random workflow ID similar to n8n format (16 alphanumeric chars)
function generateWorkflowId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

const workflow = {
  id: generateWorkflowId(),
  name: 'Password Reset OTP',
  active: true,
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'password-reset-otp',
        responseMode: 'lastNode',
        options: {}
      },
      id: crypto.randomUUID(),
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      webhookId: 'password-reset-otp-webhook'
    },
    {
      parameters: {
        fromEmail: 'support@mediqzy.com',
        toEmail: '={{ $json.email }}',
        subject: 'Password Reset OTP - Mediqzy',
        emailType: 'html',
        message: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
<div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
<h1 style="color: white; margin: 0;">🔐 Password Reset</h1>
<p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Mediqzy Healthcare Platform</p>
</div>
<div style="padding: 40px;">
<p>Hello {{ $json.name }},</p>
<p>Your OTP for password reset is:</p>
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; padding: 30px; text-align: center; margin: 20px 0;">
<p style="color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0;">{{ $json.otp }}</p>
</div>
<p style="color: #856404; background: #fff3cd; padding: 15px; border-radius: 5px;">⚠️ This OTP is valid for 10 minutes only.</p>
<p style="color: #6c757d;">Best regards,<br><strong>Mediqzy Team</strong></p>
</div></div></body></html>`,
        options: {
          replyTo: 'support@mediqzy.com'
        }
      },
      id: crypto.randomUUID(),
      name: 'Send Email',
      type: 'n8n-nodes-base.emailSend',
      typeVersion: 2,
      position: [500, 200],
      credentials: {
        smtp: {
          id: '1',
          name: 'Zoho SMTP'
        }
      },
      executeOnce: false,
      continueOnFail: true
    },
    {
      parameters: {
        method: 'POST',
        url: 'https://api.twilio.com/2010-04-01/Accounts/ACe60079054c0b9f2a7aac3a64a5aea744/Messages.json',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpBasicAuth',
        sendBody: true,
        contentType: 'form-urlencoded',
        bodyParameters: {
          parameters: [
            { name: 'From', value: 'whatsapp:+918098998998' },
            { name: 'To', value: "={{ 'whatsapp:+' + $json.phone.toString().replace(/[^0-9]/g, '') }}" },
            { name: 'ContentSid', value: 'HX33ae0014bd63fad4404789d2373b6174' },
            { name: 'ContentVariables', value: "={{ JSON.stringify({ '1': $json.otp }) }}" }
          ]
        },
        options: {}
      },
      id: crypto.randomUUID(),
      name: 'Send WhatsApp',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [500, 400],
      credentials: {
        httpBasicAuth: {
          id: '1',
          name: 'Twilio Auth'
        }
      },
      continueOnFail: true
    },
    {
      parameters: {
        values: {
          boolean: [{ name: 'success', value: true }],
          string: [{ name: 'message', value: 'OTP sent via Email and WhatsApp' }]
        },
        options: {}
      },
      id: crypto.randomUUID(),
      name: 'Set Response',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [750, 300]
    }
  ],
  connections: {
    'Webhook': {
      main: [[
        { node: 'Send Email', type: 'main', index: 0 },
        { node: 'Send WhatsApp', type: 'main', index: 0 }
      ]]
    },
    'Send Email': {
      main: [[{ node: 'Set Response', type: 'main', index: 0 }]]
    },
    'Send WhatsApp': {
      main: [[{ node: 'Set Response', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

async function importWorkflow() {
  try {
    console.log('📦 Importing Password Reset OTP workflow to n8n...');
    
    // Check if workflow exists
    const existing = await pool.query(
      'SELECT id FROM n8n.workflow_entity WHERE name = $1',
      ['Password Reset OTP']
    );
    
    if (existing.rows.length > 0) {
      console.log('⚠️  Workflow already exists, updating...');
      const workflowId = existing.rows[0].id;
      
      await pool.query(
        `UPDATE n8n.workflow_entity 
         SET nodes = $1, connections = $2, settings = $3, active = true, "updatedAt" = NOW()
         WHERE id = $4`,
        [
          JSON.stringify(workflow.nodes),
          JSON.stringify(workflow.connections),
          JSON.stringify(workflow.settings),
          workflowId
        ]
      );
      
      console.log(`✅ Workflow updated: ${workflowId}`);
      return workflowId;
    }
    
    // Insert new workflow
    const result = await pool.query(
      `INSERT INTO n8n.workflow_entity 
       (id, name, active, nodes, connections, settings, "createdAt", "updatedAt", "versionId")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)
       RETURNING id`,
      [
        workflow.id,
        workflow.name,
        true,
        JSON.stringify(workflow.nodes),
        JSON.stringify(workflow.connections),
        JSON.stringify(workflow.settings),
        crypto.randomUUID()
      ]
    );
    
    console.log(`✅ Workflow created: ${result.rows[0].id}`);
    
    // Insert webhook path
    const webhookNode = workflow.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
    if (webhookNode) {
      try {
        await pool.query(
          `INSERT INTO n8n.webhook_entity 
           ("webhookPath", method, node, "webhookId", "pathLength")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("webhookPath", method) DO UPDATE SET node = $3`,
          [
            'password-reset-otp',
            'POST',
            webhookNode.name,
            webhookNode.webhookId,
            1
          ]
        );
        console.log('✅ Webhook registered: /webhook/password-reset-otp');
      } catch (e) {
        console.log('⚠️  Webhook registration skipped:', e.message);
      }
    }
    
    return result.rows[0].id;
  } catch (error) {
    console.error('❌ Failed to import workflow:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

importWorkflow()
  .then((id) => {
    console.log(`\n🎉 Workflow ready! ID: ${id}`);
    console.log('📌 Webhook URL: https://n8n.mediqzy.com/webhook/password-reset-otp');
    console.log('\n⚠️  Note: You may need to restart n8n or activate the workflow from the UI');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
