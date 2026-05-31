# Prisma Parity Gap Matrix (Execution Tracker)

Date: 2026-05-31
Scope: Phase 5.2 execution tracking artifact

## Baseline Counts

- Sequelize-side model files under `server/models`: 138 files
- Prisma model declarations in `nestjs-app/prisma/schema.prisma`: 73 models

Note:
- The Sequelize side includes duplicates/variants (`.intelligent`, `.enhanced`, `.postgres`, dept submodules, index/association helpers).
- This initial matrix is intentionally conservative and is used to drive closure work, not as final parity proof.

## Verified Prisma Inventory (73)

- Achievement
- AiRoutingThreshold
- Ambulance
- AnonymousPatient
- Appointment
- Clinic
- Corporate
- CorporatePlanSponsorship
- DataDeletionRequest
- Doctor
- DoctorAvailabilitySlot
- DoctorSchedule
- FamilyMember
- HealthCoinsTransaction
- HealthReading
- Homecare
- HomecareService
- Hospital
- InsuranceClaim
- InsurancePolicy
- Lab
- LabOrder
- LabTest
- LookupValue
- MedicalEmbedding
- MembershipPlan
- Notification
- PatientAllergy
- PatientCondition
- PatientConsent
- PatientMedication
- Pharmacy
- PharmacyInventory
- PlatformTenant
- Role
- Tenant
- User
- UserAchievement
- UserSubscription
- UserWallet
- VitalSign
- Wearable
- Address
- DoctorAssistant
- OrganizationAdmin
- AuditLog
- EhrRecord
- PatientMedicalRecord
- HealthDiary
- Prescription
- PrescriptionDispensing
- Medication
- LocalAiNode
- AiNodeApiKey
- AiNodeHeartbeat
- AiNodeSyncLog
- PatientNote
- Report
- MedicalReport
- ReferralCode
- Ticket
- QueueEntry
- Coupon
- CouponUsage
- UserActivityLog
- Leaderboard
- Device
- CommunicationLog
- ModuleAccess
- UserAssociation
- TeamMember
- TenantPartner
- PreAuthorization

## Execution Delta (2026-05-31)

Added in this batch:

- `Address` (`addresses`)
- `DoctorAssistant` (`doctor_assistants`)
- `OrganizationAdmin` (`organization_admins`)
- `AuditLog` (`audit_logs`)

Added in subsequent batch:

- `EhrRecord` (`ehr_records`)
- `PatientMedicalRecord` (`patient_medical_records`)
- `HealthDiary` (`health_diary`)
- `Prescription` (`prescriptions`)
- `PrescriptionDispensing` (`prescription_dispensing`)
- `Medication` (`medications`)

Added in latest batch:

- `LocalAiNode` (`local_ai_nodes`)
- `AiNodeApiKey` (`ai_node_api_keys`)
- `AiNodeHeartbeat` (`ai_node_heartbeats`)
- `AiNodeSyncLog` (`ai_node_sync_logs`)

Added in current batch:

- `PatientNote` (`patient_notes`)
- `Report` (`reports`)
- `MedicalReport` (`medical_reports`)

Added in latest batch:

- `ReferralCode` (`referral_codes`)
- `Ticket` (`tickets`)
- `QueueEntry` (`queue_entries`)

Added in current batch:

- `Coupon` (`coupons`)
- `CouponUsage` (`coupon_usages`)
- `UserActivityLog` (`user_activity_logs`)
- `Leaderboard` (`leaderboards`)

Added in final batch:

- `Device` (`devices`)
- `CommunicationLog` (`communication_logs`)
- `ModuleAccess` (`module_access`)
- `UserAssociation` (`user_associations`)
- `TeamMember` (`team_members`)
- `TenantPartner` (`tenant_partners`)
- `PreAuthorization` (`pre_authorizations`)

Validation:

- `npx prisma validate --schema prisma/schema.prisma` passes (with `DATABASE_URL` provided in command env).
- Current recount: `grep -n '^model ' nestjs-app/prisma/schema.prisma | wc -l` => `73`.

Status:

- Phase 5.2 Prisma model-count target achieved (`73/73`).

## Initial Gap Candidates (Normalized from Sequelize Filenames)

These are candidate model domains found on Sequelize side that are not currently represented as Prisma model names after normalization:

- address
- admin
- aiRoutingRule
- ambulance-service
- assistant
- auditLog
- bed
- billing
- broker-integration
- chat
- communication-log
- consultationRecording
- coupon
- coupon-usage
- crm
- device
- doctor-assistant
- ehr
- ehrRecord
- email
- email inbox/settings variants
- fitnessData
- health-camp
- health-challenge
- health-goal
- healthRiskAssessment
- insurance-broker
- insurance-company
- insurance portal artifacts
- leaderboard
- medicalRecord
- ngo
- nurse
- otp
- patient
- preauthorization
- prescription
- prescriptionDispensing
- psu
- queue-management
- referral-code
- team-member
- ticket
- tpa
- user-activity-log
- user-association
- user goal/challenge progress artifacts
- vitalsRecord
- whatsapp template/number artifacts

## Next Batch Plan

1. Build authoritative Sequelize model list (exclude helper/index/association files).
2. Split candidate gaps into:
   - true missing business models
   - non-model helpers/duplicates
3. Prioritize missing core domains for Prisma addition:
   - auth/session/audit
   - prescription/ehr/medication
   - assistant/team/admin artifacts
   - insurance broker/company extensions
4. Recount after each batch:

```bash
cd /home/ubuntu/Mediczy
grep -n '^model ' nestjs-app/prisma/schema.prisma | wc -l
```

## Exit Criteria for Phase 5.2

- Prisma model count reaches 73.
- Gap matrix has zero unresolved true-model candidates.
- `prisma validate` and `prisma generate` pass in `nestjs-app`.
