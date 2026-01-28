# Healthcare Data Verification Implementation

## Summary
Three verification methods have been implemented as requested:
- **Option 2**: Web Scraping (Practo, JustDial, Google Maps)
- **Option 3**: Government APIs (NMC, NABH, NABL)
- **Option 4**: Crowdsource Verification (User Reports, Profile Claims, Reviews)

---

## Option 2: Web Scraping
**Script**: `/scripts/option2_web_scraping.py`

### Sources:
| Source | Type | Data Extracted |
|--------|------|----------------|
| **Practo** | Doctors & Hospitals | Name, Specialization, Experience, Fees, Ratings, Profile URL |
| **JustDial** | Businesses | Name, Address, Ratings (Phone requires Selenium) |
| **Google Maps** | All | Generates search URLs for verification |

### Usage:
```bash
cd /home/ubuntu/Mediczy
python3 scripts/option2_web_scraping.py

# Options:
# 1 - Verify Hospitals
# 2 - Verify Doctors
# 3 - Both
```

### How it works:
1. Fetches unverified records from database
2. Searches each source for matching entries
3. Stores verification results in `metadata` column as JSON
4. Marks entities as `web_verified: true/false`

---

## Option 3: Government APIs
**Script**: `/scripts/option3_government_verification.py`

### Sources:
| Source | Verifies | URL |
|--------|----------|-----|
| **NMC** (National Medical Commission) | Doctors | https://www.nmc.org.in/information-desk/indian-medical-register/ |
| **NABH** (National Accreditation Board for Hospitals) | Hospitals | https://www.nabh.co/AccreditedHospitals.aspx |
| **NABL** (National Accreditation Board for Labs) | Labs | https://www.nabl-india.org/ |

### State Medical Councils:
- Tamil Nadu: https://tnmc.org.in
- Karnataka: https://kmc.karnataka.gov.in
- Maharashtra: https://mciregistration.nic.in
- Delhi: https://dmc.delhi.gov.in
- Kerala: https://tmc.kerala.gov.in

### Usage:
```bash
cd /home/ubuntu/Mediczy
python3 scripts/option3_government_verification.py

# Options:
# 1 - Verify Doctors (NMC)
# 2 - Verify Hospitals (NABH)
# 3 - Verify Labs (NABL)
# 4 - All verifications
# 5 - Show verification URLs only
```

### Verification Fields Added:
- `nmc_verified` - Doctor registered with NMC
- `nabh_accredited` - Hospital has NABH accreditation
- `nabl_accredited` - Lab has NABL accreditation

---

## Option 4: Crowdsource Verification
**Schema**: `/scripts/option4_crowdsource_schema.sql`
**API Routes**: `/server/routes/verificationRoutes.js`

### Database Tables Created:

| Table | Purpose | Records |
|-------|---------|---------|
| `verification_reports` | Users report incorrect info | 0 |
| `profile_claims` | Doctors/hospitals claim profiles | 0 |
| `verification_badges` | Verification badges (verified, claimed, NABH, etc.) | 8 |
| `provider_reviews` | User ratings and reviews | 0 |
| `community_verifications` | Community voting on data accuracy | 0 |

### API Endpoints:

#### Reports (Report Incorrect Info)
```
POST /api/verification/report     - Submit a report
GET  /api/verification/reports/:type/:id - Get reports (admin)
```

#### Profile Claims
```
POST /api/verification/claim      - Submit claim request
GET  /api/verification/claim/status/:id - Check claim status
```

#### Reviews & Ratings
```
POST /api/verification/review     - Submit a review
GET  /api/verification/reviews/:type/:id - Get reviews
```

#### Community Verification
```
POST /api/verification/community-vote - Vote on data accuracy
GET  /api/verification/community-stats/:type/:id - Get stats
```

#### Badges & Summary
```
GET /api/verification/badges/:type/:id  - Get verification badges
GET /api/verification/summary/:type/:id - Full verification summary
```

### Verification Badges Available:
- `verified` - Profile verified by Mediczy
- `claimed` - Profile claimed by owner
- `nabh_accredited` - NABH accredited hospital
- `nabl_accredited` - NABL accredited lab
- `nmc_registered` - NMC registered doctor
- `top_rated` - High user ratings
- `trusted` - Trusted provider
- `community_verified` - Verified by community

---

## Integration with Existing Data

### Hospitals Verification Summary View:
```sql
SELECT * FROM hospital_verification_summary WHERE city = 'Chennai';
```

Shows: unique_id, hospital_name, nabh_accredited, web_verified, profile_claimed, review_count, avg_rating, community_confirmations

### Doctors Verification Summary View:
```sql
SELECT * FROM doctor_verification_summary WHERE specialization ILIKE '%cardio%';
```

Shows: unique_id, full_name, specialization, nmc_verified, web_verified, profile_claimed, review_count, avg_rating

---

## Quick Start

### Run All Verifications:
```bash
# 1. Web Scraping (Option 2)
cd /home/ubuntu/Mediczy
echo "3" | python3 scripts/option2_web_scraping.py

# 2. Government APIs (Option 3)
echo "4" | python3 scripts/option3_government_verification.py

# 3. Crowdsource - Tables already created!
# API routes available at /api/verification/*
```

### Add Verification Routes to Express App:
```javascript
// In server/index.js or server/app.js
const verificationRoutes = require('./routes/verificationRoutes');
app.use('/api/verification', verificationRoutes);
```

---

## Rate Limits & Notes

| Source | Rate Limit | Notes |
|--------|------------|-------|
| Practo | 1-2 sec delay | Anti-scraping measures may require Selenium |
| JustDial | 1-2 sec delay | Phone numbers obfuscated (needs Selenium) |
| NMC | Manual | Requires CAPTCHA - generates verification URLs |
| NABH | ~1 sec delay | Searches accredited hospitals list |
| NABL | ~1 sec delay | Form-based search |

---

## Current Data Status

| Entity | Total | Web Verified | Govt Verified |
|--------|-------|--------------|---------------|
| Hospitals | 10,769 | 0 (run script) | 0 (run script) |
| Doctors | 594 | 0 (run script) | 0 (run script) |
| Labs | 2,400 | 0 | 0 (run script) |
| Clinics | 547 | 0 | N/A |

Run the verification scripts to populate verification data!
