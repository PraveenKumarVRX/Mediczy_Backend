# TPA Integration - Quick Start Guide

**Version**: 2.0 | **Status**: ✅ Production Ready | **Last Updated**: December 21, 2024

---

## 🚀 Quick Setup (5 Minutes)

### 1. Configure Credentials

Edit `/server/.env`:

```env
# Care Health Insurance
CARE_TPA_PARTNER_ID=your_partner_id
CARE_TPA_PARTNER_KEY=your_partner_key
CARE_TPA_ENV=production

# Future Generali India
FGI_TPA_API_KEY=your_api_key
FGI_TPA_CLIENT_ID=your_client_id
FGI_TPA_CLIENT_SECRET=your_client_secret
FGI_TPA_ENV=production

# GoDigit
GODIGIT_TPA_CLIENT_ID=your_client_id
GODIGIT_TPA_CLIENT_SECRET=your_client_secret
GODIGIT_TPA_PARTNER_CODE=your_partner_code
GODIGIT_TPA_ENV=production

# ICICI Lombard
ICICI_TPA_USERNAME=your_username
ICICI_TPA_PASSWORD=your_password
ICICI_TPA_PARTNER_CODE=your_partner_code
ICICI_TPA_ENV=production

# MediAssist
MEDIASSIST_TPA_USERNAME=your_username
MEDIASSIST_TPA_PASSWORD=your_password
MEDIASSIST_TPA_CLIENT_ID=your_client_id
MEDIASSIST_TPA_ENV=production

# Star Health
STARHEALTH_TPA_USERNAME=your_username
STARHEALTH_TPA_PASSWORD=your_password
STARHEALTH_TPA_PARTNER_ID=your_partner_id
STARHEALTH_TPA_ENV=production
```

### 2. Restart Server

```bash
pm2 restart mediczy-server --update-env
```

### 3. Verify

```bash
curl http://localhost:8000/api/tpa/providers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📋 Common Operations

### List All TPA Providers

```bash
curl -X GET http://localhost:8000/api/tpa/providers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Enrollment Details

```bash
curl -X POST http://localhost:8000/api/tpa/heritage/enrollment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policyNumber": "POL123456"
  }'
```

### Get E-Card

```bash
curl -X POST http://localhost:8000/api/tpa/care/ecard \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policyNumber": "CARE123",
    "memberId": "M456"
  }'
```

### Search Network Hospitals

```bash
curl -X POST http://localhost:8000/api/tpa/godigit/hospitals \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Mumbai",
    "state": "Maharashtra"
  }'
```

### Submit Claim Intimation

```bash
curl -X POST http://localhost:8000/api/tpa/godigit/claim-intimation \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policyNumber": "GD123",
    "memberId": "M456",
    "claimType": "cashless",
    "hospitalName": "Apollo Hospital",
    "dateOfAdmission": "2024-12-21",
    "ailmentDetails": "Cardiac surgery",
    "estimatedAmount": "100000",
    "contactNumber": "9876543210"
  }'
```

---

## 🎨 Frontend Component Usage

### Provider Selection

```tsx
import TPAProviderSelection from '@/components/tpa/TPAProviderSelection';

function MyPage() {
  const [providers, setProviders] = useState([]);
  
  return (
    <TPAProviderSelection
      multiSelect={true}
      onSelect={setProviders}
      selectedProviders={providers}
    />
  );
}
```

### Claim Submission

```tsx
import ClaimSubmissionUI from '@/components/tpa/ClaimSubmissionUI';

function ClaimsPage() {
  return (
    <ClaimSubmissionUI
      onSuccess={(claimNumber) => {
        console.log('Claim submitted:', claimNumber);
      }}
    />
  );
}
```

### E-Card Display

```tsx
import ECardDisplay from '@/components/tpa/ECardDisplay';

function ECardPage() {
  return (
    <ECardDisplay
      policyNumber="POL123"
      memberId="M456"
    />
  );
}
```

### Hospital Search

```tsx
import HospitalSearchComponent from '@/components/tpa/HospitalSearchComponent';

function HospitalsPage() {
  return <HospitalSearchComponent />;
}
```

---

## 🧪 Testing

### Quick Test

```bash
# Test TPA API endpoint
npm run test:tpa-api

# Or test specific TPA
curl http://localhost:8000/api/tpa/providers \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.providers'
```

### Run Test Suite

```bash
# All TPA tests
npm test -- tpa

# Specific test suite
npm test -- tpa-services.test.js
npm test -- tpa-aggregator.test.js
npm test -- tpa-routes.test.ts
```

---

## 🐛 Troubleshooting

### Issue: "Provider not found"
**Solution**: Check provider name spelling. Valid providers:
- `heritage`, `mdindia`, `healthindia`
- `care`, `fgi`, `godigit`, `icici`, `mediassist`, `starhealth`

### Issue: "Authentication failed"
**Solution**: 
1. Check credentials in `.env`
2. Ensure provider-specific env variables are set
3. Restart server: `pm2 restart mediczy-server --update-env`

### Issue: "Network error"
**Solution**:
1. Check internet connectivity
2. Verify TPA base URLs are accessible
3. Check if using correct environment (PROD/UAT)

### Issue: "Token expired"
**Solution**: Tokens auto-refresh. If persists:
1. Check token expiry settings
2. Verify system time is correct
3. Review logs: `pm2 logs mediczy-server`

---

## 📊 Available TPAs

| TPA | Status | Endpoints | Key Features |
|-----|--------|-----------|--------------|
| Heritage | ✅ | 7 | Basic suite |
| MD India | ✅ | 24 | Full suite |
| Health India | ✅ | 30 | Full suite |
| Care Health | ✅ | 40 | Token auth, documents |
| FGI | ✅ | 37 | Pre-auth, documents |
| GoDigit | ✅ | 22 | Payment gateway |
| ICICI Lombard | ✅ | 12 | Batch enrollment |
| MediAssist | ✅ | 5 | MediBuddy integration |
| Star Health | ✅ | 7 | Broker services |

**Total**: 9 TPAs | 184+ Endpoints

---

## 📁 File Locations

### Backend Services
```
server/services/
├── heritage-tpa.service.js
├── mdindia-tpa.service.js
├── healthindia-tpa.service.js
├── care-health-tpa.service.js
├── fgi-tpa.service.js
├── godigit-tpa.service.js
├── icici-tpa.service.js
├── mediassist-tpa.service.js
├── starhealth-tpa.service.js
└── tpa-aggregator.service.js
```

### Frontend Components
```
client/src/components/tpa/
├── TPAProviderSelection.tsx
├── ClaimSubmissionUI.tsx
├── ECardDisplay.tsx
├── HospitalSearchComponent.tsx
└── TPASidebar.tsx
```

### Tests
```
server/tests/
├── tpa-services.test.js
├── tpa-aggregator.test.js
└── tpa-routes.test.ts
```

---

## 🔗 Documentation Links

- **Complete Guide**: [TPA_INTEGRATION_COMPLETE.md](TPA_INTEGRATION_COMPLETE.md)
- **Implementation Summary**: [TPA_IMPLEMENTATION_SUMMARY.md](TPA_IMPLEMENTATION_SUMMARY.md)
- **Postman Analysis**: [API_Kits/Heritage_TPA/analysis/](API_Kits/Heritage_TPA/analysis/)

---

## 📞 Support

**Need Help?**
1. Check [TPA_INTEGRATION_COMPLETE.md](TPA_INTEGRATION_COMPLETE.md) for detailed docs
2. Review logs: `pm2 logs mediczy-server`
3. Check health: `curl http://localhost:8000/health`
4. Run tests: `npm test -- tpa`

---

**Quick Start Version**: 1.0  
**Compatible With**: Mediczy v1.0.0+  
**Node Version**: 18+  
**Last Verified**: December 21, 2024
