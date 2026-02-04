-- Migration: Add Webinar Calendar & Notification Modules to Module Access
-- Purpose: Enable admin control over webinar features through module management
-- Date: 2026-02-04

-- ============================================================================
-- Add Webinar Modules to Module Access System
-- ============================================================================

-- 1. Webinar Management (Admin Only)
INSERT INTO module_access (user_type, module_id, module_name, category, is_enabled, can_view, can_create, can_edit, can_delete, created_at, updated_at)
VALUES 
('system_admin', 'webinar_management', 'Webinar Management', 'Admin', true, true, true, true, true, NOW(), NOW()),
('hospital_admin', 'webinar_management', 'Webinar Management', 'Admin', true, true, true, true, true, NOW(), NOW()),
('clinic_admin', 'webinar_management', 'Webinar Management', 'Admin', true, true, true, true, true, NOW(), NOW())
ON CONFLICT (user_type, module_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  updated_at = NOW();

-- 2. Webinar Hosting (Doctors)
INSERT INTO module_access (user_type, module_id, module_name, category, is_enabled, can_view, can_create, can_edit, can_delete, created_at, updated_at)
VALUES 
('doctor', 'webinar_hosting', 'Webinar Hosting', 'Webinars', true, true, true, true, false, NOW(), NOW())
ON CONFLICT (user_type, module_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  updated_at = NOW();

-- 3. Webinar Registration (Patients)
INSERT INTO module_access (user_type, module_id, module_name, category, is_enabled, can_view, can_create, can_edit, can_delete, created_at, updated_at)
VALUES 
('patient', 'webinar_registration', 'Webinar Registration', 'Webinars', true, true, true, false, false, NOW(), NOW())
ON CONFLICT (user_type, module_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  updated_at = NOW();

-- 4. Webinar Calendar Integration (All Users)
INSERT INTO module_access (user_type, module_id, module_name, category, is_enabled, can_view, can_create, can_edit, can_delete, created_at, updated_at)
VALUES 
('patient', 'webinar_calendar', 'Webinar Calendar & Reminders', 'Webinars', true, true, false, false, false, NOW(), NOW()),
('doctor', 'webinar_calendar', 'Webinar Calendar & Reminders', 'Webinars', true, true, false, false, false, NOW(), NOW()),
('system_admin', 'webinar_calendar', 'Webinar Calendar & Reminders', 'Webinars', true, true, false, false, false, NOW(), NOW())
ON CONFLICT (user_type, module_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

-- 5. Webinar Notifications (Email/Push/WhatsApp)
INSERT INTO module_access (user_type, module_id, module_name, category, is_enabled, can_view, can_create, can_edit, can_delete, created_at, updated_at)
VALUES 
('patient', 'webinar_notifications', 'Webinar Email & Push Notifications', 'Webinars', true, true, false, true, false, NOW(), NOW()),
('doctor', 'webinar_notifications', 'Webinar Email & Push Notifications', 'Webinars', true, true, false, true, false, NOW(), NOW()),
('system_admin', 'webinar_notifications', 'Webinar Email & Push Notifications', 'Webinars', true, true, true, true, true, NOW(), NOW())
ON CONFLICT (user_type, module_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  can_edit = EXCLUDED.can_edit,
  updated_at = NOW();

-- 6. Webinar Analytics (Admin & Doctors)
INSERT INTO module_access (user_type, module_id, module_name, category, is_enabled, can_view, can_create, can_edit, can_delete, created_at, updated_at)
VALUES 
('doctor', 'webinar_analytics', 'Webinar Analytics & Reports', 'Webinars', true, true, false, false, false, NOW(), NOW()),
('system_admin', 'webinar_analytics', 'Webinar Analytics & Reports', 'Webinars', true, true, false, false, false, NOW(), NOW()),
('hospital_admin', 'webinar_analytics', 'Webinar Analytics & Reports', 'Webinars', true, true, false, false, false, NOW(), NOW())
ON CONFLICT (user_type, module_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

-- ============================================================================
-- Add Module Descriptions (for admin UI)
-- ============================================================================

COMMENT ON TABLE module_access IS 'Controls which features/modules are accessible to different user roles. Admins can toggle these to enable/disable features.';

-- ============================================================================
-- Verify Installation
-- ============================================================================

SELECT 
  user_type,
  COUNT(*) as total_modules,
  COUNT(*) FILTER (WHERE module_id LIKE 'webinar_%') as webinar_modules,
  COUNT(*) FILTER (WHERE is_enabled = true) as enabled_modules
FROM module_access
WHERE user_type IN ('patient', 'doctor', 'system_admin')
GROUP BY user_type
ORDER BY user_type;

-- Show webinar modules summary
SELECT 
  module_id,
  module_name,
  COUNT(DISTINCT user_type) as available_to_user_types,
  array_agg(DISTINCT user_type ORDER BY user_type) as user_types
FROM module_access
WHERE module_id LIKE 'webinar_%'
GROUP BY module_id, module_name
ORDER BY module_id;

-- Success message
SELECT 'Webinar Modules Added Successfully!' AS status,
       '6 new webinar modules configured for patient, doctor, and admin roles' AS details;
