/**
 * Centralized Authentication Configuration
 * Single source of truth for all authentication-related settings
 * Prevents inconsistent JWT_SECRET and authentication failures
 */

import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
    dotenv.config();
}

// CRITICAL: Single JWT secret for entire application
// This MUST be the same across all authentication endpoints
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET environment variable is not set!');
    console.error('Please add JWT_SECRET to your .env file');
    console.error('Example: JWT_SECRET=your-super-secret-key-here');
    process.exit(1);
}

// JWT Configuration
export const JWT_CONFIG = {
    SECRET: JWT_SECRET,
    EXPIRY: {
        SHORT: '8h',    // For high-security operations
        NORMAL: '24h',  // Standard login
        LONG: '7d',     // Remember me
        REFRESH: '30d'  // Refresh tokens
    },
    ALGORITHM: 'HS256'
};

// Password Hashing Configuration
export const PASSWORD_CONFIG = {
    SALT_ROUNDS: 10,
    MIN_LENGTH: 8,
    MAX_LENGTH: 128
};

// Rate Limiting Configuration
export const RATE_LIMIT_CONFIG = {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000 // 15 minutes
};

// Session Configuration
export const SESSION_CONFIG = {
    COOKIE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
    COOKIE_SECURE: process.env.NODE_ENV === 'production',
    COOKIE_HTTP_ONLY: true,
    COOKIE_SAME_SITE: 'strict'
};

// Role Configuration
export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    SYSTEM_ADMIN: 'system_admin',
    ADMIN: 'admin',
    HOSPITAL_ADMIN: 'hospital_admin',
    CLINIC_ADMIN: 'clinic_admin',
    LAB_ADMIN: 'lab_admin',
    PHARMACY_ADMIN: 'pharmacy_admin',
    CORPORATE_ADMIN: 'corporate_admin',
    TPA_ADMIN: 'tpa_admin',
    PSU_ADMIN: 'psu_admin',
    NGO_ADMIN: 'ngo_admin',
    INSURER_ADMIN: 'insurer_admin',
    HOMECARE_ADMIN: 'homecare_admin',
    AMBULANCE_ADMIN: 'ambulance_admin',
    DOCTOR: 'doctor',
    NURSE: 'nurse',
    DOCTOR_ASSISTANT: 'doctor_assistant',
    INSURANCE_COORDINATOR: 'insurance_coordinator',
    PATIENT: 'patient',
    USER: 'user'
};

// Admin roles that bypass tenant restrictions
export const TENANT_BYPASS_ROLES = new Set([
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.SYSTEM_ADMIN
]);

// Organization admin roles
export const ORG_ADMIN_ROLES = new Set([
    ROLES.HOSPITAL_ADMIN,
    ROLES.CLINIC_ADMIN,
    ROLES.LAB_ADMIN,
    ROLES.PHARMACY_ADMIN,
    ROLES.TPA_ADMIN,
    ROLES.PSU_ADMIN,
    ROLES.NGO_ADMIN,
    ROLES.INSURER_ADMIN,
    ROLES.CORPORATE_ADMIN,
    ROLES.HOMECARE_ADMIN,
    ROLES.AMBULANCE_ADMIN
]);

// Export helper functions
export const isAdminRole = (role) => {
    return TENANT_BYPASS_ROLES.has(role) || ORG_ADMIN_ROLES.has(role);
};

export const canBypassTenant = (role) => {
    return TENANT_BYPASS_ROLES.has(role);
};

export default {
    JWT_CONFIG,
    PASSWORD_CONFIG,
    RATE_LIMIT_CONFIG,
    SESSION_CONFIG,
    ROLES,
    TENANT_BYPASS_ROLES,
    ORG_ADMIN_ROLES,
    isAdminRole,
    canBypassTenant
};
