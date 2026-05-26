# SMART OS — PLATFORM ENGINEERING HANDBOOK
## Master Architecture Bible
### SmartHealth OS

Version: 1.0
Date: May 2026
Classification: Internal / Strategic / Enterprise Architecture

---

# 1. EXECUTIVE SUMMARY

Smart OS is a cloud-native, AI-first, multi-tenant healthcare operating system designed to support:

- Hospitals
- Clinics
- Corporate healthcare
- Insurance ecosystems
- Telemedicine
- Webinars and CME platforms
- AI healthcare workflows
- ABDM interoperability
- Healthcare analytics
- Enterprise compliance

Smart OS combines:

- HMIS
- Telemedicine
- Webinar infrastructure
- AI orchestration
- Insurance workflows
- Healthcare APIs
- Cloud control plane
- Multi-tenant SaaS architecture

The platform is designed as a distributed healthcare cloud operating system with enterprise-grade scalability, security, and observability.

---

# 2. PLATFORM VISION

Smart OS is not merely a hospital management system.

It is designed as:

- A Healthcare Cloud Platform
- A Multi-Tenant SaaS Ecosystem
- A Real-Time Communication Platform
- An AI Healthcare Infrastructure Layer
- A Healthcare Interoperability Network

Comparable strategic architecture philosophies:

- Epic Systems
- Zoom
- Salesforce
- AWS

combined into a unified healthcare operating system.

---

# 3. CORE PLATFORM CAPABILITIES

## Healthcare Operations

- Multi-tenant HMIS
- EMR/EHR
- OP/IP workflows
- Billing and RCM
- Pharmacy
- Laboratory
- Radiology
- PACS integration
- NABH workflows
- Patient portals

## Telemedicine

- 1:1 consultations
- Multi-user consultations
- Virtual waiting rooms
- Doctor scheduling
- Session recording
- Secure medical communication

## Webinar Platform

- 1000+ participant webinars
- CME programs
- Medical conferences
- Enterprise live streaming
- Adaptive bitrate streaming
- HLS streaming
- RTMP ingestion

## AI Infrastructure

- AI Super Bot architecture
- Specialized botlets
- Clinical AI
- Claims AI
- Coding AI
- Compliance AI
- Conversational AI
- Analytics AI

## Insurance Ecosystem

- Claims workflows
- TPA integrations
- Corporate wellness
- Employee benefits
- Cashless workflows
- Insurance reconciliation

## ABDM & Healthcare Interoperability

- ABHA integration
- HIP integration
- UHI integration
- DigiDoctor integration
- ePrescription
- Health locker interoperability

---

# 4. HIGH LEVEL ARCHITECTURE

SUPER ADMIN DASHBOARD
        ↓
CONTROL PLANE API
        ↓
AWS STS ASSUME ROLE
        ↓
MULTI-ACCOUNT AWS PLATFORM

Accounts:
- Management Account
- PROD-APP
- PROD-DB
- PROD-LIVEKIT
- SECURITY
- SHARED-SERVICES
- DR-BACKUP
- SANDBOX

Core Infrastructure:
- ECS
- EKS
- Aurora PostgreSQL
- LiveKit Cluster
- Redis
- Kafka/EventBridge
- S3
- CloudFront
- AWS WAF
- GuardDuty
- Security Hub

---

# 5. MULTI-ACCOUNT AWS ARCHITECTURE

## AWS Organizations Structure

| Account | Purpose |
|---|---|
| Management | Control Plane |
| PROD-APP | APIs and services |
| PROD-DB | Databases |
| PROD-LIVEKIT | Video infrastructure |
| SECURITY | SIEM and audit logs |
| SHARED-SERVICES | DNS, CI/CD, tooling |
| DR-BACKUP | Disaster recovery |
| SANDBOX | Testing and R&D |

## Design Principles

- Zero trust architecture
- Blast radius reduction
- Strict workload isolation
- Least privilege access
- STS-based access only
- No long-term credentials

---

# 6. IAM & ZERO TRUST SECURITY MODEL

## Core Security Principle

No human or system directly accesses child AWS accounts.

All access occurs through:

AWS STS AssumeRole

## Master Role

Role Name:
SuperAdminControlRole

## Security Rules

### NEVER

- Store AWS keys in frontend
- Share root credentials
- Use wildcard admin access
- Bypass STS
- Store secrets in code repositories

### ALWAYS

- Use STS temporary credentials
- Enforce MFA
- Enable CloudTrail
- Use KMS encryption
- Apply least privilege
- Enable Security Hub
- Enable GuardDuty
- Use IAM Identity Center

## Security Services

| Service | Purpose |
|---|---|
| IAM Identity Center | SSO |
| GuardDuty | Threat detection |
| Security Hub | Centralized security |
| Macie | PHI/PII discovery |
| Inspector | Vulnerability scanning |
| CloudTrail | Audit logs |
| Config | Compliance monitoring |
| Secrets Manager | Secret rotation |
| KMS | Encryption |

---

# 7. NETWORK ARCHITECTURE

## Network Topology

Internet
   ↓
CloudFront
   ↓
AWS WAF
   ↓
Application Load Balancer
   ↓
Private App Subnets

## Subnet Architecture

### Public Subnets

- ALB
- NAT Gateways
- Bastion (restricted)

### Private App Subnets

- ECS services
- EKS workloads
- LiveKit services
- Redis

### Private Data Subnets

- Aurora
- OpenSearch
- Kafka

## Additional Network Controls

- NACLs
- VPC endpoints
- PrivateLink
- Transit Gateway
- Egress restrictions
- Cross-region replication

---

# 8. CONTROL PLANE ARCHITECTURE

## Purpose

The control plane acts as the central orchestration brain of Smart OS.

Responsibilities:

- Tenant provisioning
- Infrastructure orchestration
- STS AssumeRole operations
- ECS scaling
- LiveKit scaling
- Billing orchestration
- Compliance operations
- Disaster recovery management

## Stack

- Node.js
- NestJS
- Go microservices
- PostgreSQL metadata DB
- AWS SDK v3

## Control Flow

Dashboard Action
  ↓
Control Plane API
  ↓
Tenant Mapping
  ↓
STS AssumeRole
  ↓
Execute AWS Action
  ↓
Return Response

---

# 9. MULTI-TENANT ARCHITECTURE

## Tenant Definition

Each hospital is treated as an isolated tenant.

## Tenant Isolation

- Separate database
- Separate storage prefix
- Separate LiveKit namespace
- Tenant-aware routing
- Tenant-level RBAC

## Tenant Mapping Table

| Field | Description |
|---|---|
| tenant_id | Unique identifier |
| domain | Custom domain |
| aws_account | AWS account |
| db_name | Tenant database |
| livekit_prefix | Video namespace |
| status | Tenant state |

---

# 10. APPLICATION ARCHITECTURE

## Recommended Model

Modular monolith initially.

Gradual migration to selective microservices.

## Core Services

| Service | Purpose |
|---|---|
| Auth Service | Authentication |
| Tenant Service | Provisioning |
| Patient Service | EMR/EHR |
| Appointment Service | Scheduling |
| Telemedicine Service | Consultations |
| Webinar Service | Webinar engine |
| Claims Service | Insurance workflows |
| Billing Service | SaaS billing |
| AI Service | AI orchestration |
| Notification Service | SMS/email/WhatsApp |
| Audit Service | Compliance logging |

---

# 11. COMPUTE ARCHITECTURE

## ECS Layer

Platform:
Amazon ECS Fargate

## Production Configuration

| Parameter | Value |
|---|---|
| vCPU | 2–4 |
| RAM | 4–8 GB |
| Scaling | Auto scaling |
| OS | Amazon Linux 2023 |

## Scaling Rules

- CPU > 60% scale out
- Latency > 300ms scale out
- Multi-AZ mandatory
- Minimum active tasks maintained

---

# 12. DATABASE ARCHITECTURE

## Database Platform

Amazon Aurora PostgreSQL Serverless v2

## Design Principles

- One DB per tenant
- Encrypted storage
- Automated backups
- Point-in-time recovery
- Cross-region replication

## Targets

| Metric | Target |
|---|---|
| Query latency | 10–20ms |
| Recovery point | <15 mins |
| Recovery time | <1 hour |

---

# 13. REDIS & MESSAGE QUEUE LAYER

## Redis

Platform:
Amazon ElastiCache Redis

Uses:

- Session management
- Presence tracking
- Distributed locks
- AI workflows
- Webinar state
- Rate limiting

## Event Streaming

Recommended:

- Kafka/MSK
- EventBridge
- SQS
- NATS

## Event Examples

- webinar.started
- consultation.completed
- ai.summary.generated
- claim.submitted
- recording.completed

---

# 14. LIVE VIDEO ARCHITECTURE

## Core Platform

LiveKit

## Workloads

- Telemedicine
- Group consultations
- Webinars
- CME events
- Medical conferences

## SFU Node Configuration

| Instance | Purpose |
|---|---|
| c7i.xlarge | Telemedicine |
| c7i.2xlarge | Webinar SFU |
| g6e.xlarge | Recording/Egress |

## TURN Infrastructure

Dedicated TURN nodes:

- NAT traversal
- Firewall bypass
- Hospital network compatibility

## Scaling Rules

- CPU > 60% scale up
- Webinar event pre-scaling
- Adaptive bitrate enabled
- Active publisher restrictions

---

# 15. WEBINAR ARCHITECTURE

## Webinar Features

- 1000+ attendees
- 5–10 active speakers
- Adaptive bitrate
- HLS streaming
- RTMP ingestion
- CDN delivery
- Recording pipeline

## Streaming Pipeline

Publisher
   ↓
LiveKit SFU
   ↓
Egress Workers
   ↓
S3 Recording Bucket
   ↓
CloudFront CDN

---

# 16. STORAGE ARCHITECTURE

## Storage Platform

Amazon S3

## Structure

hmis-prod/
  hospitals/
  recordings/
  medical-documents/
  ai-outputs/
  backups/

## Storage Rules

- Lifecycle policies
- Encryption enabled
- Signed URL access
- Cross-region replication
- Immutable backups

---

# 17. AI INFRASTRUCTURE ARCHITECTURE

## AI Super Bot Architecture

AI Super Bot
   ↓
Botlets

- Claims AI
- Clinical AI
- Coding AI
- Compliance AI
- Support AI
- Analytics AI

## AI Infrastructure

| Layer | Technology |
|---|---|
| LLM Gateway | LiteLLM |
| Vector DB | pgvector/Qdrant |
| Orchestration | LangGraph |
| OCR | AWS Textract |
| Speech | Whisper/Deepgram |
| NLP | BioClinicalBERT |

## AI Governance

- Prompt logging
- AI audit trails
- Human approval workflows
- PHI filtering
- Safety validation

---

# 18. OBSERVABILITY & MONITORING

## Monitoring Stack

| Function | Tool |
|---|---|
| Metrics | Prometheus |
| Dashboards | Grafana |
| Logs | OpenSearch |
| Traces | OpenTelemetry |
| Error Tracking | Sentry |

## Alerts

- CPU thresholds
- DB latency
- Packet loss
- Storage failures
- AI failures
- Security anomalies

---

# 19. DEVOPS & PLATFORM ENGINEERING

## Infrastructure as Code

Recommended:

- Terraform
- Pulumi

## CI/CD

- GitHub Actions
- Blue/Green deployment
- Canary deployment
- Rollback automation

## Platform Engineering Principles

- GitOps
- Immutable infrastructure
- Golden AMIs
- Automated provisioning
- Internal developer platform

---

# 20. TENANT PROVISIONING WORKFLOW

Create Tenant
   ↓
Provision DB
   ↓
Create S3 Prefix
   ↓
Issue SSL
   ↓
Configure DNS
   ↓
Deploy Services
   ↓
Configure RBAC
   ↓
Enable Monitoring

---

# 21. COMPLIANCE ARCHITECTURE

## Compliance Targets

| Standard | Coverage |
|---|---|
| HIPAA | Healthcare privacy |
| GDPR | European compliance |
| DISHA | India healthcare |
| NABH | Hospital quality |
| ISO27001 | Security |
| SOC2 | SaaS trust |

## Mandatory Controls

- Encryption at rest
- Encryption in transit
- Immutable audit logs
- Tenant-level audit trails
- Access logging
- AI activity logging
- Backup verification

---

# 22. DISASTER RECOVERY

## DR Strategy

Primary Region:
- ap-south-1

Secondary Region:
- ap-southeast-1

## DR Components

- Aurora Global Database
- S3 Cross Region Replication
- AMI backups
- IaC recovery
- DNS failover

## Recovery Targets

| Metric | Target |
|---|---|
| RPO | <15 mins |
| RTO | <1 hour |
| Webinar Recovery | <5 mins |

---

# 23. SECURITY OPERATIONS

## Incident Response

Playbooks:

- Credential compromise
- PHI breach
- Ransomware response
- DDoS response
- AI abuse handling

## Logging Requirements

- 7+ year retention
- Immutable storage
- Tenant-specific logs
- Access trails
- Audit export support

---

# 24. COST MODEL

## Estimated Monthly Costs

| Stage | Cost |
|---|---|
| MVP | ₹1L–₹2.5L |
| Mid-scale | ₹4L–₹8L |
| Enterprise | ₹10L–₹25L |

## Major Cost Drivers

- Video bandwidth
- TURN traffic
- Recording storage
- NAT gateways
- AI inference
- DR replication
- Observability

---

# 25. PLATFORM SCALING STRATEGY

## Scaling Philosophy

Horizontal scaling only.

| Component | Scaling Method |
|---|---|
| APIs | ECS tasks |
| LiveKit | EC2/EKS nodes |
| DB | Aurora ACUs |
| AI | GPU workers |
| Webinar | SFU scale-out |

---

# 26. RECOMMENDED PRODUCTION STACK

| Layer | Technology |
|---|---|
| Operating System | Ubuntu Server LTS |
| Frontend | ReactJS |
| Backend | Node.js + Python |
| API Framework | NestJS |
| Realtime | LiveKit |
| Compute | ECS + EKS |
| Primary Database | PostgreSQL / Aurora PostgreSQL |
| Analytics Database | DuckDB |
| Vector Database | PGVector |
| Cache | Redis |
| Messaging | Kafka/EventBridge |
| Search | OpenSearch |
| AI Orchestration | LangGraph + LiteLLM |
| Auth | Cognito/Keycloak |
| IaC | Terraform |
| Monitoring | Prometheus + Grafana |
| CDN | CloudFront |
| WAF | AWS WAF |
| Storage | S3 |

## Core Technology Standards

### Operating System

Ubuntu Server LTS will be the standard operating system across:

- ECS container base images
- EC2 instances
- LiveKit nodes
- AI worker nodes
- Bastion systems
- DevOps environments

### Frontend Standards

ReactJS will be the core frontend framework for:

- HMIS web portal
- Doctor portal
- Patient portal
- Admin dashboard
- Super admin control plane
- Webinar interfaces

Recommended frontend ecosystem:

- ReactJS
- TypeScript
- Next.js (SSR where required)
- Tailwind CSS
- Zustand/Redux
- React Query
- WebSocket integration

### Backend Standards

Primary backend stack:

- Node.js
- NestJS
- Python microservices

Node.js responsibilities:

- HMIS APIs
- Authentication
- Tenant orchestration
- Realtime signaling
- Billing workflows
- Control plane APIs

Python responsibilities:

- AI orchestration
- ML inference
- Analytics
- ETL pipelines
- OCR workflows
- NLP processing
- Data science workloads

### Database Standards

#### PostgreSQL

Primary transactional database:

- EMR/EHR
- Billing
- Claims
- Appointments
- Authentication
- SaaS metadata

#### DuckDB

Analytics and embedded OLAP engine:

- AI analytics
- Reporting workloads
- Healthcare dashboards
- BI processing
- Data lake querying
- Batch analytics

#### PGVector

Vector search extension for PostgreSQL:

- Medical embeddings
- RAG pipelines
- Semantic search
- AI memory systems
- Clinical document retrieval
- AI recommendation systems

---

# 27. IMPLEMENTATION ROADMAP

## Phase 1 — Foundation

- AWS Organizations
- IAM and STS
- VPC architecture
- Terraform foundation

## Phase 2 — Core Infrastructure

- ECS deployment
- Aurora deployment
- Redis and queues
- S3 and CloudFront

## Phase 3 — Video Platform

- LiveKit deployment
- TURN infrastructure
- Webinar scaling
- Recording pipelines

## Phase 4 — AI Platform

- AI orchestration
- Vector DB
- AI governance
- Clinical AI services

## Phase 5 — Enterprise Layer

- Billing engine
- Compliance engine
- Analytics platform
- Partner APIs

---

# 28. FINAL PLATFORM SUMMARY

Smart OS is a:

- Multi-tenant healthcare cloud platform
- AI-native healthcare operating system
- Real-time communication infrastructure
- Healthcare interoperability ecosystem
- Enterprise-grade SaaS platform

The platform combines:

- HMIS
- Telemedicine
- Webinar infrastructure
- AI orchestration
- Insurance systems
- Cloud governance
- Enterprise security
- Healthcare compliance

into a unified healthcare operating system.

---

# 29. FINAL STRATEGIC POSITIONING

Smart OS is architected to evolve into:

- National healthcare infrastructure
- Enterprise healthcare cloud
- AI healthcare ecosystem
- Insurance integration platform
- Healthcare data network
- Digital health operating system

This architecture is designed for:

- Scalability
- Reliability
- Compliance
- Interoperability
- AI-readiness
- Global expansion

---

# END OF MASTER PLATFORM ENGINEERING HANDBOOK
# SMART OS — THE PLATFORM BIBLE

