# Mediczy Documentation Index

> **Total Documentation Files**: 437 organized markdown files  
> **Last Updated**: May 23, 2026

## 📚 Documentation Structure

This folder contains all Mediczy platform documentation, organized by category for easy navigation.

## Recent source-backed assessments

- [Exotel Contact Center implementation and activation (2026-10-20)](./deployment/CONTACT_CENTER_EXOTEL_2026-10-20.md) — source delivery, CT-01–18 status, infrastructure, remaining coding and live acceptance gates.
- [LiveKit voice implementation and activation (2026-10-20)](./deployment/CONTACT_CENTER_LIVEKIT_CLOSURE_2026-10-20.md) — advanced media, continuous STT, reception bots, campaigns/journeys and guarded biometrics; source delivery and explicit live/model acceptance gates.
- [LiveKit voice verification (2026-10-20)](./testing/CONTACT_CENTER_LIVEKIT_VERIFICATION_2026-10-20.json) — current tests, real synthetic RTC audio, CPU model smoke, migration rehearsal and source hashes.
- [Contact Center API](./api/CONTACT_CENTER_API.md) — CRM calling, queues, callbacks, recordings, transcript/AI/search and verified hook contracts.
- [Contact Center verification (2026-10-20)](./testing/CONTACT_CENTER_IMPLEMENTATION_2026-10-20.json) — synthetic test evidence and implementation hashes; no live-call acceptance.
- [MediQzy vs Comcent CE, VoiceAgent and Astradial (2026-10-20)](./audits/MEDIQZY_VS_COMCENT_VOICEAGENT_ASTRADIAL_GAPS_2026-10-20.md) — feature comparison, 18 prioritized communications workstreams, source limitations and implementation sequence.
- [Communications repository review evidence (2026-10-20)](./audits/COMMUNICATIONS_REPO_REVIEW_EVIDENCE_2026-10-20.json) — pinned upstream commits, 65 inspected-source hashes and synthetic privacy-check results.

- [Nursing implementation delivery and rollout record (2026-10-19)](./audits/NURSING_IMPLEMENTATION_DELIVERY_2026-10-19.md) — implementation coverage for NUR-01–18, verification evidence, and deployment gates.
- [Nursing production release and demo access (2026-10-19)](./deployment/NURSING_PRODUCTION_RELEASE_2026-10-19.md) — live migration, private image storage, Smart Hospital demo, verification and rollback.
- [Nursing bedside API](./api/NURSING_BEDSIDE_API.md) — assignments, chart signing, eMAR, handover, wounds, device review and export contracts.

- [Nursing: GitHub HMIS comparison, Mediqzy gaps, and implementation plan (2026-10-19)](./audits/NURSING_REPO_COMPARISON_GAPS_IMPLEMENTATION_PLAN_2026-10-19.md) — five repository references, current code findings, prioritized backlog, delivery gates, and test results.
- [Nursing repository review evidence manifest (2026-10-19)](./audits/NURSING_REPO_REVIEW_EVIDENCE_2026-10-19.json) — pinned commits, license observations, inspected-source hashes, and verification scope.

---

## 📂 Category Overview

### 🔐 [Authentication](./authentication/) - 15 files
OAuth2, password reset, OTP, SMS verification, and authentication flows.
- OAuth implementation guides
- Password reset flows
- OTP registration
- Multi-factor authentication
- JWT vs OAuth2 comparisons

### 👨‍⚕️ [Doctor Portal](./doctor/) - 19 files
Doctor-specific features, APIs, and portal documentation.
- Doctor portal setup
- Team & nurse management
- Doctor OAuth implementation
- API fixes and enhancements
- Slot management

### 🏥 [Hospital System](./hospital/) - 23 files
Hospital dashboards, validation, and management systems.
- Hospital portal setup
- Validation systems
- Sidebar configurations
- Dhyan Hospital setup
- Lab verification guides

### 🏢 [Clinic System](./clinic/) - 12 files
Multi-location clinic management and authentication.
- Clinic login systems
- Patient management
- Multiple login support
- Quick reference guides

### 🤒 [Patient Portal](./patient/) - 17 files
Patient-facing features, login issues, and portal enhancements.
- Patient login troubleshooting
- Prescription access
- Registration guides
- Portal fixes and improvements

### 🚀 [Deployment](./deployment/) - 31 files
Production deployment, SSL, environment setup, and server configuration.
- Production deployment guides
- SSL certificate setup
- GoDaddy configuration
- Frontend deployment
- Auto-restart configuration
- Port migrations

### 🔧 [Features](./features/) - 29 files
Core platform features and modules.
- Billing module
- Calendar sync
- Health dashboard
- Membership validation
- Payment integration
- Apple Health integration
- BLE SDK implementation
- Bulk upload systems
- Corporate management
- User hierarchy

### 📱 [Integrations](./integrations/) - 76 files
Third-party integrations and external services.
- **AI & Chatbots**: SIB intelligence, AI chat, chatbot systems
- **Communication**: WhatsApp, Facebook, Twilio
- **Video**: Agora, MiroTalk SFU, video consultation
- **Services**: Firebase, Google Maps, TPA, Insurance companies
- **Automation**: N8N workflows, CRM, web scraping
- **Data**: RAG systems, web search, intent detection

### 🗓️ [Appointments](./appointments/) - 8 files
Appointment booking, conflict prevention, and automation.
- Booking systems
- Conflict prevention
- Notification flows
- Conversational booking
- System analysis

### 🔒 [Security](./security/) - 11 files
Security architecture, firewalls, and encryption.
- Comprehensive login security
- Ring fencing
- Cloudflare setup
- Sophos firewall configuration
- Encryption implementation
- User audit systems

### 🔔 [Notifications](./notifications/) - 9 files
Email, SMS, and push notification systems.
- Welcome emails (automated)
- Activity logs
- Email persistence
- Triage call notifications
- Notification architecture

### 🗄️ [Database](./database/) - 6 files
PostgreSQL, migrations, and database architecture.
- Database architecture
- PostgreSQL setup
- Migration guides
- BullMQ vs RabbitMQ vs Celery

### 🏗️ [Architecture](./architecture/) - 13 files
System architecture, design patterns, and scaling.
- **[NestJS Migration Plan](./architecture/NESTJS_MIGRATION_PLAN.md)** — Strangler fig migration from Express to NestJS. Phases, patterns, nginx config, rollback protocol, progress tracker.
- Technical architecture
- Multi-tenant architecture
- PaaS architecture
- Mobile app architecture
- Performance tuning
- Phase 2 architecture

### 📖 [Guides](./guides/) - 59 files
Quick start guides, tutorials, and how-tos.
- Admin quickstart
- Clinic login guides
- Password reset testing
- Doctor portal testing
- Production guides
- Quick reference documents
- Step-by-step tutorials

### 🛠️ [Admin](./admin/) - 12 files
Admin dashboard, authentication, and management.
- Admin login fixes
- Dashboard audits
- Tenant management
- Branding updates
- Verification guides

### 📡 [API](./api/) - 4 files
API requirements, configuration, and infrastructure.
- API requirements
- Configuration guides
- Infrastructure setup
- Success reports

### 🔄 [Automation](./automation/) - 12 files
Automated testing, workflows, and async tasks.
- Automation testing
- N8N deployment
- Async task handling
- Workflow strategies
- Visual dashboards

### 🧪 [Testing](./testing/) - 15 files
Testing guides, audit reports, and validation.
- Testing guides
- Audit reports
- Sanity checks
- Validation summaries
- Final test reports
- Functional testing

### ⚙️ [Setup](./setup/) - 1 file
Initial setup and configuration guides.
- SMS configuration

### 📝 [Miscellaneous](./misc/) - 65 files
Implementation summaries, status reports, and general documentation.
- Implementation summaries
- Completion reports
- Fix documentation
- Status updates
- Checklists
- Indexes and manifests

---

## 🎯 Quick Navigation

### For New Developers
1. Start with [00_START_HERE.md](./guides/00_START_HERE.md)
2. Review [DEPLOYMENT_CHECKLIST.md](./misc/DEPLOYMENT_CHECKLIST.md)
3. Read [TECHNICAL_ARCHITECTURE_DESIGN.md](./architecture/TECHNICAL_ARCHITECTURE_DESIGN.md)

### For Admin Setup
1. [ADMIN_QUICKSTART.md](./admin/ADMIN_QUICKSTART.md)
2. [ADMIN_TENANT_MANAGEMENT_GUIDE.md](./admin/ADMIN_TENANT_MANAGEMENT_GUIDE.md)
3. [ADMIN_AUTHENTICATION_COMPLETE.md](./admin/ADMIN_AUTHENTICATION_COMPLETE.md)

### For Clinic Setup
1. [QUICKSTART_CLINIC_LOGIN.md](./guides/QUICKSTART_CLINIC_LOGIN.md)
2. [CLINIC_SYSTEM_COMPLETE.md](./clinic/CLINIC_SYSTEM_COMPLETE.md)
3. [CLINIC_PATIENT_MANAGEMENT_GUIDE.md](./clinic/CLINIC_PATIENT_MANAGEMENT_GUIDE.md)

### For Production Deployment
1. [PRODUCTION_DEPLOYMENT_GUIDE.md](./deployment/PRODUCTION_DEPLOYMENT_GUIDE.md)
2. [SSL_SETUP_GUIDE.md](./deployment/SSL_SETUP_GUIDE.md)
3. [CLOUDFLARE_SECURITY_SETUP.md](./security/CLOUDFLARE_SECURITY_SETUP.md)

### For Integration Development
1. [INTEGRATION_IMPLEMENTATION_GUIDE.md](./guides/INTEGRATION_IMPLEMENTATION_GUIDE.md)
2. [WHATSAPP_PRODUCTION_SETUP.md](./integrations/WHATSAPP_PRODUCTION_SETUP.md)
3. [VIDEO_CONSULTATION_IMPLEMENTATION_COMPLETE.md](./integrations/VIDEO_CONSULTATION_IMPLEMENTATION_COMPLETE.md)

---

## 🔍 Finding Documentation

### By Feature
- **Authentication**: Check [authentication/](./authentication/) folder
- **Video Calls**: See [integrations/](./integrations/) for Agora, MiroTalk
- **Appointments**: Browse [appointments/](./appointments/) folder
- **Billing**: Look in [features/](./features/) folder
- **AI/Chatbot**: Find in [integrations/](./integrations/) (SIB, AI Chat)

### By User Type
- **Doctors**: [doctor/](./doctor/) folder
- **Patients**: [patient/](./patient/) folder
- **Hospitals**: [hospital/](./hospital/) folder
- **Clinics**: [clinic/](./clinic/) folder
- **Admins**: [admin/](./admin/) folder

### By Task
- **Setting up a new feature**: Check [guides/](./guides/) first
- **Fixing an issue**: Look in specific category folder + [misc/](./misc/) for fixes
- **Deploying to production**: See [deployment/](./deployment/)
- **Testing**: Browse [testing/](./testing/) folder

---

## 📊 Documentation Statistics

| Category | Files | Purpose |
|----------|-------|---------|
| Integrations | 76 | External services & APIs |
| Miscellaneous | 65 | Summaries & reports |
| Guides | 59 | How-tos & tutorials |
| Deployment | 31 | Production setup |
| Features | 29 | Core functionality |
| Hospital | 23 | Hospital systems |
| Doctor | 19 | Doctor portals |
| Patient | 17 | Patient features |
| Authentication | 15 | Auth systems |
| Testing | 15 | QA & validation |
| Architecture | 12 | System design |
| Admin | 12 | Admin tools |
| Automation | 12 | Workflows & tasks |
| Clinic | 12 | Clinic management |
| Security | 11 | Security measures |
| Notifications | 9 | Alerts & emails |
| Appointments | 8 | Scheduling |
| Database | 6 | Data layer |
| API | 4 | API docs |
| Setup | 1 | Configuration |

**Total: 436 files**

---

## 🤝 Contributing to Documentation

When adding new documentation:
1. Place files in the appropriate category folder
2. Use descriptive, ALL_CAPS filenames
3. Update this README if adding a new category
4. Include date and version in document
5. Link related documents

---

## 📞 Need Help?

- **Can't find documentation**: Search across folders using your IDE
- **Documentation unclear**: File an issue or update the doc
- **New feature**: Create documentation in appropriate folder

---

**Last Organized**: January 15, 2026  
**Platform**: Mediczy Healthcare Platform  
**Documentation Maintainer**: Development Team

- [Database hardening and encrypted recovery — 19 October 2026](deployment/DATABASE_HARDENING_2026-10-19.md)
- [Encrypted RDS cutover runbook](deployment/RDS_ENCRYPTED_CUTOVER_RUNBOOK.md)
