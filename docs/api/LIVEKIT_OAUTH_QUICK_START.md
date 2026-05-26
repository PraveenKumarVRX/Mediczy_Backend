# LiveKit OAuth Integration - Quick Start Guide

## Top-Level Comparison

| Feature | Current JWT | OAuth Bridge | Strategy |
|---------|-------------|--------------|----------|
| **Implementation** | ✅ Done | 📋 Planned (1-2 weeks) | ADD OAuth as alternative |
| **Security** | ⚠️ Direct JWT | ✅ Through OAuth | Migrate to OAuth gradually |
| **Audit Trail** | ❌ Limited | ✅ Complete | Better compliance |
| **Token Revocation** | ⚠️ Complex | ✅ Instant | Use OAuth revocation |
| **Mobile Support** | ✅ Good | ✅ Better (PKCE) | Support both |
| **Maintenance** | ❌ 2 systems | ✅ 1 system | Simpler long-term |

## Recommended Implementation Path

### IMMEDIATE (This Week) - Add OAuth Bridge
```
Current: Browser → /api/video/livekit/token → LiveKit JWT
                         (JWT generated)

New:     Browser → OAuth JWT (1 hour) 
            ↓
         /api/video/token (NEW)
            ↓
         Generated LiveKit JWT (from OAuth)
            ↓
         LiveKit WebSocket connection
```

### Step 1: Create LiveKit OAuth Service (200 lines)
```javascript
// /server/services/livekit-oauth.service.js
- Convert OAuth token data → LiveKit JWT
- Validate user permissions
- Handle room membership
```

### Step 2: Add Bridge Endpoint (150 lines)
```javascript
// POST /api/video/token
// Input: Bearer <OAuth_JWT>
// Output: { access_token, expires_in, room }
```

### Step 3: Update Frontend Component
```typescript
// VideoConsultation.tsx
// Replace current: /api/video/livekit/token
// With: /api/video/token (OAuth bridge)
```

## SSO Architecture Summary

### Current State
```
3 Systems = 3 Auth Paths:
├─ Mediqzy Web → Session Cookie
├─ Rocket.Chat → Custom OAuth (WIP)
└─ LiveKit → JWT Token
```

### Recommended Future State
```
3 Systems = 1 Auth Path (OAuth):
├─ Mediqzy Web → OAuth JWT (1 hour)
├─ Rocket.Chat → OAuth JWT (1 hour)
└─ LiveKit → Exchanged from OAuth (2 hour)
```

## Implementation Phases

### Phase 1: OAuth Bridge (WEEKS 1-2) ⭐
**Deliverable**: OAuth → LiveKit token exchange working
- Create `livekit-oauth.service.js`
- Add `/api/video/token` endpoint
- Test with real LiveKit server
- Keep existing `/api/video/livekit/token` (backward compatible)

**Code Required**: ~350-400 lines
**Testing**: 200+ lines unit tests
**Risk**: LOW (non-breaking change)

### Phase 2: Unified Video UX (WEEKS 3-4)
**Deliverable**: Single OAuth flow for all video consultations
- Update frontend VideoConsultation component
- Integrate with Rocket.Chat OAuth
- Handle token refresh/expiry
- Add error recovery

**Code Required**: ~300-400 lines
**Testing**: Integration tests with real RC + LiveKit
**Risk**: LOW (backward compatible with Phase 1)

### Phase 3: Enterprise Features (WEEKS 5-8)
**Deliverable**: Multi-provider OAuth + audit logging
- Token refresh support
- Audit logging & compliance
- Role-based video permissions
- Admin dashboard

**Code Required**: ~600-800 lines
**Risk**: MEDIUM (adds complexity)

## Benefits Comparison

### For Users
✅ Single sign-on across all services
✅ No re-authentication needed for video
✅ Better security (shorter token life)
✅ Seamless experience

### For Developers
✅ Single token type (OAuth JWT)
✅ Easier to maintain (one auth system)
✅ Better debugging (trace OAuth token through system)
✅ Simpler compliance audits

### For Business
✅ Enterprise SSO support (future)
✅ Compliance-ready (audit trail)
✅ Better security posture
✅ Multi-provider OAuth (OKTA, Azure AD, etc.)

## Configuration Needed

### Add to `.env`:
```bash
# LiveKit OAuth Configuration
OAUTH_LIVEKIT_ENABLED=true
LIVEKIT_TOKEN_TTL=7200
LIVEKIT_ENABLE_RECORDING=true
```

### Already Have:
```bash
LIVEKIT_API_KEY=API29FkbfieGsfq
LIVEKIT_API_SECRET=J1wqey7DBFq3UUmfhmQCiS...
LIVEKIT_URL=wss://video.mediqzy.com
```

## Success Metrics

| Metric | Target | Timeline |
|--------|--------|----------|
| Token Generation Time | <100ms | Phase 1 end |
| LiveKit Connection Success | >99.5% | Phase 2 end |
| Video Consultation Duration | Stable | Phase 2 end |
| Audit Log Completeness | 100% | Phase 3 end |
| Backward Compatibility | 100% | Throughout |

## Risk Assessment

### Risk: Low ✅
- Backward compatible (old JWT still works)
- Optional implementation (users can choose path)
- No migration of existing videos needed
- Rollback is simple (just disable OAuth bridge)

### Mitigation:
- Keep both endpoints active
- Gradual rollout to clients
- A/B testing capability
- Real-time monitoring

## Documentation Deliverables

1. ✅ **LIVEKIT_OAUTH_FEASIBILITY.md** (This document - 400+ lines)
   - Complete analysis
   - Implementation examples
   - Architecture diagrams

2. 📋 **LIVEKIT_SSO_INTEGRATION_GUIDE.md** (To be created)
   - Step-by-step implementation
   - Testing procedures
   - Troubleshooting

3. 📋 **PLATFORM_SSO_ARCHITECTURE.md** (To be created)
   - Unified SSO architecture
   - Multi-service authentication flow
   - Future multi-provider support

## Recommended Decision

✅ **IMPLEMENT PHASE 1 (OAuth Bridge)**

**Reasoning**:
- Low risk (backward compatible)
- Clear benefits (single auth system)
- Foundation for future enterprise features
- Unblocks multi-provider OAuth roadmap
- Minimal impact on production

**Timeline**: 1-2 weeks for complete Phase 1
**Resource**: 1-2 developers
**Testing**: 2-3 days QA

## Architecture Diagram (Recommended State)

```
┌─────────────────────────────────────────┐
│   UNIFIED MEDIQZY SSO ARCHITECTURE      │
└─────────────────────────────────────────┘

           PostgreSQL Master DB
                  │
         ┌────────┼────────┐
         │        │        │
         ▼        ▼        ▼
   ┌──────────────────────────────┐
   │  OAuth 2.0 Core Services     │
   ├──────────────────────────────┤
   │ /authorize    - User login   │
   │ /token        - Code → JWT   │
   │ /userinfo     - User profile │
   └────────┬─────────────────────┘
            │
    ┌───────┼───────┬────────┐
    │       │       │        │
    ▼       ▼       ▼        ▼
┌─────┐ ┌──────┐ ┌────┐ ┌──────────┐
│ Web │ │  RC  │ │ LK │ │ Audit    │
│     │ │ Chat │ │    │ │ Logging  │
├─────┤ ├──────┤ ├────┤ ├──────────┤
│OAuth│ │OAuth │ │OAuth│ │Complete  │
│JWT  │ │JWT   │ │→LK │ │Trail     │
│     │ │      │ │JWT │ │          │
└─────┘ └──────┘ └────┘ └──────────┘

All Systems:
✅ Single authentication entry point
✅ Unified token format (OAuth JWT)
✅ Simplified debugging
✅ Better compliance/audit
✅ Enterprise-ready
```

## Next Person Actions

1. **Review** this feasibility analysis (30 min)
2. **Decide** on Phase 1 implementation (decision point)
3. **If YES**: Create livekit-oauth.service.js (3-4 hours)
4. **Create** /api/video/token endpoint (2-3 hours)
5. **Test** with existing LiveKit deployment (2 hours)
6. **Update** frontend to use new endpoint (2-3 hours)
7. **Deploy** to staging (1 hour)
8. **Test** end-to-end (2 hours)

**Total Effort**: ~14-16 developer hours (1-2 weeks with testing)

---

**Document Status**: READY FOR IMPLEMENTATION ✅
**Recommendation**: PROCEED WITH PHASE 1 OAUTH BRIDGE
**Next Step**: Create `/server/services/livekit-oauth.service.js`
