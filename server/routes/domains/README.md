# Route Domain Architecture

This directory contains **domain router files** — each aggregates related routes into a single Express router that app.js can mount with one line.

## Domains

| Domain file | Covers | Routes under |
|---|---|---|
| `patient.domain.js` | User auth, wallet, appointments, lab, family, fitness | `/api/users`, `/api/appointments`, `/api/wallet`, etc. |
| `doctor.domain.js` | Doctor portal, scribe, imaging, clinical workflow | `/api/doctors`, `/api/doctor/*`, `/api/scribe`, etc. |
| `admin.domain.js` | Admin portal, team portal, CRM, super-admin | `/api/admin`, `/api/team`, `/api/crm`, etc. |
| `providers.domain.js` | Hospital, clinic, lab, pharmacy, ambulance, homecare | `/api/hospital`, `/api/clinic`, `/api/labs`, etc. |
| `corporate.domain.js` | Corporate portal, insurance | `/api/corporate`, `/api/insurance`, etc. |
| `hmis.domain.js` | HMIS inpatient (ADT, beds, OT, ICU, ER, nursing) | `/api/v1/adt`, `/api/v1/beds`, etc. |
| `ai.domain.js` | AI health, triage, brain, governance, telemetry | `/api/ai`, `/api/medical-ai`, etc. |

## Migration strategy

Domain files are **pass-through routers** — they import and re-mount existing route files at the same paths. No logic changes. Each file is a safe drop-in.

**How to migrate a section in app.js:**
1. Ensure the domain file lists all routers for that section
2. In app.js, replace the individual `app.use()` calls with a single domain mount:
   ```js
   import patientDomain from './routes/domains/patient.domain.js';
   app.use('/api', patientDomain);
   ```
3. Remove the individual imports from app.js for that domain

**Do NOT rush the migration.** Each domain should be migrated, deployed, and smoke-tested before the next one.

## Target state

app.js should eventually contain:
```js
app.use('/api', authDomain);      // auth flows
app.use('/api', patientDomain);   // patient-facing
app.use('/api', doctorDomain);    // doctor portal
app.use('/api', adminDomain);     // admin + team + CRM
app.use('/api', providersDomain); // hospital/clinic/lab/pharmacy
app.use('/api', corporateDomain); // corporate + insurance
app.use('/api', aiDomain);        // AI features
app.use('/api', hmisDomain);      // inpatient HMIS
```
