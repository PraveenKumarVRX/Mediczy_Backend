# Mediczy

> **Healthcare Platform** - Complete digital health ecosystem with multi-tenant architecture

## 📚 Documentation

**All documentation has been organized into the [`docs/`](./docs/) folder.**

- **[Documentation Index](./docs/README.md)** - Complete guide to all 466+ documentation files
- **Quick Links**: See organized categories below

### Documentation Categories
- 🔐 [Authentication](./docs/authentication/) - OAuth, passwords, OTP (16 files)
- 👨‍⚕️ [Doctor Portal](./docs/doctor/) - Doctor features & APIs (19 files)
- 🏥 [Hospital System](./docs/hospital/) - Hospital management (23 files)
- 🏢 [Clinic System](./docs/clinic/) - Clinic operations (12 files)
- 🤒 [Patient Portal](./docs/patient/) - Patient features (18 files)
- 🚀 [Deployment](./docs/deployment/) - Production setup (32 files)
- 📱 [Integrations](./docs/integrations/) - APIs & services (82 files)
- 🔒 [Security](./docs/security/) - Security measures (12 files)
- 📖 [Guides](./docs/guides/) - How-tos & tutorials (60 files)
- 🧪 [Testing](./docs/testing/) - QA & validation (19 files)
- ⚙️ [More...](./docs/README.md) - See full documentation index

---

## Features

- **Admin Dashboard**: ERP+CRM system for managing users, doctors, labs, pharmacies, and corporates
- **CRM Pipeline**: Complete lead management with stages, activities, notes, and tasks
- **Async Task Processing**: Background jobs for emails, reports, notifications using Redis + BullMQ
- **Event Streaming**: Real-time event processing with Kafka
- **Monitoring**: Prometheus metrics and Grafana dashboards
- **Real-time Communication**: Video consultations with Agora RTC
- **Push Notifications**: Firebase Cloud Messaging with graceful fallback
- **Health Tracking**: Patient health metrics and vitals tracking

## Quick Links

- **🐛 Debugging**: [DEBUG_QUICK_REFERENCE.md](./docs/DEBUG_QUICK_REFERENCE.md) - Quick debugging guide | [Full Guide](./docs/DEBUGGING_GUIDE.md)
- **Admin Setup**: See section below
- **CRM Guide**: [CRM_GUIDE.md](CRM_GUIDE.md) - Complete CRM documentation
- **Async Tasks**: [ASYNC_TASKS.md](ASYNC_TASKS.md) - Background job processing guide
- **CRM Quick Start**: [CRM_QUICKSTART.md](CRM_QUICKSTART.md) - Quick reference card

## Admin Setup & Master Data Uploads

The platform now supports an Admin workflow for uploading master data (Doctors, Labs, Pharmacies) in bulk.

### 1. Seed an Admin User

An initial admin user can be created via a seed script:

```bash
cd server
npm run seed:admin
```

Environment variables (optional):

- `ADMIN_EMAIL` (default: `admin@mediczy.local`)
- `ADMIN_PASSWORD` (default: `Admin@1234`)

**✅ Admin credentials already seeded:**
- Email: `admin@mediczy.local`
- Password: `Admin@1234`

⚠️ **Change these credentials immediately in production!**

### 2. Admin Login

Navigate to `/admin/login` in the client and login with the seeded credentials. A distinct `adminToken` is stored in `localStorage`.

### 3. Admin Dashboard

After login visit `/admin` to access the dashboard with three bulk upload panels:

- Doctors
- Labs
- Pharmacies

Paste JSON arrays and submit. Each panel sends a POST request to:

- `POST /api/admin/masters/doctors`
- `POST /api/admin/masters/labs`
- `POST /api/admin/masters/pharmacies`

### 4. JSON Payload Examples

Doctors (⚠️ `specialization` must be a valid enum value):
```json
[
  {
    "firstName": "Alice",
    "lastName": "Doe",
    "email": "alice@example.com",
    "specialization": "Cardiologist",
    "experience": 8,
    "languages": ["English", "Hindi"],
    "about": "Experienced cardiologist"
  }
]
```

Valid specialization values: `General Practitioner`, `Cardiologist`, `Dermatologist`, `Pediatrician`, `Orthopedist`, `Neurologist`, `Psychiatrist`, `Psychologist`, `Gynecologist`, `ENT Specialist`, `Ophthalmologist`, `Rheumatologist`, `Pulmonologist`, `Physiotherapist`, `Occupational Therapist`, `Nutritionist`, `Dietician`, `Nephrologist`, `Urologist`, `Diabetologist`, `Intensivist`, `Cardio Thoracic Surgeon`, `Vascular Surgeon`, `Neuro Surgeon`, `Cardio Vascular Surgeon`, `Gastroenterologist`, `Gastro Surgeon`, `General Surgeon`, `Proctologist`, `Podiatrician`, `Dentist`, `Endocrinologist`, `Oncologist`, `Other`Labs:
```json
[
	{
		"name": "City Lab",
		"email": "lab@example.com",
		"services": ["Blood Test", "X-Ray"],
		"accreditation": "NABL"
	}
]
```

Pharmacies:
```json
[
	{
		"name": "Main Pharmacy",
		"email": "pharm@example.com",
		"licenseNumber": "LIC-12345"
	}
]
```

### 5. Security Notes

- Admin endpoints are protected by JWT + role check (`requireRole('admin')`).
- The client dashboard uses a dedicated `adminToken`; user token is not reused.
- Add rate limiting & stronger schema validation before production (e.g. celebrate/joi or zod on both client + server).

### 6. CRM Module

The admin panel now includes a comprehensive **CRM (Customer Relationship Management)** system for managing leads, tracking activities, and monitoring the sales pipeline.

#### Features:
- **Lead Management**: Create, update, and delete leads with details like name, company, email, phone, source, stage, and value.
- **Pipeline Stages**: Track leads through customizable stages:
  - `New` → `Qualified` → `Proposal` → `Negotiation` → `Closed Won` / `Closed Lost`
- **Activities & Notes**: Log calls, meetings, emails, and notes for each lead.
- **Tasks & Reminders**: Assign tasks with due dates and priorities; track completion.
- **Visual Pipeline**: Kanban-style board showing leads grouped by stage.
- **Analytics**: View conversion rates, open pipeline value, leads by source, and stage distribution charts.

#### CRM Endpoints:

**Leads:**
- `POST /api/crm/leads` - Create a new lead
- `GET /api/crm/leads` - List all leads (supports filters: `?stage=New&q=search&assignedTo=userId`)
- `GET /api/crm/leads/:id` - Get lead details with activities, notes, and tasks
- `PUT /api/crm/leads/:id` - Update lead (stage changes auto-log activity)
- `DELETE /api/crm/leads/:id` - Delete a lead

**Activities & Notes:**
- `POST /api/crm/leads/:leadId/activities` - Log an activity (call, meeting, email, etc.)
- `POST /api/crm/leads/:leadId/notes` - Add a note
- `POST /api/crm/leads/:leadId/tasks` - Create a task
- `POST /api/crm/tasks/:id/complete` - Mark task as completed

**Stats & Reports:**
- `GET /api/crm/stats` - Pipeline stats (stage counts, open value, conversion rate, source distribution)
- `GET /api/crm/reports/overview` - Average stage age, total pipeline value, lead counts

#### CRM Payload Examples:

Create Lead:
```json
{
  "name": "Acme Corp",
  "company": "Acme Corporation",
  "email": "contact@acme.com",
  "phone": "+91-9876543210",
  "source": "Referral",
  "stage": "New",
  "value": 50000
}
```

Add Note:
```json
{
  "content": "Discussed pricing and implementation timeline. Follow up next week.",
  "pinned": false
}
```

Add Task:
```json
{
  "title": "Send proposal document",
  "description": "Include pricing and timeline details",
  "dueDate": "2025-11-15",
  "priority": "High"
}
```

Update Lead Stage:
```json
{
  "stage": "Qualified",
  "statusReason": "Budget confirmed, decision maker identified"
}
```

#### Validation:
All CRM endpoints include schema validation using `express-validator`:
- Lead name is required
- Email must be valid format
- Stage must be one of the enum values
- Value must be a positive number

#### Access Control:
All CRM routes require admin authentication (`authUser` + `requireRole('admin')`).

### 7. Async Task Processing

The platform includes a robust async infrastructure for background job processing and monitoring.

#### Features:
- **Redis + BullMQ**: Reliable job queues for email, notifications, reports, data exports
- **Kafka**: Event streaming for real-time analytics and system events
- **Prometheus**: Metrics collection for API performance, queue stats, business metrics
- **Grafana**: Visualization dashboards (optional)

#### Available Queues:
- `email` - Send transactional emails
- `notifications` - Push and in-app notifications
- `reports` - Generate PDF/Excel reports
- `dataExport` - CSV/JSON data exports
- `analytics` - Track user actions and events
- `cleanup` - Database maintenance tasks

#### Quick Start:
See **[ASYNC_TASKS.md](ASYNC_TASKS.md)** for complete setup instructions and usage examples.

#### API Endpoints:
- `GET /api/async/queues/stats` - Queue statistics
- `POST /api/async/tasks/email/test` - Send test email
- `POST /api/async/tasks/reports/generate` - Generate reports
- `GET /api/async/metrics` - Prometheus metrics endpoint

### 8. Next Enhancements (Planned)

- CSV/Excel upload & parsing for CRM lead imports
- Assignment workflows with notifications
- Admin audit logs (who uploaded what & when)
- Advanced reporting with date range filters and export capabilities
- Lead scoring and automated stage progression
- Email integration for activity tracking
- Docker Compose for production deployment

---

For video, notifications, and Firebase push setup, see dedicated docs (to be expanded).

## Server Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Environment variables:
Create `.env` based on `server/.env.example`.

### MariaDB (Leader) Setup
- Create app user and grant privileges (recommended):
```bash
sudo mysql -u root <<'SQL'
CREATE DATABASE IF NOT EXISTS mediczy;
CREATE USER IF NOT EXISTS 'mediczy_user'@'127.0.0.1' IDENTIFIED BY 'StrongPass123!';
GRANT ALL PRIVILEGES ON mediczy.* TO 'mediczy_user'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
```
- Set server envs:
```bash
export DB_HOST=127.0.0.1
export DB_NAME=mediczy
export DB_USER=mediczy_user
export DB_PASSWORD=StrongPass123!
```
- Verify:
```bash
mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASSWORD" -e "SHOW DATABASES;"
```

### Redis and Mongo
```bash
export REDIS_HOST=127.0.0.1
export REDIS_URL=redis://127.0.0.1:6379
export MONGO_URI=mongodb://127.0.0.1:27017/mediczy
```

3. Start the server:
```bash
node index.js
```

### Metrics
- The server exposes Prometheus metrics at `/metrics`.
- Prometheus sample config is in `server/observability/prometheus.yml`.
- Grafana dashboard is in `server/observability/grafana-dashboard.json`.