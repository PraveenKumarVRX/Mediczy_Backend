# 🎫 Ticketing System + RocketChat Integration Guide

## Overview

Your Mediczy app has a **comprehensive support ticketing system** fully integrated with RocketChat for team collaboration. This system automatically manages customer support tickets from multiple sources.

---

## 📍 Access Points

### **Admin Panel**
- URL: https://app.mediqzy.com/admin/tickets
- Features: Full ticket management, statistics, bulk operations, exports

### **Team Portal**
- URL: https://app.mediqzy.com/team/support-tickets
- Features: View and manage assigned tickets, team collaboration

### **RocketChat**
- URL: https://smart-chat.live
- Login: parinitha@mysmarthealth.in / Welcome@2026
- Purpose: Real-time team collaboration on tickets

---

## 🎯 Key Features

### 1. **Multi-Channel Ticket Creation**
Tickets can be created from:
- ✅ **Admin/Team Portal** - Manual ticket creation
- ✅ **Corporate Portal** - Customer self-service
- ✅ **WhatsApp Conversations** - Automatic ticket creation (NEW!)
- ✅ **API Endpoints** - Programmatic creation

### 2. **Automatic RocketChat Integration**
When a ticket is created:
1. **Private channel** created: `#ticket-TKT202501-0001`
2. **Notification posted** to `#general` channel
3. **Team alerted** with ticket details
4. **Real-time updates** posted to ticket channel

### 3. **Ticket Management**
- **Status Tracking**: open → in-progress → pending → resolved → closed
- **Priority Levels**: low, medium, high, critical
- **Categories**: technical, billing, integration, performance, feature-request, other
- **Assignments**: Assign to team members
- **SLA Monitoring**: Track response and resolution times
- **Internal Notes**: Team-only communication

### 4. **RocketChat Collaboration**
- **Dedicated channel** per ticket for team discussion
- **Status updates** automatically posted
- **Message sync** between ticket and RocketChat
- **Team mentions** and notifications
- **Conversation history** preserved

---

## 🚀 How to Use

### **Creating a Ticket Manually (Admin/Team)**

1. Login to https://app.mediqzy.com/admin/tickets or /team/support-tickets
2. Click **"New Ticket"** button
3. Fill in:
   - Title (required)
   - Description (required)
   - Priority: low/medium/high/critical
   - Category: technical/billing/integration/etc
   - Requester name and email
   - Optional: Assign to team member, set due date, add tags
4. Click **"Create Ticket"**
5. System automatically:
   - Generates unique ticket ID (e.g., TKT202501-0001)
   - Creates RocketChat channel `#ticket-tkt202501-0001`
   - Posts notification to `#general`
   - Notifies assigned team member

### **Creating Ticket from Customer Portal**

Customers can create tickets from:
- https://app.mediqzy.com/corporate/support (Corporate users)
- https://app.mediqzy.com/clinic/support (Clinic staff)

Form includes:
- Title
- Description
- Category selection
- Automatic requester information from login

### **Creating Ticket from WhatsApp (Automatic)**

#### **API Endpoint**: `POST /api/tickets/from-whatsapp`

```javascript
// Example: Create ticket from WhatsApp conversation
const response = await fetch('https://app.mediqzy.com/api/tickets/from-whatsapp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phoneNumber: '+917373007737',
    customerName: 'Rajesh Kumar',
    message: 'I need help with my prescription refill',
    conversationHistory: [
      { sender: 'user', content: 'Hi, I need prescription refill', timestamp: '2026-01-26T10:00:00Z' },
      { sender: 'agent', content: 'I can help you with that. Let me check your records.', timestamp: '2026-01-26T10:01:00Z' }
    ],
    priority: 'medium', // optional: low/medium/high/critical
    category: 'technical' // optional
  })
});

const result = await response.json();
console.log('Ticket created:', result.ticket.ticketId);
```

This endpoint:
- ✅ No authentication required (internal service)
- ✅ Creates ticket with WhatsApp context
- ✅ Attaches conversation history
- ✅ Creates RocketChat channel
- ✅ Posts full context to team
- ✅ Tags ticket as 'whatsapp'

---

## 📊 Managing Tickets

### **Ticket Lifecycle**

```
🆕 OPEN → ⚙️ IN-PROGRESS → ⏸️ PENDING → ✅ RESOLVED → 🔒 CLOSED
```

### **Status Transitions**

#### **Open → In-Progress**
- When team member starts working
- Auto-set when assigned to agent
- RocketChat notification: "⚙️ Ticket now in progress"

#### **In-Progress → Pending**
- Waiting for customer response
- Waiting for external dependency
- RocketChat notification: "⏸️ Ticket pending customer input"

#### **Pending → Resolved**
- Issue fixed
- Add resolution summary
- Customer satisfaction survey sent
- RocketChat notification: "✅ Ticket resolved" (posted to #general)

#### **Resolved → Closed**
- Customer confirms resolution
- Auto-close after 48 hours if no response
- Final stats recorded
- RocketChat notification: "🔒 Ticket closed"

### **Priority Management**

- **🔴 Critical**: System down, data loss - SLA: 1 hour
- **🟠 High**: Major feature broken - SLA: 4 hours
- **🟡 Medium**: Standard support - SLA: 24 hours
- **🔵 Low**: Enhancement, question - SLA: 48 hours

### **Team Collaboration in RocketChat**

#### **Finding Your Tickets**
1. Login to https://smart-chat.live
2. Check `#general` for new ticket notifications
3. Click channel link: `#ticket-tkt202501-0001`
4. Join channel to start collaborating

#### **Ticket Channel Format**
Each ticket gets a dedicated channel: `#ticket-{ticketId}`

**Example**: Ticket TKT202501-0001 → Channel `#ticket-tkt202501-0001`

#### **Channel Features**
- 📜 Full ticket context pinned
- 💬 Team discussion and notes
- 🔔 Status update notifications
- 👥 Customer message history
- 🔒 Internal team notes (not visible to customer)

#### **Posting to Ticket Channel**
```
Team Member in RocketChat:
💬 "I've reviewed the issue. Need to escalate to backend team."

System auto-posts to channel:
👨‍💼 **Parinitha**
I've reviewed the issue. Need to escalate to backend team.
```

All messages posted via ticket system also appear in RocketChat channel.

---

## 🔔 RocketChat Notifications

### **New Ticket Created**
Posted to: `#general` + ticket channel

```
🎫 *New Support Ticket Created*

📋 *Ticket:* TKT202501-0042
🔴 *Priority:* HIGH
🔧 *Category:* technical
👤 *From:* Rajesh Kumar (rajesh@example.com)
📌 *Title:* Cannot access prescription history
📝 *Description:* Getting error 500 when trying to view my past prescriptions...

💬 *Discuss in:* #ticket-tkt202501-0042
⏰ *Created:* 26/01/2026, 03:45:00 PM
```

### **WhatsApp Ticket Created**
Posted to: `#general` + ticket channel

```
📱 *WhatsApp Ticket Created*

🎫 *Ticket:* TKT202501-0043
👤 *Customer:* Priya Sharma
📞 *Phone:* +917373007737
🔥 *Priority:* MEDIUM
📌 *Category:* technical
💬 *Issue:* Need help with appointment booking

🗨️ *Discuss in:* #ticket-tkt202501-0043
⏰ *Created:* 26/01/2026, 04:12:00 PM

---

📋 *Recent Conversation History:*

1. 👤 **Priya Sharma**: I want to book appointment with Dr. Isha
2. 🤖 **Dr. iSHA**: I can help you book an appointment. Which specialty?
3. 👤 **Priya Sharma**: Gynecology
4. 🤖 **Dr. iSHA**: Let me check available slots...
```

### **Status Change Notification**
Posted to: ticket channel (major updates also to `#general`)

```
⚙️ *Ticket Status Updated*

📋 *Ticket:* TKT202501-0042
📊 *Status:* open → in-progress
👤 *Updated by:* Parinitha
⏰ *Time:* 26/01/2026, 04:05:00 PM
```

### **Resolution Notification**
Posted to: ticket channel + `#general`

```
✅ *Ticket Status Updated*

📋 *Ticket:* TKT202501-0042
📊 *Status:* in-progress → resolved
👤 *Updated by:* Parinitha
⏰ *Time:* 26/01/2026, 05:30:00 PM

✅ *Resolution:* Fixed database permission issue. Customer can now view all prescription history. Tested with customer account.
```

---

## 📈 Statistics & Analytics

### **Dashboard Metrics**
Available at `/admin/tickets`:

- **Total Tickets**: All-time count
- **Open Tickets**: Currently unresolved
- **In Progress**: Being worked on
- **Pending**: Awaiting response
- **Resolved**: Fixed issues
- **Closed**: Completed tickets
- **Avg Response Time**: Time to first agent reply
- **Avg Resolution Time**: Time to resolve
- **Satisfaction Score**: Customer ratings (1-5 stars)

### **Team Performance**
Track individual agent metrics:
- Tickets assigned
- Tickets resolved
- Average resolution time
- Customer satisfaction rating
- Active vs resolved ratio

### **Category Breakdown**
- Technical issues
- Billing inquiries
- Integration support
- Performance complaints
- Feature requests
- Other

### **Priority Distribution**
- Critical: Immediate attention
- High: Same-day resolution
- Medium: 24-hour SLA
- Low: Best effort

---

## 🛠️ API Endpoints

### **Ticket Management**

#### **Get All Tickets** (with filters)
```
GET /api/tickets?status=open&priority=high&page=1&limit=20
Authorization: Bearer {token}
```

Query parameters:
- `status`: open/in-progress/pending/resolved/closed
- `priority`: low/medium/high/critical
- `category`: technical/billing/integration/etc
- `search`: Search in title, description, ticket ID
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `sortBy`: Field to sort by (default: createdAt)
- `sortOrder`: asc/desc (default: desc)

#### **Get Ticket Statistics**
```
GET /api/tickets/stats
Authorization: Bearer {token}
```

Returns:
- General statistics (total, open, resolved, etc.)
- Category breakdown
- Priority distribution
- Agent performance metrics

#### **Get Single Ticket**
```
GET /api/tickets/{ticketId}
Authorization: Bearer {token}
```

Returns full ticket details including messages, attachments, history.

#### **Create Ticket**
```
POST /api/tickets
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Cannot login to mobile app",
  "description": "Getting 'invalid credentials' error even with correct password",
  "priority": "high",
  "category": "technical",
  "requester": {
    "name": "Amit Patel",
    "email": "amit@example.com",
    "role": "Patient"
  },
  "assignee": "agent@mediczy.com", // optional
  "dueDate": "2026-01-28T12:00:00Z", // optional
  "tags": ["mobile", "authentication"], // optional
  "message": "Please help urgently, I have appointment in 2 hours" // optional
}
```

#### **Update Ticket**
```
PUT /api/tickets/{ticketId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "resolved",
  "priority": "critical",
  "resolution": "Reset user password and cleared app cache"
}
```

#### **Add Message to Ticket**
```
POST /api/tickets/{ticketId}/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "content": "I've investigated the issue. It's a backend sync problem.",
  "isInternal": true  // true = team-only note, false = visible to customer
}
```

#### **Assign Ticket**
```
POST /api/tickets/{ticketId}/assign
Authorization: Bearer {token}
Content-Type: application/json

{
  "assigneeId": "user123"
}
```

#### **Create Ticket from WhatsApp** (No auth required)
```
POST /api/tickets/from-whatsapp
Content-Type: application/json

{
  "phoneNumber": "+917373007737",
  "customerName": "Suresh Reddy",
  "message": "Need help with appointment booking",
  "conversationHistory": [
    { "sender": "user", "content": "Hi", "timestamp": "2026-01-26T10:00:00Z" },
    { "sender": "agent", "content": "Hello! How can I help?", "timestamp": "2026-01-26T10:01:00Z" }
  ],
  "priority": "medium",
  "category": "technical"
}
```

### **Bulk Operations**

#### **Bulk Update Tickets**
```
POST /api/tickets/bulk
Authorization: Bearer {token}
Content-Type: application/json

{
  "operation": "updateStatus",  // assign, updateStatus, updatePriority, addTags
  "ticketIds": ["TKT202501-0001", "TKT202501-0002"],
  "data": {
    "status": "in-progress"
  }
}
```

### **Export**

#### **Export Tickets**
```
GET /api/tickets/export/csv?status=open&startDate=2026-01-01
Authorization: Bearer {token}
```

Formats: `csv` or `json`

---

## 🔗 Integration Examples

### **Example 1: Create Ticket When WhatsApp User Requests Team**

Add to `/server/routes/whatsapp-production.route.js`:

```javascript
// In webhook handler where you detect team request
const teamChatPatterns = [
  /\b(chat|talk|speak|connect)\s+(with|to)\s+(\w+)/i,
  /i\s+need\s+to\s+(speak|talk)\s+to/i
];

// If team request detected
if (isTeamRequest) {
  // Create ticket automatically
  const ticketResponse = await fetch('http://localhost:8000/api/tickets/from-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber: from.replace('whatsapp:', ''),
      customerName: userName,
      message: userMessage,
      conversationHistory: recentMessages,
      priority: 'high', // Team requests are high priority
      category: 'customer-support'
    })
  });
  
  const ticketData = await ticketResponse.json();
  
  // Notify user
  await whatsappProductionService.sendMessage(
    from,
    `I've created ticket ${ticketData.ticket.ticketId} and notified our team. ` +
    `Someone will respond to you shortly. 👍`
  );
}
```

### **Example 2: Auto-Escalate High-Priority WhatsApp Issues**

```javascript
// In AI response handler
if (aiResponse.includes('urgent') || aiResponse.includes('emergency')) {
  await fetch('http://localhost:8000/api/tickets/from-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber: phoneNumber,
      customerName: customerName,
      message: userMessage,
      conversationHistory: history,
      priority: 'critical', // Urgent issues
      category: 'technical',
      tags: ['urgent', 'auto-escalated', 'ai-detected']
    })
  });
  
  // Alert team in RocketChat via webhook
  // Team gets notification immediately
}
```

### **Example 3: Monitor Ticket Updates in RocketChat**

Team members can:
1. Join ticket channels to follow progress
2. Receive notifications for status changes
3. Discuss solutions with team
4. Add internal notes that customer doesn't see
5. View full conversation context from WhatsApp

---

## 🎓 Best Practices

### **For Team Members**

1. **Check RocketChat Daily**
   - Login to https://smart-chat.live
   - Review `#general` for new tickets
   - Join relevant ticket channels

2. **Update Ticket Status Promptly**
   - Move to "in-progress" when you start
   - Set to "pending" if waiting for customer
   - Mark "resolved" with detailed resolution

3. **Use Internal Notes**
   - Set `isInternal: true` for team discussions
   - Customer won't see internal messages
   - Use for technical details, escalation notes

4. **Add Tags**
   - Tag tickets for easy filtering
   - Examples: 'mobile', 'payment', 'urgent', 'vip-customer'

5. **Track Time**
   - System automatically tracks response time
   - Update status to track resolution time
   - Aim to meet SLA targets

### **For Customers**

1. **Provide Details**
   - Clear title and description
   - Include error messages/screenshots if possible
   - Mention what you already tried

2. **Check Email**
   - Updates sent to email address
   - Ticket ID in subject line
   - Click link to view status

3. **Respond Promptly**
   - If status is "pending", team is waiting for you
   - Quick responses speed up resolution

### **For Administrators**

1. **Monitor Dashboard**
   - Check `/admin/tickets` regularly
   - Review team performance metrics
   - Identify bottlenecks

2. **Balance Workload**
   - Assign tickets evenly
   - Check agent availability
   - Reassign if needed

3. **Review Analytics**
   - Track resolution times
   - Monitor satisfaction scores
   - Identify recurring issues

4. **Export Reports**
   - Weekly/monthly ticket reports
   - Share with management
   - Use for process improvement

---

## 🆘 Troubleshooting

### **Ticket Not Creating RocketChat Channel**

Check logs:
```bash
pm2 logs mediczy-server --lines 100 | grep -i "rocketchat"
```

Verify RocketChat config in `.env`:
```
ROCKETCHAT_URL=https://smart-chat.live
ROCKETCHAT_USER_ID=AAAXSfxydgRxBhHaJ
ROCKETCHAT_AUTH_TOKEN=0hoYIxI2zxVuyUVX6rltCNswMkXcb9WWCwdMRGQiRNs
```

### **Messages Not Posting to RocketChat**

Test RocketChat connection:
```bash
curl https://app.mediqzy.com/api/rocketchat/test
```

Should return: `{"success": true, "message": "RocketChat connection working"}`

### **Can't Find Ticket Channel**

Ticket channels are **private groups**. You need to:
1. Be invited by admin, OR
2. Admin makes channel public, OR
3. Check if channel name matches: `#ticket-{ticketId}`

### **WhatsApp Tickets Not Creating**

Check endpoint is accessible internally:
```bash
curl http://localhost:8000/api/tickets/from-whatsapp -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919999999999",
    "customerName": "Test User",
    "message": "Test ticket creation"
  }'
```

---

## 📞 Support

For system issues with the ticketing system itself:
- Create a ticket at https://app.mediqzy.com/admin/tickets
- Email: tech-support@mediczy.com
- Emergency: WhatsApp +918098998998

---

## 🔄 System Integration Flow

```
┌─────────────────┐
│  TICKET SOURCES │
└────────┬────────┘
         │
         ├─── Admin Portal (/admin/tickets)
         ├─── Team Portal (/team/support-tickets)
         ├─── Corporate Portal (/corporate/support)
         ├─── WhatsApp Conversations
         └─── API Endpoints
                  │
                  ▼
         ┌────────────────┐
         │  TICKET SYSTEM │
         │   (PostgreSQL) │
         └────────┬───────┘
                  │
                  ├─── Create Ticket
                  ├─── Generate Ticket ID
                  ├─── Assign to Agent
                  └─── Track Status
                           │
                           ▼
              ┌────────────────────┐
              │ ROCKETCHAT SERVICE │
              └────────┬───────────┘
                       │
                       ├─── Create Private Channel (#ticket-xxx)
                       ├─── Post to #general
                       ├─── Notify Team
                       ├─── Sync Messages
                       └─── Post Status Updates
                                │
                                ▼
                   ┌─────────────────────┐
                   │ TEAM COLLABORATION  │
                   │  (smart-chat.live)  │
                   └─────────────────────┘
```

---

## ✅ Summary

Your ticketing system is **production-ready** with:

✅ **Full CRUD Operations** - Create, read, update, delete tickets  
✅ **Multi-Source Creation** - Admin, Team, Corporate, WhatsApp, API  
✅ **RocketChat Integration** - Auto-create channels, post notifications  
✅ **Team Collaboration** - Dedicated channels, real-time updates  
✅ **WhatsApp Support** - Auto-create tickets from conversations  
✅ **Statistics Dashboard** - Performance metrics, analytics  
✅ **SLA Tracking** - Monitor response and resolution times  
✅ **Bulk Operations** - Manage multiple tickets at once  
✅ **Export Functionality** - CSV and JSON exports  
✅ **Internal Notes** - Team-only communication  

**Start using it now!**

1. Login to RocketChat: https://smart-chat.live (parinitha@mysmarthealth.in / Welcome@2026)
2. Check tickets: https://app.mediqzy.com/admin/tickets
3. Monitor #general channel for new tickets
4. Join ticket channels to collaborate

---

*Last Updated: January 26, 2026*
