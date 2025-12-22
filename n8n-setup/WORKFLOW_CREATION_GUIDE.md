# n8n Workflow Creation Guide - Step by Step

## 🎯 Goal
Build your first workflow: **Appointment Confirmation with Multi-Channel Notifications**

This workflow will:
1. Receive appointment data from Mediczy backend
2. Send email confirmation via SendGrid
3. Send SMS via Twilio
4. Send WhatsApp message
5. Report status back to Mediczy

---

## 📋 Prerequisites Checklist

Before starting, you need:
- [x] n8n logged in at http://13.234.17.52:5678
- [ ] SendGrid account (free tier - 100 emails/day)
- [ ] Twilio account (free trial credits)
- [ ] WhatsApp Business API (optional for now)

---

## 🚀 Step 1: Create Your First Workflow

### 1.1 Create New Workflow
1. In n8n dashboard, click **"Add workflow"** button (top right)
2. You'll see an empty canvas with a plus (+) button
3. Click the workflow name at the top (says "My workflow")
4. Rename it to: **"Appointment Booked - Multi-Channel Notification"**
5. Click "Save" (bottom right)

### 1.2 Add Webhook Trigger (Entry Point)
1. Click the **(+)** button on the canvas
2. Search for **"Webhook"** in the nodes list
3. Click **"Webhook"** to add it
4. Configure the Webhook node:
   - **HTTP Method:** `POST`
   - **Path:** `appointment-booked`
   - **Authentication:** `None` (we'll secure it later)
   - **Response Mode:** `Last Node`
   
5. Copy the webhook URL shown (will be something like):
   ```
   http://localhost:5678/webhook/appointment-booked
   ```

6. Click **"Execute Node"** to test it
7. Keep this node selected for now

---

## 🚀 Step 2: Extract Appointment Data

### 2.1 Add Set Node (Data Processing)
1. Hover over the **Webhook** node
2. Click the **(+)** button that appears on the right
3. Search for **"Set"** and click it
4. Rename node to: **"Extract Appointment Data"**
5. Click **"Add Value"** and configure these fields:

**Field 1:**
- Name: `appointmentId`
- Value: `{{ $json.body.id }}`

**Field 2:**
- Name: `patientName`
- Value: `{{ $json.body.patientName }}`

**Field 3:**
- Name: `patientEmail`
- Value: `{{ $json.body.patientEmail }}`

**Field 4:**
- Name: `patientPhone`
- Value: `{{ $json.body.patientPhone }}`

**Field 5:**
- Name: `doctorName`
- Value: `{{ $json.body.doctorName }}`

**Field 6:**
- Name: `appointmentDate`
- Value: `{{ $json.body.appointmentDate }}`

**Field 7:**
- Name: `appointmentTime`
- Value: `{{ $json.body.appointmentTime }}`

**Field 8:**
- Name: `consultationType`
- Value: `{{ $json.body.consultationType }}`

6. Click **"Execute Node"** to test
7. You should see the extracted values in the output

---

## 🚀 Step 3: Send Email Notification (SendGrid)

### 3.1 Set Up SendGrid Credentials (One-time setup)

**First, create SendGrid account:**
1. Go to https://signup.sendgrid.com/
2. Sign up for free account (100 emails/day)
3. Verify your email
4. Go to Settings → API Keys
5. Click "Create API Key"
6. Name it: `Mediczy-n8n`
7. Select "Full Access"
8. Copy the API key (you won't see it again!)

**Add credentials to n8n:**
1. In n8n, click your profile icon (top right)
2. Click **"Credentials"**
3. Click **"Add Credential"**
4. Search for **"SendGrid"**
5. Paste your API key
6. Click **"Save"**

**Set up Sender Identity:**
1. In SendGrid dashboard, go to Settings → Sender Authentication
2. Click "Verify a Single Sender"
3. Fill in:
   - From Name: `Mediczy`
   - From Email: `noreply@mayden.in` (or your domain)
4. Verify the email

### 3.2 Add SendGrid Node to Workflow
1. Hover over the **"Extract Appointment Data"** node
2. Click the **(+)** button
3. Search for **"SendGrid"** and click it
4. Configure:
   - **Credential:** Select the SendGrid credential you created
   - **Resource:** `Email`
   - **Operation:** `Send`
   
5. Fill in email details:
   - **From Email:** `noreply@mayden.in` (must match verified sender)
   - **From Name:** `Mediczy`
   - **To Email:** `{{ $json.patientEmail }}`
   - **Subject:** `Appointment Confirmed with Dr. {{ $json.doctorName }}`
   - **Email Type:** `Text`
   - **Message (Text):** 
     ```
     Dear {{ $json.patientName }},

     Your appointment has been confirmed!

     📅 Date: {{ $json.appointmentDate }}
     ⏰ Time: {{ $json.appointmentTime }}
     👨‍⚕️ Doctor: Dr. {{ $json.doctorName }}
     💼 Type: {{ $json.consultationType }}

     Important:
     - Please arrive 10 minutes early
     - Bring your ID and any relevant medical records
     - You will receive reminders 24 hours and 1 hour before your appointment

     If you need to reschedule, please contact us at support@mediczy.com

     Thank you for choosing Mediczy!

     Best regards,
     Team Mediczy
     ```

6. Click **"Execute Node"** to test
7. Check your email inbox!

---

## 🚀 Step 4: Send SMS Notification (Twilio)

### 4.1 Set Up Twilio (Skip if you want to test email first)

**Create Twilio account:**
1. Go to https://www.twilio.com/try-twilio
2. Sign up for free ($15 trial credits)
3. Verify your phone number
4. Get a Twilio phone number (free with trial)
5. Go to Console → Account Info
6. Copy:
   - Account SID
   - Auth Token

**Add Twilio credentials to n8n:**
1. In n8n, go to Credentials
2. Add Credential → Search "Twilio"
3. Paste Account SID and Auth Token
4. Save

### 4.2 Add Twilio Node (Optional for now)
1. Hover over **SendGrid** node
2. Click **(+)** button
3. Search for **"Twilio"** and add it
4. Configure:
   - **Credential:** Select Twilio credential
   - **Resource:** `SMS`
   - **Operation:** `Send`
   - **From:** Your Twilio phone number (e.g., `+1234567890`)
   - **To:** `{{ $json.patientPhone }}`
   - **Message:** 
     ```
     Mediczy: Appointment confirmed with Dr. {{ $json.doctorName }} on {{ $json.appointmentDate }} at {{ $json.appointmentTime }}. See you soon!
     ```

5. Execute to test

---

## 🚀 Step 5: Report Back to Mediczy

### 5.1 Add HTTP Request Node (Callback)
1. Add new node after SendGrid (or Twilio if you added it)
2. Search for **"HTTP Request"** and add it
3. Configure:
   - **Method:** `POST`
   - **URL:** `http://localhost:3000/api/webhooks/n8n-callback/workflow-complete`
   - **Authentication:** `None`
   - **Send Body:** `Yes`
   - **Body Content Type:** `JSON`
   - **Specify Body:** `Using JSON`
   - **JSON:**
     ```json
     {
       "workflowId": "{{ $workflow.id }}",
       "workflowName": "{{ $workflow.name }}",
       "appointmentId": "{{ $('Extract Appointment Data').item.json.appointmentId }}",
       "status": "success",
       "channels": {
         "email": "{{ $('SendGrid').item.json.messageId ? 'sent' : 'failed' }}",
         "sms": "pending"
       },
       "timestamp": "{{ $now }}"
     }
     ```

4. Execute to test

---

## 🚀 Step 6: Add Error Handling

### 6.1 Add Error Workflow
1. Click on the **SendGrid** node
2. In settings panel, scroll down to "Settings"
3. Click "On Error" dropdown
4. Select "Continue"

This ensures if email fails, workflow continues to SMS.

### 6.2 Add Error Callback Node
1. Add another **HTTP Request** node parallel to success callback
2. Connect it as error handler
3. Configure same as Step 5.1 but with:
   ```json
   {
     "workflowId": "{{ $workflow.id }}",
     "appointmentId": "{{ $('Extract Appointment Data').item.json.appointmentId }}",
     "status": "error",
     "error": "{{ $json.error }}",
     "timestamp": "{{ $now }}"
   }
   ```

---

## 🚀 Step 7: Activate Your Workflow

### 7.1 Test End-to-End
1. Click **"Execute Workflow"** button (top right)
2. In another tab, use curl to test:
   ```bash
   curl -X POST http://13.234.17.52:5678/webhook/appointment-booked \
     -H "Content-Type: application/json" \
     -d '{
       "id": "test-123",
       "patientName": "John Doe",
       "patientEmail": "your-email@example.com",
       "patientPhone": "+919876543210",
       "doctorName": "Dr. Sharma",
       "appointmentDate": "2025-12-15",
       "appointmentTime": "10:30 AM",
       "consultationType": "Video Consultation"
     }'
   ```

3. Check each node's output in n8n
4. Verify email received

### 7.2 Activate for Production
1. Toggle the switch at top left: **"Inactive" → "Active"**
2. Your workflow is now live!
3. The webhook will automatically trigger when appointments are booked

---

## 🎉 Step 8: Verify Integration with Mediczy

### 8.1 Update Mediczy Backend
The n8n service is already configured to call this webhook when appointments are booked.

Test it:
1. Start your Mediczy backend: `pm2 restart mediczy-backend`
2. Book a test appointment through your app
3. Check n8n executions: Click "Executions" in left sidebar
4. You should see your workflow run automatically!

---

## 📊 Quick Visual Workflow Structure

```
[Webhook: appointment-booked]
         ↓
[Set: Extract Appointment Data]
         ↓
[SendGrid: Send Email] → [Error Handler] → [HTTP: Error Callback]
         ↓
[Twilio: Send SMS] (optional)
         ↓
[HTTP Request: Success Callback to Mediczy]
```

---

## 🔧 Troubleshooting

### Email not sending?
- Check SendGrid API key is valid
- Verify sender email is authenticated in SendGrid
- Check spam folder
- Look at SendGrid dashboard → Activity for delivery status

### Webhook not triggering?
- Make sure workflow is **Active** (toggle on)
- Check webhook URL is correct
- Verify n8n is running: `pm2 status mediczy-n8n`
- Check n8n logs: `pm2 logs mediczy-n8n`

### Can't find node?
- Use search bar in node selector
- Some nodes require n8n Pro (like advanced AI)
- Check n8n community nodes if needed

### Data not passing between nodes?
- Click on connections (lines) to see data flow
- Use `{{ $json }}` to see all available data
- Use "Execute Previous Nodes" to test with real data

---

## 🎯 Next Steps

Once this workflow is working:

1. **Week 2 Day 1-2:** Add more email templates
2. **Week 2 Day 3-4:** Add SMS reminders (24h, 1h before)
3. **Week 2 Day 5-7:** Add WhatsApp notifications
4. **Week 3:** Build payment reminder workflow
5. **Week 3:** Build no-show detection workflow
6. **Week 4:** Build health monitoring alerts

Refer to `N8N_IMPLEMENTATION_ROADMAP.md` for complete timeline!

---

## 📚 Useful n8n Resources

- **Expressions:** https://docs.n8n.io/code-examples/expressions/
- **Workflow Templates:** https://n8n.io/workflows/
- **Community Forum:** https://community.n8n.io/
- **Node Documentation:** Click any node → Click "?" icon

---

## 💡 Pro Tips

1. **Save often:** n8n auto-saves, but manual save after major changes
2. **Name your nodes:** Descriptive names make debugging easier
3. **Use sticky notes:** Right-click canvas → Add Sticky Note for documentation
4. **Test with real data:** Use "Execute Previous Nodes" to test with actual webhook data
5. **Version control:** Duplicate workflows before making major changes
6. **Monitor executions:** Check "Executions" tab regularly for errors

---

**Ready to build? Start with Step 1!** 🚀

If you get stuck, check the n8n docs or ask me for help!
