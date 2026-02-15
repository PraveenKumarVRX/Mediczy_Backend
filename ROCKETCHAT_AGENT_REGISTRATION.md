# How to Register Agents in RocketChat

## Quick Summary
RocketChat agents are registered using the **livechat API endpoints** with admin credentials. An agent must be a regular RocketChat user who is then assigned to handle livechat/omnichannel conversations.

---

## Method 1: Via RocketChat Admin UI (Easiest)

### Step 1: Create Agent User Account
1. Login to RocketChat: https://smart-chat.live/admin
2. Go to **Administration** → **Workspace** → **Users**
3. Click **New User**
4. Fill in:
   ```
   Name: Support Agent
   Username: support_agent_1
   Email: agent1@mediczy.com
   Password: StrongPassword123!
   ```
5. Click **Save**

### Step 2: Assign as Livechat Agent
1. Go to **Administration** → **Omnichannel** → **Agents**
2. Click **New Agent**
3. Select the user: `support_agent_1`
4. Click **Confirm**

### Step 3: Set Agent Online
1. Agent logs into RocketChat
2. Avatar menu → Set status to **Online**
3. Agent now appears available in livechat queue

---

## Method 2: Via API (Programmatic)

### Step 1: Create User via API

```bash
# Create agent user
curl -X POST https://smart-chat.live/api/v1/users.create \
  -H "X-Auth-Token: $AUTH_TOKEN" \
  -H "X-User-Id: $ADMIN_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "support_agent_1",
    "email": "agent1@mediczy.com",
    "password": "StrongPassword123!",
    "name": "Support Agent",
    "active": true
  }'

# Response:
{
  "user": {
    "_id": "USER_ID_123",
    "username": "support_agent_1",
    "email": "agent1@mediczy.com"
  },
  "success": true
}
```

### Step 2: Register as Livechat Agent

```bash
# Register as livechat agent
curl -X POST https://smart-chat.live/api/v1/livechat/users/agent \
  -H "X-Auth-Token: $AUTH_TOKEN" \
  -H "X-User-Id: $ADMIN_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "support_agent_1"
  }'

# Response:
{
  "user": {
    "_id": "USER_ID_123",
    "username": "support_agent_1"
  },
  "success": true
}
```

### Step 3: Set Online Status

```bash
# Set user online
curl -X POST https://smart-chat.live/api/v1/users.setStatus \
  -H "X-Auth-Token: $AUTH_TOKEN" \
  -H "X-User-Id: $ADMIN_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "support_agent_1",
    "status": "online"
  }'

# Response:
{
  "success": true
}
```

---

## Method 3: Via Node.js Backend Code

### Code in [omnichannel-chat.service.js](server/services/omnichannel-chat.service.js)

```javascript
/**
 * Register a user as livechat agent
 */
async registerAgent(username) {
  try {
    console.log(`📋 Registering ${username} as livechat agent...`);
    
    // Register as agent
    const response = await axios.post(
      `${this.rocketChatUrl}/api/v1/livechat/users/agent`,
      { username },
      { headers: this.getHeaders() }
    );

    console.log(`✅ Agent registered: ${username}`);
    return {
      success: true,
      agent: response.data.user
    };
  } catch (error) {
    console.error(`❌ Agent registration failed: ${error.message}`);
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
}

/**
 * Set agent online/offline status
 */
async setAgentStatus(username, status = 'online') {
  try {
    const response = await axios.post(
      `${this.rocketChatUrl}/api/v1/users.setStatus`,
      { username, status },
      { headers: this.getHeaders() }
    );

    console.log(`✅ ${username} set to ${status}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Status update failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get list of livechat agents
 */
async getAvailableAgents(department = null) {
  try {
    const params = department 
      ? { department: this.departments[department] } 
      : {};
    
    const response = await axios.get(
      `${this.rocketChatUrl}/api/v1/livechat/users/agent`,
      { params, headers: this.getHeaders() }
    );

    return {
      success: true,
      agents: response.data.users || []
    };
  } catch (error) {
    console.error('Get agents error:', error.message);
    return { success: false, agents: [] };
  }
}
```

### Usage Example

```javascript
// In your backend route or service
import omnichannelChatService from './omnichannel-chat.service.js';

// Register new agent
const result = await omnichannelChatService.registerAgent('support_agent_1');
if (result.success) {
  console.log(`✅ Agent registered: ${result.agent.username}`);
}

// Set online
await omnichannelChatService.setAgentStatus('support_agent_1', 'online');

// Get all available agents
const agents = await omnichannelChatService.getAvailableAgents();
console.log(`Available agents: ${agents.agents.length}`);
```

---

## Current Setup (Already Done)

### Default Agent: `support_admin`

The system already has a default agent configured:

```
Username: support_admin
Email: support@mediqzy.com
Status: Online
Role: Admin + Livechat Agent
Capabilities: All departments
```

**Verify status:**
```bash
curl -s https://smart-chat.live/api/v1/livechat/users/agent \
  -H "X-Auth-Token: YOUR_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID" | jq '.users[] | {username, _id, status}'
```

---

## Agent Configuration Options

### Department Assignment

```javascript
// Assign agent to specific department
const departmentMapping = {
  general: 'General Support',
  emergency: 'Emergency Support',
  appointments: 'Appointments',
  pharmacy: 'Pharmacy Orders',
  billing: 'Billing & Payments',
  technical: 'Technical Support'
};
```

### Agent Capabilities

Each agent can:
- ✅ See incoming livechat messages
- ✅ Respond to patients
- ✅ Set their online/offline status
- ✅ Transfer to other agents
- ✅ Close conversations
- ✅ View chat history

### Agent Limitations

- ❌ Cannot create new visitors (system does this automatically)
- ❌ Cannot modify other agents (need admin)
- ❌ Cannot change system settings

---

## Complete Agent Setup Script

### File: `setup-rocketchat-agents.mjs`

```javascript
#!/usr/bin/env node

import axios from 'axios';

const RC_URL = process.env.ROCKETCHAT_URL || 'https://smart-chat.live';
const RC_ADMIN_USER = process.env.ROCKETCHAT_ADMIN_USER || 'support_admin';
const RC_ADMIN_PASS = process.env.ROCKETCHAT_ADMIN_PASSWORD || 'Password@1234567';

async function getAdminAuth() {
  const response = await axios.post(`${RC_URL}/api/v1/login`, {
    user: RC_ADMIN_USER,
    password: RC_ADMIN_PASS
  });
  
  return {
    authToken: response.data.data.authToken,
    userId: response.data.data.userId
  };
}

async function createAgent(auth, agentData) {
  const { authToken, userId } = auth;
  
  console.log(`\n📋 Creating agent: ${agentData.username}`);
  
  try {
    // Step 1: Create user
    console.log('  Step 1: Creating user...');
    const userResponse = await axios.post(
      `${RC_URL}/api/v1/users.create`,
      {
        username: agentData.username,
        email: agentData.email,
        password: agentData.password,
        name: agentData.name,
        active: true
      },
      {
        headers: {
          'X-Auth-Token': authToken,
          'X-User-Id': userId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`  ✅ User created: ${userResponse.data.user._id}`);
    
    // Step 2: Register as agent
    console.log('  Step 2: Registering as livechat agent...');
    const agentResponse = await axios.post(
      `${RC_URL}/api/v1/livechat/users/agent`,
      { username: agentData.username },
      {
        headers: {
          'X-Auth-Token': authToken,
          'X-User-Id': userId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`  ✅ Registered as agent`);
    
    // Step 3: Set online
    console.log('  Step 3: Setting online status...');
    await axios.post(
      `${RC_URL}/api/v1/users.setStatus`,
      {
        username: agentData.username,
        status: 'online'
      },
      {
        headers: {
          'X-Auth-Token': authToken,
          'X-User-Id': userId,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`  ✅ Set to online status`);
    console.log(`✅ Agent setup complete: ${agentData.username}\n`);
    
    return true;
  } catch (error) {
    console.error(`  ❌ Error: ${error.response?.data?.error || error.message}\n`);
    return false;
  }
}

async function main() {
  console.log('🚀 RocketChat Agent Setup Script\n');
  
  try {
    // Get admin auth
    console.log('🔐 Authenticating as admin...');
    const auth = await getAdminAuth();
    console.log('✅ Authenticated\n');
    
    // Define agents to create
    const agentsToCreate = [
      {
        username: 'agent_john',
        email: 'john@mediczy.com',
        name: 'John - Support Agent',
        password: 'SecurePass123!'
      },
      {
        username: 'agent_sarah',
        email: 'sarah@mediczy.com',
        name: 'Sarah - Support Agent',
        password: 'SecurePass456!'
      },
      {
        username: 'agent_mike',
        email: 'mike@mediczy.com',
        name: 'Mike - Emergency Support',
        password: 'SecurePass789!'
      }
    ];
    
    // Create agents
    for (const agentData of agentsToCreate) {
      await createAgent(auth, agentData);
    }
    
    console.log('🎉 All agents setup complete!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();
```

### Usage

```bash
# Make executable
chmod +x setup-rocketchat-agents.mjs

# Run with default credentials
node setup-rocketchat-agents.mjs

# Or with custom credentials
ROCKETCHAT_URL=https://smart-chat.live \
ROCKETCHAT_ADMIN_USER=admin \
ROCKETCHAT_ADMIN_PASSWORD=password \
node setup-rocketchat-agents.mjs
```

---

## Verify Agent Registration

### Check via RocketChat UI

1. Login to https://smart-chat.live/admin
2. Go to **Administration** → **Omnichannel** → **Agents**
3. See list of registered agents

### Check via API

```bash
# Get all agents
curl -s https://smart-chat.live/api/v1/livechat/users/agent \
  -H "X-Auth-Token: $TOKEN" \
  -H "X-User-Id: $USER_ID" | jq '.'

# Response:
{
  "success": true,
  "users": [
    {
      "_id": "USER_ID_1",
      "username": "support_admin",
      "name": "Support Admin",
      "status": "online",
      "email": "support@mediqzy.com"
    },
    {
      "_id": "USER_ID_2",
      "username": "agent_john",
      "name": "John - Support Agent",
      "status": "online",
      "email": "john@mediczy.com"
    }
  ]
}
```

### Check via Node.js

```javascript
const omnichannelChatService = require('./server/services/omnichannel-chat.service');

const result = await omnichannelChatService.getAvailableAgents();
console.log('Available agents:', result.agents);
```

---

## Agent Privileges & Roles

### Livechat Agent Permissions

| Permission | Agent | Manager | Admin |
|-----------|-------|---------|-------|
| View livechat conversations | ✅ | ✅ | ✅ |
| Send messages | ✅ | ✅ | ✅ |
| Manage own status | ✅ | ✅ | ✅ |
| Transfer to other agent | ✅ | ✅ | ✅ |
| Close conversation | ✅ | ✅ | ✅ |
| View all agents | ✅ | ✅ | ✅ |
| Manage other agents | ❌ | ✅ | ✅ |
| Modify settings | ❌ | ❌ | ✅ |

---

## Troubleshooting

### Agent Not Appearing in Livechat

```bash
# Check if user exists
curl -s https://smart-chat.live/api/v1/users.list  \
  -H "X-Auth-Token: $TOKEN" \
  -H "X-User-Id: $USER_ID" | jq '.users[] | select(.username=="agent_john")'

# Check if registered as agent
curl -s https://smart-chat.live/api/v1/livechat/users/agent \
  -H "X-Auth-Token: $TOKEN" \
  -H "X-User-Id: $USER_ID" | jq '.users[] | select(.username=="agent_john")'

# Check status
curl -s https://smart-chat.live/api/v1/users.info?username=agent_john \
  -H "X-Auth-Token: $TOKEN" \
  -H "X-User-Id: $USER_ID" | jq '.user.status'
```

### Agent Shows But Not Online

```bash
# Set agent online
curl -X POST https://smart-chat.live/api/v1/users.setStatus \
  -H "X-Auth-Token: $TOKEN" \
  -H "X-User-Id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"username":"agent_john","status":"online"}'
```

### Cannot Create Agent (Permission Denied)

- Ensure you're using **admin credentials**
- Check admin token is not expired
- Verify `X-Auth-Token` and `X-User-Id` headers are correct

---

## Best Practices

✅ **Do:**
- Use strong passwords for agent accounts
- Set agents to **offline** if not working
- Create separate agent accounts (don't share)
- Regularly audit agent list
- Use meaningful usernames

❌ **Don't:**
- Use same password for all agents
- Leave test agents in production
- Give admin access to non-managers
- Use agent@mediczy.com for fake agents
- Register same user multiple times

---

## Quick Reference

| Task | API Endpoint | Method |
|------|-------------|--------|
| Create agent | `/api/v1/users.create` | POST |
| Register as livechat | `/api/v1/livechat/users/agent` | POST |
| Set status | `/api/v1/users.setStatus` | POST |
| Get all agents | `/api/v1/livechat/users/agent` | GET |
| Delete agent | `/api/v1/users.deactivate` | POST |
| Remove from livechat | `/api/v1/livechat/users/agent` | DELETE |

---

## Summary

**Steps to register an agent:**

1. Create RocketChat user account
2. Register as livechat agent via API
3. Set online status
4. Agent now appears in livechat queue

**Default Agent:** `support_admin` (already configured)

**Files Involved:**
- [omnichannel-chat.service.js](server/services/omnichannel-chat.service.js) - Backend code
- [ROCKETCHAT_USER_IDENTIFICATION.md](ROCKETCHAT_USER_IDENTIFICATION.md) - User identification
- RocketChat Admin Panel: https://smart-chat.live/admin

✅ **Status:** Agent registration system fully implemented and operational.
