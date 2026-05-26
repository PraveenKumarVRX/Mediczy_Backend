# Cloud Mother - Local AI Node Multi-Tenancy System

## Overview

The Cloud Mother architecture enables hospitals to deploy local AI compute nodes while maintaining central cloud oversight. This provides:

- **Offline-First AI**: AI processing continues even without internet connectivity
- **Data Residency**: Patient data stays on-premise for compliance
- **Low Latency**: Local processing reduces response times
- **Cost Efficiency**: Reduce cloud compute costs for high-volume hospitals
- **Central Management**: Cloud Mother manages all nodes from a single dashboard

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUD MOTHER (Central)                       │
│                    api.mediczy.com                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Node Mgmt   │  │ Routing     │  │ Config      │             │
│  │ Service     │  │ Service     │  │ Sync        │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                          │                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │            PostgreSQL Database                    │           │
│  │  - local_ai_nodes     - ai_routing_rules        │           │
│  │  - ai_node_heartbeats - ai_node_api_keys        │           │
│  │  - ai_node_sync_logs                            │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + API Keys
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Hospital A    │    │ Hospital B    │    │ Hospital C    │
│ Local AI Node │    │ Local AI Node │    │ Local AI Node │
│ (ON_PREMISE)  │    │ (EDGE)        │    │ (HYBRID)      │
├───────────────┤    ├───────────────┤    ├───────────────┤
│ - Indic-Gemma │    │ - Whisper     │    │ - Full Stack  │
│ - Whisper     │    │ - TinyLlama   │    │ - GPU Enabled │
│ - CPU-only    │    │ - ARM CPU     │    │ - HA Setup    │
└───────────────┘    └───────────────┘    └───────────────┘
```

## Database Schema

### Tables

1. **local_ai_nodes** - Registry of all AI nodes
   - Node identity and configuration
   - Health metrics and status
   - Capabilities and installed models

2. **ai_routing_rules** - Request routing configuration
   - Per-hospital or global rules
   - Routing strategies (PREFER_LOCAL, PREFER_CLOUD, etc.)
   - Fallback strategies

3. **ai_node_heartbeats** - Health monitoring time-series
   - CPU/Memory/GPU usage
   - Request latency and error rates
   - Queue length and active requests

4. **ai_node_api_keys** - Secure authentication
   - Hashed API keys with prefixes
   - Scopes and rate limits
   - Expiration and revocation tracking

5. **ai_node_sync_logs** - Sync audit trail
   - Config push, model updates
   - Success/failure tracking

## API Endpoints

### Node Management (Hospital Admin)

```
POST   /api/ai-nodes/register          - Register new node
GET    /api/ai-nodes                   - List nodes
GET    /api/ai-nodes/:id/health        - Node health details
PATCH  /api/ai-nodes/:id/config        - Update configuration
POST   /api/ai-nodes/:id/deactivate    - Deactivate node
POST   /api/ai-nodes/:id/reactivate    - Reactivate node
POST   /api/ai-nodes/:id/api-keys      - Generate API key
```

### Node Communication (Local Nodes)

```
POST   /api/ai-nodes/heartbeat         - Send heartbeat (API Key auth)
```

### AI Request Routing

```
POST   /api/ai-nodes/route             - Route AI request
GET    /api/ai-nodes/check-availability - Check node availability
GET    /api/ai-nodes/stats/routing     - Routing statistics
```

## Routing Strategies

| Strategy       | Description                              |
| -------------- | ---------------------------------------- |
| `PREFER_LOCAL` | Try local node first, fallback to cloud  |
| `PREFER_CLOUD` | Try cloud first, fallback to local       |
| `LOCAL_ONLY`   | Only use local node, fail if unavailable |
| `CLOUD_ONLY`   | Only use cloud, never route to local     |
| `ROUND_ROBIN`  | Distribute between local and cloud       |

## Fallback Strategies

| Strategy | Description                        |
| -------- | ---------------------------------- |
| `CLOUD`  | Fallback to cloud AI services      |
| `QUEUE`  | Queue request for later processing |
| `FAIL`   | Return error immediately           |

## Node Types

| Type         | Description            | Use Case                               |
| ------------ | ---------------------- | -------------------------------------- |
| `ON_PREMISE` | Full server deployment | Large hospitals with IT infrastructure |
| `EDGE`       | Compact edge device    | Clinics, mobile units                  |
| `HYBRID`     | Cloud + Local          | Partial offline capability             |
| `MOBILE`     | Android tablet/phone   | Field workers, ambulances              |

## Capabilities

- `SCRIBE` - Medical transcription and note generation
- `TRANSCRIPTION` - Audio to text conversion
- `PRESCRIPTION` - Prescription generation
- `CHAT` - Conversational AI
- `IMAGE_ANALYSIS` - Medical image analysis

## Security

### API Key Authentication

Local nodes authenticate using API keys:

```
Authorization: X-API-Key: mczn_<base64_key>
```

API keys have:

- **Prefix**: First 8 chars for identification
- **Hash**: bcrypt hash stored in database
- **Scopes**: Limited permissions (heartbeat, sync, ai_request)
- **Expiration**: Auto-expire after configured period
- **Rate Limits**: Per-minute request limits

### Network Security

- All communication over HTTPS
- VPN/private network for on-premise nodes
- TLS client certificates (optional)
- IP allowlisting for cloud endpoints

## Local Node Setup

### 1. Register Node

```bash
curl -X POST https://api.mediczy.com/api/ai-nodes/register \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "hospitalId": 123,
    "hospitalName": "Apollo Chennai",
    "endpoint": "https://ai.apollo.local:8006",
    "nodeType": "ON_PREMISE",
    "capabilities": ["SCRIBE", "TRANSCRIPTION"]
  }'
```

Response includes one-time API key.

### 2. Configure Local Node

```yaml
# /etc/mediczy-ai-node/config.yaml
node_code: MCZ-123-ABC123
api_key: mczn_<your_api_key>
cloud_mother_url: https://api.mediczy.com
heartbeat_interval_seconds: 30
models_path: /opt/mediczy/models
log_level: info
```

### 3. Start Node Service

```bash
systemctl start mediczy-ai-node
```

### 4. Verify in Dashboard

Cloud Mother dashboard shows node status as ACTIVE after first heartbeat.

## Heartbeat Protocol

Local nodes send heartbeats every 30 seconds:

```json
POST /api/ai-nodes/heartbeat
X-API-Key: mczn_<key>

{
  "status": "HEALTHY",
  "metrics": {
    "cpu_usage": 45,
    "memory_usage": 62,
    "gpu_usage": 30,
    "disk_usage": 55
  },
  "activeRequests": 3,
  "queueLength": 0,
  "errorRate": 0.5,
  "avgResponseTime": 120
}
```

Response may include:

- Configuration updates
- Pending commands
- Model update notifications

## Offline Behavior

When a local node loses connectivity to Cloud Mother:

1. **Continue Processing**: Node processes requests locally
2. **Queue Syncs**: Sync logs queued for later upload
3. **Local Auth**: Cached API key validation continues
4. **Graceful Degradation**: Status shown as OFFLINE in dashboard

When connectivity restored:

1. Heartbeat resumes
2. Queued syncs uploaded
3. Config updates pulled
4. Status updates to ACTIVE

## Monitoring

### Health Metrics

- CPU/Memory/GPU utilization
- Request latency (p50, p95, p99)
- Error rate percentage
- Queue length and throughput
- Uptime and availability

### Alerts

Configure alerts for:

- Node offline > 5 minutes
- CPU/Memory > 80%
- Error rate > 5%
- High latency > 5s

## Files Created

### Backend

| File                                                       | Purpose                 |
| ---------------------------------------------------------- | ----------------------- |
| `server/migrations/cloud-mother-local-ai-nodes-v2.sql`     | Database migration      |
| `server/models/postgres/localAiNode.model.postgres.js`     | Node model              |
| `server/models/postgres/aiRoutingRule.model.postgres.js`   | Routing rules model     |
| `server/models/postgres/aiNodeSyncLog.model.postgres.js`   | Sync logs model         |
| `server/models/postgres/aiNodeHeartbeat.model.postgres.js` | Heartbeats model        |
| `server/models/postgres/aiNodeApiKey.model.postgres.js`    | API keys model          |
| `server/models/postgres/cloudMother.models.index.js`       | Models index            |
| `server/services/aiNodeManager.service.js`                 | Node management service |
| `server/services/aiRouting.service.js`                     | Request routing service |
| `server/routes/local-ai-node.route.js`                     | API routes              |
| `server/middleware/aiRouting.middleware.js`                | Routing middleware      |

### Frontend

| File                                                       | Purpose         |
| ---------------------------------------------------------- | --------------- |
| `client/src/services/localAiNode.service.ts`               | API client      |
| `client/src/components/hospital/LocalAiNodeManagement.tsx` | Admin dashboard |

## Usage Examples

### Route AI Request Through Local Node

```typescript
import aiRoutingService from "./services/aiRouting.service";

const result = await aiRoutingService.routeRequest({
  hospitalId: 123,
  requestType: "SCRIBE",
  priority: "NORMAL",
  payload: {
    audio_base64: "...",
    language: "hi",
  },
  userId: 456,
});

console.log(result.routedTo); // { nodeId: '...', type: 'LOCAL' }
```

### Check Local Node Availability

```typescript
const hasNode = await aiRoutingService.hasLocalNode(hospitalId, "SCRIBE");
if (hasNode) {
  // Route to local node
} else {
  // Use cloud
}
```

## Deployment Checklist

- [ ] Run database migration
- [ ] Deploy backend services
- [ ] Configure firewall for node communication
- [ ] Set up VPN/private network (for on-premise)
- [ ] Register first node
- [ ] Install node software on hospital server
- [ ] Configure node with API key
- [ ] Verify heartbeat in dashboard
- [ ] Test AI request routing
- [ ] Set up monitoring alerts

---

**Version**: 1.0.0  
**Date**: January 2026  
**Author**: Mediczy Engineering Team
