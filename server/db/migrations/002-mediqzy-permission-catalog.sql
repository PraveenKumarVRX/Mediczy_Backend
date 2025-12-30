-- =============================================================================
-- MEDIQZY PAAS - PERMISSION CATALOG SEED DATA
-- Complete permission set for healthcare PaaS
-- =============================================================================
-- Version: 1.0.0
-- Date: 2025-01-05
-- =============================================================================

-- =============================================================================
-- PLATFORM-LEVEL PERMISSIONS (Control Plane - Super Super Admin)
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

-- Tenant Management
('PLATFORM.TENANT.CREATE', 'Create Tenant', 'Create new tenant organization', 'PLATFORM', 'TENANT', 'CREATE', 'TENANT_MGMT', true),
('PLATFORM.TENANT.READ', 'View Tenant', 'View tenant details', 'PLATFORM', 'TENANT', 'READ', 'TENANT_MGMT', false),
('PLATFORM.TENANT.UPDATE', 'Update Tenant', 'Modify tenant configuration', 'PLATFORM', 'TENANT', 'UPDATE', 'TENANT_MGMT', true),
('PLATFORM.TENANT.SUSPEND', 'Suspend Tenant', 'Suspend tenant access', 'PLATFORM', 'TENANT', 'SUSPEND', 'TENANT_MGMT', true),
('PLATFORM.TENANT.DELETE', 'Delete Tenant', 'Permanently delete tenant', 'PLATFORM', 'TENANT', 'DELETE', 'TENANT_MGMT', true),
('PLATFORM.TENANT.PROVISION', 'Provision Tenant', 'Provision tenant resources', 'PLATFORM', 'TENANT', 'PROVISION', 'TENANT_MGMT', true),

-- Domain Management
('PLATFORM.DOMAIN.CREATE', 'Create Domain', 'Add new domain mapping', 'PLATFORM', 'DOMAIN', 'CREATE', 'DOMAIN_MGMT', true),
('PLATFORM.DOMAIN.VERIFY', 'Verify Domain', 'Verify domain DNS', 'PLATFORM', 'DOMAIN', 'VERIFY', 'DOMAIN_MGMT', false),
('PLATFORM.DOMAIN.DELETE', 'Delete Domain', 'Remove domain mapping', 'PLATFORM', 'DOMAIN', 'DELETE', 'DOMAIN_MGMT', true),

-- Subscription & Billing
('PLATFORM.SUBSCRIPTION.CREATE', 'Create Subscription', 'Create new subscription', 'PLATFORM', 'SUBSCRIPTION', 'CREATE', 'BILLING', true),
('PLATFORM.SUBSCRIPTION.UPDATE', 'Update Subscription', 'Modify subscription plan', 'PLATFORM', 'SUBSCRIPTION', 'UPDATE', 'BILLING', true),
('PLATFORM.SUBSCRIPTION.CANCEL', 'Cancel Subscription', 'Cancel subscription', 'PLATFORM', 'SUBSCRIPTION', 'CANCEL', 'BILLING', true),
('PLATFORM.BILLING.VIEW', 'View Billing', 'View billing information', 'PLATFORM', 'BILLING', 'READ', 'BILLING', false),
('PLATFORM.BILLING.MANAGE', 'Manage Billing', 'Manage invoices and payments', 'PLATFORM', 'BILLING', 'UPDATE', 'BILLING', true),

-- Platform Audit
('PLATFORM.AUDIT.READ', 'View Audit Logs', 'View platform audit logs', 'PLATFORM', 'AUDIT', 'READ', 'COMPLIANCE', false),
('PLATFORM.AUDIT.EXPORT', 'Export Audit Logs', 'Export audit data', 'PLATFORM', 'AUDIT', 'EXPORT', 'COMPLIANCE', false),

-- User Impersonation (Support)
('PLATFORM.USER.IMPERSONATE', 'Impersonate User', 'Login as another user for support', 'PLATFORM', 'USER', 'IMPERSONATE', 'SUPPORT', true),

-- System Config
('PLATFORM.CONFIG.READ', 'View Platform Config', 'View system configuration', 'PLATFORM', 'CONFIG', 'READ', 'SYSTEM', false),
('PLATFORM.CONFIG.UPDATE', 'Update Platform Config', 'Modify system settings', 'PLATFORM', 'CONFIG', 'UPDATE', 'SYSTEM', true),

-- API Keys
('PLATFORM.APIKEY.CREATE', 'Create API Key', 'Generate platform API keys', 'PLATFORM', 'APIKEY', 'CREATE', 'INTEGRATION', true),
('PLATFORM.APIKEY.REVOKE', 'Revoke API Key', 'Revoke API keys', 'PLATFORM', 'APIKEY', 'REVOKE', 'INTEGRATION', true)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- TENANT-LEVEL PERMISSIONS (Tenant Admin)
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

-- Tenant Configuration
('TENANT.CONFIG.READ', 'View Tenant Config', 'View tenant settings', 'TENANT', 'CONFIG', 'READ', 'ADMIN', false),
('TENANT.CONFIG.UPDATE', 'Update Tenant Config', 'Modify tenant settings', 'TENANT', 'CONFIG', 'UPDATE', 'ADMIN', true),

-- Entity Management
('TENANT.ENTITY.CREATE', 'Create Entity', 'Add new entity/branch', 'TENANT', 'ENTITY', 'CREATE', 'ADMIN', true),
('TENANT.ENTITY.UPDATE', 'Update Entity', 'Modify entity details', 'TENANT', 'ENTITY', 'UPDATE', 'ADMIN', false),
('TENANT.ENTITY.DELETE', 'Delete Entity', 'Remove entity', 'TENANT', 'ENTITY', 'DELETE', 'ADMIN', true),

-- User Management (within tenant)
('TENANT.USER.CREATE', 'Create User', 'Add new user to tenant', 'TENANT', 'USER', 'CREATE', 'USER_MGMT', false),
('TENANT.USER.READ', 'View Users', 'View tenant users', 'TENANT', 'USER', 'READ', 'USER_MGMT', false),
('TENANT.USER.UPDATE', 'Update User', 'Modify user profile', 'TENANT', 'USER', 'UPDATE', 'USER_MGMT', false),
('TENANT.USER.DEACTIVATE', 'Deactivate User', 'Deactivate user account', 'TENANT', 'USER', 'DEACTIVATE', 'USER_MGMT', true),

-- Role Management
('TENANT.ROLE.CREATE', 'Create Role', 'Define custom role', 'TENANT', 'ROLE', 'CREATE', 'ADMIN', true),
('TENANT.ROLE.UPDATE', 'Update Role', 'Modify role permissions', 'TENANT', 'ROLE', 'UPDATE', 'ADMIN', true),
('TENANT.ROLE.ASSIGN', 'Assign Role', 'Assign role to user', 'TENANT', 'ROLE', 'ASSIGN', 'ADMIN', true),
('TENANT.ROLE.DELETE', 'Delete Role', 'Remove custom role', 'TENANT', 'ROLE', 'DELETE', 'ADMIN', true),

-- Tenant Reports
('TENANT.REPORT.VIEW', 'View Reports', 'View cross-entity reports', 'TENANT', 'REPORT', 'READ', 'ANALYTICS', false),
('TENANT.REPORT.EXPORT', 'Export Reports', 'Export tenant reports', 'TENANT', 'REPORT', 'EXPORT', 'ANALYTICS', false),

-- Tenant Billing
('TENANT.BILLING.VIEW', 'View Billing', 'View billing info', 'TENANT', 'BILLING', 'READ', 'BILLING', false),
('TENANT.BILLING.MANAGE', 'Manage Billing', 'Update payment methods', 'TENANT', 'BILLING', 'UPDATE', 'BILLING', true),

-- Audit
('TENANT.AUDIT.READ', 'View Audit Logs', 'View tenant audit logs', 'TENANT', 'AUDIT', 'READ', 'COMPLIANCE', false),

-- API Integration
('TENANT.INTEGRATION.MANAGE', 'Manage Integrations', 'Configure third-party integrations', 'TENANT', 'INTEGRATION', 'UPDATE', 'INTEGRATION', true),
('TENANT.APIKEY.CREATE', 'Create API Key', 'Generate tenant API keys', 'TENANT', 'APIKEY', 'CREATE', 'INTEGRATION', true)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - USER & ACCESS
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.USER.CREATE', 'Create Entity User', 'Add user to entity', 'ENTITY', 'USER', 'CREATE', 'USER_MGMT', false),
('ENTITY.USER.READ', 'View Entity Users', 'View entity users', 'ENTITY', 'USER', 'READ', 'USER_MGMT', false),
('ENTITY.USER.UPDATE', 'Update Entity User', 'Modify user in entity', 'ENTITY', 'USER', 'UPDATE', 'USER_MGMT', false),
('ENTITY.USER.REMOVE', 'Remove Entity User', 'Remove user from entity', 'ENTITY', 'USER', 'DELETE', 'USER_MGMT', true),
('ENTITY.ROLE.ASSIGN', 'Assign Entity Role', 'Assign role within entity', 'ENTITY', 'ROLE', 'ASSIGN', 'USER_MGMT', true)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - PATIENT & CARE (Healthcare Core)
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive, requires_mfa) VALUES

-- Patient
('ENTITY.PATIENT.CREATE', 'Register Patient', 'Register new patient', 'ENTITY', 'PATIENT', 'CREATE', 'PATIENT_CARE', false, false),
('ENTITY.PATIENT.READ', 'View Patient', 'View patient details', 'ENTITY', 'PATIENT', 'READ', 'PATIENT_CARE', true, false),
('ENTITY.PATIENT.UPDATE', 'Update Patient', 'Update patient info', 'ENTITY', 'PATIENT', 'UPDATE', 'PATIENT_CARE', true, false),
('ENTITY.PATIENT.DELETE', 'Delete Patient', 'Remove patient record', 'ENTITY', 'PATIENT', 'DELETE', 'PATIENT_CARE', true, true),
('ENTITY.PATIENT.SEARCH', 'Search Patients', 'Search patient database', 'ENTITY', 'PATIENT', 'SEARCH', 'PATIENT_CARE', false, false),
('ENTITY.PATIENT.EXPORT', 'Export Patient Data', 'Export patient records', 'ENTITY', 'PATIENT', 'EXPORT', 'PATIENT_CARE', true, true),

-- Medical Records / EHR
('ENTITY.MEDICAL_RECORD.CREATE', 'Create Medical Record', 'Add new medical record', 'ENTITY', 'MEDICAL_RECORD', 'CREATE', 'EHR', true, false),
('ENTITY.MEDICAL_RECORD.READ', 'View Medical Record', 'View medical history', 'ENTITY', 'MEDICAL_RECORD', 'READ', 'EHR', true, false),
('ENTITY.MEDICAL_RECORD.UPDATE', 'Update Medical Record', 'Modify medical record', 'ENTITY', 'MEDICAL_RECORD', 'UPDATE', 'EHR', true, false),
('ENTITY.MEDICAL_RECORD.DELETE', 'Delete Medical Record', 'Remove medical record', 'ENTITY', 'MEDICAL_RECORD', 'DELETE', 'EHR', true, true),

-- Vital Signs
('ENTITY.VITALS.CREATE', 'Record Vitals', 'Record patient vitals', 'ENTITY', 'VITALS', 'CREATE', 'PATIENT_CARE', false, false),
('ENTITY.VITALS.READ', 'View Vitals', 'View vital signs', 'ENTITY', 'VITALS', 'READ', 'PATIENT_CARE', false, false)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - APPOINTMENTS
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.APPOINTMENT.CREATE', 'Book Appointment', 'Create new appointment', 'ENTITY', 'APPOINTMENT', 'CREATE', 'APPOINTMENTS', false),
('ENTITY.APPOINTMENT.READ', 'View Appointments', 'View appointment details', 'ENTITY', 'APPOINTMENT', 'READ', 'APPOINTMENTS', false),
('ENTITY.APPOINTMENT.UPDATE', 'Update Appointment', 'Reschedule appointment', 'ENTITY', 'APPOINTMENT', 'UPDATE', 'APPOINTMENTS', false),
('ENTITY.APPOINTMENT.CANCEL', 'Cancel Appointment', 'Cancel appointment', 'ENTITY', 'APPOINTMENT', 'CANCEL', 'APPOINTMENTS', false),
('ENTITY.APPOINTMENT.CONFIRM', 'Confirm Appointment', 'Confirm appointment', 'ENTITY', 'APPOINTMENT', 'CONFIRM', 'APPOINTMENTS', false),
('ENTITY.APPOINTMENT.COMPLETE', 'Complete Appointment', 'Mark as completed', 'ENTITY', 'APPOINTMENT', 'COMPLETE', 'APPOINTMENTS', false),

-- Availability / Schedule
('ENTITY.SCHEDULE.VIEW', 'View Schedule', 'View doctor schedule', 'ENTITY', 'SCHEDULE', 'READ', 'APPOINTMENTS', false),
('ENTITY.SCHEDULE.MANAGE', 'Manage Schedule', 'Manage availability', 'ENTITY', 'SCHEDULE', 'UPDATE', 'APPOINTMENTS', false)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - BILLING & FINANCE
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.BILLING.CREATE', 'Create Bill', 'Generate invoice', 'ENTITY', 'BILLING', 'CREATE', 'BILLING', false),
('ENTITY.BILLING.READ', 'View Bills', 'View invoices', 'ENTITY', 'BILLING', 'READ', 'BILLING', false),
('ENTITY.BILLING.UPDATE', 'Update Bill', 'Modify invoice', 'ENTITY', 'BILLING', 'UPDATE', 'BILLING', false),
('ENTITY.BILLING.VOID', 'Void Bill', 'Cancel invoice', 'ENTITY', 'BILLING', 'VOID', 'BILLING', true),
('ENTITY.BILLING.REFUND', 'Process Refund', 'Issue refund', 'ENTITY', 'BILLING', 'REFUND', 'BILLING', true),

-- Payments
('ENTITY.PAYMENT.COLLECT', 'Collect Payment', 'Process payment', 'ENTITY', 'PAYMENT', 'CREATE', 'BILLING', false),
('ENTITY.PAYMENT.VIEW', 'View Payments', 'View payment history', 'ENTITY', 'PAYMENT', 'READ', 'BILLING', false),
('ENTITY.PAYMENT.RECONCILE', 'Reconcile Payments', 'Reconcile accounts', 'ENTITY', 'PAYMENT', 'RECONCILE', 'BILLING', true)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - INSURANCE & CLAIMS
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.CLAIM.SUBMIT', 'Submit Claim', 'Submit insurance claim', 'ENTITY', 'CLAIM', 'CREATE', 'CLAIMS', false),
('ENTITY.CLAIM.READ', 'View Claims', 'View claim details', 'ENTITY', 'CLAIM', 'READ', 'CLAIMS', false),
('ENTITY.CLAIM.UPDATE', 'Update Claim', 'Modify claim', 'ENTITY', 'CLAIM', 'UPDATE', 'CLAIMS', false),
('ENTITY.CLAIM.APPROVE', 'Approve Claim', 'Approve insurance claim', 'ENTITY', 'CLAIM', 'APPROVE', 'CLAIMS', true),
('ENTITY.CLAIM.REJECT', 'Reject Claim', 'Reject insurance claim', 'ENTITY', 'CLAIM', 'REJECT', 'CLAIMS', true),
('ENTITY.CLAIM.SETTLE', 'Settle Claim', 'Process claim settlement', 'ENTITY', 'CLAIM', 'SETTLE', 'CLAIMS', true),

-- Pre-authorization
('ENTITY.PREAUTH.CREATE', 'Create Pre-auth', 'Request pre-authorization', 'ENTITY', 'PREAUTH', 'CREATE', 'CLAIMS', false),
('ENTITY.PREAUTH.APPROVE', 'Approve Pre-auth', 'Approve pre-auth request', 'ENTITY', 'PREAUTH', 'APPROVE', 'CLAIMS', true),

-- Policy Management
('ENTITY.POLICY.READ', 'View Policies', 'View insurance policies', 'ENTITY', 'POLICY', 'READ', 'INSURANCE', false),
('ENTITY.POLICY.CREATE', 'Create Policy', 'Issue new policy', 'ENTITY', 'POLICY', 'CREATE', 'INSURANCE', true),
('ENTITY.POLICY.UPDATE', 'Update Policy', 'Modify policy', 'ENTITY', 'POLICY', 'UPDATE', 'INSURANCE', true)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - PRESCRIPTION & MEDICATION
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.PRESCRIPTION.CREATE', 'Create Prescription', 'Write prescription', 'ENTITY', 'PRESCRIPTION', 'CREATE', 'PHARMACY', false),
('ENTITY.PRESCRIPTION.READ', 'View Prescriptions', 'View prescription', 'ENTITY', 'PRESCRIPTION', 'READ', 'PHARMACY', false),
('ENTITY.PRESCRIPTION.UPDATE', 'Update Prescription', 'Modify prescription', 'ENTITY', 'PRESCRIPTION', 'UPDATE', 'PHARMACY', false),
('ENTITY.PRESCRIPTION.CANCEL', 'Cancel Prescription', 'Cancel prescription', 'ENTITY', 'PRESCRIPTION', 'CANCEL', 'PHARMACY', true),

-- Pharmacy Orders
('ENTITY.PHARMACY_ORDER.CREATE', 'Create Order', 'Create pharmacy order', 'ENTITY', 'PHARMACY_ORDER', 'CREATE', 'PHARMACY', false),
('ENTITY.PHARMACY_ORDER.FULFILL', 'Fulfill Order', 'Process pharmacy order', 'ENTITY', 'PHARMACY_ORDER', 'FULFILL', 'PHARMACY', false),
('ENTITY.PHARMACY_ORDER.CANCEL', 'Cancel Order', 'Cancel pharmacy order', 'ENTITY', 'PHARMACY_ORDER', 'CANCEL', 'PHARMACY', false),

-- Inventory
('ENTITY.INVENTORY.READ', 'View Inventory', 'View stock levels', 'ENTITY', 'INVENTORY', 'READ', 'PHARMACY', false),
('ENTITY.INVENTORY.MANAGE', 'Manage Inventory', 'Update stock', 'ENTITY', 'INVENTORY', 'UPDATE', 'PHARMACY', false)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - LAB & DIAGNOSTICS
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.LAB_ORDER.CREATE', 'Create Lab Order', 'Order lab tests', 'ENTITY', 'LAB_ORDER', 'CREATE', 'DIAGNOSTICS', false),
('ENTITY.LAB_ORDER.READ', 'View Lab Orders', 'View lab orders', 'ENTITY', 'LAB_ORDER', 'READ', 'DIAGNOSTICS', false),
('ENTITY.LAB_ORDER.CANCEL', 'Cancel Lab Order', 'Cancel lab test', 'ENTITY', 'LAB_ORDER', 'CANCEL', 'DIAGNOSTICS', false),

('ENTITY.LAB_RESULT.CREATE', 'Enter Results', 'Enter test results', 'ENTITY', 'LAB_RESULT', 'CREATE', 'DIAGNOSTICS', false),
('ENTITY.LAB_RESULT.READ', 'View Results', 'View test results', 'ENTITY', 'LAB_RESULT', 'READ', 'DIAGNOSTICS', false),
('ENTITY.LAB_RESULT.PUBLISH', 'Publish Results', 'Publish to patient', 'ENTITY', 'LAB_RESULT', 'PUBLISH', 'DIAGNOSTICS', false),
('ENTITY.LAB_RESULT.VERIFY', 'Verify Results', 'Approve results', 'ENTITY', 'LAB_RESULT', 'VERIFY', 'DIAGNOSTICS', true),

-- Radiology
('ENTITY.IMAGING.CREATE', 'Create Imaging Order', 'Order imaging study', 'ENTITY', 'IMAGING', 'CREATE', 'DIAGNOSTICS', false),
('ENTITY.IMAGING.READ', 'View Imaging', 'View imaging results', 'ENTITY', 'IMAGING', 'READ', 'DIAGNOSTICS', false)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - AMBULANCE / EMERGENCY
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.AMBULANCE_TRIP.CREATE', 'Create Trip', 'Book ambulance', 'ENTITY', 'AMBULANCE_TRIP', 'CREATE', 'EMERGENCY', false),
('ENTITY.AMBULANCE_TRIP.READ', 'View Trips', 'View trip details', 'ENTITY', 'AMBULANCE_TRIP', 'READ', 'EMERGENCY', false),
('ENTITY.AMBULANCE_TRIP.ASSIGN', 'Assign Trip', 'Assign to vehicle', 'ENTITY', 'AMBULANCE_TRIP', 'ASSIGN', 'EMERGENCY', false),
('ENTITY.AMBULANCE_TRIP.COMPLETE', 'Complete Trip', 'Mark trip complete', 'ENTITY', 'AMBULANCE_TRIP', 'COMPLETE', 'EMERGENCY', false),
('ENTITY.AMBULANCE_TRIP.CANCEL', 'Cancel Trip', 'Cancel trip', 'ENTITY', 'AMBULANCE_TRIP', 'CANCEL', 'EMERGENCY', false),

-- Fleet
('ENTITY.FLEET.VIEW', 'View Fleet', 'View ambulance fleet', 'ENTITY', 'FLEET', 'READ', 'EMERGENCY', false),
('ENTITY.FLEET.MANAGE', 'Manage Fleet', 'Manage vehicles', 'ENTITY', 'FLEET', 'UPDATE', 'EMERGENCY', false)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - COMMUNICATION
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.MESSAGE.SEND', 'Send Message', 'Send patient message', 'ENTITY', 'MESSAGE', 'CREATE', 'COMMUNICATION', false),
('ENTITY.MESSAGE.READ', 'Read Messages', 'View messages', 'ENTITY', 'MESSAGE', 'READ', 'COMMUNICATION', false),

('ENTITY.NOTIFICATION.SEND', 'Send Notification', 'Send notifications', 'ENTITY', 'NOTIFICATION', 'CREATE', 'COMMUNICATION', false),
('ENTITY.BROADCAST.SEND', 'Send Broadcast', 'Mass communication', 'ENTITY', 'BROADCAST', 'CREATE', 'COMMUNICATION', true)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- ENTITY-LEVEL PERMISSIONS - REPORTS & ANALYTICS
-- =============================================================================
INSERT INTO platform_permissions (permission_code, permission_name, description, scope, resource, action, module, is_sensitive) VALUES

('ENTITY.REPORT.VIEW', 'View Reports', 'View analytics', 'ENTITY', 'REPORT', 'READ', 'ANALYTICS', false),
('ENTITY.REPORT.CREATE', 'Create Report', 'Generate reports', 'ENTITY', 'REPORT', 'CREATE', 'ANALYTICS', false),
('ENTITY.REPORT.EXPORT', 'Export Report', 'Export data', 'ENTITY', 'REPORT', 'EXPORT', 'ANALYTICS', false),

('ENTITY.DASHBOARD.VIEW', 'View Dashboard', 'View entity dashboard', 'ENTITY', 'DASHBOARD', 'READ', 'ANALYTICS', false)

ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- DEFAULT SYSTEM ROLES
-- =============================================================================
INSERT INTO platform_roles (role_id, tenant_id, role_code, role_name, description, scope, is_system_role) VALUES

-- Platform Roles
('00000000-0000-0000-0000-000000000001', NULL, 'SUPER_SUPER_ADMIN', 'Super Super Admin', 'Platform owner with all permissions', 'PLATFORM', true),
('00000000-0000-0000-0000-000000000002', NULL, 'PLATFORM_OPS', 'Platform Operations', 'Infrastructure and operations team', 'PLATFORM', true),
('00000000-0000-0000-0000-000000000003', NULL, 'PLATFORM_SUPPORT', 'Platform Support', 'Customer support team', 'PLATFORM', true),

-- Default Tenant Roles (Template - will be cloned per tenant)
('00000000-0000-0000-0000-000000000010', NULL, 'TENANT_ADMIN', 'Tenant Admin', 'Full tenant administration', 'TENANT', true),
('00000000-0000-0000-0000-000000000011', NULL, 'TENANT_MANAGER', 'Tenant Manager', 'Manage entities and users', 'TENANT', true),
('00000000-0000-0000-0000-000000000012', NULL, 'TENANT_AUDITOR', 'Tenant Auditor', 'Read-only audit access', 'TENANT', true),
('00000000-0000-0000-0000-000000000013', NULL, 'TENANT_FINANCE', 'Tenant Finance', 'Billing and financial access', 'TENANT', true),

-- Default Entity Roles (Template)
('00000000-0000-0000-0000-000000000020', NULL, 'ENTITY_ADMIN', 'Entity Admin', 'Full entity administration', 'ENTITY', true),
('00000000-0000-0000-0000-000000000021', NULL, 'DOCTOR', 'Doctor', 'Healthcare provider role', 'ENTITY', true),
('00000000-0000-0000-0000-000000000022', NULL, 'NURSE', 'Nurse', 'Nursing staff role', 'ENTITY', true),
('00000000-0000-0000-0000-000000000023', NULL, 'RECEPTIONIST', 'Receptionist', 'Front desk staff', 'ENTITY', true),
('00000000-0000-0000-0000-000000000024', NULL, 'BILLING_STAFF', 'Billing Staff', 'Billing department', 'ENTITY', true),
('00000000-0000-0000-0000-000000000025', NULL, 'LAB_TECHNICIAN', 'Lab Technician', 'Lab staff', 'ENTITY', true),
('00000000-0000-0000-0000-000000000026', NULL, 'PHARMACIST', 'Pharmacist', 'Pharmacy staff', 'ENTITY', true),
('00000000-0000-0000-0000-000000000027', NULL, 'CLAIMS_PROCESSOR', 'Claims Processor', 'Insurance claims staff', 'ENTITY', true),
('00000000-0000-0000-0000-000000000028', NULL, 'CLAIMS_APPROVER', 'Claims Approver', 'Claims approval authority', 'ENTITY', true),
('00000000-0000-0000-0000-000000000029', NULL, 'AMBULANCE_DRIVER', 'Ambulance Driver', 'Ambulance driver', 'ENTITY', true)

ON CONFLICT DO NOTHING;

-- =============================================================================
-- ASSIGN PERMISSIONS TO DEFAULT ROLES
-- =============================================================================

-- Super Super Admin gets ALL platform permissions
INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', permission_id 
FROM platform_permissions 
WHERE scope = 'PLATFORM'
ON CONFLICT DO NOTHING;

-- Doctor Role permissions
INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000021', permission_id 
FROM platform_permissions 
WHERE permission_code IN (
    'ENTITY.PATIENT.CREATE',
    'ENTITY.PATIENT.READ',
    'ENTITY.PATIENT.UPDATE',
    'ENTITY.PATIENT.SEARCH',
    'ENTITY.MEDICAL_RECORD.CREATE',
    'ENTITY.MEDICAL_RECORD.READ',
    'ENTITY.MEDICAL_RECORD.UPDATE',
    'ENTITY.VITALS.CREATE',
    'ENTITY.VITALS.READ',
    'ENTITY.APPOINTMENT.READ',
    'ENTITY.APPOINTMENT.UPDATE',
    'ENTITY.APPOINTMENT.COMPLETE',
    'ENTITY.SCHEDULE.VIEW',
    'ENTITY.SCHEDULE.MANAGE',
    'ENTITY.PRESCRIPTION.CREATE',
    'ENTITY.PRESCRIPTION.READ',
    'ENTITY.PRESCRIPTION.UPDATE',
    'ENTITY.LAB_ORDER.CREATE',
    'ENTITY.LAB_ORDER.READ',
    'ENTITY.LAB_RESULT.READ',
    'ENTITY.IMAGING.CREATE',
    'ENTITY.IMAGING.READ',
    'ENTITY.MESSAGE.SEND',
    'ENTITY.MESSAGE.READ',
    'ENTITY.DASHBOARD.VIEW'
)
ON CONFLICT DO NOTHING;

-- Receptionist Role permissions
INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000023', permission_id 
FROM platform_permissions 
WHERE permission_code IN (
    'ENTITY.PATIENT.CREATE',
    'ENTITY.PATIENT.READ',
    'ENTITY.PATIENT.UPDATE',
    'ENTITY.PATIENT.SEARCH',
    'ENTITY.APPOINTMENT.CREATE',
    'ENTITY.APPOINTMENT.READ',
    'ENTITY.APPOINTMENT.UPDATE',
    'ENTITY.APPOINTMENT.CANCEL',
    'ENTITY.APPOINTMENT.CONFIRM',
    'ENTITY.SCHEDULE.VIEW',
    'ENTITY.BILLING.CREATE',
    'ENTITY.BILLING.READ',
    'ENTITY.PAYMENT.COLLECT',
    'ENTITY.MESSAGE.SEND',
    'ENTITY.MESSAGE.READ'
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- CREATE SUPER SUPER ADMIN USER
-- =============================================================================
INSERT INTO platform_users (
    user_id,
    email,
    email_verified,
    first_name,
    last_name,
    is_platform_admin,
    platform_role,
    status
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@mediqzy.com',
    true,
    'System',
    'Administrator',
    true,
    'SUPER_SUPER_ADMIN',
    'ACTIVE'
) ON CONFLICT (email) DO UPDATE SET
    is_platform_admin = true,
    platform_role = 'SUPER_SUPER_ADMIN';

-- =============================================================================
-- END OF PERMISSION CATALOG SEED
-- =============================================================================
