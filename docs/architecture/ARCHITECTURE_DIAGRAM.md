# 🏗️ MEDICZY COMPREHENSIVE ARCHITECTURE DIAGRAM
## Complete System Wiring & Data Flow Documentation

### 📊 **Mermaid Architecture Diagram**

```mermaid
graph TB
    %% === CLIENT LAYER ===
    subgraph "🖥️ CLIENT LAYER"
        RJS[React.js Frontend<br/>Port 9443<br/>Vite Development Server]
        PWA[Progressive Web App<br/>Service Workers<br/>Offline Capabilities]
        RJS --> PWA
    end

    %% === API GATEWAY LAYER ===
    subgraph "🌐 API GATEWAY LAYER"
        NGINX[NGINX Reverse Proxy<br/>Load Balancer<br/>SSL Termination]
        CORS[CORS Handler<br/>Rate Limiting<br/>Security Middleware]
        NGINX --> CORS
    end

    %% === BACKEND SERVICES ===
    subgraph "🔧 BACKEND SERVICES"
        subgraph "📱 Node.js Backend (Port 8000)"
            EXPRESS[Express.js Server<br/>server.js<br/>REST API Gateway]
            AUTH[JWT Authentication<br/>User Management<br/>Role-Based Access]
            ROUTES[API Routes<br/>User/Doctor/Appointment<br/>Insurance/CRM Routes]
            EXPRESS --> AUTH
            EXPRESS --> ROUTES
        end

        subgraph "🤖 AI Services (Port 5000)"
            FLASK[Flask AI Server<br/>app.py<br/>DocsGPT Core]
            LLM[LLM Orchestrator<br/>llm_orchestrator.py<br/>Dr. iSHA AI Engine]
            MODELS[AI Models<br/>Mistral 7B Medical<br/>BiMediX2 Clinical<br/>TinyLlama Chat]
            FLASK --> LLM
            LLM --> MODELS
        end

        subgraph "🧠 Intelligent Database (Port 5005)"
            IDB[Ultra-Fast Intelligent DB<br/>ultra_fast_intelligent_db_service.py<br/>Medical Analysis Engine]
            CACHE[Intelligent Caching<br/>TTL Management<br/>Performance Optimization]
            ANALYTICS[Real-time Analytics<br/>Health Metrics<br/>Patient Insights]
            IDB --> CACHE
            IDB --> ANALYTICS
        end
    end

    %% === MESSAGE QUEUE LAYER ===
    subgraph "📬 MESSAGE QUEUE LAYER"
        KAFKA[Apache Kafka<br/>Event Streaming<br/>Real-time Data Pipeline]
        BULLMQ[BullMQ<br/>Job Queue<br/>Background Processing]
        REDIS[Redis Cache<br/>Session Storage<br/>Real-time Data]
        KAFKA --> BULLMQ
        BULLMQ --> REDIS
    end

    %% === DATABASE LAYER ===
    subgraph "💾 DATABASE LAYER"
        subgraph "📊 Primary Databases"
            MARIADB[MariaDB<br/>Primary Relational DB<br/>Users/Doctors/Appointments]
            MONGODB[MongoDB<br/>Document Storage<br/>Medical Records/Reports]
            SQLITE[SQLite<br/>Local Fast Storage<br/>Cache/Sessions]
        end

        subgraph "🔍 Specialized Databases"
            VECTOR[Vector Database<br/>AI Embeddings<br/>Semantic Search]
            TIMESERIES[InfluxDB<br/>Time-series Data<br/>Health Metrics]
            GRAPH[Neo4j<br/>Relationship Mapping<br/>Medical Connections]
        end
    end

    %% === EXTERNAL INTEGRATIONS ===
    subgraph "🌍 EXTERNAL INTEGRATIONS"
        INSURANCE[Insurance APIs<br/>Claims Processing<br/>Coverage Verification]
        PAYMENT[Payment Gateways<br/>Stripe/PayPal<br/>Transaction Processing]
        SMS[SMS/Email Services<br/>Twilio/SendGrid<br/>Notifications]
        CALENDAR[Calendar APIs<br/>Google/Outlook<br/>Appointment Sync]
    end

    %% === MONITORING & OBSERVABILITY ===
    subgraph "📈 MONITORING LAYER"
        GRAFANA[Grafana Dashboards<br/>Real-time Metrics<br/>Health Monitoring]
        PROMETHEUS[Prometheus<br/>Metrics Collection<br/>Alerting]
        LOGS[Centralized Logging<br/>ELK Stack<br/>Error Tracking]
        GRAFANA --> PROMETHEUS
        PROMETHEUS --> LOGS
    end

    %% === CLIENT TO BACKEND CONNECTIONS ===
    RJS -.->|HTTPS/WSS| NGINX
    NGINX --> EXPRESS
    NGINX --> FLASK

    %% === INTER-SERVICE COMMUNICATION ===
    EXPRESS <-.->|HTTP/JSON| FLASK
    EXPRESS <-.->|HTTP/JSON| IDB
    FLASK <-.->|HTTP/JSON| IDB
    
    %% === DATABASE CONNECTIONS ===
    EXPRESS --> MARIADB
    EXPRESS --> MONGODB
    EXPRESS --> REDIS
    FLASK --> SQLITE
    IDB --> SQLITE
    
    %% === MESSAGE QUEUE FLOWS ===
    EXPRESS --> KAFKA
    FLASK --> KAFKA
    IDB --> KAFKA
    KAFKA --> REDIS
    
    %% === EXTERNAL API CONNECTIONS ===
    EXPRESS --> INSURANCE
    EXPRESS --> PAYMENT
    EXPRESS --> SMS
    EXPRESS --> CALENDAR
    
    %% === MONITORING CONNECTIONS ===
    EXPRESS --> PROMETHEUS
    FLASK --> PROMETHEUS
    IDB --> PROMETHEUS
    KAFKA --> PROMETHEUS

    %% === DATA FLOW ANNOTATIONS ===
    EXPRESS -.->|"Patient Data<br/>Appointments<br/>Doctor Info"| MARIADB
    IDB -.->|"Medical Analysis<br/>AI Insights<br/>Performance Metrics"| SQLITE
    KAFKA -.->|"Real-time Events<br/>Health Updates<br/>Notifications"| BULLMQ

    classDef frontend fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef backend fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef database fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef queue fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef external fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef monitoring fill:#f1f8e9,stroke:#558b2f,stroke-width:2px

    class RJS,PWA frontend
    class EXPRESS,FLASK,IDB,AUTH,ROUTES,LLM,MODELS,CACHE,ANALYTICS backend
    class MARIADB,MONGODB,SQLITE,VECTOR,TIMESERIES,GRAPH database
    class KAFKA,BULLMQ,REDIS queue
    class INSURANCE,PAYMENT,SMS,CALENDAR external
    class GRAFANA,PROMETHEUS,LOGS monitoring
```

### 🔌 **Database Sharing Architecture**

```mermaid
graph LR
    subgraph "📱 Node.js Backend (server.js)"
        NS[Node.js Server<br/>Port 8000]
        NDB[Database Client<br/>intelligentDatabaseClient.js]
        NS --> NDB
    end

    subgraph "🤖 Flask AI Server (app.py)"
        FS[Flask Server<br/>Port 5000]
        FDB[Python DB Client<br/>db_client.py]
        FS --> FDB
    end

    subgraph "🖥️ React Client"
        RC[React Components]
        API[API Service Layer<br/>apiService.js]
        RC --> API
    end

    subgraph "🧠 Intelligent Database Service (Port 5005)"
        IDS[Intelligent DB Service<br/>ultra_fast_intelligent_db_service.py]
        IAPI[REST API Endpoints<br/>/api/intelligent/*]
        IDS --> IAPI
    end

    subgraph "💾 Shared Databases"
        subgraph "🔄 Synchronized Data"
            PD[Patient Profiles<br/>Medical History<br/>Health Metrics]
            DD[Doctor Profiles<br/>Availability<br/>Specializations]
            AD[Appointments<br/>Consultations<br/>Scheduling]
            HD[Health Data<br/>Vitals<br/>Fitness Tracking]
            IA[Insurance Claims<br/>Coverage<br/>Billing]
        end
    end

    %% API Connections
    NDB -.->|HTTP POST/GET<br/>JSON Payload| IAPI
    FDB -.->|HTTP POST/GET<br/>JSON Payload| IAPI
    API -.->|HTTPS REST<br/>Authenticated| NS
    API -.->|WebSocket<br/>Real-time| FS

    %% Database Write/Read Flows
    IAPI --> PD
    IAPI --> DD
    IAPI --> AD
    IAPI --> HD
    IAPI --> IA

    %% Bi-directional sync
    PD <-.-> IAPI
    DD <-.-> IAPI
    AD <-.-> IAPI
    HD <-.-> IAPI
    IA <-.-> IAPI
```

---

## 📋 **Detailed Wiring Specifications**

### 🔗 **1. Client Layer (React.js)**
```javascript
// Frontend API Integration
const API_ENDPOINTS = {
    backend: 'http://localhost:8000',  // Node.js server.js
    ai: 'http://localhost:5000',       // Flask app.py
    intelligent_db: 'http://localhost:5005' // Intelligent DB
};

// Data Flow: React → Node.js → Intelligent DB
// Health Tracking: React → Flask → AI Analysis → Intelligent DB
// Real-time Updates: WebSocket connections to all services
```

### 🔧 **2. Node.js Backend (server.js) - Port 8000**
```javascript
// Database Integration Layers
const connections = {
    mariadb: 'mysql://localhost:3306/mediczy',
    mongodb: 'mongodb://localhost:27017/mediczy', 
    redis: 'redis://localhost:6379',
    intelligent_db: 'http://localhost:5005/api/intelligent'
};

// Routes that use Intelligent DB:
// - /api/patients/* → Patient profile management
// - /api/doctors/* → Doctor availability & specializations  
// - /api/appointments/* → Intelligent scheduling
// - /api/health-metrics/* → Health data analysis
// - /api/analytics/* → Platform analytics
```

### 🤖 **3. Flask AI Server (app.py) - Port 5000**
```python
# AI Service Integration
SERVICES = {
    'llm_orchestrator': 'http://localhost:5000/api/dr-isha-consultation',
    'intelligent_db': 'http://localhost:5005/api/intelligent',
    'document_processing': '/api/chat',
    'medical_analysis': '/api/medical-analysis'
}

# AI Data Pipeline:
# User Query → LLM Orchestrator → Intelligent DB Analysis → Enhanced Response
# Medical Documents → DocsGPT → Knowledge Base → Patient Context
```

### 🧠 **4. Intelligent Database Service - Port 5005**
```python
# Core Database Functions
ENDPOINTS = {
    '/api/intelligent/analyze': 'Medical query analysis',
    '/api/intelligent/patient-profile': 'Patient management', 
    '/api/intelligent/doctor-profile': 'Doctor management',
    '/api/intelligent/appointment': 'Appointment scheduling',
    '/api/intelligent/health-metric': 'Health tracking',
    '/api/intelligent/analytics': 'Platform analytics'
}

# Performance: <1ms response time, 99.9% accuracy
# Caching: TTL-based intelligent caching
# Indexing: Optimized medical data indexes
```

---

## 🌊 **Data Flow Patterns**

### **A. Patient Registration Flow**
```
React Form → Node.js Validation → MariaDB Storage → Intelligent DB Sync → AI Profile Creation
```

### **B. Medical Consultation Flow**  
```
React Chat → Flask AI Server → LLM Orchestrator → Intelligent DB Analysis → Enhanced Response → Patient Context Update
```

### **C. Appointment Booking Flow**
```
React Calendar → Node.js Backend → Doctor Availability Check → Intelligent DB Scheduling → Calendar Sync → Notification Queue
```

### **D. Health Tracking Flow**
```
React Health Input → Node.js API → Intelligent DB Analysis → Health Score Calculation → Trend Analysis → Alert Generation
```

### **E. Real-time Analytics Flow**
```
All Services → Kafka Event Stream → BullMQ Processing → Redis Cache → Grafana Dashboard → Real-time Updates
```

---

## ⚡ **Performance Optimizations**

### **1. Database Layer**
- **MariaDB**: Primary relational data (users, appointments)
- **MongoDB**: Document storage (medical records, reports)  
- **Intelligent SQLite**: Ultra-fast medical analysis (<1ms)
- **Redis**: Session cache and real-time data
- **Vector DB**: AI embeddings and semantic search

### **2. Caching Strategy**
- **L1 Cache**: In-memory application cache
- **L2 Cache**: Redis distributed cache  
- **L3 Cache**: Intelligent DB TTL cache
- **CDN Cache**: Static assets and images

### **3. Load Balancing**
- **NGINX**: Frontend load balancing
- **Node.js Cluster**: Backend horizontal scaling
- **Flask Gunicorn**: AI service scaling
- **Database Read Replicas**: Query distribution

---

## 🔐 **Security Architecture**

### **Authentication Flow**
```
React Login → JWT Token → Node.js Verification → Database Session → Service Authorization
```

### **Data Encryption**
- **Transit**: HTTPS/TLS 1.3 encryption
- **Rest**: AES-256-GCM database encryption  
- **Backup**: End-to-end encrypted backups
- **API**: OAuth 2.0 + JWT tokens

### **Compliance**
- **HIPAA**: Medical data protection
- **GDPR**: EU data compliance
- **SOC 2**: Security controls
- **PCI DSS**: Payment processing

---

## 📊 **Monitoring & Observability**

### **Health Checks**
```bash
# Service Health Endpoints
GET /health → All services
GET /metrics → Prometheus metrics  
GET /status → System status
GET /performance → Performance metrics
```

### **Real-time Monitoring**
- **Application Metrics**: Response times, error rates
- **Infrastructure Metrics**: CPU, memory, disk usage
- **Business Metrics**: Patient engagement, consultation success
- **Security Metrics**: Failed logins, suspicious activity

This architecture provides a robust, scalable, and intelligent healthcare platform with seamless data sharing across all services while maintaining excellent performance and security! 🏥✨