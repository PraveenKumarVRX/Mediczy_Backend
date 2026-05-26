# Team User as RocketChat Agent Setup Guide

## Overview

This guide explains how to set up a **team user** (like `parinitha@mysmarthealth.in`) in Mediczy to act as a **RocketChat agent** who can chat with users through the omnichannel livechat flow.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEDICZY SYSTEM FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. TEAM USER CREATION (Mediczy DB)                             │
│     └─> Parinitha@mysmarthealth.in                              │
│         - role: 'team'                                           │
│         - isTeam: true                                           │
│         - department: 'Support'                                  │
│         - Login via /api/team/login                              │
│                                                                   │
│  2. RC AGENT REGISTRATION                                        │
│     └─> RocketChat User Account                                 │
│         - username: parinitha_smarthealth                        │
│         - email: parinitha@mysmarthealth.in                      │
│         - role: livechat agent                                   │
│                                                                   │
│  3. LINKAGE (Mediczy metadata)                                   │
│     └─> metadata.rocketchatUserId = RC_USER_ID                  │
│         metadata.rocketchatUsername = RC_USERNAME                │
│                                                                   │
│  4. AGENT CHAT FLOW                                              │
│     WhatsApp User → Mediczy → RocketChat Omnichannel            │
│                               ↓                                   │
│                        Parinitha (Agent)                         │
│                               ↓                                   │
│                    WhatsApp User (Response)                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Create Team User in Mediczy

### Option A: Via Admin API

```bash
curl -X POST http://localhost:8888/api/admin/team \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Parinitha",
    "lastName": "Kumar",
    "email": "parinitha@mysmarthealth.in",
    "phoneNumber": "+91XXXXXXXXXX",
    "password": "SecureTeamPassword123!",
    "department": "Customer Support",
    "designation": "Support Agent",
    "role": "Support Agent",
    "isTeam": true,
    "canLogin": true
  }'

# Response:
{
  "success": true,
  "message": "Team user created successfully",
  "user": {
    "id": 42,
    "email": "parinitha@mysmarthealth.in",
    "firstName": "Parinitha",
    "role": "team"
  }
}
```

### Option B: Via Admin Dashboard

1. Login: `https://localhost:3000/admin/login`
2. Go to **Admin** → **Team Management** → **Add Team Member**
3. Fill in:
   ```
   First Name: Parinitha
   Last Name: Kumar
   Email: parinitha@mysmarthealth.in
   Phone: +91XXXXXXXXXX
   Password: SecureTeamPassword123!
   Department: Customer Support
   Designation: Support Agent
   Role Title: Support Agent
   Can Login: ✅ Yes
   Status: Active
   ```
4. Click **Save**

### Option C: Direct Database Insert

```sql
INSERT INTO users (
  uid, firstName, lastName, email, password, status, 
  role, membershipType, metadata, emailVerified, createdAt, updatedAt
)
VALUES (
  gen_random_uuid(),
  'Parinitha',
  'Kumar',
  'parinitha@mysmarthealth.in',
  -- Hash password: SecureTeamPassword123! using bcrypt
  '$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'active',
  'team',
  'team',
  jsonb_build_object(
    'department', 'Customer Support',
    'designation', 'Support Agent',
    'roleTitle', 'Support Agent',
    'isTeam', true,
    'canLogin', true
  ),
  false,
  NOW(),
  NOW()
);
```

---

## Step 2: Register Team User in RocketChat as Agent

### Option A: Via Script (Recommended)

**File:** `setup-team-agent.mjs`

```javascript
#!/usr/bin/env node

import axios from 'axios';

const RC_URL = process.env.ROCKETCHAT_URL || 'https://smart-chat.live';
const RC_ADMIN_USER = process.env.ROCKETCHAT_ADMIN_USER || 'support_admin';
const RC_ADMIN_PASS = process.env.ROCKETCHAT_ADMIN_PASSWORD || 'Password@1234567';

const TEAM_USER = {
  firstName: 'Parinitha',
  lastName: 'Kumar',
  email: 'parinitha@mysmarthealth.in',
  username: 'parinitha_smarthealth',
  password: 'SecureTeamPassword123!'
};

async function getAdminAuth() {
  try {
    console.log('🔐 Authenticating with RocketChat admin...');
    const response = await axios.post(`${RC_URL}/api/v1/login`, {
      user: RC_ADMIN_USER,
      password: RC_ADMIN_PASS
    });

    return {
      authToken: response.data.data.authToken,
      userId: response.data.data.userId
    };
  } catch (error) {
    console.error('❌ Admin auth failed:', error.response?.data?.error || error.message);
    throw error;
  }
}

async function createRCUser(auth, userData) {
  try {
    console.log(`\n📝 Creating RocketChat user: ${userData.username}...`);
    
    const response = await axios.post(
      `${RC_URL}/api/v1/users.create`,
      {
        username: userData.username,
        email: userData.email,
        password: userData.password,
        name: `${userData.firstName} ${userData.lastName}`,
        active: true
      },
      {
        headers: {
          'X-Auth-Token': auth.authToken,
          'X-User-Id': auth.userId,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ RocketChat user created: ${response.data.user._id}`);
    return response.data.user;
  } catch (error) {
    if (error.response?.status === 400 && 
        error.response?.data?.error?.includes('already exists')) {
      console.log(`⚠️  User already exists, fetching existing user...`);
      return await getRCUser(auth, userData.username);
    }
    throw error;
  }
}

async function getRCUser(auth, username) {
  console.log(`🔍 Fetching existing RocketChat user: ${username}...`);
  
  const response = await axios.get(
    `${RC_URL}/api/v1/users.info?username=${username}`,
    {
      headers: {
        'X-Auth-Token': auth.authToken,
        'X-User-Id': auth.userId
      }
    }
  );

  return response.data.user;
}

async function registerAsAgent(auth, rcUserId) {
  try {
    console.log(`\n👤 Registering as livechat agent...`);
    
    const response = await axios.post(
      `${RC_URL}/api/v1/livechat/users/agent`,
      { userId: rcUserId },
      {
        headers: {
          'X-Auth-Token': auth.authToken,
          'X-User-Id': auth.userId,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Registered as agent`);
    return response.data.user;
  } catch (error) {
    console.error('❌ Agent registration failed:', error.response?.data || error.message);
    throw error;
  }
}

async function setAgentOnline(auth, username) {
  try {
    console.log(`\n🟢 Setting agent online...`);
    
    const response = await axios.post(
      `${RC_URL}/api/v1/users.setStatus`,
      { username, status: 'online' },
      {
        headers: {
          'X-Auth-Token': auth.authToken,
          'X-User-Id': auth.userId,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Agent is now online`);
    return true;
  } catch (error) {
    console.error('❌ Status change failed:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Team User RocketChat Agent Setup\n');

    // Step 1: Get admin auth
    const auth = await getAdminAuth();
    console.log('✅ Admin authenticated\n');

    // Step 2: Create/Get RC user
    const rcUser = await createRCUser(auth, TEAM_USER);

    // Step 3: Register as agent
    await registerAsAgent(auth, rcUser._id);

    // Step 4: Set online
    await setAgentOnline(auth, TEAM_USER.username);

    console.log(`\n✅ SETUP COMPLETE!\n`);
    console.log(`Team User Agent Details:`);
    console.log(`  📧 Email: ${TEAM_USER.email}`);
    console.log(`  👤 Username: ${TEAM_USER.username}`);
    console.log(`  🆔 RocketChat ID: ${rcUser._id}`);
    console.log(`  🟢 Status: Online`);
    console.log(`  💼 Role: Livechat Agent`);

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();
```

**Run it:**

```bash
chmod +x setup-team-agent.mjs
node setup-team-agent.mjs

# Or with custom credentials
ROCKETCHAT_URL=https://smart-chat.live \
ROCKETCHAT_ADMIN_USER=support_admin \
ROCKETCHAT_ADMIN_PASSWORD=Password@1234567 \
node setup-team-agent.mjs
```

### Option B: Manual Setup via RocketChat UI

1. **Create User:**
   - Login to https://smart-chat.live/admin
   - Go to **Administration** → **Workspace** → **Users**
   - Click **New User**
   - Fill:
     ```
     Username: parinitha_smarthealth
     Email: parinitha@mysmarthealth.in
     Name: Parinitha Kumar
     Password: SecureTeamPassword123!
     ```
   - Click **Save**

2. **Register as Agent:**
   - Go to **Administration** → **Omnichannel** → **Agents**
   - Click **Add Agent**
   - Select: `parinitha_smarthealth`
   - Click **Confirm**

3. **Set Online:**
   - Agent logs in and sets status to **Online**

---

## Step 3: Link Team User to RocketChat Agent (Backend)

Create an endpoint to link Mediczy team user to RocketChat agent:

**File:** `server/routes/team.route.js`

```javascript
/**
 * Link team user to RocketChat agent
 * POST /api/team/link-to-rocketchat
 */
router.post('/link-to-rocketchat', authTeam, async (req, res) => {
  try {
    const { teamUserId, rocketchatUserId, rocketchatUsername } = req.body;

    if (!teamUserId || !rocketchatUserId || !rocketchatUsername) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: teamUserId, rocketchatUserId, rocketchatUsername'
      });
    }

    // Get team user
    const teamUser = await userModel.findOne({
      where: { id: teamUserId, role: 'team' }
    });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    // Parse existing metadata
    let metadata = {};
    try {
      metadata = teamUser.metadata ? JSON.parse(teamUser.metadata) : {};
    } catch (e) {
      metadata = {};
    }

    // Link to RocketChat
    metadata.rocketchatUserId = rocketchatUserId;
    metadata.rocketchatUsername = rocketchatUsername;
    metadata.isRocketchatAgent = true;
    metadata.linkedAt = new Date().toISOString();

    // Update user
    await teamUser.update({
      metadata: JSON.stringify(metadata)
    });

    console.log(`✅ Team user ${teamUser.email} linked to RocketChat agent ${rocketchatUsername}`);

    return res.status(200).json({
      success: true,
      message: 'Team user linked to RocketChat agent',
      linking: {
        teamUserEmail: teamUser.email,
        rocketchatUsername: rocketchatUsername,
        linkedAt: metadata.linkedAt
      }
    });

  } catch (error) {
    console.error('Error linking team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get team user's RocketChat agent info
 * GET /api/team/:id/rocketchat-agent
 */
router.get('/:id/rocketchat-agent', authTeam, async (req, res) => {
  try {
    const teamUser = await userModel.findOne({
      where: { id: req.params.id, role: 'team' }
    });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    let metadata = {};
    try {
      metadata = teamUser.metadata ? JSON.parse(teamUser.metadata) : {};
    } catch (e) {
      metadata = {};
    }

    const isAgent = metadata.isRocketchatAgent === true;

    return res.status(200).json({
      success: true,
      isAgent,
      agentInfo: isAgent ? {
        rocketchatUserId: metadata.rocketchatUserId,
        rocketchatUsername: metadata.rocketchatUsername,
        linkedAt: metadata.linkedAt
      } : null
    });

  } catch (error) {
    console.error('Error fetching agent info:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
```

---

## Step 4: Update Omnichannel Service to Use Team Agents

**File:** `server/services/omnichannel-chat.service.js`

```javascript
/**
 * Get available agents from both RocketChat and team users
 */
async getAvailableAgents(department = null) {
  try {
    // Get agents from RocketChat
    const params = department ? { department: this.departments[department] } : {};
    const response = await axios.get(
      `${this.rocketChatUrl}/api/v1/livechat/users/agent`,
      { params, headers: this.getHeaders() }
    );

    const agents = response.data.users || [];

    // Enrich with team user information
    const enrichedAgents = await Promise.all(
      agents.map(async (agent) => {
        try {
          // Look up corresponding team user
          const teamUser = await this.getUserModel().findOne({
            where: {
              metadata: {
                rocketchatUserId: agent._id
              }
            }
          });

          return {
            ...agent,
            teamUserId: teamUser?.id || null,
            teamUserEmail: teamUser?.email || null,
            department: teamUser?.department || agent.department || 'General'
          };
        } catch (err) {
          return agent;
        }
      })
    );

    return { success: true, agents: enrichedAgents };
  } catch (error) {
    console.error('Get agents error:', error.message);
    return { success: false, agents: [] };
  }
}
```

---

## Step 5: Testing

### Test 1: Verify Team User Login

```bash
curl -X POST http://localhost:8888/api/team/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "parinitha@mysmarthealth.in",
    "password": "SecureTeamPassword123!"
  }'

# Response:
{
  "success": true,
  "token": "eyJhbGciOiJ...",
  "teamUser": {
    "id": 42,
    "email": "parinitha@mysmarthealth.in",
    "firstName": "Parinitha",
    "role": "Team Member",
    "department": "Customer Support"
  }
}
```

### Test 2: Verify RocketChat Agent Status

```bash
curl -s http://localhost:8001/api/v1/livechat/users/agent \
  -H "X-Auth-Token: $TOKEN" \
  -H "X-User-Id: $USER_ID" | jq '.users[] | select(.username=="parinitha_smarthealth")'

# Response:
{
  "_id": "RC_USER_ID_123",
  "username": "parinitha_smarthealth",
  "name": "Parinitha Kumar",
  "status": "online",
  "email": "parinitha@mysmarthealth.in"
}
```

### Test 3: Verify Linkage

```bash
curl -X POST http://localhost:8888/api/team/link-to-rocketchat \
  -H "Authorization: Bearer $TEAM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "teamUserId": 42,
    "rocketchatUserId": "RC_USER_ID_123",
    "rocketchatUsername": "parinitha_smarthealth"
  }'

# Response:
{
  "success": true,
  "message": "Team user linked to RocketChat agent",
  "linking": {
    "teamUserEmail": "parinitha@mysmarthealth.in",
    "rocketchatUsername": "parinitha_smarthealth",
    "linkedAt": "2026-02-15T10:30:00.000Z"
  }
}
```

### Test 4: Chat Flow

1. **WhatsApp user sends message**
   ```
   Message: "Hi, I need help with my prescription"
   ```

2. **Message arrives at Mediczy**
   ```
   POST /api/support/webhook/whatsapp
   User: +91XXXXXXXXXX
   ```

3. **Mediczy sends to RocketChat**
   ```
   POST https://smart-chat.live/hooks/[WEBHOOK_ID]
   Team User Phone: +91XXXXXXXXXX
   Message in #livechat channel
   ```

4. **Parinitha sees notification**
   - RocketChat shows new livechat from patient
   - Parinitha accepts and responds

5. **Response goes back to WhatsApp**
   ```
   POST /api/support/webhook/rocketchat
   Body: {
     "msg": "Parinitha's response",
     "roomName": "patient_phone"
   }
   ```

6. **WhatsApp user receives response**
   ```
   WhatsApp Message: "Parinitha's response"
   ```

---

## Complete Setup Checklist

- [ ] **Mediczy:** Create team user `parinitha@mysmarthealth.in` (role: 'team')
- [ ] **RocketChat:** Create user `parinitha_smarthealth`
- [ ] **RocketChat:** Register as livechat agent
- [ ] **RocketChat:** Set online status (🟢)
- [ ] **Mediczy Backend:** Link team user to RocketChat agent (metadata.rocketchatUserId)
- [ ] **Test:** Team user can login to Mediczy
- [ ] **Test:** Team user appears in RocketChat agent list
- [ ] **Test:** WhatsApp message routes to RocketChat livechat
- [ ] **Test:** Parinitha can reply to WhatsApp users
- [ ] **Test:** Responses reach WhatsApp users

---

## Team User vs Standard Agent

| Feature | Team User | Standard User |
|---------|-----------|---------------|
| **Login** | `/api/team/login` | `/api/user/login` |
| **Dashboard** | Team Portal | Patient Dashboard |
| **RocketChat Link** | YES (via metadata) | NO |
| **Multiple Roles** | YES (team + agent) | Single role |
| **Permissions** | Granular team perms | Fixed user perms |
| **Support Access** | Full backend access | Limited |
| **Department** | Yes | No |
| **Designation** | Support Agent, etc | N/A |

---

## Parinitha's Full Setup Summary

```
┌──────────────────────────────────────────────────────────┐
│        PARINITHA TEAM USER AGENT SETUP                   │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  MEDICZY (Internal)                                      │
│  ├─ Email: parinitha@mysmarthealth.in                   │
│  ├─ Role: team                                           │
│  ├─ Department: Customer Support                         │
│  ├─ Status: Active                                       │
│  └─ Login: /api/team/login                               │
│                                                            │
│  ROCKETCHAT (External)                                   │
│  ├─ Username: parinitha_smarthealth                      │
│  ├─ Email: parinitha@mysmarthealth.in                    │
│  ├─ Role: Livechat Agent                                 │
│  ├─ Status: Online 🟢                                    │
│  └─ ID: RC_USER_ID_123                                   │
│                                                            │
│  LINKAGE (Backend Metadata)                              │
│  ├─ rocketchatUserId: RC_USER_ID_123                     │
│  ├─ rocketchatUsername: parinitha_smarthealth            │
│  ├─ isRocketchatAgent: true                              │
│  └─ linkedAt: 2026-02-15T10:30:00Z                       │
│                                                            │
│  CHAT FLOW                                               │
│  ├─ WhatsApp User → Message → Mediczy Backend            │
│  ├─ → RocketChat Omnichannel 📱                          │
│  ├─ → Parinitha (Agent) 👤                               │
│  ├─ → Response → Mediczy Backend                         │
│  └─ → WhatsApp User 📱                                   │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Issue: Team user can't login

**Error:**
```json
{
  "success": false,
  "message": "Access denied. Team member privileges required."
}
```

**Solution:**
- Check if `role: 'team'` is set in database
- Check if `isTeam: true` flag exists in metadata
- Verify password is correct

### Issue: User created but not appearing as RocketChat agent

**Cause:** Agent registration failed

**Solution:**
```bash
# Check if user exists in RocketChat
curl -s https://smart-chat.live/api/v1/users.list \
  -H "X-Auth-Token: $TOKEN" | jq '.users[] | select(.username=="parinitha_smarthealth")'

# Re-register as agent
curl -X POST https://smart-chat.live/api/v1/livechat/users/agent \
  -H "X-Auth-Token: $TOKEN" \
  -H "X-User-Id: $USER_ID" \
  -d '{"username":"parinitha_smarthealth"}'
```

### Issue: Messages not routing to agent

**Cause:** Linkage metadata missing

**Solution:**
```bash
# Link team user to RC agent via endpoint
curl -X POST http://localhost:8888/api/team/link-to-rocketchat \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"teamUserId":42,"rocketchatUserId":"RC_ID","rocketchatUsername":"parinitha_smarthealth"}'
```

---

## Next Steps

1. **Add multiple team agents** - Repeat setup for more support staff
2. **Department routing** - Configure different departments (Support, Billing, Emergency)
3. **Agent availability** - Implement queue management and availability tracking
4. **Performance monitoring** - Track response times, chat metrics
5. **Team training** - Onboard Parinitha on RocketChat interface and chat workflows

---

## Files Involved

- [server/models/user.model.intelligent.js](server/models/user.model.intelligent.js) - User model
- [server/routes/team.route.js](server/routes/team.route.js) - Team endpoints (add new routes)
- [server/services/omnichannel-chat.service.js](server/services/omnichannel-chat.service.js) - RocketChat integration
- [server/routes/admin.route.js](server/routes/admin.route.js) - Admin team creation
- [setup-team-agent.mjs](setup-team-agent.mjs) - New setup script

---

## Quick Start

```bash
# 1. Create team user (via admin API or dashboard)
# 2. Run setup script
node setup-team-agent.mjs

# 3. Parinitha logs in
# Email: parinitha@mysmarthealth.in
# Password: SecureTeamPassword123!
# URL: https://localhost:3000/team/login

# 4. WhatsApp users start chatting
# They'll be routed to Parinitha in RocketChat
```

✅ **Status:** Ready to set up team user agents!
