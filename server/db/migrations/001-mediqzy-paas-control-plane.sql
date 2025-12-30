-- =============================================================================
-- MEDIQZY PAAS - CONTROL PLANE SCHEMA
-- Multi-tenant Healthcare Platform with Entity Management
-- =============================================================================
-- Version: 1.0.0
-- Date: 2025-01-05
-- Description: Core tables for the Control Plane - NEVER stores PHI/clinical data
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TENANTS TABLE (Primary tenant registry)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_tenants (
    tenant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_code VARCHAR(20) UNIQUE NOT NULL,  -- Short code like "CHG001"
    tenant_name VARCHAR(255) NOT NULL,
    tenant_type VARCHAR(50) NOT NULL CHECK (tenant_type IN (
        'CLINIC', 'HOSPITAL', 'CORPORATE', 'INSURANCE_BROKER', 
        'INSURANCE_TPA', 'INSURANCE_COMPANY', 'WELLNESS_AGGREGATOR',
        'AMBULANCE', 'LAB', 'PHARMACY', 'PSU', 'NGO'
    )),
    
    -- Database Strategy
    db_strategy VARCHAR(20) NOT NULL DEFAULT 'SHARED' CHECK (db_strategy IN (
        'SHARED',       -- Shared DB with tenant_id filtering (small tenants)
        'SCHEMA',       -- Dedicated schema per tenant (medium tenants)
        'DEDICATED'     -- Dedicated database (large tenants/enterprise)
    )),
    db_host VARCHAR(255),           -- For DEDICATED: separate DB host
    db_name VARCHAR(100),           -- For DEDICATED/SCHEMA: database/schema name
    db_credentials_vault_key VARCHAR(255), -- Reference to vault for credentials
    
    -- Domain Configuration
    primary_domain VARCHAR(255),     -- e.g., "cityhospital.mediqzy.com"
    custom_domain VARCHAR(255),      -- e.g., "ehr.cityhospital.com"
    
    -- Branding
    logo_url VARCHAR(500),
    favicon_url VARCHAR(500),
    theme_config JSONB DEFAULT '{"primaryColor": "#0066cc", "secondaryColor": "#004d99"}',
    
    -- Contact & Location
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(20),
    address JSONB DEFAULT '{}',
    country_code VARCHAR(3) DEFAULT 'IND',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    
    -- Subscription
    subscription_plan VARCHAR(50) DEFAULT 'STARTER' CHECK (subscription_plan IN (
        'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'
    )),
    subscription_status VARCHAR(20) DEFAULT 'TRIAL' CHECK (subscription_status IN (
        'TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'
    )),
    trial_ends_at TIMESTAMPTZ,
    subscription_starts_at TIMESTAMPTZ,
    subscription_ends_at TIMESTAMPTZ,
    
    -- Limits & Usage
    limits JSONB DEFAULT '{
        "maxUsers": 50,
        "maxEntities": 5,
        "maxStorageGB": 10,
        "maxApiCallsPerMonth": 100000,
        "features": ["appointments", "patients", "billing"]
    }',
    current_usage JSONB DEFAULT '{
        "users": 0,
        "entities": 0,
        "storageGB": 0,
        "apiCallsThisMonth": 0
    }',
    
    -- Status & Lifecycle
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED', 'DELETED'
    )),
    provisioned_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    suspension_reason TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_by UUID,               -- Super Super Admin who created
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for tenants
CREATE INDEX IF NOT EXISTS idx_platform_tenants_type ON platform_tenants(tenant_type);
CREATE INDEX IF NOT EXISTS idx_platform_tenants_status ON platform_tenants(status);
CREATE INDEX IF NOT EXISTS idx_platform_tenants_domain ON platform_tenants(primary_domain);
CREATE INDEX IF NOT EXISTS idx_platform_tenants_custom_domain ON platform_tenants(custom_domain);
CREATE INDEX IF NOT EXISTS idx_platform_tenants_code ON platform_tenants(tenant_code);

-- =============================================================================
-- 2. ENTITIES TABLE (Sub-organizations within a tenant)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_entities (
    entity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES platform_tenants(tenant_id) ON DELETE CASCADE,
    parent_entity_id UUID REFERENCES platform_entities(entity_id), -- For hierarchy
    
    entity_code VARCHAR(20) NOT NULL,  -- Unique within tenant
    entity_name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
        -- Healthcare Facilities
        'HOSPITAL', 'CLINIC', 'DEPARTMENT', 'BRANCH',
        -- Diagnostic
        'LAB', 'IMAGING_CENTER', 'PATHOLOGY',
        -- Pharmacy
        'PHARMACY', 'MEDICAL_STORE',
        -- Emergency
        'AMBULANCE_STATION', 'EMERGENCY_CENTER',
        -- Insurance
        'INSURANCE_BRANCH', 'TPA_OFFICE', 'BROKER_OFFICE',
        -- Corporate
        'CORPORATE_OFFICE', 'FACTORY', 'CAMPUS',
        -- Wellness
        'GYM', 'WELLNESS_CENTER', 'YOGA_CENTER',
        -- Other
        'OTHER'
    )),
    
    -- Location
    address JSONB DEFAULT '{}',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Contact
    email VARCHAR(255),
    phone VARCHAR(20),
    
    -- Operating Hours
    operating_hours JSONB DEFAULT '{
        "monday": {"open": "09:00", "close": "18:00"},
        "tuesday": {"open": "09:00", "close": "18:00"},
        "wednesday": {"open": "09:00", "close": "18:00"},
        "thursday": {"open": "09:00", "close": "18:00"},
        "friday": {"open": "09:00", "close": "18:00"},
        "saturday": {"open": "09:00", "close": "14:00"},
        "sunday": null
    }',
    
    -- Licenses & Registration
    license_number VARCHAR(100),
    registration_number VARCHAR(100),
    accreditations JSONB DEFAULT '[]', -- e.g., ["NABH", "NABL", "ISO"]
    
    -- Services
    services_offered JSONB DEFAULT '[]', -- List of service codes
    specializations JSONB DEFAULT '[]', -- Medical specializations
    
    -- Capacity
    capacity JSONB DEFAULT '{}', -- beds, staff count, etc.
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN (
        'ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'
    )),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, entity_code)
);

-- Indexes for entities
CREATE INDEX IF NOT EXISTS idx_platform_entities_tenant ON platform_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_entities_type ON platform_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_platform_entities_parent ON platform_entities(parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_platform_entities_status ON platform_entities(status);
CREATE INDEX IF NOT EXISTS idx_platform_entities_location ON platform_entities USING GIST (
    ll_to_earth(latitude, longitude)
) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- =============================================================================
-- 3. DOMAINS TABLE (Domain routing)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_domains (
    domain_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES platform_tenants(tenant_id) ON DELETE CASCADE,
    entity_id UUID REFERENCES platform_entities(entity_id),
    
    domain_name VARCHAR(255) NOT NULL UNIQUE,
    domain_type VARCHAR(20) DEFAULT 'SUBDOMAIN' CHECK (domain_type IN (
        'SUBDOMAIN',    -- xxx.mediqzy.com
        'CUSTOM'        -- custom domain
    )),
    
    -- SSL Configuration
    ssl_enabled BOOLEAN DEFAULT true,
    ssl_certificate_id VARCHAR(255),
    ssl_expires_at TIMESTAMPTZ,
    
    -- DNS Status
    dns_verified BOOLEAN DEFAULT false,
    dns_verified_at TIMESTAMPTZ,
    dns_verification_token VARCHAR(100),
    
    -- Status
    is_primary BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'VERIFYING', 'ACTIVE', 'SUSPENDED', 'INVALID'
    )),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for domains
CREATE INDEX IF NOT EXISTS idx_platform_domains_tenant ON platform_domains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_domains_name ON platform_domains(domain_name);

-- =============================================================================
-- 4. GLOBAL USERS TABLE (Identity layer)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identity
    email VARCHAR(255) NOT NULL UNIQUE,
    email_verified BOOLEAN DEFAULT false,
    phone VARCHAR(20),
    phone_verified BOOLEAN DEFAULT false,
    
    -- Authentication
    password_hash VARCHAR(255),
    auth_provider VARCHAR(20) DEFAULT 'LOCAL' CHECK (auth_provider IN (
        'LOCAL', 'GOOGLE', 'APPLE', 'MICROSOFT', 'AADHAAR', 'ABHA'
    )),
    auth_provider_id VARCHAR(255),  -- External provider user ID
    
    -- Profile
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    display_name VARCHAR(200),
    avatar_url VARCHAR(500),
    
    -- Demographics
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')),
    
    -- KYC / Healthcare ID
    aadhaar_last_4 VARCHAR(4),
    abha_id VARCHAR(20),           -- ABDM Health ID
    pan_number VARCHAR(10),
    
    -- Preferences
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    notification_preferences JSONB DEFAULT '{
        "email": true,
        "sms": true,
        "push": true,
        "whatsapp": false
    }',
    
    -- Security
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_method VARCHAR(20) CHECK (mfa_method IN ('SMS', 'EMAIL', 'TOTP', 'BIOMETRIC')),
    mfa_secret VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(45),
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN (
        'PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'
    )),
    
    -- Super Admin Flag (for admin@mediqzy.com)
    is_platform_admin BOOLEAN DEFAULT false,
    platform_role VARCHAR(50), -- 'SUPER_SUPER_ADMIN', 'PLATFORM_OPS', 'SUPPORT'
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_platform_users_email ON platform_users(email);
CREATE INDEX IF NOT EXISTS idx_platform_users_phone ON platform_users(phone);
CREATE INDEX IF NOT EXISTS idx_platform_users_status ON platform_users(status);
CREATE INDEX IF NOT EXISTS idx_platform_users_platform_admin ON platform_users(is_platform_admin) WHERE is_platform_admin = true;

-- =============================================================================
-- 5. ROLES TABLE (Permission groups)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_roles (
    role_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES platform_tenants(tenant_id), -- NULL for platform roles
    
    role_code VARCHAR(50) NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    scope VARCHAR(20) NOT NULL CHECK (scope IN (
        'PLATFORM',     -- System-wide (admin@mediqzy.com)
        'TENANT',       -- Tenant-wide
        'ENTITY'        -- Entity-specific
    )),
    
    -- Parent role for inheritance
    parent_role_id UUID REFERENCES platform_roles(role_id),
    
    -- Is this a default system role?
    is_system_role BOOLEAN DEFAULT false,
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, role_code)
);

-- Indexes for roles
CREATE INDEX IF NOT EXISTS idx_platform_roles_tenant ON platform_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_roles_scope ON platform_roles(scope);
CREATE INDEX IF NOT EXISTS idx_platform_roles_system ON platform_roles(is_system_role);

-- =============================================================================
-- 6. PERMISSIONS TABLE (Granular permissions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_permissions (
    permission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    permission_code VARCHAR(100) NOT NULL UNIQUE,  -- e.g., 'ENTITY.PATIENT.CREATE'
    permission_name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Permission categorization
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'ENTITY')),
    resource VARCHAR(50) NOT NULL,    -- e.g., 'PATIENT', 'APPOINTMENT', 'CLAIM'
    action VARCHAR(20) NOT NULL,      -- e.g., 'CREATE', 'READ', 'UPDATE', 'DELETE'
    
    -- Module grouping
    module VARCHAR(50),               -- e.g., 'PATIENT_CARE', 'BILLING', 'CLAIMS'
    
    -- Is this a sensitive permission?
    is_sensitive BOOLEAN DEFAULT false,
    requires_mfa BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for permissions
CREATE INDEX IF NOT EXISTS idx_platform_permissions_scope ON platform_permissions(scope);
CREATE INDEX IF NOT EXISTS idx_platform_permissions_resource ON platform_permissions(resource);
CREATE INDEX IF NOT EXISTS idx_platform_permissions_module ON platform_permissions(module);

-- =============================================================================
-- 7. ROLE_PERMISSIONS TABLE (Role to permission mapping)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_role_permissions (
    role_id UUID NOT NULL REFERENCES platform_roles(role_id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES platform_permissions(permission_id) ON DELETE CASCADE,
    
    -- Conditions for permission
    conditions JSONB DEFAULT '{}',  -- e.g., {"only_own_records": true}
    
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES platform_users(user_id),
    
    PRIMARY KEY (role_id, permission_id)
);

-- =============================================================================
-- 8. USER_ENTITY_MAP TABLE (User to entity assignments)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_user_entity_map (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES platform_users(user_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES platform_tenants(tenant_id) ON DELETE CASCADE,
    entity_id UUID REFERENCES platform_entities(entity_id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES platform_roles(role_id),
    
    -- Professional info for this entity
    employee_id VARCHAR(50),
    designation VARCHAR(100),
    department VARCHAR(100),
    
    -- Validity
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN (
        'ACTIVE', 'INACTIVE', 'SUSPENDED', 'EXPIRED'
    )),
    
    -- Is this the primary entity for the user?
    is_primary BOOLEAN DEFAULT false,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, tenant_id, entity_id, role_id)
);

-- Indexes for user_entity_map
CREATE INDEX IF NOT EXISTS idx_user_entity_map_user ON platform_user_entity_map(user_id);
CREATE INDEX IF NOT EXISTS idx_user_entity_map_tenant ON platform_user_entity_map(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_entity_map_entity ON platform_user_entity_map(entity_id);
CREATE INDEX IF NOT EXISTS idx_user_entity_map_role ON platform_user_entity_map(role_id);
CREATE INDEX IF NOT EXISTS idx_user_entity_map_status ON platform_user_entity_map(status);

-- =============================================================================
-- 9. SUBSCRIPTIONS TABLE (Billing & plans)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES platform_tenants(tenant_id) ON DELETE CASCADE,
    
    -- Plan Details
    plan_code VARCHAR(50) NOT NULL,
    plan_name VARCHAR(100) NOT NULL,
    billing_cycle VARCHAR(20) CHECK (billing_cycle IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    
    -- Pricing
    base_price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'INR',
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    
    -- Period
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN (
        'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'
    )),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    
    -- Payment
    payment_method VARCHAR(50),
    last_payment_at TIMESTAMPTZ,
    next_billing_at TIMESTAMPTZ,
    
    -- Features included
    features JSONB DEFAULT '[]',
    
    -- Add-ons
    addons JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 10. PLATFORM AUDIT LOGS (High-level platform events)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Context
    tenant_id UUID REFERENCES platform_tenants(tenant_id),
    entity_id UUID REFERENCES platform_entities(entity_id),
    user_id UUID REFERENCES platform_users(user_id),
    
    -- Event Details
    event_type VARCHAR(100) NOT NULL,  -- e.g., 'tenant.created', 'user.login'
    event_category VARCHAR(50),         -- 'AUTH', 'ADMIN', 'BILLING', 'SECURITY'
    
    -- Actor
    actor_id UUID,
    actor_email VARCHAR(255),
    actor_role VARCHAR(50),
    actor_ip VARCHAR(45),
    actor_user_agent TEXT,
    
    -- Target
    target_type VARCHAR(50),           -- 'TENANT', 'USER', 'ENTITY'
    target_id UUID,
    
    -- Changes
    old_values JSONB,
    new_values JSONB,
    
    -- Request metadata
    request_id UUID,
    correlation_id UUID,
    
    -- Result
    status VARCHAR(20) CHECK (status IN ('SUCCESS', 'FAILURE', 'PARTIAL')),
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON platform_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON platform_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON platform_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON platform_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation ON platform_audit_logs(correlation_id);

-- =============================================================================
-- 11. API KEYS TABLE (For programmatic access)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_api_keys (
    key_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES platform_tenants(tenant_id) ON DELETE CASCADE,
    entity_id UUID REFERENCES platform_entities(entity_id),
    
    -- Key Details
    key_name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,     -- SHA256 hash of the key
    key_prefix VARCHAR(10) NOT NULL,    -- First few chars for identification
    
    -- Permissions
    scopes JSONB DEFAULT '["read"]',    -- e.g., ["read", "write", "admin"]
    allowed_ips JSONB DEFAULT '[]',     -- IP whitelist
    
    -- Rate Limiting
    rate_limit INT DEFAULT 1000,        -- Requests per minute
    
    -- Validity
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    
    created_by UUID REFERENCES platform_users(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_platform_tenants_timestamp
    BEFORE UPDATE ON platform_tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_entities_timestamp
    BEFORE UPDATE ON platform_entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_domains_timestamp
    BEFORE UPDATE ON platform_domains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_users_timestamp
    BEFORE UPDATE ON platform_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_roles_timestamp
    BEFORE UPDATE ON platform_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_user_entity_map_timestamp
    BEFORE UPDATE ON platform_user_entity_map
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_subscriptions_timestamp
    BEFORE UPDATE ON platform_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- END OF CONTROL PLANE SCHEMA
-- =============================================================================
