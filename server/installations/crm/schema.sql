CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3 (Ubuntu 18.3-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: corporate_benefit_authorization_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.corporate_benefit_authorization_status AS ENUM (
    'submitted',
    'approved',
    'declined',
    'cancelled',
    'settled',
    'expired'
);


--
-- Name: corporate_benefit_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.corporate_benefit_category AS ENUM (
    'opd',
    'diagnostics',
    'pharmacy',
    'dental',
    'vision',
    'health_checkup',
    'mental_wellness',
    'fitness',
    'vaccination',
    'other'
);


--
-- Name: corporate_benefit_program_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.corporate_benefit_program_status AS ENUM (
    'draft',
    'active',
    'paused',
    'expired',
    'archived'
);


--
-- Name: corporate_benefit_transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.corporate_benefit_transaction_type AS ENUM (
    'allocation',
    'reservation',
    'reservation_release',
    'settlement',
    'adjustment',
    'expiry',
    'reversal'
);


--
-- Name: corporate_benefit_wallet_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.corporate_benefit_wallet_status AS ENUM (
    'active',
    'paused',
    'exhausted',
    'expired',
    'archived'
);


--
-- Name: enum_achievements_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_achievements_category AS ENUM (
    'GOALS',
    'CHALLENGES',
    'STREAKS',
    'SOCIAL',
    'MILESTONES',
    'CONSISTENCY',
    'CHAMPION',
    'SPECIAL'
);


--
-- Name: enum_achievements_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_achievements_tier AS ENUM (
    'BRONZE',
    'SILVER',
    'GOLD',
    'PLATINUM',
    'DIAMOND'
);


--
-- Name: enum_appointment_inquiries_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_appointment_inquiries_status AS ENUM (
    'pending',
    'contacted',
    'scheduled',
    'cancelled'
);


--
-- Name: enum_appointments_callInitiatedBy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_appointments_callInitiatedBy" AS ENUM (
    'doctor',
    'patient'
);


--
-- Name: enum_appointments_cancelledBy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_appointments_cancelledBy" AS ENUM (
    'patient',
    'doctor',
    'admin',
    'system'
);


--
-- Name: enum_appointments_consultationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_appointments_consultationType" AS ENUM (
    'online',
    'in-person'
);


--
-- Name: enum_appointments_organization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_appointments_organization_type AS ENUM (
    'hospital',
    'clinic',
    'corporate',
    'individual'
);


--
-- Name: enum_appointments_paymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_appointments_paymentStatus" AS ENUM (
    'pending',
    'paid',
    'failed',
    'refunded'
);


--
-- Name: enum_appointments_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_appointments_status AS ENUM (
    'pending',
    'accepted',
    'scheduled',
    'confirmed',
    'in-progress',
    'completed',
    'cancelled',
    'rejected',
    'no-show',
    'rescheduled'
);


--
-- Name: enum_beds_gender_restriction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_beds_gender_restriction AS ENUM (
    'male',
    'female',
    'any'
);


--
-- Name: enum_billing_notifications_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_billing_notifications_status AS ENUM (
    'received',
    'pending',
    'paid',
    'overdue'
);


--
-- Name: enum_charge_master_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_charge_master_category AS ENUM (
    'bed_day',
    'procedure',
    'nursing',
    'ot_package',
    'lab',
    'pharmacy',
    'misc'
);


--
-- Name: enum_clinical_notes_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_clinical_notes_status AS ENUM (
    'draft',
    'completed',
    'signed',
    'amended'
);


--
-- Name: enum_communication_logs_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_communication_logs_status AS ENUM (
    'sent',
    'delivered',
    'read',
    'failed',
    'pending'
);


--
-- Name: enum_communication_logs_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_communication_logs_type AS ENUM (
    'email',
    'sms',
    'whatsapp'
);


--
-- Name: enum_corporate_plan_sponsorships_sponsorship_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_corporate_plan_sponsorships_sponsorship_type AS ENUM (
    'FULL',
    'PARTIAL',
    'UPGRADE_ONLY'
);


--
-- Name: enum_coupons_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_coupons_type AS ENUM (
    'PERCENTAGE',
    'FIXED_HC',
    'FREE_HC'
);


--
-- Name: enum_devices_assigned_to_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_devices_assigned_to_type AS ENUM (
    'hospital',
    'clinic',
    'lab',
    'pharmacy',
    'doctor',
    'doctor_assistant',
    'ambulance',
    'homecare'
);


--
-- Name: enum_devices_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_devices_status AS ENUM (
    'active',
    'inactive',
    'maintenance',
    'faulty',
    'returned',
    'lost'
);


--
-- Name: enum_devices_subscription_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_devices_subscription_plan AS ENUM (
    'basic',
    'standard',
    'premium',
    'enterprise'
);


--
-- Name: enum_doctors_organization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_doctors_organization_type AS ENUM (
    'hospital',
    'clinic',
    'individual'
);


--
-- Name: enum_doctors_prefix; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_doctors_prefix AS ENUM (
    'Dr',
    'Mr',
    'Ms',
    'Mrs',
    'Prof',
    'Dr.'
);


--
-- Name: enum_doctors_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_doctors_status AS ENUM (
    'active',
    'inactive',
    'suspended',
    'pending'
);


--
-- Name: enum_early_warning_alerts_alert_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_early_warning_alerts_alert_type AS ENUM (
    'sepsis',
    'deterioration',
    'fall_risk',
    'respiratory',
    'cardiac',
    'hypoglycemia',
    'pain'
);


--
-- Name: enum_early_warning_alerts_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_early_warning_alerts_severity AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


--
-- Name: enum_email_inboxes_ai_intent; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_email_inboxes_ai_intent AS ENUM (
    'appointment_request',
    'test_result',
    'prescription',
    'billing',
    'patient_query',
    'feedback',
    'other'
);


--
-- Name: enum_email_inboxes_ai_sentiment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_email_inboxes_ai_sentiment AS ENUM (
    'positive',
    'neutral',
    'negative'
);


--
-- Name: enum_email_inboxes_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_email_inboxes_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


--
-- Name: enum_email_logs_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_email_logs_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


--
-- Name: enum_email_logs_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_email_logs_status AS ENUM (
    'pending',
    'sent',
    'delivered',
    'bounced',
    'failed',
    'cancelled'
);


--
-- Name: enum_email_templates_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_email_templates_category AS ENUM (
    'notification',
    'welcome',
    'reminder',
    'billing',
    'system',
    'marketing'
);


--
-- Name: enum_family_members_gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_family_members_gender AS ENUM (
    'Male',
    'Female',
    'Other'
);


--
-- Name: enum_family_members_relationship; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_family_members_relationship AS ENUM (
    'spouse',
    'father',
    'mother',
    'son',
    'daughter',
    'brother',
    'sister',
    'grandfather',
    'grandmother',
    'grandson',
    'granddaughter',
    'uncle',
    'aunt',
    'nephew',
    'niece',
    'cousin',
    'guardian',
    'other'
);


--
-- Name: enum_feedback_records_sentiment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_feedback_records_sentiment AS ENUM (
    'positive',
    'neutral',
    'negative'
);


--
-- Name: enum_feedback_records_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_feedback_records_status AS ENUM (
    'new',
    'reviewed',
    'responded',
    'closed'
);


--
-- Name: enum_health_camps_camp_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_camps_camp_type AS ENUM (
    'general',
    'diabetes',
    'cardiac',
    'eye',
    'dental',
    'women_health',
    'pediatric',
    'vaccination'
);


--
-- Name: enum_health_camps_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_camps_status AS ENUM (
    'planned',
    'active',
    'completed',
    'cancelled'
);


--
-- Name: enum_health_challenges_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_challenges_category AS ENUM (
    'FITNESS',
    'NUTRITION',
    'WEIGHT',
    'MENTAL_HEALTH',
    'SLEEP',
    'HYDRATION',
    'STEPS',
    'EXERCISE',
    'MEDITATION',
    'SCREENING',
    'MEDICATION',
    'QUIT_SMOKING',
    'CUSTOM'
);


--
-- Name: enum_health_challenges_difficulty; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_challenges_difficulty AS ENUM (
    'EASY',
    'MEDIUM',
    'HARD',
    'EXPERT'
);


--
-- Name: enum_health_challenges_goal_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_challenges_goal_type AS ENUM (
    'INDIVIDUAL',
    'TEAM',
    'CUMULATIVE'
);


--
-- Name: enum_health_challenges_recurring_pattern; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_challenges_recurring_pattern AS ENUM (
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'CUSTOM'
);


--
-- Name: enum_health_challenges_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_challenges_status AS ENUM (
    'UPCOMING',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: enum_health_challenges_target_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_challenges_target_type AS ENUM (
    'COUNT',
    'DURATION',
    'DISTANCE',
    'WEIGHT',
    'BOOLEAN',
    'PERCENTAGE'
);


--
-- Name: enum_health_challenges_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_challenges_type AS ENUM (
    'OPEN',
    'PRIVATE',
    'CORPORATE',
    'FRIENDS'
);


--
-- Name: enum_health_coins_transactions_activityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_health_coins_transactions_activityType" AS ENUM (
    'DAILY_LOGIN',
    'STEPS_MILESTONE',
    'HEALTH_ASSESSMENT',
    'APPOINTMENT_BOOKING',
    'APPOINTMENT_COMPLETED',
    'PROFILE_COMPLETION',
    'MEDICATION_ADHERENCE',
    'VITAL_SIGNS_LOG',
    'HEALTH_DIARY_ENTRY',
    'REFERRAL',
    'REVIEW',
    'STREAK_BONUS',
    'WEEKLY_GOAL',
    'MONTHLY_GOAL',
    'PURCHASE',
    'CONSULTATION',
    'LAB_TEST',
    'MEDICATION',
    'OTHER'
);


--
-- Name: enum_health_coins_transactions_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_coins_transactions_status AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED',
    'REVERSED'
);


--
-- Name: enum_health_coins_transactions_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_coins_transactions_type AS ENUM (
    'EARN',
    'SPEND',
    'PURCHASE',
    'REFUND',
    'BONUS',
    'TRANSFER',
    'ADJUSTMENT'
);


--
-- Name: enum_health_diary_entryType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_health_diary_entryType" AS ENUM (
    'symptom',
    'medication',
    'mood',
    'activity',
    'diet',
    'sleep',
    'vital',
    'note',
    'prescription',
    'consultation',
    'lab_test',
    'lab_result',
    'appointment',
    'device_reading',
    'ai_consultation',
    'diagnosis',
    'procedure',
    'imaging',
    'vaccination',
    'allergy',
    'insurance_claim'
);


--
-- Name: enum_health_goals_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_goals_category AS ENUM (
    'FITNESS',
    'NUTRITION',
    'WEIGHT',
    'MENTAL_HEALTH',
    'SLEEP',
    'HYDRATION',
    'STEPS',
    'EXERCISE',
    'MEDITATION',
    'SCREENING',
    'MEDICATION',
    'QUIT_SMOKING',
    'CUSTOM'
);


--
-- Name: enum_health_goals_difficulty; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_goals_difficulty AS ENUM (
    'EASY',
    'MEDIUM',
    'HARD',
    'EXPERT'
);


--
-- Name: enum_health_goals_target_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_goals_target_type AS ENUM (
    'COUNT',
    'DURATION',
    'DISTANCE',
    'WEIGHT',
    'BOOLEAN',
    'PERCENTAGE'
);


--
-- Name: enum_health_goals_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_goals_type AS ENUM (
    'PERSONAL',
    'GROUP',
    'CORPORATE'
);


--
-- Name: enum_health_readings_alert_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_readings_alert_severity AS ENUM (
    'info',
    'warning',
    'critical'
);


--
-- Name: enum_health_readings_reading_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_health_readings_reading_type AS ENUM (
    'heart_rate',
    'blood_pressure',
    'spo2',
    'steps',
    'sleep',
    'calories',
    'distance',
    'stress',
    'ecg',
    'temperature',
    'blood_glucose',
    'weight',
    'hydration'
);


--
-- Name: enum_insurance_email_inbox_ai_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_insurance_email_inbox_ai_category AS ENUM (
    'payment_advice',
    'pre_auth_approval',
    'pre_auth_rejection',
    'pre_auth_query',
    'pre_auth_partial',
    'claim_repudiation',
    'general'
);


--
-- Name: enum_insurance_email_inbox_label; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_insurance_email_inbox_label AS ENUM (
    'pre-auth',
    'payment',
    'query',
    'rejection',
    'general'
);


--
-- Name: enum_invoices_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_invoices_status AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue',
    'cancelled'
);


--
-- Name: enum_ip_admissions_admission_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ip_admissions_admission_type AS ENUM (
    'elective',
    'emergency',
    'op_converted',
    'corporate',
    'day_care'
);


--
-- Name: enum_ip_admissions_discharge_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ip_admissions_discharge_type AS ENUM (
    'routine',
    'ama',
    'transfer',
    'death',
    'absconded'
);


--
-- Name: enum_ip_admissions_referral_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ip_admissions_referral_source AS ENUM (
    'self',
    'doctor',
    'er',
    'opd',
    'corporate',
    'ambulance',
    'transfer'
);


--
-- Name: enum_ip_admissions_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ip_admissions_status AS ENUM (
    'pre_admitted',
    'admitted',
    'in_ot',
    'in_icu',
    'discharged',
    'cancelled'
);


--
-- Name: enum_lab_tests_cancelledBy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_lab_tests_cancelledBy" AS ENUM (
    'patient',
    'hospital',
    'system'
);


--
-- Name: enum_lab_tests_confirmationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_lab_tests_confirmationStatus" AS ENUM (
    'pending',
    'confirmed',
    'rejected'
);


--
-- Name: enum_lab_tests_resultStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_lab_tests_resultStatus" AS ENUM (
    'pending',
    'ready',
    'reviewed',
    'abnormal',
    'normal'
);


--
-- Name: enum_lab_tests_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_lab_tests_status AS ENUM (
    'pending_confirmation',
    'booked',
    'completed',
    'cancelled',
    'no_show',
    'rescheduled'
);


--
-- Name: enum_lab_tests_testType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_lab_tests_testType" AS ENUM (
    'blood_test',
    'pathology',
    'radiology',
    'scan',
    'ultrasound',
    'xray',
    'ct_scan',
    'mri',
    'ecg',
    'echo',
    'eeg',
    'endoscopy',
    'colonoscopy',
    'other'
);


--
-- Name: enum_lab_tests_urgency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_lab_tests_urgency AS ENUM (
    'routine',
    'urgent',
    'stat'
);


--
-- Name: enum_leaderboards_leaderboard_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_leaderboards_leaderboard_type AS ENUM (
    'GLOBAL',
    'FRIENDS',
    'CORPORATE',
    'CHALLENGE',
    'GOAL_CATEGORY'
);


--
-- Name: enum_leaderboards_period; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_leaderboards_period AS ENUM (
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'YEARLY',
    'ALL_TIME'
);


--
-- Name: enum_medication_administrations_outcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_medication_administrations_outcome AS ENUM (
    'given',
    'not_given',
    'refused',
    'held',
    'late'
);


--
-- Name: enum_medication_orders_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_medication_orders_order_status AS ENUM (
    'active',
    'discontinued',
    'completed',
    'on_hold',
    'pending'
);


--
-- Name: enum_medication_orders_route; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_medication_orders_route AS ENUM (
    'oral',
    'iv',
    'im',
    'sc',
    'topical',
    'inhaled',
    'sublingual',
    'rectal',
    'ng_tube',
    'other'
);


--
-- Name: enum_membership_plans_billing_cycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_membership_plans_billing_cycle AS ENUM (
    'MONTHLY',
    'ANNUAL',
    'LIFETIME'
);


--
-- Name: enum_membership_plans_planType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_membership_plans_planType" AS ENUM (
    'primary',
    'addon'
);


--
-- Name: enum_membership_plans_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_membership_plans_type AS ENUM (
    'PERSONAL',
    'CORPORATE'
);


--
-- Name: enum_notification_events_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_notification_events_status AS ENUM (
    'triggered',
    'sent',
    'delivered',
    'read',
    'failed'
);


--
-- Name: enum_notification_events_userType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_notification_events_userType" AS ENUM (
    'patient',
    'doctor',
    'admin',
    'hospital'
);


--
-- Name: enum_orders_orderType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_orders_orderType" AS ENUM (
    'membership',
    'appointment',
    'prescription',
    'lab_test',
    'medicine',
    'consultation',
    'other',
    'pharmacy'
);


--
-- Name: enum_orders_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_orders_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'refunded'
);


--
-- Name: enum_organization_admins_admin_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_organization_admins_admin_role AS ENUM (
    'org_admin',
    'dept_admin',
    'billing_admin',
    'hr_admin',
    'reports_admin',
    'support_admin'
);


--
-- Name: enum_organization_admins_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_organization_admins_status AS ENUM (
    'active',
    'inactive',
    'suspended'
);


--
-- Name: enum_ot_bookings_booking_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ot_bookings_booking_type AS ENUM (
    'elective',
    'emergency',
    'urgent'
);


--
-- Name: enum_ot_bookings_ot_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ot_bookings_ot_status AS ENUM (
    'scheduled',
    'patient_in',
    'prep',
    'incision',
    'closure',
    'completed',
    'cancelled',
    'postponed'
);


--
-- Name: enum_ot_checklists_checklist_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ot_checklists_checklist_type AS ENUM (
    'pre_op_nursing',
    'sign_in',
    'time_out',
    'sign_out'
);


--
-- Name: enum_ot_rooms_room_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ot_rooms_room_type AS ENUM (
    'major',
    'minor',
    'emergency',
    'day_care',
    'cath_lab',
    'endo',
    'laser'
);


--
-- Name: enum_ot_rooms_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ot_rooms_status AS ENUM (
    'available',
    'occupied',
    'cleaning',
    'maintenance'
);


--
-- Name: enum_patients_bloodGroup; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_patients_bloodGroup" AS ENUM (
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-'
);


--
-- Name: enum_patients_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_patients_status AS ENUM (
    'active',
    'inactive',
    'deceased',
    'transferred'
);


--
-- Name: enum_payments_gateway; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_payments_gateway AS ENUM (
    'razorpay',
    'stripe',
    'paytm',
    'phonepe',
    'manual'
);


--
-- Name: enum_payments_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_payments_status AS ENUM (
    'initiated',
    'pending',
    'authorized',
    'captured',
    'success',
    'failed',
    'refunded',
    'cancelled'
);


--
-- Name: enum_pharmacy_dispense_queue_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_pharmacy_dispense_queue_status AS ENUM (
    'pending',
    'dispensed',
    'cancelled'
);


--
-- Name: enum_poc_devices_assigned_to_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_poc_devices_assigned_to_type AS ENUM (
    'doctor',
    'nurse',
    'health_camp'
);


--
-- Name: enum_poc_devices_device_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_poc_devices_device_type AS ENUM (
    'glucometer',
    'bp_monitor',
    'pulse_oximeter',
    'thermometer',
    'ecg_device',
    'hemoglobin_meter',
    'cholesterol_meter',
    'urine_analyzer',
    'pregnancy_test',
    'covid_test',
    'breath_analyzer'
);


--
-- Name: enum_poc_devices_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_poc_devices_status AS ENUM (
    'active',
    'inactive',
    'maintenance',
    'calibration_needed',
    'lost'
);


--
-- Name: enum_prescriptions_organization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_prescriptions_organization_type AS ENUM (
    'hospital',
    'clinic',
    'individual'
);


--
-- Name: enum_prescriptions_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_prescriptions_status AS ENUM (
    'draft',
    'issued',
    'dispensed',
    'cancelled',
    'active',
    'expired'
);


--
-- Name: enum_queue_entries_queueType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_queue_entries_queueType" AS ENUM (
    'scheduled',
    'walk_in',
    'urgent',
    'emergency',
    'follow_up'
);


--
-- Name: enum_queue_entries_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_queue_entries_status AS ENUM (
    'waiting',
    'called',
    'in_consultation',
    'completed',
    'no_show',
    'cancelled',
    'postponed',
    'transferred'
);


--
-- Name: enum_queue_entries_triageLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_queue_entries_triageLevel" AS ENUM (
    'resuscitation',
    'emergent',
    'urgent',
    'less_urgent',
    'non_urgent'
);


--
-- Name: enum_referral_codes_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_referral_codes_type AS ENUM (
    'USER',
    'CORPORATE',
    'AFFILIATE',
    'PROMOTIONAL'
);


--
-- Name: enum_refunds_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_refunds_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


--
-- Name: enum_reports_analysisStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_reports_analysisStatus" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


--
-- Name: enum_reports_reportType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_reports_reportType" AS ENUM (
    'lab',
    'imaging',
    'prescription',
    'general'
);


--
-- Name: enum_reports_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_reports_status AS ENUM (
    'active',
    'archived',
    'deleted',
    'pending_review'
);


--
-- Name: enum_revenue_insights_appealStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_revenue_insights_appealStatus" AS ENUM (
    'not_appealed',
    'appealed',
    'approved_on_appeal',
    'denied_on_appeal'
);


--
-- Name: enum_revenue_insights_claimStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_revenue_insights_claimStatus" AS ENUM (
    'pending',
    'submitted',
    'in_review',
    'approved',
    'partially_paid',
    'paid',
    'denied',
    'appealed',
    'written_off'
);


--
-- Name: enum_revenue_insights_denialCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_revenue_insights_denialCategory" AS ENUM (
    'missing_information',
    'authorization_required',
    'not_covered',
    'coding_error',
    'timely_filing',
    'duplicate_claim',
    'medical_necessity',
    'other'
);


--
-- Name: enum_sib_decisions_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_sib_decisions_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'executed',
    'failed'
);


--
-- Name: enum_subscription_plans_billing_cycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_subscription_plans_billing_cycle AS ENUM (
    'MONTHLY',
    'ANNUAL',
    'LIFETIME'
);


--
-- Name: enum_subscription_plans_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_subscription_plans_type AS ENUM (
    'PERSONAL',
    'CORPORATE'
);


--
-- Name: enum_team_members_employmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_team_members_employmentStatus" AS ENUM (
    'active',
    'inactive',
    'on_leave',
    'terminated'
);


--
-- Name: enum_team_members_employmentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_team_members_employmentType" AS ENUM (
    'full_time',
    'part_time',
    'contract',
    'intern'
);


--
-- Name: enum_team_members_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_team_members_role AS ENUM (
    'admin',
    'super_admin',
    'support',
    'operations',
    'marketing',
    'sales',
    'tech',
    'product',
    'customer_success',
    'finance',
    'hr',
    'legal',
    'medical_advisor'
);


--
-- Name: enum_tenants_billing_cycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_tenants_billing_cycle AS ENUM (
    'monthly',
    'quarterly',
    'annual'
);


--
-- Name: enum_tenants_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_tenants_plan AS ENUM (
    'free',
    'basic',
    'professional',
    'enterprise',
    'custom'
);


--
-- Name: enum_tenants_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_tenants_status AS ENUM (
    'pending',
    'active',
    'suspended',
    'cancelled',
    'trial'
);


--
-- Name: enum_tenants_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_tenants_type AS ENUM (
    'hospital',
    'clinic',
    'lab',
    'pharmacy',
    'ambulance',
    'corporate',
    'homecare',
    'tpa',
    'psu',
    'ngo',
    'insurer',
    'broker',
    'aggregator'
);


--
-- Name: enum_tickets_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_tickets_category AS ENUM (
    'technical',
    'billing',
    'appointment',
    'general',
    'feedback',
    'complaint'
);


--
-- Name: enum_tickets_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_tickets_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- Name: enum_tickets_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_tickets_status AS ENUM (
    'open',
    'in_progress',
    'pending',
    'resolved',
    'closed'
);


--
-- Name: enum_transactions_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_transactions_status AS ENUM (
    'pending',
    'completed',
    'failed',
    'reversed'
);


--
-- Name: enum_transactions_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_transactions_type AS ENUM (
    'credit',
    'debit',
    'refund',
    'adjustment'
);


--
-- Name: enum_user_associations_entityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_user_associations_entityType" AS ENUM (
    'hospital',
    'clinic',
    'corporate',
    'membership_plan',
    'homecare',
    'pharmacy',
    'lab',
    'mediqzy_team'
);


--
-- Name: enum_user_associations_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_user_associations_role AS ENUM (
    'patient',
    'doctor',
    'nurse',
    'doctor_assistant',
    'team_member',
    'admin',
    'staff',
    'member',
    'dependent',
    'employee'
);


--
-- Name: enum_user_associations_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_user_associations_status AS ENUM (
    'active',
    'inactive',
    'suspended',
    'pending'
);


--
-- Name: enum_user_challenge_participation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_user_challenge_participation_status AS ENUM (
    'REGISTERED',
    'ACTIVE',
    'COMPLETED',
    'WITHDRAWN',
    'DISQUALIFIED'
);


--
-- Name: enum_user_goal_progress_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_user_goal_progress_status AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'FAILED',
    'ABANDONED'
);


--
-- Name: enum_user_subscriptions_billing_cycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_user_subscriptions_billing_cycle AS ENUM (
    'MONTHLY',
    'ANNUAL',
    'LIFETIME'
);


--
-- Name: enum_user_subscriptions_payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_user_subscriptions_payment_status AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED',
    'REFUNDED'
);


--
-- Name: enum_user_subscriptions_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_user_subscriptions_status AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'CANCELLED',
    'SUSPENDED',
    'PENDING'
);


--
-- Name: enum_users_gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_gender AS ENUM (
    'Male',
    'Female',
    'Other'
);


--
-- Name: enum_users_organization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_organization_type AS ENUM (
    'hospital',
    'clinic',
    'corporate',
    'lab',
    'pharmacy',
    'individual'
);


--
-- Name: enum_users_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_status AS ENUM (
    'active',
    'inactive',
    'suspended',
    'deleted'
);


--
-- Name: enum_vital_records_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_vital_records_source AS ENUM (
    'manual',
    'iot_device',
    'wearable',
    'ventilator',
    'monitor'
);


--
-- Name: enum_wards_gender_restriction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_wards_gender_restriction AS ENUM (
    'male',
    'female',
    'any'
);


--
-- Name: enum_wards_ward_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_wards_ward_type AS ENUM (
    'general',
    'private',
    'semi_private',
    'icu',
    'nicu',
    'picu',
    'step_down',
    'recovery',
    'ot',
    'er',
    'day_care'
);


--
-- Name: enum_wearables_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_wearables_status AS ENUM (
    'available',
    'assigned',
    'active',
    'inactive',
    'lost',
    'damaged',
    'returned'
);


--
-- Name: enum_wearables_subscription_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_wearables_subscription_type AS ENUM (
    'free',
    'basic',
    'premium',
    'corporate'
);


--
-- Name: enum_wearables_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_wearables_type AS ENUM (
    'smartwatch',
    'smartband',
    'smartring'
);


--
-- Name: enum_whatsapp_templates_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_whatsapp_templates_category AS ENUM (
    'UTILITY',
    'MARKETING',
    'AUTHENTICATION'
);


--
-- Name: enum_whatsapp_templates_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_whatsapp_templates_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status_enum AS ENUM (
    'triggered',
    'sent',
    'delivered',
    'read',
    'failed'
);


--
-- Name: whatsapp_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.whatsapp_provider AS ENUM (
    'twilio',
    'facebook',
    'gupshup',
    'karix',
    'infobip',
    'messagebird'
);


--
-- Name: whatsapp_route; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.whatsapp_route AS ENUM (
    'appointments',
    'prescriptions',
    'test-results',
    'general-support',
    'emergency',
    'reminders',
    'billing',
    'marketing',
    'teleconsultation',
    'feedback',
    'custom'
);


--
-- Name: current_app_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_user_id() RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$ BEGIN RETURN NULLIF(current_setting('app.current_user_id', TRUE), '')::INTEGER;
EXCEPTION
WHEN OTHERS THEN RETURN NULL;
END;
$$;


--
-- Name: current_org_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_org_id() RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$ BEGIN RETURN NULLIF(current_setting('app.current_org_id', TRUE), '')::INTEGER;
EXCEPTION
WHEN OTHERS THEN RETURN NULL;
END;
$$;


--
-- Name: doctors_fts_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.doctors_fts_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'firstName',      '')), 'A') ||
    setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'lastName',       '')), 'A') ||
    setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'specialization', '')), 'B') ||
    setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'hospitalName',   to_jsonb(NEW)->>'clinicAddress', '')), 'C');
  RETURN NEW;
END;
$$;


--
-- Name: doctors_search_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.doctors_search_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
          NEW.search_vector := 
            setweight(to_tsvector('english', COALESCE(NEW."firstName", '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(NEW."lastName", '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(NEW.specialization, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'C');
          RETURN NEW;
        END
        $$;


--
-- Name: entity_kind_for_tenant_type(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entity_kind_for_tenant_type(p_type text) RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT kind FROM entity_kinds WHERE tenant_type = p_type $$;


--
-- Name: entity_uid_before(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entity_uid_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
  v_kind     text    := NULLIF(TG_ARGV[0], '');
  v_col      text    := TG_ARGV[1];
  v_strict   boolean := (TG_ARGV[2] = 'strict');
  v_type_col text    := NULLIF(TG_ARGV[3], '');
  v_new      jsonb   := to_jsonb(NEW);
  v_uid      text    := v_new ->> v_col;
  v_old_uid  text;
  v_prefix   text;
  v_id       bigint  := NULLIF(v_new ->> 'id', '')::bigint;
BEGIN
  IF v_type_col IS NOT NULL THEN
    v_kind := entity_kind_for_tenant_type(v_new ->> v_type_col);
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'entity_uid: %.% = "%" has no entity kind', TG_TABLE_NAME, v_type_col, v_new ->> v_type_col
        USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'entity_uid: %.id is NULL; cannot register an entity without a primary key', TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_uid := to_jsonb(OLD) ->> v_col;
    IF v_old_uid IS NOT NULL THEN
      IF v_uid IS NOT DISTINCT FROM v_old_uid THEN
        RETURN NEW;
      END IF;
      -- The ONLY way a uid may change is reissue_entity_uid(), which sets this transaction-local flag
      -- after retiring the old registry row. Anything else, including a hand-written UPDATE, is refused.
      IF COALESCE(current_setting('app.entity_uid_reissue', true), '') <> 'on' OR v_uid IS NULL THEN
        RAISE EXCEPTION 'entity_uid: %.% is immutable (% -> %); use reissue_entity_uid()', TG_TABLE_NAME, v_col, v_old_uid, v_uid
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF v_uid IS NULL THEN
    v_uid := generate_entity_uid(v_kind);
    NEW := jsonb_populate_record(NEW, jsonb_build_object(v_col, v_uid));
  ELSE
    IF v_uid !~ '^[A-Z0-9]{6}$' THEN
      RAISE EXCEPTION 'entity_uid: "%" is not a valid uid (6 characters, A-Z and 0-9)', v_uid USING ERRCODE = '23514';
    END IF;
    IF v_strict THEN
      SELECT prefix INTO v_prefix FROM entity_kinds WHERE kind = v_kind;
      IF left(v_uid, 1) <> v_prefix THEN
        RAISE EXCEPTION 'entity_uid: "%" must start with "%" for a % (got "%")', v_uid, v_prefix, v_kind, left(v_uid, 1)
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  INSERT INTO entity_registry (uid, kind, source_table, source_id) VALUES (v_uid, v_kind, TG_TABLE_NAME, v_id);
  RETURN NEW;
END
$_$;


--
-- Name: entity_uid_retire(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entity_uid_retire() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE entity_registry SET retired_at = now()
   WHERE source_table = TG_TABLE_NAME
     AND source_id = (to_jsonb(OLD) ->> 'id')::bigint
     AND retired_at IS NULL;
  RETURN OLD;
END
$$;


--
-- Name: generate_entity_uid(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_entity_uid(p_kind text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_prefix text;
  -- Same alphabet as utils/uniqueIdGenerator.js: no 0/O/1/I so an id read aloud or off a printout
  -- cannot be mistaken.
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_uid   text;
  v_i     int;
  v_tries int := 0;
BEGIN
  SELECT prefix INTO v_prefix FROM entity_kinds WHERE kind = p_kind;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'entity_uid: unknown entity kind "%"', p_kind USING ERRCODE = '22023';
  END IF;
  LOOP
    v_uid := v_prefix;
    FOR v_i IN 1..5 LOOP
      v_uid := v_uid || substr(v_chars, 1 + floor(random() * 32)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM entity_registry WHERE uid = v_uid);
    v_tries := v_tries + 1;
    IF v_tries > 200 THEN
      RAISE EXCEPTION 'entity_uid: no free uid for kind "%" after 200 tries', p_kind;
    END IF;
  END LOOP;
  RETURN v_uid;
END
$$;


--
-- Name: get_tenant_scope(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_scope(v_tenant_id integer) RETURNS integer[]
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  WITH RECURSIVE scope AS (
    -- anchor: own tenant
    SELECT id FROM tenants WHERE id = v_tenant_id
    UNION ALL
    -- children: tenants whose parent_id is in scope
    SELECT t.id FROM tenants t
    INNER JOIN scope s ON t.parent_id = s.id
  )
  SELECT ARRAY_AGG(DISTINCT id) FROM scope;
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$ BEGIN RETURN NULLIF(
    current_setting('app.is_platform_admin', TRUE),
    ''
  ) = 'true';
EXCEPTION
WHEN OTHERS THEN RETURN FALSE;
END;
$$;


--
-- Name: reissue_entity_uid(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reissue_entity_uid(p_table text, p_id bigint, p_reason text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
  v_rule record;
  v_old  text;
  v_kind text;
  v_new  text;
  v_ref  record;
BEGIN
  SELECT * INTO v_rule FROM entity_uid_rules WHERE table_name = p_table;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reissue_entity_uid: table "%" is not under the entity uid rule', p_table;
  END IF;

  EXECUTE format('SELECT %I FROM %I WHERE id = $1', v_rule.column_name, p_table) INTO v_old USING p_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'reissue_entity_uid: %.id=% not found or has no uid', p_table, p_id;
  END IF;

  SELECT kind INTO v_kind FROM entity_registry WHERE uid = v_old AND retired_at IS NULL;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'reissue_entity_uid: % is not an active uid', v_old;
  END IF;

  v_new := generate_entity_uid(v_kind);

  UPDATE entity_registry SET retired_at = now(), legacy = true WHERE uid = v_old AND retired_at IS NULL;
  PERFORM set_config('app.entity_uid_reissue', 'on', true);
  EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2', p_table, v_rule.column_name) USING v_new, p_id;
  PERFORM set_config('app.entity_uid_reissue', 'off', true);

  -- Every column that references this uid follows it. Found from the foreign keys, never from a list.
  FOR v_ref IN
    SELECT k.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint k
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
     WHERE k.contype = 'f' AND k.confrelid = 'entity_registry'::regclass
       AND array_length(k.conkey, 1) = 1
       AND k.conrelid <> 'entity_uid_aliases'::regclass
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', v_ref.tbl, v_ref.col, v_ref.col) USING v_new, v_old;
  END LOOP;

  UPDATE entity_uid_aliases SET uid = v_new WHERE uid = v_old;
  INSERT INTO entity_uid_aliases (old_uid, uid, reason) VALUES (v_old, v_new, p_reason);
  RETURN v_new;
END
$_$;


--
-- Name: sync_uuid_id_map(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_uuid_id_map() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    INSERT INTO uuid_id_map VALUES ('user', NEW.id, NEW.uuid_id)
    ON CONFLICT (entity_type, integer_id) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'doctors' THEN
    INSERT INTO uuid_id_map VALUES ('doctor', NEW.id, NEW.uuid_id)
    ON CONFLICT (entity_type, integer_id) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'appointments' THEN
    INSERT INTO uuid_id_map VALUES ('appointment', NEW.id, NEW.uuid_id)
    ON CONFLICT (entity_type, integer_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: uid_ref_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uid_ref_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
  v_int_col text := TG_ARGV[0];
  v_uid_col text := TG_ARGV[1];
  v_target  text := TG_ARGV[2];
  v_tcol    text := TG_ARGV[3];
  v_row     jsonb  := to_jsonb(NEW);
  v_int     bigint := NULLIF(v_row ->> v_int_col, '')::bigint;
  v_uid     text   := v_row ->> v_uid_col;
  v_old     jsonb;
  v_old_int bigint;
  v_old_uid text;
  v_int_authority boolean := false;
  v_reg_tbl text;
  v_reg_id  bigint;
  v_found   text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old     := to_jsonb(OLD);
    v_old_int := NULLIF(v_old ->> v_int_col, '')::bigint;
    v_old_uid := v_old ->> v_uid_col;
    IF v_int IS DISTINCT FROM v_old_int AND v_uid IS NOT DISTINCT FROM v_old_uid THEN
      v_int_authority := true;          -- only the integer changed: the uid follows it
    ELSIF v_uid IS DISTINCT FROM v_old_uid AND v_int IS NOT DISTINCT FROM v_old_int THEN
      v_int := NULL;                    -- only the uid changed: the integer follows it
    END IF;
  END IF;

  IF v_int_authority OR v_uid IS NULL THEN
    -- the integer is the authority: derive the uid from it (NULL when the integer is NULL or dangling)
    v_found := NULL;
    IF v_int IS NOT NULL THEN
      EXECUTE format('SELECT %I FROM %I WHERE id = $1', v_tcol, v_target) INTO v_found USING v_int;
    END IF;
    IF v_found IS DISTINCT FROM v_uid THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(v_uid_col, v_found));
    END IF;
  ELSE
    SELECT source_table, source_id INTO v_reg_tbl, v_reg_id FROM entity_registry WHERE uid = v_uid;
    IF v_reg_tbl IS NULL THEN
      RAISE EXCEPTION 'uid_ref: %.% = "%" is not a registered uid', TG_TABLE_NAME, v_uid_col, v_uid USING ERRCODE = '23503';
    END IF;
    IF v_reg_tbl <> v_target THEN
      RAISE EXCEPTION 'uid_ref: %.% = "%" is a % uid, but this column references %',
        TG_TABLE_NAME, v_uid_col, v_uid, v_reg_tbl, v_target USING ERRCODE = '23514';
    END IF;
    IF v_int IS NULL THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(v_int_col, v_reg_id));
    ELSIF v_int <> v_reg_id THEN
      RAISE EXCEPTION 'uid_ref: %.% = % but %.% = "%" points at % #%. The integer and the uid must agree.',
        TG_TABLE_NAME, v_int_col, v_int, TG_TABLE_NAME, v_uid_col, v_uid, v_target, v_reg_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$_$;


--
-- Name: users_fts_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.users_fts_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW."firstName", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."lastName",  '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.email,       '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."phoneNumber", '')), 'C');
  RETURN NEW;
END;
$$;


--
-- Name: users_ohc_role_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.users_ohc_role_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_kind text;
BEGIN
  IF NEW.role IN ('ohc_doctor', 'ohc_staff') THEN
    IF NEW.organization_uid IS NULL THEN RAISE EXCEPTION 'users: % must belong to a hospital or clinic (organization_uid is required)', NEW.role USING ERRCODE = '23502'; END IF;
    SELECT kind INTO v_kind FROM entity_registry WHERE uid = NEW.organization_uid AND retired_at IS NULL;
    IF v_kind IS NULL OR v_kind NOT IN ('hospital', 'clinic') THEN
      RAISE EXCEPTION 'users: % must belong to a hospital or clinic, not a % (organization_uid %)', NEW.role, COALESCE(v_kind, 'unknown'), NEW.organization_uid USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: users_organization_uid_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.users_organization_uid_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_otype  text := NEW.organization_type::text;
  v_tenant record;
  v_uid    text;
  v_n      int;
  v_kind   text;
BEGIN
  -- 1. derive when the writer did not say
  IF NEW.organization_uid IS NULL AND NEW.organization_id IS NOT NULL THEN
    SELECT t.id, t.type::text AS ttype, t.unique_id INTO v_tenant FROM tenants t WHERE t.id = NEW.organization_id;

    IF v_otype = 'corporate' THEN
      v_n := 0;
      IF v_tenant.id IS NOT NULL AND v_tenant.ttype = 'corporate' THEN
        SELECT count(*), min(c.unique_id) INTO v_n, v_uid
          FROM corporates c WHERE c.tenant_id = v_tenant.id AND c.status ILIKE 'active';
        IF v_n = 1 THEN
          NEW.organization_uid := v_uid;
        END IF;
      END IF;
      IF NEW.organization_uid IS NULL AND v_n = 0 THEN
        SELECT c.unique_id INTO v_uid FROM corporates c WHERE c.id = NEW.organization_id;
        NEW.organization_uid := v_uid;   -- organization_id is itself a corporates id (may stay NULL)
      END IF;

    ELSIF v_otype IN ('hospital', 'clinic', 'lab', 'pharmacy') THEN
      IF v_tenant.id IS NOT NULL AND v_tenant.ttype = v_otype THEN
        NEW.organization_uid := v_tenant.unique_id;
      END IF;

    ELSE
      IF v_tenant.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM corporates c WHERE c.id = NEW.organization_id) THEN
        NEW.organization_uid := v_tenant.unique_id;
      END IF;
    END IF;
  END IF;

  -- 2. the organisation's kind must agree with the role
  IF NEW.organization_uid IS NOT NULL THEN
    SELECT kind INTO v_kind FROM entity_registry WHERE uid = NEW.organization_uid AND retired_at IS NULL;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'users.organization_uid "%" is not an active registered uid', NEW.organization_uid
        USING ERRCODE = '23503';
    END IF;
    IF (NEW.role IN ('corporate_admin', 'corporate_cmo', 'corporate_ohc') AND v_kind <> 'corporate')
       OR (NEW.role = 'hr_staff' AND v_otype = 'corporate' AND v_kind <> 'corporate')
       OR (NEW.role = 'hr_staff' AND v_otype <> 'corporate' AND v_kind = 'corporate') THEN
      RAISE EXCEPTION 'users: role "%" in a "%" organisation cannot belong to a % (organization_uid %). hr_staff is hospital HRMS in a hospital and employee wellness in a corporate; the organisation kind must match.',
        NEW.role, v_otype, v_kind, NEW.organization_uid USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: users_search_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.users_search_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.search_vector := 
          setweight(to_tsvector('english', COALESCE(NEW."firstName", '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW."lastName", '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW."phoneNumber", '')), 'C');
        RETURN NEW;
      END
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_v2_refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_v2_refresh_tokens (
    id bigint NOT NULL,
    jti uuid NOT NULL,
    user_id integer NOT NULL,
    role character varying(50) NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by_jti uuid,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id integer,
    tenant_uid text
);


--
-- Name: api_v2_refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_v2_refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_v2_refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_v2_refresh_tokens_id_seq OWNED BY public.api_v2_refresh_tokens.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text,
    user_type text,
    user_email text,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    data_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    changes_before jsonb DEFAULT '{}'::jsonb NOT NULL,
    changes_after jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address text,
    user_agent text,
    method text,
    endpoint text,
    status text,
    status_code integer,
    error_message text,
    is_phi boolean DEFAULT false NOT NULL,
    is_pii boolean DEFAULT false NOT NULL,
    purpose text,
    consent_id text,
    session_id text,
    retention_date timestamp with time zone,
    "timestamp" timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: corporates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporates (
    id integer NOT NULL,
    "companyName" character varying(255) NOT NULL,
    "contactPerson" character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    "phoneNumber" character varying(20) NOT NULL,
    "alternatePhone" character varying(20),
    industry character varying(100),
    "employeeCount" integer,
    "gstNumber" character varying(50),
    "panNumber" character varying(50),
    address jsonb DEFAULT '{}'::jsonb,
    "packageType" character varying(50) DEFAULT 'Standard'::character varying,
    "packageStartDate" date,
    "packageEndDate" date,
    "packageAmount" numeric(10,2),
    services jsonb DEFAULT '[]'::jsonb,
    "contractDocument" character varying(500),
    status character varying(50) DEFAULT 'Pending'::character varying,
    "leadSource" character varying(100),
    "assignedTo" integer,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    tenant_id integer,
    onboarded_by character varying(50),
    onboarded_by_id integer,
    unique_id character varying(6) NOT NULL,
    uid uuid DEFAULT public.uuid_generate_v4(),
    password character varying(255),
    "passwordResetToken" character varying(255),
    "passwordResetExpires" timestamp with time zone,
    aggregator_id integer,
    aggregator_type character varying(50),
    owned_by_tenant_id integer,
    tenant_uid text,
    aggregator_uid text,
    owned_by_tenant_uid text,
    CONSTRAINT corporates_aggregator_type_check CHECK (((aggregator_type)::text = ANY (ARRAY[('broker'::character varying)::text, ('tpa'::character varying)::text, ('insurance'::character varying)::text, ('hospital'::character varying)::text, ('aggregator'::character varying)::text])))
);

ALTER TABLE ONLY public.corporates FORCE ROW LEVEL SECURITY;


--
-- Name: corporates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.corporates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: corporates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.corporates_id_seq OWNED BY public.corporates.id;


--
-- Name: crm_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activities (
    id bigint NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    lead_id bigint,
    deal_id bigint,
    scheduled_at timestamp with time zone,
    completed_at timestamp with time zone,
    outcome character varying(100),
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text,
    corporate_uid text,
    contact_id bigint
);


--
-- Name: crm_activities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_activities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_activities_id_seq OWNED BY public.crm_activities.id;


--
-- Name: crm_agencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_agencies (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    owner_name character varying(255),
    email character varying(255),
    phone character varying(50),
    city character varying(100),
    territory character varying(255),
    gstin character varying(50),
    onboarding_step integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'onboarding'::character varying NOT NULL,
    monthly_activations integer DEFAULT 0 NOT NULL,
    agent_count integer DEFAULT 0 NOT NULL,
    total_override numeric(15,2) DEFAULT 0 NOT NULL,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_agencies_onboarding_step_check CHECK (((onboarding_step >= 1) AND (onboarding_step <= 5)))
);


--
-- Name: crm_agencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_agencies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_agencies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_agencies_id_seq OWNED BY public.crm_agencies.id;


--
-- Name: crm_agent_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_agent_memories (
    id bigint NOT NULL,
    entity_uid text DEFAULT ('crm-agent-memory-'::text || (gen_random_uuid())::text) NOT NULL,
    tenant_uid text NOT NULL,
    actor_user_id bigint NOT NULL,
    memory_key character varying(160) NOT NULL,
    category character varying(60) DEFAULT 'general'::character varying NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    source character varying(80) DEFAULT 'agent'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    corporate_uid text
);


--
-- Name: crm_agent_memories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_agent_memories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_agent_memories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_agent_memories_id_seq OWNED BY public.crm_agent_memories.id;


--
-- Name: crm_agent_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_agent_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_uid text DEFAULT ('crm-agent-proposal-'::text || (gen_random_uuid())::text) NOT NULL,
    tenant_uid text NOT NULL,
    actor_user_id bigint NOT NULL,
    tool_name character varying(100) NOT NULL,
    args jsonb DEFAULT '{}'::jsonb NOT NULL,
    preview jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    confirmed_at timestamp with time zone,
    applied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    corporate_uid text,
    CONSTRAINT crm_agent_proposals_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('applied'::character varying)::text, ('rejected'::character varying)::text, ('expired'::character varying)::text])))
);


--
-- Name: crm_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_agents (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    city character varying(100),
    channel_type character varying(50) DEFAULT 'IFA'::character varying NOT NULL,
    agent_code character varying(50),
    agency_id bigint,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    notes text,
    total_activations integer DEFAULT 0 NOT NULL,
    total_earned numeric(15,2) DEFAULT 0 NOT NULL,
    pending_payout numeric(15,2) DEFAULT 0 NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_agents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_agents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_agents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_agents_id_seq OWNED BY public.crm_agents.id;


--
-- Name: crm_ai_email_communications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_ai_email_communications (
    id bigint NOT NULL,
    entity_type character varying(40),
    entity_id bigint,
    lead_id bigint,
    deal_id bigint,
    contact_email character varying(255),
    subject text,
    body text,
    intent character varying(100),
    tone character varying(80),
    status character varying(40) DEFAULT 'draft'::character varying,
    event_type character varying(40),
    sentiment character varying(40),
    engagement_score integer DEFAULT 0,
    conversion_signal character varying(40),
    urgency character varying(40),
    next_action jsonb DEFAULT '{}'::jsonb,
    suggested_stage character varying(100),
    revenue_impact numeric(15,2) DEFAULT 0,
    ai_payload jsonb DEFAULT '{}'::jsonb,
    learning_tags jsonb DEFAULT '[]'::jsonb,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_ai_email_communications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_ai_email_communications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_ai_email_communications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_ai_email_communications_id_seq OWNED BY public.crm_ai_email_communications.id;


--
-- Name: crm_ai_growth_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_ai_growth_recommendations (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    scope_type character varying(50) NOT NULL,
    scope_ref character varying(160),
    title character varying(240) NOT NULL,
    recommendation text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    estimated_impact_amount numeric(14,2),
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_ai_growth_recommendations_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('accepted'::character varying)::text, ('dismissed'::character varying)::text, ('applied'::character varying)::text])))
);


--
-- Name: crm_ai_growth_recommendations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_ai_growth_recommendations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_ai_growth_recommendations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_ai_growth_recommendations_id_seq OWNED BY public.crm_ai_growth_recommendations.id;


--
-- Name: crm_appointment_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_appointment_links (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    identity_id bigint,
    appointment_id bigint,
    patient_id bigint,
    doctor_id bigint,
    hospital_id bigint,
    branch_id bigint,
    department_id bigint,
    service_line_id bigint,
    appointment_status character varying(40) DEFAULT 'booked'::character varying NOT NULL,
    scheduled_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    no_show_at timestamp with time zone,
    checked_in_at timestamp with time zone,
    consulted_at timestamp with time zone,
    source_system character varying(100),
    source_ref character varying(240),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_appointment_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_appointment_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_appointment_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_appointment_links_id_seq OWNED BY public.crm_appointment_links.id;


--
-- Name: crm_approval_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_approval_workflows (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    entity_type character varying(80) NOT NULL,
    entity_id bigint NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    requested_by bigint,
    approved_by bigint,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_approval_workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_approval_workflows_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_approval_workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_approval_workflows_id_seq OWNED BY public.crm_approval_workflows.id;


--
-- Name: crm_assignment_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_assignment_rules (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    rule_name character varying(160) NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    assignment_strategy character varying(40) DEFAULT 'round_robin'::character varying NOT NULL,
    target_user_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_team_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    fallback_user_id bigint,
    sla_rule_id bigint,
    created_by bigint,
    updated_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_assignment_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_assignment_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_assignment_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_assignment_rules_id_seq OWNED BY public.crm_assignment_rules.id;


--
-- Name: crm_attribution_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_attribution_results (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    identity_id bigint,
    conversion_event_id bigint,
    revenue_event_id bigint,
    campaign_id bigint,
    source_id bigint,
    model character varying(40) NOT NULL,
    attribution_window_days integer DEFAULT 90 NOT NULL,
    attributed_weight numeric(8,6) DEFAULT 0 NOT NULL,
    attributed_revenue numeric(14,2) DEFAULT 0 NOT NULL,
    attributed_conversion_count numeric(14,4) DEFAULT 0 NOT NULL,
    calculation_run_id bigint,
    input_touchpoint_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_attribution_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_attribution_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_attribution_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_attribution_results_id_seq OWNED BY public.crm_attribution_results.id;


--
-- Name: crm_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_audit_log (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    entity_type character varying(80) NOT NULL,
    entity_id bigint,
    event_type character varying(80) NOT NULL,
    actor_user_id bigint,
    actor_role character varying(80),
    ip_address character varying(80),
    user_agent text,
    old_value jsonb,
    new_value jsonb,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text,
    corporate_uid text
);


--
-- Name: crm_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_audit_log_id_seq OWNED BY public.crm_audit_log.id;


--
-- Name: crm_automation_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_automation_executions (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    automation_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_automation_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_automation_executions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_automation_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_automation_executions_id_seq OWNED BY public.crm_automation_executions.id;


--
-- Name: crm_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_automations (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    trigger_type character varying(50) NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    delay_minutes integer DEFAULT 0 NOT NULL,
    action_type character varying(50) NOT NULL,
    action_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_automations_delay_minutes_check CHECK ((delay_minutes >= 0))
);


--
-- Name: crm_automations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_automations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_automations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_automations_id_seq OWNED BY public.crm_automations.id;


--
-- Name: crm_business_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_business_hours (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(120) NOT NULL,
    timezone character varying(80) DEFAULT 'Asia/Kolkata'::character varying NOT NULL,
    schedule jsonb DEFAULT '{}'::jsonb NOT NULL,
    holidays jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_business_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_business_hours_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_business_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_business_hours_id_seq OWNED BY public.crm_business_hours.id;


--
-- Name: crm_calculation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_calculation_runs (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    run_type character varying(60) NOT NULL,
    status character varying(30) DEFAULT 'running'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    records_seen integer DEFAULT 0 NOT NULL,
    records_written integer DEFAULT 0 NOT NULL,
    error_summary text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: crm_calculation_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_calculation_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_calculation_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_calculation_runs_id_seq OWNED BY public.crm_calculation_runs.id;


--
-- Name: crm_campaign_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_campaign_costs (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    campaign_id bigint,
    source_id bigint,
    cost_type character varying(50) NOT NULL,
    vendor_id bigint,
    cost_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    currency character varying(10) DEFAULT 'INR'::character varying NOT NULL,
    invoice_ref character varying(160),
    external_spend_id character varying(240),
    is_imported boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_campaign_costs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_campaign_costs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_campaign_costs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_campaign_costs_id_seq OWNED BY public.crm_campaign_costs.id;


--
-- Name: crm_campaign_performance_mart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_campaign_performance_mart (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    campaign_id bigint,
    source_id bigint,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_campaign_performance_mart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_campaign_performance_mart_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_campaign_performance_mart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_campaign_performance_mart_id_seq OWNED BY public.crm_campaign_performance_mart.id;


--
-- Name: crm_campaigns_unified; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_campaigns_unified (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    channel character varying(60) NOT NULL,
    platform character varying(80),
    account_key character varying(160),
    external_campaign_id character varying(240),
    name character varying(240) NOT NULL,
    objective character varying(100),
    lifecycle_status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    utm_source character varying(120),
    utm_medium character varying(120),
    utm_campaign character varying(200),
    utm_term character varying(200),
    utm_content character varying(200),
    budget_amount numeric(14,2),
    budget_currency character varying(10) DEFAULT 'INR'::character varying NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hospital_id bigint,
    branch_id bigint,
    service_line_id bigint,
    campaign_code character varying(120),
    description text,
    campaign_type character varying(80),
    source character varying(120),
    medium character varying(120),
    start_date date,
    end_date date,
    actual_spend_amount numeric(14,2) DEFAULT 0 NOT NULL,
    approval_status character varying(30) DEFAULT 'approved'::character varying NOT NULL,
    legacy_email_campaign_id bigint,
    deleted_at timestamp with time zone,
    audience_ref character varying(240),
    template_ref character varying(240),
    last_run_at timestamp with time zone,
    last_error text,
    CONSTRAINT crm_campaigns_unified_lifecycle_status_check CHECK (((lifecycle_status)::text = ANY (ARRAY[('draft'::character varying)::text, ('active'::character varying)::text, ('paused'::character varying)::text, ('completed'::character varying)::text, ('archived'::character varying)::text])))
);


--
-- Name: crm_campaigns_unified_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_campaigns_unified_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_campaigns_unified_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_campaigns_unified_id_seq OWNED BY public.crm_campaigns_unified.id;


--
-- Name: crm_channel_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_channel_metrics (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    provider character varying(80) NOT NULL,
    metric_date date NOT NULL,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    external_ref character varying(240),
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_channel_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_channel_metrics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_channel_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_channel_metrics_id_seq OWNED BY public.crm_channel_metrics.id;


--
-- Name: crm_chatwoot_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_chatwoot_accounts (
    tenant_id bigint NOT NULL,
    account_id bigint NOT NULL,
    api_token_env character varying(120) NOT NULL,
    webhook_secret_env character varying(120) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_chatwoot_accounts_account_id_check CHECK ((account_id > 0)),
    CONSTRAINT crm_chatwoot_accounts_tenant_id_check CHECK ((tenant_id > 0))
);


--
-- Name: crm_chatwoot_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_chatwoot_conversations (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    integration_id bigint NOT NULL,
    customer_id character varying(320) NOT NULL,
    customer_name character varying(240),
    crm_conversation_id bigint NOT NULL,
    contact_id bigint,
    conversation_id bigint
);


--
-- Name: crm_chatwoot_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_chatwoot_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_chatwoot_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_chatwoot_conversations_id_seq OWNED BY public.crm_chatwoot_conversations.id;


--
-- Name: crm_chatwoot_inboxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_chatwoot_inboxes (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    inbox_id bigint NOT NULL,
    channel character varying(30) NOT NULL,
    channel_address character varying(320) NOT NULL,
    provider character varying(30) NOT NULL,
    credentials_prefix character varying(100) NOT NULL,
    inbound_webhook_url text,
    enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT crm_chatwoot_inboxes_channel_check CHECK (((channel)::text = ANY (ARRAY[('whatsapp'::character varying)::text, ('sms'::character varying)::text, ('email'::character varying)::text, ('in_app'::character varying)::text]))),
    CONSTRAINT crm_chatwoot_inboxes_check CHECK (((((channel)::text = ANY (ARRAY[('whatsapp'::character varying)::text, ('sms'::character varying)::text])) AND ((provider)::text = 'twilio'::text)) OR (((channel)::text = 'email'::text) AND ((provider)::text = 'smtp'::text)) OR (((channel)::text = 'in_app'::text) AND ((provider)::text = 'internal'::text)))),
    CONSTRAINT crm_chatwoot_inboxes_inbox_id_check CHECK ((inbox_id > 0)),
    CONSTRAINT crm_chatwoot_inboxes_provider_check CHECK (((provider)::text = ANY (ARRAY[('twilio'::character varying)::text, ('smtp'::character varying)::text, ('internal'::character varying)::text])))
);


--
-- Name: crm_chatwoot_inboxes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_chatwoot_inboxes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_chatwoot_inboxes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_chatwoot_inboxes_id_seq OWNED BY public.crm_chatwoot_inboxes.id;


--
-- Name: crm_chatwoot_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_chatwoot_jobs (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    bridge_conversation_id bigint NOT NULL,
    direction character varying(20) NOT NULL,
    external_id character varying(240) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    last_error text,
    provider_message_id character varying(240),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_chatwoot_jobs_direction_check CHECK (((direction)::text = ANY (ARRAY[('inbound'::character varying)::text, ('outbound'::character varying)::text]))),
    CONSTRAINT crm_chatwoot_jobs_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('sent'::character varying)::text, ('failed'::character varying)::text, ('uncertain'::character varying)::text])))
);


--
-- Name: crm_chatwoot_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_chatwoot_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_chatwoot_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_chatwoot_jobs_id_seq OWNED BY public.crm_chatwoot_jobs.id;


--
-- Name: crm_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_commissions (
    id bigint NOT NULL,
    agent_id bigint,
    agent_code character varying(50),
    agent_name character varying(255),
    subscriber_name character varying(255),
    subscriber_phone character varying(50),
    subscriber_email character varying(255),
    plan_code character varying(50),
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    commission_type character varying(20) DEFAULT 'y1'::character varying NOT NULL,
    activation_date date,
    eligible_date date,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    paid_at timestamp with time zone,
    clawback_reason text,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_commissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_commissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_commissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_commissions_id_seq OWNED BY public.crm_commissions.id;


--
-- Name: crm_communication_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_communication_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    identity_id bigint,
    lead_id bigint,
    contact_id bigint,
    campaign_id bigint,
    conversation_id bigint,
    channel character varying(30) NOT NULL,
    direction character varying(20) NOT NULL,
    message_type character varying(50) DEFAULT 'message'::character varying NOT NULL,
    template_id bigint,
    subject character varying(240),
    body_preview text,
    provider character varying(80),
    provider_message_id character varying(240),
    status character varying(40) DEFAULT 'queued'::character varying NOT NULL,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    clicked_at timestamp with time zone,
    replied_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_reason text,
    owner_user_id bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text,
    corporate_uid text,
    CONSTRAINT crm_communication_events_direction_check CHECK (((direction)::text = ANY (ARRAY[('inbound'::character varying)::text, ('outbound'::character varying)::text, ('system'::character varying)::text])))
);


--
-- Name: crm_communication_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_communication_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_communication_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_communication_events_id_seq OWNED BY public.crm_communication_events.id;


--
-- Name: crm_communication_hub_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_communication_hub_alerts (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    alert_type character varying(80) NOT NULL,
    severity character varying(20) DEFAULT 'warning'::character varying NOT NULL,
    title character varying(240) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_type character varying(80),
    source_id bigint,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_by bigint,
    acknowledged_at timestamp with time zone,
    resolved_by bigint,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_communication_hub_alerts_severity_check CHECK (((severity)::text = ANY (ARRAY[('info'::character varying)::text, ('warning'::character varying)::text, ('critical'::character varying)::text]))),
    CONSTRAINT crm_communication_hub_alerts_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('acknowledged'::character varying)::text, ('resolved'::character varying)::text])))
);


--
-- Name: crm_communication_hub_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_communication_hub_alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_communication_hub_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_communication_hub_alerts_id_seq OWNED BY public.crm_communication_hub_alerts.id;


--
-- Name: crm_communication_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_communication_templates (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(200) NOT NULL,
    channel character varying(30) NOT NULL,
    category character varying(80) DEFAULT 'general'::character varying NOT NULL,
    subject character varying(240),
    body text DEFAULT ''::text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by bigint,
    approved_by bigint,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_communication_templates_channel_check CHECK (((channel)::text = ANY (ARRAY[('email'::character varying)::text, ('whatsapp'::character varying)::text, ('sms'::character varying)::text, ('push'::character varying)::text, ('in_app'::character varying)::text]))),
    CONSTRAINT crm_communication_templates_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending_approval'::character varying)::text, ('approved'::character varying)::text, ('archived'::character varying)::text])))
);


--
-- Name: crm_communication_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_communication_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_communication_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_communication_templates_id_seq OWNED BY public.crm_communication_templates.id;


--
-- Name: crm_consent_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_consent_records (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    identity_id bigint,
    contact_id bigint,
    channel character varying(30) NOT NULL,
    purpose character varying(80) NOT NULL,
    status character varying(30) DEFAULT 'unknown'::character varying NOT NULL,
    source character varying(100),
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    withdrawn_at timestamp with time zone,
    proof_ref character varying(240),
    captured_by bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_consent_records_status_check CHECK (((status)::text = ANY (ARRAY[('opted_in'::character varying)::text, ('opted_out'::character varying)::text, ('unknown'::character varying)::text, ('revoked'::character varying)::text, ('expired'::character varying)::text])))
);


--
-- Name: crm_consent_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_consent_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_consent_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_consent_records_id_seq OWNED BY public.crm_consent_records.id;


--
-- Name: crm_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    company character varying(255),
    designation character varying(255),
    address text,
    city character varying(100),
    state character varying(100),
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    lead_id bigint,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text
);


--
-- Name: crm_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_contacts_id_seq OWNED BY public.crm_contacts.id;


--
-- Name: crm_contacts_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts_v2 (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    person_id bigint,
    org_unit_id bigint,
    contact_type character varying(40) DEFAULT 'patient'::character varying NOT NULL,
    name character varying(240) NOT NULL,
    designation character varying(160),
    company character varying(240),
    preferred_channel character varying(30),
    consent_status character varying(30) DEFAULT 'unknown'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    identity_id bigint,
    legacy_contact_id bigint,
    full_name character varying(240),
    phone_e164 character varying(40),
    email character varying(320),
    age integer,
    gender character varying(40),
    city character varying(120),
    area character varying(120),
    preferred_language character varying(80),
    patient_status character varying(40),
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_by bigint,
    deleted_at timestamp with time zone,
    tenant_uid text,
    corporate_uid text,
    CONSTRAINT crm_contacts_v2_consent_status_check CHECK (((consent_status)::text = ANY (ARRAY[('unknown'::character varying)::text, ('granted'::character varying)::text, ('denied'::character varying)::text, ('withdrawn'::character varying)::text])))
);


--
-- Name: crm_contacts_v2_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_contacts_v2_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_contacts_v2_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_contacts_v2_id_seq OWNED BY public.crm_contacts_v2.id;


--
-- Name: crm_content_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_content_assets (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(200) NOT NULL,
    asset_type character varying(60) NOT NULL,
    channel character varying(60),
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    created_by bigint,
    approved_by bigint,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_content_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_content_assets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_content_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_content_assets_id_seq OWNED BY public.crm_content_assets.id;


--
-- Name: crm_content_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_content_calendar (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    specialty_code character varying(80),
    campaign_id bigint,
    channel character varying(50) NOT NULL,
    content_type character varying(60) NOT NULL,
    title character varying(240) NOT NULL,
    workflow_status character varying(40) DEFAULT 'idea'::character varying NOT NULL,
    scheduled_at timestamp with time zone,
    owner_user_id bigint,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_content_calendar_workflow_status_check CHECK (((workflow_status)::text = ANY (ARRAY[('idea'::character varying)::text, ('draft'::character varying)::text, ('medical_review'::character varying)::text, ('marketing_review'::character varying)::text, ('approved'::character varying)::text, ('scheduled'::character varying)::text, ('published'::character varying)::text])))
);


--
-- Name: crm_content_calendar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_content_calendar_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_content_calendar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_content_calendar_id_seq OWNED BY public.crm_content_calendar.id;


--
-- Name: crm_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_conversations (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    identity_id bigint,
    lead_id bigint,
    channel character varying(30) NOT NULL,
    external_thread_id character varying(240),
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    assigned_to_user_id bigint,
    last_message_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text,
    corporate_uid text,
    CONSTRAINT crm_conversations_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('pending'::character varying)::text, ('closed'::character varying)::text])))
);


--
-- Name: crm_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_conversations_id_seq OWNED BY public.crm_conversations.id;


--
-- Name: crm_corporate_health_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_corporate_health_plans (
    id bigint NOT NULL,
    corporate_id integer,
    corporate_name character varying(255) NOT NULL,
    plan_template_code character varying(50) NOT NULL,
    display_name character varying(255) NOT NULL,
    plan_year integer DEFAULT EXTRACT(year FROM now()) NOT NULL,
    plan_grade character varying(100),
    contract_ref character varying(50),
    negotiated_price_per_emp numeric(10,2),
    employee_headcount integer DEFAULT 0 NOT NULL,
    corporate_share numeric(5,2) DEFAULT 100.00 NOT NULL,
    employee_share numeric(5,2) DEFAULT 0.00 NOT NULL,
    start_date date,
    end_date date,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    renewal_of_id bigint,
    notes text,
    contract_doc_url character varying(500),
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rfq_id bigint
);


--
-- Name: crm_corporate_health_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_corporate_health_plans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_corporate_health_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_corporate_health_plans_id_seq OWNED BY public.crm_corporate_health_plans.id;


--
-- Name: crm_daily_funnel_mart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_daily_funnel_mart (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    metric_date date NOT NULL,
    grain_key character varying(300) NOT NULL,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_daily_funnel_mart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_daily_funnel_mart_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_daily_funnel_mart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_daily_funnel_mart_id_seq OWNED BY public.crm_daily_funnel_mart.id;


--
-- Name: crm_data_quality_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_data_quality_issues (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    entity_type character varying(80) NOT NULL,
    entity_id bigint,
    issue_type character varying(80) NOT NULL,
    severity character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    field_name character varying(120),
    current_value text,
    recommended_value text,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: crm_data_quality_issues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_data_quality_issues_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_data_quality_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_data_quality_issues_id_seq OWNED BY public.crm_data_quality_issues.id;


--
-- Name: crm_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_deals (
    id bigint NOT NULL,
    title character varying(255) NOT NULL,
    lead_id bigint,
    value numeric(15,2) DEFAULT 0,
    currency character varying(10) DEFAULT 'INR'::character varying,
    stage character varying(50) DEFAULT 'qualification'::character varying NOT NULL,
    probability integer DEFAULT 10,
    expected_close date,
    assigned_to integer,
    contact_name character varying(255),
    contact_email character varying(255),
    contact_phone character varying(50),
    company character varying(255),
    notes text,
    tags jsonb DEFAULT '[]'::jsonb,
    won_at timestamp with time zone,
    lost_at timestamp with time zone,
    lost_reason text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text,
    corporate_uid text,
    contact_id bigint,
    CONSTRAINT crm_deals_probability_check CHECK (((probability >= 0) AND (probability <= 100)))
);


--
-- Name: crm_deals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_deals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_deals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_deals_id_seq OWNED BY public.crm_deals.id;


--
-- Name: crm_diagnostic_booking_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_diagnostic_booking_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    booking_id bigint NOT NULL,
    event_type character varying(50) NOT NULL,
    event_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: crm_diagnostic_booking_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_diagnostic_booking_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_diagnostic_booking_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_diagnostic_booking_events_id_seq OWNED BY public.crm_diagnostic_booking_events.id;


--
-- Name: crm_diagnostic_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_diagnostic_bookings (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    identity_id bigint,
    centre_id bigint,
    product_id bigint,
    campaign_id bigint,
    source_id bigint,
    booking_status character varying(40) DEFAULT 'new'::character varying NOT NULL,
    collection_mode character varying(30) DEFAULT 'centre'::character varying NOT NULL,
    scheduled_at timestamp with time zone,
    sample_collected_at timestamp with time zone,
    completed_at timestamp with time zone,
    booking_value numeric(14,2) DEFAULT 0 NOT NULL,
    revenue_amount numeric(14,2) DEFAULT 0 NOT NULL,
    source_system character varying(100),
    source_ref character varying(240),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_diagnostic_bookings_booking_status_check CHECK (((booking_status)::text = ANY (ARRAY[('new'::character varying)::text, ('confirmed'::character varying)::text, ('assigned'::character varying)::text, ('on_the_way'::character varying)::text, ('sample_collected'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text, ('rescheduled'::character varying)::text]))),
    CONSTRAINT crm_diagnostic_bookings_collection_mode_check CHECK (((collection_mode)::text = ANY (ARRAY[('centre'::character varying)::text, ('home_collection'::character varying)::text])))
);


--
-- Name: crm_diagnostic_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_diagnostic_bookings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_diagnostic_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_diagnostic_bookings_id_seq OWNED BY public.crm_diagnostic_bookings.id;


--
-- Name: crm_diagnostic_centres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_diagnostic_centres (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code character varying(100) NOT NULL,
    centre_name character varying(200) NOT NULL,
    city character varying(120),
    region character varying(120),
    pincode character varying(20),
    address text,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    capacity_per_day integer,
    home_collection_zones jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unique_id text NOT NULL
);


--
-- Name: crm_diagnostic_centres_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_diagnostic_centres_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_diagnostic_centres_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_diagnostic_centres_id_seq OWNED BY public.crm_diagnostic_centres.id;


--
-- Name: crm_diagnostic_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_diagnostic_products (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    product_type character varying(30) NOT NULL,
    code character varying(120) NOT NULL,
    product_name character varying(240) NOT NULL,
    category character varying(120),
    original_price numeric(14,2),
    selling_price numeric(14,2),
    expected_margin_percent numeric(8,3),
    home_collection_available boolean DEFAULT false NOT NULL,
    included_product_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_diagnostic_products_product_type_check CHECK (((product_type)::text = ANY (ARRAY[('test'::character varying)::text, ('package'::character varying)::text])))
);


--
-- Name: crm_diagnostic_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_diagnostic_products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_diagnostic_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_diagnostic_products_id_seq OWNED BY public.crm_diagnostic_products.id;


--
-- Name: crm_doctor_service_line_mart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_doctor_service_line_mart (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    doctor_id bigint,
    service_line_id bigint,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_doctor_service_line_mart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_doctor_service_line_mart_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_doctor_service_line_mart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_doctor_service_line_mart_id_seq OWNED BY public.crm_doctor_service_line_mart.id;


--
-- Name: crm_email_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_email_inbox (
    id bigint NOT NULL,
    crm_user_id integer NOT NULL,
    settings_id bigint,
    message_id text,
    folder character varying(50) DEFAULT 'inbox'::character varying,
    from_addr text DEFAULT ''::text NOT NULL,
    from_name text DEFAULT ''::text,
    to_addrs text[] DEFAULT '{}'::text[],
    cc_addrs text[] DEFAULT '{}'::text[],
    subject text DEFAULT ''::text,
    body_text text,
    body_html text,
    is_read boolean DEFAULT false,
    is_starred boolean DEFAULT false,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_email_inbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_email_inbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_email_inbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_email_inbox_id_seq OWNED BY public.crm_email_inbox.id;


--
-- Name: crm_email_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_email_settings (
    id bigint NOT NULL,
    crm_user_id integer NOT NULL,
    display_name character varying(255),
    email character varying(255) NOT NULL,
    provider character varying(50) DEFAULT 'custom'::character varying,
    smtp_host character varying(255),
    smtp_port integer DEFAULT 587,
    smtp_secure boolean DEFAULT false,
    smtp_username character varying(255),
    smtp_password text,
    imap_host character varying(255),
    imap_port integer DEFAULT 993,
    imap_secure boolean DEFAULT true,
    imap_username character varying(255),
    imap_password text,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_email_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_email_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_email_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_email_settings_id_seq OWNED BY public.crm_email_settings.id;


--
-- Name: crm_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_email_templates (
    id bigint NOT NULL,
    crm_user_id integer NOT NULL,
    name character varying(255) NOT NULL,
    subject text,
    body text,
    category character varying(100) DEFAULT 'general'::character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_email_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_email_templates_id_seq OWNED BY public.crm_email_templates.id;


--
-- Name: crm_employee_performance_mart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_employee_performance_mart (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    employee_profile_id bigint,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_employee_performance_mart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_employee_performance_mart_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_employee_performance_mart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_employee_performance_mart_id_seq OWNED BY public.crm_employee_performance_mart.id;


--
-- Name: crm_employee_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_employee_profiles (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    user_id bigint NOT NULL,
    employee_code character varying(80),
    designation character varying(160),
    department_id bigint,
    team_id bigint,
    manager_user_id bigint,
    hospital_id bigint,
    branch_id bigint,
    joining_date date,
    employment_status character varying(40) DEFAULT 'active'::character varying NOT NULL,
    cost_centre character varying(120),
    salary_cost numeric(14,2),
    incentive_plan_id bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_employee_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_employee_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_employee_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_employee_profiles_id_seq OWNED BY public.crm_employee_profiles.id;


--
-- Name: crm_employee_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_employee_targets (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    employee_profile_id bigint NOT NULL,
    kpi_definition_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    target_value numeric(14,4) DEFAULT 0 NOT NULL,
    minimum_value numeric(14,4),
    stretch_value numeric(14,4),
    weight numeric(8,4),
    created_by bigint,
    approved_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_employee_targets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_employee_targets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_employee_targets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_employee_targets_id_seq OWNED BY public.crm_employee_targets.id;


--
-- Name: crm_feedback_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_feedback_responses (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    identity_id bigint,
    lead_id bigint,
    appointment_link_id bigint,
    visit_event_id bigint,
    survey_id bigint,
    score integer,
    nps_category character varying(30),
    comments text,
    response_channel character varying(40),
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    doctor_id bigint,
    hospital_id bigint,
    branch_id bigint,
    service_line_id bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_feedback_responses_score_check CHECK (((score IS NULL) OR ((score >= 0) AND (score <= 10))))
);


--
-- Name: crm_feedback_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_feedback_responses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_feedback_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_feedback_responses_id_seq OWNED BY public.crm_feedback_responses.id;


--
-- Name: crm_feedback_surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_feedback_surveys (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(160) NOT NULL,
    survey_type character varying(40) DEFAULT 'nps'::character varying NOT NULL,
    trigger_event character varying(80),
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_feedback_surveys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_feedback_surveys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_feedback_surveys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_feedback_surveys_id_seq OWNED BY public.crm_feedback_surveys.id;


--
-- Name: crm_flow_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_flow_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_uid text NOT NULL,
    name character varying(160) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    updated_by bigint,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_uid text DEFAULT ('crm-flow-'::text || (gen_random_uuid())::text) NOT NULL,
    CONSTRAINT crm_flow_definitions_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('published'::character varying)::text, ('archived'::character varying)::text]))),
    CONSTRAINT crm_flow_definitions_version_check CHECK ((version > 0))
);


--
-- Name: crm_flow_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_flow_edges (
    id bigint NOT NULL,
    flow_id uuid NOT NULL,
    from_node_key character varying(100) NOT NULL,
    to_node_key character varying(100) NOT NULL,
    branch_key character varying(80) DEFAULT 'default'::character varying NOT NULL,
    entity_uid text DEFAULT ('crm-flow-edge-'::text || (gen_random_uuid())::text) NOT NULL
);


--
-- Name: crm_flow_edges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_flow_edges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_flow_edges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_flow_edges_id_seq OWNED BY public.crm_flow_edges.id;


--
-- Name: crm_flow_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_flow_nodes (
    id bigint NOT NULL,
    flow_id uuid NOT NULL,
    node_key character varying(100) NOT NULL,
    node_type character varying(40) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_uid text DEFAULT ('crm-flow-node-'::text || (gen_random_uuid())::text) NOT NULL,
    CONSTRAINT crm_flow_nodes_node_type_check CHECK (((node_type)::text = ANY (ARRAY[('trigger'::character varying)::text, ('condition'::character varying)::text, ('delay'::character varying)::text, ('split'::character varying)::text, ('randomizer'::character varying)::text, ('send_message'::character varying)::text, ('http_request'::character varying)::text, ('set_field'::character varying)::text, ('wait_for_reply'::character varying)::text, ('hand_to_human'::character varying)::text])))
);


--
-- Name: crm_flow_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_flow_nodes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_flow_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_flow_nodes_id_seq OWNED BY public.crm_flow_nodes.id;


--
-- Name: crm_flow_run_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_flow_run_events (
    id bigint NOT NULL,
    run_id uuid NOT NULL,
    node_key character varying(100),
    event_type character varying(40) NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_uid text DEFAULT ('crm-flow-event-'::text || (gen_random_uuid())::text) NOT NULL
);


--
-- Name: crm_flow_run_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_flow_run_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_flow_run_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_flow_run_events_id_seq OWNED BY public.crm_flow_run_events.id;


--
-- Name: crm_flow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_flow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    tenant_uid text NOT NULL,
    lead_id bigint,
    status character varying(20) DEFAULT 'queued'::character varying NOT NULL,
    current_node_key character varying(100),
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    next_run_at timestamp with time zone,
    error text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_uid text DEFAULT ('crm-flow-run-'::text || (gen_random_uuid())::text) NOT NULL,
    CONSTRAINT crm_flow_runs_status_check CHECK (((status)::text = ANY (ARRAY[('queued'::character varying)::text, ('running'::character varying)::text, ('waiting'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('paused'::character varying)::text])))
);


--
-- Name: crm_frequency_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_frequency_counters (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    identity_id bigint NOT NULL,
    channel character varying(30) NOT NULL,
    purpose character varying(80) NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    send_count integer DEFAULT 0 NOT NULL,
    last_sent_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_frequency_counters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_frequency_counters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_frequency_counters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_frequency_counters_id_seq OWNED BY public.crm_frequency_counters.id;


--
-- Name: crm_funnel_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_funnel_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    person_id bigint,
    campaign_id bigint,
    event_type character varying(60) NOT NULL,
    from_stage character varying(40),
    to_stage character varying(40),
    channel character varying(60),
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id bigint,
    idempotency_key character varying(240),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    identity_id bigint,
    event_at timestamp with time zone DEFAULT now(),
    owner_user_id bigint,
    hospital_id bigint,
    branch_id bigint,
    service_line_id bigint,
    doctor_id bigint,
    source_system character varying(100),
    source_ref character varying(240)
);


--
-- Name: crm_funnel_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_funnel_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_funnel_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_funnel_events_id_seq OWNED BY public.crm_funnel_events.id;


--
-- Name: crm_growth_daily_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_growth_daily_metrics (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    metric_date date NOT NULL,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_growth_daily_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_growth_daily_metrics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_growth_daily_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_growth_daily_metrics_id_seq OWNED BY public.crm_growth_daily_metrics.id;


--
-- Name: crm_growth_recovery_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_growth_recovery_cases (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    identity_id bigint,
    case_type character varying(40) NOT NULL,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    due_at timestamp with time zone,
    recovered_at timestamp with time zone,
    owner_user_id bigint,
    source_ref character varying(240),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_growth_recovery_cases_case_type_check CHECK (((case_type)::text = ANY (ARRAY[('speed_to_lead'::character varying)::text, ('abandoned_form'::character varying)::text, ('no_show'::character varying)::text, ('dormant'::character varying)::text, ('uncontacted'::character varying)::text]))),
    CONSTRAINT crm_growth_recovery_cases_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('in_progress'::character varying)::text, ('recovered'::character varying)::text, ('dismissed'::character varying)::text])))
);


--
-- Name: crm_growth_recovery_cases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_growth_recovery_cases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_growth_recovery_cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_growth_recovery_cases_id_seq OWNED BY public.crm_growth_recovery_cases.id;


--
-- Name: crm_identity_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_identity_keys (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    person_id bigint NOT NULL,
    key_type character varying(30) NOT NULL,
    normalized_value character varying(320) NOT NULL,
    raw_value character varying(320),
    is_verified boolean DEFAULT false NOT NULL,
    source character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    identity_id bigint,
    source_system character varying(100),
    confidence numeric(5,4),
    is_primary boolean DEFAULT false NOT NULL,
    tenant_uid text,
    CONSTRAINT crm_identity_keys_key_type_check CHECK (((key_type)::text = ANY (ARRAY[('email'::character varying)::text, ('phone'::character varying)::text, ('external'::character varying)::text, ('mrn'::character varying)::text])))
);


--
-- Name: crm_identity_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_identity_keys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_identity_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_identity_keys_id_seq OWNED BY public.crm_identity_keys.id;


--
-- Name: crm_incentive_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_incentive_payouts (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    employee_profile_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    gross_incentive numeric(14,2) DEFAULT 0 NOT NULL,
    adjustments numeric(14,2) DEFAULT 0 NOT NULL,
    net_incentive numeric(14,2) DEFAULT 0 NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    approved_by bigint,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_incentive_payouts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_incentive_payouts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_incentive_payouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_incentive_payouts_id_seq OWNED BY public.crm_incentive_payouts.id;


--
-- Name: crm_incentive_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_incentive_rules (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(160) NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculation jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_incentive_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_incentive_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_incentive_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_incentive_rules_id_seq OWNED BY public.crm_incentive_rules.id;


--
-- Name: crm_insurance_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_insurance_products (
    id bigint NOT NULL,
    code character varying(30) NOT NULL,
    name character varying(200) NOT NULL,
    category character varying(50) NOT NULL,
    description text,
    irdai_ref character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_insurance_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_insurance_products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_insurance_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_insurance_products_id_seq OWNED BY public.crm_insurance_products.id;


--
-- Name: crm_integration_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_integration_errors (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    integration_run_id bigint,
    integration_name character varying(100) NOT NULL,
    entity_type character varying(80),
    external_ref character varying(240),
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_code character varying(80),
    error_message text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_integration_errors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_integration_errors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_integration_errors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_integration_errors_id_seq OWNED BY public.crm_integration_errors.id;


--
-- Name: crm_integration_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_integration_runs (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    integration_name character varying(100) NOT NULL,
    run_type character varying(80) NOT NULL,
    status character varying(30) DEFAULT 'running'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    records_seen integer DEFAULT 0 NOT NULL,
    records_created integer DEFAULT 0 NOT NULL,
    records_updated integer DEFAULT 0 NOT NULL,
    records_failed integer DEFAULT 0 NOT NULL,
    last_cursor character varying(500),
    error_summary text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: crm_integration_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_integration_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_integration_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_integration_runs_id_seq OWNED BY public.crm_integration_runs.id;


--
-- Name: crm_journey_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_journey_enrollments (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    journey_id bigint NOT NULL,
    lead_id bigint,
    identity_id bigint,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    current_step_order integer DEFAULT 1 NOT NULL,
    next_run_at timestamp with time zone,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    exit_reason character varying(240),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT crm_journey_enrollments_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('completed'::character varying)::text, ('exited'::character varying)::text, ('paused'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: crm_journey_enrollments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_journey_enrollments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_journey_enrollments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_journey_enrollments_id_seq OWNED BY public.crm_journey_enrollments.id;


--
-- Name: crm_journey_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_journey_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    enrollment_id bigint NOT NULL,
    step_id bigint,
    event_type character varying(40) NOT NULL,
    status character varying(30) DEFAULT 'queued'::character varying NOT NULL,
    scheduled_at timestamp with time zone,
    executed_at timestamp with time zone,
    provider_ref character varying(240),
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_journey_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_journey_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_journey_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_journey_events_id_seq OWNED BY public.crm_journey_events.id;


--
-- Name: crm_journey_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_journey_steps (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    journey_id bigint NOT NULL,
    step_order integer NOT NULL,
    step_type character varying(40) NOT NULL,
    delay_minutes integer DEFAULT 0 NOT NULL,
    channel character varying(30),
    template_id bigint,
    title character varying(240),
    content text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_journey_steps_delay_minutes_check CHECK ((delay_minutes >= 0)),
    CONSTRAINT crm_journey_steps_step_type_check CHECK (((step_type)::text = ANY (ARRAY[('wait'::character varying)::text, ('message'::character varying)::text, ('task'::character varying)::text, ('condition'::character varying)::text, ('stage_change'::character varying)::text, ('score'::character varying)::text])))
);


--
-- Name: crm_journey_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_journey_steps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_journey_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_journey_steps_id_seq OWNED BY public.crm_journey_steps.id;


--
-- Name: crm_journeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_journeys (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(180) NOT NULL,
    description text,
    journey_type character varying(50) DEFAULT 'nurture'::character varying NOT NULL,
    entry_conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    exit_conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    goal_stage character varying(60),
    frequency_cap jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    updated_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_journeys_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('active'::character varying)::text, ('paused'::character varying)::text, ('archived'::character varying)::text])))
);


--
-- Name: crm_journeys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_journeys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_journeys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_journeys_id_seq OWNED BY public.crm_journeys.id;


--
-- Name: crm_kpi_actuals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_kpi_actuals (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    employee_profile_id bigint NOT NULL,
    kpi_definition_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    actual_value numeric(14,4) DEFAULT 0 NOT NULL,
    target_value numeric(14,4) DEFAULT 0 NOT NULL,
    achievement_pct numeric(10,4) DEFAULT 0 NOT NULL,
    score numeric(10,4) DEFAULT 0 NOT NULL,
    calculation_run_id bigint,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: crm_kpi_actuals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_kpi_actuals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_kpi_actuals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_kpi_actuals_id_seq OWNED BY public.crm_kpi_actuals.id;


--
-- Name: crm_kpi_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_kpi_definitions (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    role_code character varying(80),
    kpi_code character varying(100) NOT NULL,
    kpi_name character varying(160) NOT NULL,
    kpi_type character varying(40) DEFAULT 'count'::character varying NOT NULL,
    calculation_sql_key character varying(120) NOT NULL,
    unit character varying(40),
    direction character varying(20) DEFAULT 'higher_is_better'::character varying NOT NULL,
    weight numeric(8,4) DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_kpi_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_kpi_definitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_kpi_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_kpi_definitions_id_seq OWNED BY public.crm_kpi_definitions.id;


--
-- Name: crm_landing_page_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_landing_page_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    landing_page_id bigint NOT NULL,
    lead_id bigint,
    session_id character varying(240),
    event_type character varying(40) NOT NULL,
    event_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT crm_landing_page_events_event_type_check CHECK (((event_type)::text = ANY (ARRAY[('view'::character varying)::text, ('form_start'::character varying)::text, ('form_submit'::character varying)::text, ('form_abandon'::character varying)::text, ('cta_click'::character varying)::text])))
);


--
-- Name: crm_landing_page_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_landing_page_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_landing_page_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_landing_page_events_id_seq OWNED BY public.crm_landing_page_events.id;


--
-- Name: crm_landing_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_landing_pages (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    campaign_id bigint,
    page_name character varying(180) NOT NULL,
    slug character varying(180) NOT NULL,
    service_line_id bigint,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    form_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    tracking_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    published_at timestamp with time zone,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_landing_pages_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('published'::character varying)::text, ('paused'::character varying)::text, ('archived'::character varying)::text])))
);


--
-- Name: crm_landing_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_landing_pages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_landing_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_landing_pages_id_seq OWNED BY public.crm_landing_pages.id;


--
-- Name: crm_lead_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_assignments (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    assignee_user_id bigint NOT NULL,
    assignment_type character varying(30) DEFAULT 'owner'::character varying NOT NULL,
    assigned_by bigint,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    unassigned_at timestamp with time zone,
    note text,
    assigned_from_user_id bigint,
    assigned_to_user_id bigint,
    assigned_team_id bigint,
    assignment_reason character varying(240),
    assignment_rule_id bigint,
    accepted_at timestamp with time zone,
    released_at timestamp with time zone,
    CONSTRAINT crm_lead_assignments_assignment_type_check CHECK (((assignment_type)::text = ANY (ARRAY[('owner'::character varying)::text, ('backup'::character varying)::text, ('queue'::character varying)::text])))
);


--
-- Name: crm_lead_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_lead_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_lead_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_lead_assignments_id_seq OWNED BY public.crm_lead_assignments.id;


--
-- Name: crm_lead_merge_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_merge_audit (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    source_lead_id bigint NOT NULL,
    target_lead_id bigint NOT NULL,
    reason text,
    merged_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_lead_merge_audit_check CHECK ((source_lead_id <> target_lead_id))
);


--
-- Name: crm_lead_merge_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_lead_merge_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_lead_merge_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_lead_merge_audit_id_seq OWNED BY public.crm_lead_merge_audit.id;


--
-- Name: crm_lead_score_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_score_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    rule_id bigint,
    event_name character varying(160) NOT NULL,
    points integer NOT NULL,
    score_before integer DEFAULT 0 NOT NULL,
    score_after integer DEFAULT 0 NOT NULL,
    source_ref character varying(240),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_lead_score_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_lead_score_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_lead_score_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_lead_score_events_id_seq OWNED BY public.crm_lead_score_events.id;


--
-- Name: crm_lead_score_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_score_rules (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(180) NOT NULL,
    rule_type character varying(40) DEFAULT 'event'::character varying NOT NULL,
    event_name character varying(160),
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by bigint,
    updated_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_lead_score_rules_points_check CHECK (((points >= '-100'::integer) AND (points <= 100)))
);


--
-- Name: crm_lead_score_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_lead_score_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_lead_score_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_lead_score_rules_id_seq OWNED BY public.crm_lead_score_rules.id;


--
-- Name: crm_lead_sla_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_sla_instances (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    policy_id bigint,
    first_response_due_at timestamp with time zone,
    first_response_at timestamp with time zone,
    next_action_due_at timestamp with time zone,
    next_action_at timestamp with time zone,
    breached_at timestamp with time zone,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_lead_sla_instances_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('met'::character varying)::text, ('breached'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: crm_lead_sla_instances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_lead_sla_instances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_lead_sla_instances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_lead_sla_instances_id_seq OWNED BY public.crm_lead_sla_instances.id;


--
-- Name: crm_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_leads (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    company character varying(255),
    designation character varying(255),
    source character varying(100) DEFAULT 'manual'::character varying,
    status character varying(50) DEFAULT 'new'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying,
    assigned_to integer,
    notes text,
    tags jsonb DEFAULT '[]'::jsonb,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    last_contacted timestamp with time zone,
    next_followup timestamp with time zone,
    converted_at timestamp with time zone,
    deal_id bigint,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    score integer DEFAULT 0
);


--
-- Name: crm_leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_leads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_leads_id_seq OWNED BY public.crm_leads.id;


--
-- Name: crm_leads_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_leads_v2 (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    person_id bigint,
    contact_id bigint,
    org_unit_id bigint,
    legacy_lead_id bigint,
    lifecycle_stage character varying(40) DEFAULT 'new'::character varying NOT NULL,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    source_taxonomy_id bigint,
    campaign_id bigint,
    source_detail character varying(240),
    service_line character varying(160),
    inquiry_type character varying(120),
    owner_user_id bigint,
    assigned_at timestamp with time zone,
    first_response_at timestamp with time zone,
    next_action_at timestamp with time zone,
    converted_at timestamp with time zone,
    merged_into_lead_id bigint,
    consent_status character varying(30) DEFAULT 'unknown'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hospital_id bigint,
    branch_id bigint,
    department_id bigint,
    service_line_id bigint,
    doctor_id bigint,
    identity_id bigint,
    lead_number character varying(80),
    lead_type character varying(60) DEFAULT 'opd'::character varying NOT NULL,
    qualification_status character varying(40) DEFAULT 'unqualified'::character varying NOT NULL,
    treatment_interest character varying(240),
    symptom_or_need text,
    expected_value numeric(14,2),
    actual_revenue numeric(14,2) DEFAULT 0 NOT NULL,
    first_touch_id bigint,
    last_touch_id bigint,
    assigned_team_id bigint,
    next_action character varying(120),
    lost_at timestamp with time zone,
    lost_reason_code character varying(100),
    lost_reason_notes text,
    consent_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by bigint,
    deleted_at timestamp with time zone,
    tenant_uid text,
    corporate_uid text,
    CONSTRAINT crm_leads_v2_consent_status_check CHECK (((consent_status)::text = ANY (ARRAY[('unknown'::character varying)::text, ('granted'::character varying)::text, ('denied'::character varying)::text, ('withdrawn'::character varying)::text]))),
    CONSTRAINT crm_leads_v2_lifecycle_stage_check CHECK (((lifecycle_stage)::text = ANY (ARRAY[('new'::character varying)::text, ('attempting_contact'::character varying)::text, ('contacted'::character varying)::text, ('qualified'::character varying)::text, ('appointment_requested'::character varying)::text, ('appointment_booked'::character varying)::text, ('appointment_confirmed'::character varying)::text, ('visited'::character varying)::text, ('consulted'::character varying)::text, ('investigation_advised'::character varying)::text, ('procedure_advised'::character varying)::text, ('admission_advised'::character varying)::text, ('billing_completed'::character varying)::text, ('won'::character varying)::text, ('lost'::character varying)::text, ('dormant'::character varying)::text, ('nurture'::character varying)::text, ('duplicate'::character varying)::text]))),
    CONSTRAINT crm_leads_v2_priority_check CHECK (((priority)::text = ANY (ARRAY[('low'::character varying)::text, ('medium'::character varying)::text, ('high'::character varying)::text, ('urgent'::character varying)::text]))),
    CONSTRAINT crm_leads_v2_score_check CHECK (((score >= 0) AND (score <= 100))),
    CONSTRAINT crm_leads_v2_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('paused'::character varying)::text, ('converted'::character varying)::text, ('closed'::character varying)::text, ('merged'::character varying)::text])))
);


--
-- Name: crm_leads_v2_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_leads_v2_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_leads_v2_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_leads_v2_id_seq OWNED BY public.crm_leads_v2.id;


--
-- Name: crm_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_login_attempts (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    ip_address character varying(45),
    succeeded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_login_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_login_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_login_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_login_attempts_id_seq OWNED BY public.crm_login_attempts.id;


--
-- Name: crm_marketing_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_budgets (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    period_type character varying(30) DEFAULT 'monthly'::character varying NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    hospital_id bigint,
    branch_id bigint,
    service_line_id bigint,
    channel character varying(60),
    campaign_id bigint,
    budget_amount numeric(14,2) DEFAULT 0 NOT NULL,
    approved_amount numeric(14,2),
    owner_user_id bigint,
    approval_status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    created_by bigint,
    updated_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_marketing_budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_budgets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_budgets_id_seq OWNED BY public.crm_marketing_budgets.id;


--
-- Name: crm_marketing_campaign_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_campaign_lists (
    campaign_id bigint NOT NULL,
    list_id bigint NOT NULL,
    mode character varying(20) DEFAULT 'include'::character varying NOT NULL
);


--
-- Name: crm_marketing_campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_campaign_recipients (
    id bigint NOT NULL,
    campaign_id bigint NOT NULL,
    email character varying(255) NOT NULL,
    personalization jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    provider_message_id text,
    last_error text,
    sent_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_marketing_campaign_recipients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_campaign_recipients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_campaign_recipients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_campaign_recipients_id_seq OWNED BY public.crm_marketing_campaign_recipients.id;


--
-- Name: crm_marketing_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_campaigns (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    preheader text DEFAULT ''::text NOT NULL,
    template_id bigint,
    sender_id bigint,
    html_content text DEFAULT ''::text NOT NULL,
    text_content text DEFAULT ''::text NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_to_address character varying(255),
    description text DEFAULT ''::text NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    utm_source character varying(100) DEFAULT ''::character varying NOT NULL,
    utm_medium character varying(100) DEFAULT 'email'::character varying NOT NULL,
    utm_campaign character varying(100) DEFAULT ''::character varying NOT NULL,
    utm_content character varying(100) DEFAULT ''::character varying NOT NULL,
    ab_test_enabled boolean DEFAULT false NOT NULL,
    ab_test_subject_b text DEFAULT ''::text NOT NULL,
    ab_test_split integer DEFAULT 50 NOT NULL,
    send_timezone character varying(50) DEFAULT 'Asia/Kolkata'::character varying NOT NULL,
    recipient_count integer DEFAULT 0 NOT NULL
);


--
-- Name: crm_marketing_campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_campaigns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_campaigns_id_seq OWNED BY public.crm_marketing_campaigns.id;


--
-- Name: crm_marketing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_events (
    id bigint NOT NULL,
    campaign_id bigint NOT NULL,
    recipient_id bigint,
    event_type character varying(30) NOT NULL,
    event_at timestamp with time zone DEFAULT now() NOT NULL,
    provider character varying(50) DEFAULT 'internal'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: crm_marketing_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_events_id_seq OWNED BY public.crm_marketing_events.id;


--
-- Name: crm_marketing_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_imports (
    id bigint NOT NULL,
    list_id bigint NOT NULL,
    filename text NOT NULL,
    status character varying(30) DEFAULT 'processing'::character varying NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    valid_rows integer DEFAULT 0 NOT NULL,
    invalid_rows integer DEFAULT 0 NOT NULL,
    duplicate_rows integer DEFAULT 0 NOT NULL,
    error_report jsonb DEFAULT '[]'::jsonb NOT NULL,
    s3_key text,
    s3_url text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: crm_marketing_imports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_imports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_imports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_imports_id_seq OWNED BY public.crm_marketing_imports.id;


--
-- Name: crm_marketing_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_integrations (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    provider character varying(80) NOT NULL,
    integration_type character varying(80) NOT NULL,
    status character varying(30) DEFAULT 'not_configured'::character varying NOT NULL,
    account_ref character varying(240),
    credentials_ref character varying(240),
    last_sync_at timestamp with time zone,
    last_sync_status character varying(30),
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    health_score integer,
    health_message text,
    last_health_check_at timestamp with time zone,
    encrypted_credentials text,
    credentials_updated_at timestamp with time zone,
    credentials_fingerprint character varying(64)
);


--
-- Name: crm_marketing_integrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_integrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_integrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_integrations_id_seq OWNED BY public.crm_marketing_integrations.id;


--
-- Name: crm_marketing_list_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_list_members (
    id bigint NOT NULL,
    list_id bigint NOT NULL,
    contact_id bigint,
    lead_id bigint,
    email character varying(255) NOT NULL,
    first_name character varying(255),
    last_name character varying(255),
    company character varying(255),
    city character varying(100),
    state character varying(100),
    status character varying(30) DEFAULT 'subscribed'::character varying NOT NULL,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bounce_type character varying(20),
    last_engaged_at timestamp with time zone
);


--
-- Name: crm_marketing_list_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_list_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_list_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_list_members_id_seq OWNED BY public.crm_marketing_list_members.id;


--
-- Name: crm_marketing_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_lists (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_marketing_lists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_lists_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_lists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_lists_id_seq OWNED BY public.crm_marketing_lists.id;


--
-- Name: crm_marketing_senders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_senders (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    reply_to character varying(255),
    provider character varying(50) DEFAULT 'smtp'::character varying NOT NULL,
    provider_sender_id character varying(255),
    is_verified boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_marketing_senders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_senders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_senders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_senders_id_seq OWNED BY public.crm_marketing_senders.id;


--
-- Name: crm_marketing_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_suppressions (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    reason character varying(50) NOT NULL,
    source_campaign_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: crm_marketing_suppressions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_suppressions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_suppressions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_suppressions_id_seq OWNED BY public.crm_marketing_suppressions.id;


--
-- Name: crm_marketing_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marketing_templates (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    preheader text DEFAULT ''::text NOT NULL,
    html_content text DEFAULT ''::text NOT NULL,
    text_content text DEFAULT ''::text NOT NULL,
    category character varying(100) DEFAULT 'general'::character varying NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_marketing_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marketing_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marketing_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marketing_templates_id_seq OWNED BY public.crm_marketing_templates.id;


--
-- Name: crm_offline_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_offline_campaigns (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    campaign_id bigint,
    event_name character varying(200) NOT NULL,
    event_date date,
    location character varying(240),
    qr_code character varying(160),
    short_url character varying(240),
    registrations_count integer DEFAULT 0 NOT NULL,
    visits_count integer DEFAULT 0 NOT NULL,
    revenue_amount numeric(14,2) DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_offline_campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_offline_campaigns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_offline_campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_offline_campaigns_id_seq OWNED BY public.crm_offline_campaigns.id;


--
-- Name: crm_org_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_org_units (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    parent_id bigint,
    code character varying(80) NOT NULL,
    name character varying(200) NOT NULL,
    unit_type character varying(60) DEFAULT 'hospital'::character varying NOT NULL,
    timezone character varying(80) DEFAULT 'Asia/Kolkata'::character varying NOT NULL,
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    external_ref character varying(160),
    deleted_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT crm_org_units_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text])))
);


--
-- Name: crm_org_units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_org_units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_org_units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_org_units_id_seq OWNED BY public.crm_org_units.id;


--
-- Name: crm_person_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_person_identities (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    person_type character varying(30) DEFAULT 'patient'::character varying NOT NULL,
    external_patient_id character varying(120),
    legacy_patient_id bigint,
    first_name character varying(120),
    last_name character varying(120),
    display_name character varying(240),
    date_of_birth date,
    gender character varying(40),
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    merged_into_id bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    primary_patient_id bigint,
    primary_contact_id bigint,
    primary_phone_e164 character varying(40),
    primary_email character varying(320),
    identity_confidence numeric(5,4),
    merge_status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    tenant_uid text,
    CONSTRAINT crm_person_identities_person_type_check CHECK (((person_type)::text = ANY (ARRAY[('patient'::character varying)::text, ('attendant'::character varying)::text, ('referrer'::character varying)::text, ('corporate_contact'::character varying)::text, ('other'::character varying)::text]))),
    CONSTRAINT crm_person_identities_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('merged'::character varying)::text, ('inactive'::character varying)::text])))
);


--
-- Name: crm_person_identities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_person_identities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_person_identities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_person_identities_id_seq OWNED BY public.crm_person_identities.id;


--
-- Name: crm_product_coverage_matrix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_product_coverage_matrix (
    id bigint NOT NULL,
    product_id bigint NOT NULL,
    coverage_head character varying(200) NOT NULL,
    category character varying(50) DEFAULT 'hospitalization'::character varying NOT NULL,
    status character varying(20) DEFAULT 'included'::character varying NOT NULL,
    description text,
    limit_type character varying(50),
    limit_value character varying(200),
    waiting_period character varying(100),
    sub_limit_notes text,
    regulatory_ref character varying(200),
    is_optional boolean DEFAULT false NOT NULL,
    is_standard_excl boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_product_coverage_matrix_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_product_coverage_matrix_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_product_coverage_matrix_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_product_coverage_matrix_id_seq OWNED BY public.crm_product_coverage_matrix.id;


--
-- Name: crm_product_tc_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_product_tc_master (
    id bigint NOT NULL,
    product_type character varying(50) NOT NULL,
    section character varying(100) DEFAULT 'general'::character varying NOT NULL,
    title character varying(255) NOT NULL,
    content text NOT NULL,
    source_rfq_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    is_pending boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_product_tc_master_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_product_tc_master_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_product_tc_master_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_product_tc_master_id_seq OWNED BY public.crm_product_tc_master.id;


--
-- Name: crm_provider_referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_provider_referrals (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    referral_type character varying(40) NOT NULL,
    provider_name character varying(240) NOT NULL,
    provider_ref character varying(160),
    lead_id bigint,
    booking_id bigint,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    referred_at timestamp with time zone DEFAULT now() NOT NULL,
    converted_at timestamp with time zone,
    revenue_amount numeric(14,2) DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_provider_referrals_referral_type_check CHECK (((referral_type)::text = ANY (ARRAY[('doctor'::character varying)::text, ('corporate'::character varying)::text, ('insurance'::character varying)::text, ('tpa'::character varying)::text, ('patient'::character varying)::text, ('partner'::character varying)::text])))
);


--
-- Name: crm_provider_referrals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_provider_referrals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_provider_referrals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_provider_referrals_id_seq OWNED BY public.crm_provider_referrals.id;


--
-- Name: crm_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_quotes (
    id bigint NOT NULL,
    rfq_id bigint NOT NULL,
    quote_number character varying(50) NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    version integer DEFAULT 1,
    valid_until date,
    total_premium numeric(15,2) DEFAULT 0,
    total_lives integer DEFAULT 0,
    per_life_cost numeric(12,2) DEFAULT 0,
    per_family_cost numeric(12,2) DEFAULT 0,
    pricing_model character varying(50) DEFAULT 'per_family'::character varying,
    commission_pct numeric(5,2) DEFAULT 0,
    gst_pct numeric(5,2) DEFAULT 18,
    discount_pct numeric(5,2) DEFAULT 0,
    coverage_details jsonb DEFAULT '{}'::jsonb,
    slab_pricing jsonb DEFAULT '[]'::jsonb,
    terms text,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone
);


--
-- Name: crm_quotes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_quotes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_quotes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_quotes_id_seq OWNED BY public.crm_quotes.id;


--
-- Name: crm_refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_refresh_tokens (
    id bigint NOT NULL,
    jti uuid NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    revoked_at timestamp with time zone,
    device_fp character varying(64),
    ip_address character varying(45)
);


--
-- Name: crm_refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_refresh_tokens_id_seq OWNED BY public.crm_refresh_tokens.id;


--
-- Name: crm_reputation_mart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_reputation_mart (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    grain_key character varying(240) NOT NULL,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_reputation_mart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_reputation_mart_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_reputation_mart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_reputation_mart_id_seq OWNED BY public.crm_reputation_mart.id;


--
-- Name: crm_reputation_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_reputation_tasks (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    review_id bigint,
    feedback_response_id bigint,
    task_type character varying(50) NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    assigned_to_user_id bigint,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_reputation_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_reputation_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_reputation_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_reputation_tasks_id_seq OWNED BY public.crm_reputation_tasks.id;


--
-- Name: crm_revenue_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_revenue_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    identity_id bigint,
    appointment_link_id bigint,
    visit_event_id bigint,
    patient_id bigint,
    billing_id bigint,
    invoice_number character varying(120),
    revenue_event_type character varying(60) DEFAULT 'billing_completed'::character varying NOT NULL,
    revenue_date date DEFAULT CURRENT_DATE NOT NULL,
    gross_amount numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    net_amount numeric(14,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(14,2) DEFAULT 0 NOT NULL,
    refund_amount numeric(14,2) DEFAULT 0 NOT NULL,
    outstanding_amount numeric(14,2) DEFAULT 0 NOT NULL,
    contribution_amount numeric(14,2),
    currency character varying(10) DEFAULT 'INR'::character varying NOT NULL,
    payer_type character varying(50),
    insurance_tpa_id bigint,
    doctor_id bigint,
    hospital_id bigint,
    branch_id bigint,
    department_id bigint,
    service_line_id bigint,
    procedure_code character varying(100),
    package_code character varying(100),
    source_system character varying(100),
    source_ref character varying(240),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_revenue_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_revenue_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_revenue_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_revenue_events_id_seq OWNED BY public.crm_revenue_events.id;


--
-- Name: crm_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_reviews (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    identity_id bigint,
    platform character varying(60) NOT NULL,
    external_review_id character varying(240),
    reviewer_name character varying(240),
    rating numeric(3,1),
    review_text text,
    sentiment character varying(30),
    severity character varying(30) DEFAULT 'normal'::character varying NOT NULL,
    topics jsonb DEFAULT '[]'::jsonb NOT NULL,
    doctor_id bigint,
    hospital_id bigint,
    branch_id bigint,
    service_line_id bigint,
    review_url text,
    reviewed_at timestamp with time zone,
    response_status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    responded_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_reviews_rating_check CHECK (((rating IS NULL) OR ((rating >= (0)::numeric) AND (rating <= (5)::numeric))))
);


--
-- Name: crm_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_reviews_id_seq OWNED BY public.crm_reviews.id;


--
-- Name: crm_rfq_analysis_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rfq_analysis_cache (
    id bigint NOT NULL,
    rfq_id bigint NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    risk_score numeric(5,2),
    risk_tier character varying(20),
    renewal_probability numeric(4,3),
    avg_loss_ratio numeric(6,3),
    trend_factor numeric(6,4),
    claim_frequency_trend character varying(20),
    top_diagnoses jsonb DEFAULT '[]'::jsonb,
    pure_premium_per_life numeric(12,2),
    loaded_premium_per_life numeric(12,2),
    gross_premium_per_life numeric(12,2),
    total_projected_premium numeric(15,2),
    projected_loss_ratio numeric(6,3),
    quote_strategies jsonb DEFAULT '[]'::jsonb,
    ai_narrative text,
    ai_executive_summary text,
    inputs_snapshot jsonb DEFAULT '{}'::jsonb,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    generated_by integer
);


--
-- Name: crm_rfq_analysis_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_rfq_analysis_cache_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_rfq_analysis_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_rfq_analysis_cache_id_seq OWNED BY public.crm_rfq_analysis_cache.id;


--
-- Name: crm_rfq_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rfq_audit_log (
    id bigint NOT NULL,
    rfq_id bigint NOT NULL,
    event_type character varying(50) NOT NULL,
    old_value text,
    new_value text,
    changed_by integer,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_rfq_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_rfq_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_rfq_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_rfq_audit_log_id_seq OWNED BY public.crm_rfq_audit_log.id;


--
-- Name: crm_rfq_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rfq_claims (
    id bigint NOT NULL,
    rfq_id bigint NOT NULL,
    claim_number character varying(200),
    emp_code character varying(50),
    employee_name character varying(255),
    relationship character varying(50),
    gender character varying(10),
    age integer,
    claim_date date,
    service_type character varying(100),
    service_category character varying(100),
    diagnosis character varying(500),
    provider_name character varying(255),
    provider_type character varying(100),
    claimed_amount numeric(12,2) DEFAULT 0,
    approved_amount numeric(12,2) DEFAULT 0,
    paid_amount numeric(12,2) DEFAULT 0,
    rejection_reason character varying(255),
    claim_status character varying(100),
    policy_year character varying(50),
    si_amount numeric(12,2) DEFAULT 0,
    band character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    icd_code character varying(20)
);


--
-- Name: crm_rfq_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_rfq_claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_rfq_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_rfq_claims_id_seq OWNED BY public.crm_rfq_claims.id;


--
-- Name: crm_rfq_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rfq_files (
    id bigint NOT NULL,
    rfq_id bigint NOT NULL,
    category character varying(30) DEFAULT 'other'::character varying NOT NULL,
    original_name character varying(500) NOT NULL,
    s3_key text NOT NULL,
    file_size bigint DEFAULT 0,
    mime_type character varying(100),
    uploaded_by integer,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    extracted_text text
);


--
-- Name: crm_rfq_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_rfq_files_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_rfq_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_rfq_files_id_seq OWNED BY public.crm_rfq_files.id;


--
-- Name: crm_rfq_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rfq_members (
    id bigint NOT NULL,
    rfq_id bigint NOT NULL,
    sr_no integer,
    emp_code character varying(50),
    relationship character varying(50),
    relation_type character varying(50),
    gender character varying(10),
    dob date,
    age integer,
    si_expiring numeric(12,2) DEFAULT 0,
    si_proposed numeric(12,2) DEFAULT 0,
    designation character varying(255),
    band character varying(20),
    doj date,
    employee_name character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_rfq_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_rfq_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_rfq_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_rfq_members_id_seq OWNED BY public.crm_rfq_members.id;


--
-- Name: crm_rfq_policy_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rfq_policy_history (
    id bigint NOT NULL,
    rfq_id bigint NOT NULL,
    year_label character varying(10) NOT NULL,
    policy_year_start date,
    policy_year_end date,
    insurer_name character varying(255),
    tpa_name character varying(255),
    gross_premium numeric(15,2) DEFAULT 0,
    net_premium numeric(15,2) DEFAULT 0,
    total_claims_incurred numeric(15,2) DEFAULT 0,
    total_claims_count integer DEFAULT 0,
    cat_claims_count integer DEFAULT 0,
    cat_claims_amount numeric(15,2) DEFAULT 0,
    avg_claim_size numeric(12,2),
    claim_frequency_pct numeric(6,3),
    loss_ratio numeric(6,3),
    copay_collected numeric(12,2) DEFAULT 0,
    ibnr_reserve numeric(12,2) DEFAULT 0,
    lives_count integer DEFAULT 0,
    employee_count integer DEFAULT 0,
    top_diagnoses jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_by integer,
    updated_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_rfq_policy_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_rfq_policy_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_rfq_policy_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_rfq_policy_history_id_seq OWNED BY public.crm_rfq_policy_history.id;


--
-- Name: crm_rfq_underwriting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rfq_underwriting (
    id bigint NOT NULL,
    rfq_id bigint NOT NULL,
    product_id bigint,
    product_code character varying(30),
    uw_status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    risk_score integer DEFAULT 50,
    loading_pct numeric(5,2) DEFAULT 0,
    decision character varying(100),
    ai_narrative text,
    slip_parsed jsonb DEFAULT '{}'::jsonb,
    requested_coverages jsonb DEFAULT '[]'::jsonb,
    coverage_gap jsonb DEFAULT '[]'::jsonb,
    conditions jsonb DEFAULT '[]'::jsonb,
    exclusions_applied jsonb DEFAULT '[]'::jsonb,
    risk_flags jsonb DEFAULT '[]'::jsonb,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_rfq_underwriting_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_rfq_underwriting_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_rfq_underwriting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_rfq_underwriting_id_seq OWNED BY public.crm_rfq_underwriting.id;


--
-- Name: crm_rfqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_rfqs (
    id bigint NOT NULL,
    rfq_number character varying(50) NOT NULL,
    status character varying(30) DEFAULT 'received'::character varying NOT NULL,
    broker_name character varying(255),
    broker_company character varying(255),
    broker_email character varying(255),
    broker_phone character varying(50),
    insured_name character varying(500) NOT NULL,
    insured_address text,
    policy_type character varying(100) DEFAULT 'Group Mediclaim'::character varying,
    product_type character varying(100) DEFAULT 'OPD'::character varying,
    existing_insurer character varying(255),
    existing_tpa character varying(255),
    policy_start date,
    policy_end date,
    premium_paid numeric(15,2),
    lives_at_inception jsonb DEFAULT '{}'::jsonb,
    lives_at_renewal jsonb DEFAULT '{}'::jsonb,
    coverage_scope jsonb DEFAULT '{}'::jsonb,
    special_conditions jsonb DEFAULT '[]'::jsonb,
    exclusions text,
    terms_and_conditions text,
    notes text,
    member_count integer DEFAULT 0,
    sum_insured_slabs jsonb DEFAULT '[]'::jsonb,
    deal_id bigint,
    lead_id bigint,
    assigned_to integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slip_file_key text,
    existing_coverages text,
    required_coverages text,
    lost_reason text,
    industry character varying(100),
    ai_quote_data jsonb
);


--
-- Name: crm_rfqs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_rfqs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_rfqs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_rfqs_id_seq OWNED BY public.crm_rfqs.id;


--
-- Name: crm_segment_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_segment_members (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    segment_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_segment_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_segment_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_segment_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_segment_members_id_seq OWNED BY public.crm_segment_members.id;


--
-- Name: crm_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_segments (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    filter_definition jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    member_count integer DEFAULT 0 NOT NULL,
    last_refreshed_at timestamp with time zone,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_segments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_segments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_segments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_segments_id_seq OWNED BY public.crm_segments.id;


--
-- Name: crm_service_line_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_service_line_targets (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    service_line_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    lead_target numeric(14,2),
    appointment_target numeric(14,2),
    visit_target numeric(14,2),
    revenue_target numeric(14,2),
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_service_line_targets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_service_line_targets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_service_line_targets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_service_line_targets_id_seq OWNED BY public.crm_service_line_targets.id;


--
-- Name: crm_sla_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sla_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    activity_id bigint,
    sla_rule_id bigint,
    sla_type character varying(40) NOT NULL,
    due_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    breached_at timestamp with time zone,
    breach_minutes integer,
    escalation_level integer DEFAULT 0 NOT NULL,
    escalated_to_user_id bigint,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_sla_events_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('met'::character varying)::text, ('breached'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: crm_sla_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_sla_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_sla_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_sla_events_id_seq OWNED BY public.crm_sla_events.id;


--
-- Name: crm_sla_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sla_policies (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(160) NOT NULL,
    service_line character varying(160),
    priority character varying(20),
    first_response_minutes integer NOT NULL,
    next_action_minutes integer,
    active boolean DEFAULT true NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_sla_policies_first_response_minutes_check CHECK ((first_response_minutes > 0)),
    CONSTRAINT crm_sla_policies_next_action_minutes_check CHECK (((next_action_minutes IS NULL) OR (next_action_minutes > 0)))
);


--
-- Name: crm_sla_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_sla_policies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_sla_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_sla_policies_id_seq OWNED BY public.crm_sla_policies.id;


--
-- Name: crm_sla_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_sla_rules (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(160) NOT NULL,
    applies_to character varying(60) DEFAULT 'lead'::character varying NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    first_response_minutes integer DEFAULT 60 NOT NULL,
    followup_minutes integer,
    resolution_minutes integer,
    escalation_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    business_hours_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_sla_rules_first_response_minutes_check CHECK ((first_response_minutes > 0)),
    CONSTRAINT crm_sla_rules_followup_minutes_check CHECK (((followup_minutes IS NULL) OR (followup_minutes > 0))),
    CONSTRAINT crm_sla_rules_resolution_minutes_check CHECK (((resolution_minutes IS NULL) OR (resolution_minutes > 0)))
);


--
-- Name: crm_sla_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_sla_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_sla_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_sla_rules_id_seq OWNED BY public.crm_sla_rules.id;


--
-- Name: crm_social_automation_pauses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_automation_pauses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_uid text NOT NULL,
    conversation_id bigint NOT NULL,
    reason text NOT NULL,
    paused_by bigint,
    paused_at timestamp with time zone DEFAULT now() NOT NULL,
    resumed_at timestamp with time zone,
    entity_uid text DEFAULT ('crm-social-pause-'::text || (gen_random_uuid())::text) NOT NULL
);


--
-- Name: crm_social_erasure_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_erasure_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_uid text DEFAULT ('crm-social-erasure-'::text || (gen_random_uuid())::text) NOT NULL,
    tenant_uid text NOT NULL,
    identity_id uuid,
    channel character varying(30) NOT NULL,
    external_user_id text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    reason text,
    requested_by bigint,
    processed_by bigint,
    processed_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_social_erasure_requests_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: crm_social_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_uid text NOT NULL,
    channel character varying(30) NOT NULL,
    external_user_id character varying(240) NOT NULL,
    contact_id bigint,
    lead_id bigint,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    consent_status character varying(20) DEFAULT 'unknown'::character varying NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_uid text DEFAULT ('crm-social-identity-'::text || (gen_random_uuid())::text) NOT NULL,
    CONSTRAINT crm_social_identities_channel_check CHECK (((channel)::text = ANY (ARRAY[('instagram'::character varying)::text, ('facebook'::character varying)::text, ('whatsapp'::character varying)::text, ('sms'::character varying)::text, ('email'::character varying)::text]))),
    CONSTRAINT crm_social_identities_consent_status_check CHECK (((consent_status)::text = ANY (ARRAY[('unknown'::character varying)::text, ('opted_in'::character varying)::text, ('opted_out'::character varying)::text])))
);


--
-- Name: crm_social_inbox_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_inbox_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_uid text DEFAULT ('crm-social-reminder-'::text || (gen_random_uuid())::text) NOT NULL,
    tenant_uid text NOT NULL,
    conversation_id bigint NOT NULL,
    remind_at timestamp with time zone NOT NULL,
    note text NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    created_by bigint,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_social_inbox_reminders_status_check CHECK (((status)::text = ANY (ARRAY[('scheduled'::character varying)::text, ('sent'::character varying)::text, ('cancelled'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: crm_social_inbox_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_inbox_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_uid text DEFAULT ('crm-social-rule-'::text || (gen_random_uuid())::text) NOT NULL,
    tenant_uid text NOT NULL,
    name character varying(160) NOT NULL,
    channel character varying(30),
    match_type character varying(30) NOT NULL,
    match_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    action_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by bigint,
    updated_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_social_inbox_rules_match_type_check CHECK (((match_type)::text = ANY (ARRAY[('keyword'::character varying)::text, ('event'::character varying)::text, ('status'::character varying)::text, ('label'::character varying)::text])))
);


--
-- Name: crm_social_post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_post_comments (
    id bigint NOT NULL,
    tenant_uid text NOT NULL,
    post_id bigint NOT NULL,
    body text NOT NULL,
    created_by bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_social_post_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_social_post_comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_social_post_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_social_post_comments_id_seq OWNED BY public.crm_social_post_comments.id;


--
-- Name: crm_social_post_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_post_events (
    id bigint NOT NULL,
    tenant_uid text NOT NULL,
    post_id bigint NOT NULL,
    action character varying(40) NOT NULL,
    from_status character varying(24),
    to_status character varying(24),
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor_user_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_social_post_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_social_post_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_social_post_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_social_post_events_id_seq OWNED BY public.crm_social_post_events.id;


--
-- Name: crm_social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_posts (
    id bigint NOT NULL,
    tenant_uid text NOT NULL,
    caption text NOT NULL,
    platforms text[] NOT NULL,
    platform_captions jsonb DEFAULT '{}'::jsonb NOT NULL,
    media_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    category character varying(80),
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    status character varying(24) DEFAULT 'draft'::character varying NOT NULL,
    planned_at timestamp with time zone,
    submitted_at timestamp with time zone,
    approved_by bigint,
    approved_at timestamp with time zone,
    rejection_reason text,
    created_by bigint NOT NULL,
    updated_by bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unique_id text NOT NULL,
    CONSTRAINT crm_social_posts_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending_approval'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text])))
);


--
-- Name: crm_social_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_social_posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_social_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_social_posts_id_seq OWNED BY public.crm_social_posts.id;


--
-- Name: crm_social_scheduled_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_scheduled_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_uid text NOT NULL,
    conversation_id bigint NOT NULL,
    body text NOT NULL,
    send_at timestamp with time zone NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    created_by bigint,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_uid text DEFAULT ('crm-social-reply-'::text || (gen_random_uuid())::text) NOT NULL,
    CONSTRAINT crm_social_scheduled_replies_status_check CHECK (((status)::text = ANY (ARRAY[('scheduled'::character varying)::text, ('sent'::character varying)::text, ('cancelled'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: crm_social_triggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_social_triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_uid text NOT NULL,
    trigger_type character varying(40) NOT NULL,
    channel character varying(30) NOT NULL,
    trigger_key character varying(240) NOT NULL,
    flow_id uuid,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_uid text DEFAULT ('crm-social-trigger-'::text || (gen_random_uuid())::text) NOT NULL,
    CONSTRAINT crm_social_triggers_trigger_type_check CHECK (((trigger_type)::text = ANY (ARRAY[('comment_to_dm'::character varying)::text, ('story_mention'::character varying)::text, ('follow'::character varying)::text, ('ref_url'::character varying)::text, ('qr'::character varying)::text])))
);


--
-- Name: crm_source_taxonomy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_source_taxonomy (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    channel character varying(60) NOT NULL,
    source character varying(120) NOT NULL,
    medium character varying(120),
    campaign character varying(200),
    term character varying(200),
    content character varying(200),
    display_name character varying(240) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_group character varying(100),
    is_paid boolean DEFAULT false NOT NULL,
    is_offline boolean DEFAULT false NOT NULL,
    is_referral boolean DEFAULT false NOT NULL,
    default_attribution_weight numeric(8,4) DEFAULT 1 NOT NULL,
    tenant_uid text
);


--
-- Name: crm_source_taxonomy_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_source_taxonomy_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_source_taxonomy_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_source_taxonomy_id_seq OWNED BY public.crm_source_taxonomy.id;


--
-- Name: crm_specialty_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_specialty_profiles (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code character varying(80) NOT NULL,
    display_name character varying(180) NOT NULL,
    category character varying(40) DEFAULT 'hospital'::character varying NOT NULL,
    funnel_stages jsonb DEFAULT '[]'::jsonb NOT NULL,
    segments jsonb DEFAULT '[]'::jsonb NOT NULL,
    kpis jsonb DEFAULT '[]'::jsonb NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text
);


--
-- Name: crm_specialty_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_specialty_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_specialty_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_specialty_profiles_id_seq OWNED BY public.crm_specialty_profiles.id;


--
-- Name: crm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_tasks (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    identity_id bigint,
    task_type character varying(50) NOT NULL,
    title character varying(240) NOT NULL,
    description text,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    status character varying(30) DEFAULT 'open'::character varying NOT NULL,
    assigned_to_user_id bigint,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    outcome character varying(160),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text,
    corporate_uid text,
    CONSTRAINT crm_tasks_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: crm_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_tasks_id_seq OWNED BY public.crm_tasks.id;


--
-- Name: crm_touchpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_touchpoints (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    identity_id bigint,
    lead_id bigint,
    contact_id bigint,
    campaign_id bigint,
    source_id bigint,
    touchpoint_type character varying(60) NOT NULL,
    channel character varying(60),
    source character varying(120),
    medium character varying(120),
    event_name character varying(160),
    event_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id character varying(240),
    gclid character varying(240),
    fbclid character varying(240),
    utm_source character varying(120),
    utm_medium character varying(120),
    utm_campaign character varying(200),
    utm_term character varying(200),
    utm_content character varying(200),
    landing_page_url text,
    referrer_url text,
    external_event_id character varying(240),
    cost_amount numeric(14,2),
    revenue_amount numeric(14,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_touchpoints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_touchpoints_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_touchpoints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_touchpoints_id_seq OWNED BY public.crm_touchpoints.id;


--
-- Name: crm_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_vendors (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    vendor_name character varying(240) NOT NULL,
    vendor_type character varying(80),
    contact_name character varying(160),
    email character varying(320),
    phone character varying(40),
    gstin character varying(40),
    status character varying(30) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_vendors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_vendors_id_seq OWNED BY public.crm_vendors.id;


--
-- Name: crm_visit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_visit_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    lead_id bigint,
    identity_id bigint,
    appointment_link_id bigint,
    patient_id bigint,
    visit_id bigint,
    event_type character varying(60) NOT NULL,
    event_at timestamp with time zone DEFAULT now() NOT NULL,
    doctor_id bigint,
    hospital_id bigint,
    branch_id bigint,
    department_id bigint,
    service_line_id bigint,
    clinical_unit character varying(120),
    source_system character varying(100),
    source_ref character varying(240),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_visit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_visit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_visit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_visit_events_id_seq OWNED BY public.crm_visit_events.id;


--
-- Name: crm_whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_uid text DEFAULT ('crm-wa-template-'::text || (gen_random_uuid())::text) NOT NULL,
    tenant_uid text NOT NULL,
    name character varying(160) NOT NULL,
    language character varying(20) DEFAULT 'en_US'::character varying NOT NULL,
    category character varying(30) NOT NULL,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    components jsonb DEFAULT '[]'::jsonb NOT NULL,
    provider_template_id character varying(240),
    quality_rating character varying(30),
    rejection_reason text,
    submitted_at timestamp with time zone,
    approved_at timestamp with time zone,
    created_by bigint,
    updated_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_whatsapp_templates_category_check CHECK (((category)::text = ANY (ARRAY[('marketing'::character varying)::text, ('utility'::character varying)::text, ('authentication'::character varying)::text]))),
    CONSTRAINT crm_whatsapp_templates_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('submitted'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('paused'::character varying)::text])))
);


--
-- Name: doctors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctors (
    id integer NOT NULL,
    organization_id integer,
    organization_type public.enum_doctors_organization_type DEFAULT 'individual'::public.enum_doctors_organization_type,
    prefix public.enum_doctors_prefix DEFAULT 'Dr'::public.enum_doctors_prefix NOT NULL,
    "firstName" character varying(100) NOT NULL,
    "lastName" character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    "phoneNumber" character varying(20) NOT NULL,
    "profileImage" character varying(500),
    specialization character varying(100) NOT NULL,
    specializations character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    qualification text,
    qualifications character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    experience integer,
    "registrationNumber" character varying(100),
    "clinicAddress" text,
    "clinicAddress_json" jsonb DEFAULT '{}'::jsonb,
    "consultationFees" numeric(10,2),
    "feeStructure" jsonb DEFAULT '{}'::jsonb,
    "availableSlots" text,
    "weeklySchedule" jsonb DEFAULT '{"friday": {"isOff": false, "online": {"enabled": true, "endTime": "13:00", "startTime": "09:00"}, "inPerson": {"enabled": true, "endTime": "18:00", "startTime": "14:00"}}, "monday": {"isOff": false, "online": {"enabled": true, "endTime": "13:00", "startTime": "09:00"}, "inPerson": {"enabled": true, "endTime": "18:00", "startTime": "14:00"}}, "sunday": {"isOff": true, "online": {"enabled": false, "endTime": "", "startTime": ""}, "inPerson": {"enabled": false, "endTime": "", "startTime": ""}}, "tuesday": {"isOff": false, "online": {"enabled": true, "endTime": "13:00", "startTime": "09:00"}, "inPerson": {"enabled": true, "endTime": "18:00", "startTime": "14:00"}}, "saturday": {"isOff": false, "online": {"enabled": true, "endTime": "13:00", "startTime": "09:00"}, "inPerson": {"enabled": false, "endTime": "", "startTime": ""}}, "thursday": {"isOff": false, "online": {"enabled": true, "endTime": "13:00", "startTime": "09:00"}, "inPerson": {"enabled": true, "endTime": "18:00", "startTime": "14:00"}}, "wednesday": {"isOff": false, "online": {"enabled": true, "endTime": "13:00", "startTime": "09:00"}, "inPerson": {"enabled": true, "endTime": "18:00", "startTime": "14:00"}}}'::jsonb,
    reviews text,
    reviews_json jsonb DEFAULT '[]'::jsonb,
    rating numeric(3,2) DEFAULT 0,
    "totalReviews" integer DEFAULT 0,
    "servicesOffered" character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    languages character varying(255)[] DEFAULT ARRAY['English'::character varying(255)],
    "totalAppointments" integer DEFAULT 0,
    "completedAppointments" integer DEFAULT 0,
    "cancelledAppointments" integer DEFAULT 0,
    "professionalSettings" jsonb DEFAULT '{}'::jsonb,
    "isVerified" boolean DEFAULT false,
    "emailVerified" boolean DEFAULT false,
    "phoneVerified" boolean DEFAULT false,
    "documentVerified" boolean DEFAULT false,
    documents jsonb DEFAULT '{}'::jsonb,
    status public.enum_doctors_status DEFAULT 'pending'::public.enum_doctors_status,
    "isOnline" boolean DEFAULT false,
    "lastLoginAt" timestamp with time zone,
    "lastActivityAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    search_vector tsvector,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    tenant_id integer,
    "passwordResetToken" character varying(255),
    "passwordResetExpires" timestamp with time zone,
    "slotDuration" integer DEFAULT 30,
    "practiceLocations" jsonb DEFAULT '[]'::jsonb,
    "documentTemplates" jsonb DEFAULT '[]'::jsonb,
    "templateSettings" jsonb DEFAULT '{}'::jsonb,
    offers_second_opinion boolean DEFAULT false,
    offers_home_visits boolean DEFAULT false,
    home_visit_radius_km integer DEFAULT 10,
    second_opinion_fee numeric(10,2),
    home_visit_fee numeric(10,2),
    unique_id character varying(6) NOT NULL,
    "onlineConsultationFee" numeric(10,2) DEFAULT 500.00,
    "uniqueId" character varying(10),
    accepts_emergency_calls boolean DEFAULT false,
    emergency_available_from time without time zone DEFAULT '00:00:00'::time without time zone,
    emergency_available_to time without time zone DEFAULT '23:59:59'::time without time zone,
    emergency_fee numeric(10,2) DEFAULT 0,
    emergency_available_until timestamp with time zone,
    uid uuid DEFAULT public.uuid_generate_v4(),
    "weeklyAvailability" jsonb DEFAULT '{"friday": {"slots": [{"endTime": "17:00", "startTime": "09:00", "consultationType": "both"}], "isAvailable": true}, "monday": {"slots": [{"endTime": "17:00", "startTime": "09:00", "consultationType": "both"}], "isAvailable": true}, "sunday": {"slots": [], "isAvailable": false}, "tuesday": {"slots": [{"endTime": "17:00", "startTime": "09:00", "consultationType": "both"}], "isAvailable": true}, "saturday": {"slots": [], "isAvailable": false}, "thursday": {"slots": [{"endTime": "17:00", "startTime": "09:00", "consultationType": "both"}], "isAvailable": true}, "wednesday": {"slots": [{"endTime": "17:00", "startTime": "09:00", "consultationType": "both"}], "isAvailable": true}}'::jsonb,
    "consultationTypes" jsonb DEFAULT '{"online": {"fee": 500, "available": true}, "walkIn": {"fee": 600, "available": true}, "homeVisit": {"fee": 1000, "available": false}}'::jsonb,
    "userId" integer,
    "inPersonConsultationFee" numeric(10,2),
    attached_pharmacies jsonb DEFAULT '[]'::jsonb,
    attached_labs jsonb DEFAULT '[]'::jsonb,
    affiliated_organizations jsonb DEFAULT '[]'::jsonb,
    social_links jsonb DEFAULT '{}'::jsonb,
    uuid_id uuid DEFAULT gen_random_uuid() NOT NULL,
    google_id character varying(255),
    facebook_id character varying(255),
    oauth_provider character varying(50),
    organization_uid text,
    tenant_uid text,
    linked_user_uid text,
    CONSTRAINT doctors_slotduration_check CHECK (("slotDuration" = ANY (ARRAY[15, 30, 45, 60])))
);


--
-- Name: doctors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.doctors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: doctors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.doctors_id_seq OWNED BY public.doctors.id;


--
-- Name: email_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    email character varying(255) NOT NULL,
    display_name character varying(255),
    smtp_host character varying(255),
    smtp_port integer DEFAULT 587,
    smtp_secure boolean DEFAULT false,
    smtp_username character varying(255),
    smtp_password character varying(500),
    imap_host character varying(255),
    imap_port integer DEFAULT 993,
    imap_secure boolean DEFAULT true,
    imap_username character varying(255),
    imap_password character varying(500),
    provider character varying(50) DEFAULT 'custom'::character varying,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    last_tested_at timestamp without time zone,
    test_result character varying(50),
    test_details jsonb,
    rate_limit_per_hour integer DEFAULT 100,
    rate_limit_per_day integer DEFAULT 1000,
    emails_sent_today integer DEFAULT 0,
    emails_sent_this_hour integer DEFAULT 0,
    sync_enabled boolean DEFAULT true,
    sync_frequency_minutes integer DEFAULT 15,
    last_sync_at timestamp without time zone,
    last_sync_status character varying(50),
    auto_reply_enabled boolean DEFAULT false,
    auto_reply_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp without time zone
);


--
-- Name: entity_kinds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_kinds (
    kind text NOT NULL,
    prefix text NOT NULL,
    label text NOT NULL,
    is_org boolean NOT NULL,
    tenant_type text,
    CONSTRAINT entity_kinds_prefix_check CHECK ((prefix ~ '^[A-Z]$'::text))
);


--
-- Name: entity_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_registry (
    uid text NOT NULL,
    kind text NOT NULL,
    source_table text NOT NULL,
    source_id bigint NOT NULL,
    legacy boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retired_at timestamp with time zone,
    CONSTRAINT entity_registry_uid_check CHECK ((uid ~ '^[A-Z0-9]{6}$'::text))
);


--
-- Name: entity_uid_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_uid_aliases (
    old_uid text NOT NULL,
    uid text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_uid_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_uid_rules (
    table_name text NOT NULL,
    kind text,
    column_name text NOT NULL,
    strict boolean NOT NULL,
    type_column text,
    attached_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: insurance_brokers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_brokers (
    id integer NOT NULL,
    broker_name character varying(255) NOT NULL,
    contact_person_name character varying(200) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    phone_number character varying(20),
    irdai_license_number character varying(100),
    license_validity_date date,
    pan_number character varying(10),
    gstin character varying(15),
    business_type character varying(50) DEFAULT 'individual'::character varying,
    office_address text,
    city character varying(100),
    state character varying(100),
    pincode character varying(10),
    commission_percentage numeric(5,2) DEFAULT 10.00,
    active_policies_count integer DEFAULT 0,
    total_premium_facilitated numeric(15,2) DEFAULT 0,
    payout_bank_account jsonb DEFAULT '{}'::jsonb,
    certifications jsonb DEFAULT '[]'::jsonb,
    specializations jsonb DEFAULT '[]'::jsonb,
    service_areas jsonb DEFAULT '[]'::jsonb,
    status character varying(20) DEFAULT 'active'::character varying,
    is_verified boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    uid uuid DEFAULT public.uuid_generate_v4(),
    broker_uid character varying(6) NOT NULL,
    tenant_id integer,
    tenant_uid text
);


--
-- Name: insurance_brokers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.insurance_brokers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: insurance_brokers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.insurance_brokers_id_seq OWNED BY public.insurance_brokers.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    "deepLink" character varying(500),
    "webRoute" character varying(500),
    priority character varying(20) DEFAULT 'normal'::character varying,
    "isRead" boolean DEFAULT false,
    "readAt" timestamp with time zone,
    "scheduledFor" timestamp with time zone,
    "sentAt" timestamp with time zone,
    status character varying(50) DEFAULT 'pending'::character varying,
    channels character varying(255)[] DEFAULT ARRAY['app'::character varying(255)],
    "deliveryStatus" jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    "expiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    tenant_id integer,
    "userType" character varying(20) DEFAULT 'patient'::character varying
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    "firstName" character varying(100) NOT NULL,
    "lastName" character varying(100) NOT NULL,
    email character varying(255),
    password character varying(255) NOT NULL,
    "dateOfBirth" timestamp with time zone,
    gender public.enum_users_gender,
    "phoneNumber" character varying(20) NOT NULL,
    organization_id integer,
    organization_type public.enum_users_organization_type DEFAULT 'individual'::public.enum_users_organization_type,
    address_street text,
    address_city character varying(100),
    address_state character varying(100),
    "address_zipCode" character varying(10),
    address_country character varying(100) DEFAULT 'India'::character varying,
    address_json jsonb DEFAULT '{}'::jsonb,
    "emergencyContact_name" character varying(100),
    "emergencyContact_relationship" character varying(50),
    "emergencyContact_phoneNumber" character varying(20),
    "emergencyContact_json" jsonb DEFAULT '{}'::jsonb,
    "bloodType" character varying(10),
    allergies character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    medications character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    "chronicConditions" character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    "medicalHistory" jsonb DEFAULT '{}'::jsonb,
    "profileImage" character varying(500),
    "isVerified" boolean DEFAULT false,
    "emailVerified" boolean DEFAULT false,
    "phoneVerified" boolean DEFAULT false,
    preferences jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    "lastLoginAt" timestamp with time zone,
    "lastActivityAt" timestamp with time zone,
    "loginCount" integer DEFAULT 0,
    status public.enum_users_status DEFAULT 'active'::public.enum_users_status,
    search_vector tsvector,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    "isAdmin" boolean DEFAULT false,
    role character varying(50) DEFAULT 'user'::character varying,
    tenant_id integer,
    "abhaHealthId" character varying(50),
    department_id integer,
    department_name character varying(100),
    permissions jsonb DEFAULT '[]'::jsonb,
    scope jsonb DEFAULT '{}'::jsonb,
    "passwordResetToken" character varying(255),
    "passwordResetExpires" timestamp without time zone,
    employer_name character varying(200),
    employee_id character varying(50),
    corporate_id integer,
    membership_type character varying(50) DEFAULT 'individual'::character varying,
    "isTeam" boolean DEFAULT false,
    "isCorporate" boolean DEFAULT false,
    primary_doctor_id integer,
    unique_id character varying(6) NOT NULL,
    emergency_triage_credits_used integer DEFAULT 0 NOT NULL,
    emergency_triage_credit_limit integer DEFAULT 1 NOT NULL,
    emergency_triage_pending_amount numeric(10,2) DEFAULT 0 NOT NULL,
    "emergencyTriageCreditsUsed" integer DEFAULT 0,
    "emergencyTriageCreditLimit" integer DEFAULT 1,
    "emergencyTriagePendingAmount" numeric(10,2) DEFAULT 0.00,
    uid uuid DEFAULT public.uuid_generate_v4(),
    aggregator_id integer,
    aggregator_type character varying(50),
    height numeric(5,1),
    weight numeric(5,1),
    "familyHistory" jsonb DEFAULT '{}'::jsonb,
    "personalHistory" jsonb DEFAULT '{}'::jsonb,
    "googleId" character varying(128),
    "facebookId" character varying(128),
    "oauthProvider" character varying(32),
    "googleFitConnected" boolean DEFAULT false,
    "googleFitLastSync" timestamp with time zone,
    medical_history_enc bytea,
    family_history_enc bytea,
    personal_history_enc bytea,
    blood_type_enc bytea,
    abha_id_enc bytea,
    uuid_id uuid DEFAULT gen_random_uuid() NOT NULL,
    invited_by integer,
    username character varying(100),
    organization_uid text,
    aggregator_uid text,
    corporate_uid text,
    tenant_uid text
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;


--
-- Name: portal_refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_refresh_tokens (
    jti uuid NOT NULL,
    user_id text NOT NULL,
    portal text NOT NULL,
    device_fp text,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: social_inbox_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_inbox_conversations (
    id integer NOT NULL,
    channel text NOT NULL,
    page_id text,
    external_user_id text NOT NULL,
    contact_name text,
    contact_avatar_url text,
    last_message_preview text,
    last_message_at timestamp with time zone,
    last_direction text,
    unread_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assigned_team_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_uid text,
    labels jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    human_takeover_at timestamp with time zone,
    human_takeover_by bigint,
    closed_at timestamp with time zone,
    CONSTRAINT social_inbox_conversations_channel_check CHECK ((channel = ANY (ARRAY['instagram'::text, 'facebook'::text]))),
    CONSTRAINT social_inbox_conversations_last_direction_check CHECK ((last_direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT social_inbox_conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: social_inbox_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_inbox_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: social_inbox_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_inbox_conversations_id_seq OWNED BY public.social_inbox_conversations.id;


--
-- Name: social_inbox_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_inbox_messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    direction text NOT NULL,
    external_message_id text,
    body text,
    attachments jsonb,
    sent_by_team_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_inbox_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: social_inbox_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_inbox_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: social_inbox_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_inbox_messages_id_seq OWNED BY public.social_inbox_messages.id;


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id integer NOT NULL,
    "userId" integer,
    unique_id character varying(6) NOT NULL,
    "employeeId" character varying(50) NOT NULL,
    "firstName" character varying(100) NOT NULL,
    "lastName" character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    "phoneNumber" character varying(20) NOT NULL,
    "profileImage" character varying(500),
    role public.enum_team_members_role DEFAULT 'support'::public.enum_team_members_role NOT NULL,
    department character varying(100),
    designation character varying(100),
    "joiningDate" timestamp with time zone,
    "exitDate" timestamp with time zone,
    "employmentStatus" public."enum_team_members_employmentStatus" DEFAULT 'active'::public."enum_team_members_employmentStatus",
    "employmentType" public."enum_team_members_employmentType" DEFAULT 'full_time'::public."enum_team_members_employmentType",
    permissions jsonb DEFAULT '{}'::jsonb,
    "accessLevel" integer DEFAULT 1,
    "workLocation" character varying(255),
    "emergencyContact" jsonb DEFAULT '{}'::jsonb,
    "managerId" integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    notes text,
    "isActive" boolean DEFAULT true,
    "twoFactorEnabled" boolean DEFAULT false,
    "twoFactorSecret" character varying(255),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: team_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: team_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_members_id_seq OWNED BY public.team_members.id;


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    subdomain character varying(63),
    custom_domain character varying(255),
    type public.enum_tenants_type NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20) NOT NULL,
    website character varying(255),
    address jsonb DEFAULT '{}'::jsonb NOT NULL,
    latitude numeric(10,8),
    longitude numeric(11,8),
    registration_number character varying(100),
    tax_id character varying(50),
    plan public.enum_tenants_plan DEFAULT 'free'::public.enum_tenants_plan NOT NULL,
    plan_start_date timestamp with time zone,
    plan_end_date timestamp with time zone,
    billing_cycle public.enum_tenants_billing_cycle,
    limits jsonb DEFAULT '{"users": 10, "doctors": 5, "storage_gb": 5, "appointments_per_month": 100}'::jsonb NOT NULL,
    usage jsonb DEFAULT '{"users": 0, "doctors": 0, "storage_gb": 0, "appointments_this_month": 0}'::jsonb NOT NULL,
    settings jsonb DEFAULT '{"currency": "INR", "language": "en", "timezone": "Asia/Kolkata", "date_format": "DD/MM/YYYY", "time_format": "24h"}'::jsonb NOT NULL,
    branding jsonb DEFAULT '{"logo_url": null, "favicon_url": null, "primary_color": "#0066cc", "secondary_color": "#00994d"}'::jsonb NOT NULL,
    features jsonb DEFAULT '{"pharmacy": false, "analytics": false, "insurance": false, "lab_tests": false, "ai_assistant": false, "appointments": true, "telemedicine": false, "prescriptions": true}'::jsonb NOT NULL,
    integrations jsonb DEFAULT '{}'::jsonb NOT NULL,
    owner_id integer,
    status public.enum_tenants_status DEFAULT 'pending'::public.enum_tenants_status NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    verified_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    onboarded_at timestamp with time zone,
    last_activity_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    admin_user_id integer,
    admin_email character varying(255),
    admin_users jsonb DEFAULT '[]'::jsonb,
    uid uuid DEFAULT public.uuid_generate_v4(),
    admin_password character varying(255),
    admin_metadata jsonb DEFAULT '{}'::jsonb,
    parent_id integer,
    aggregator_uid character varying(6),
    billing_email character varying(255),
    billing_contact character varying(255),
    suspension_reason text,
    suspended_at timestamp without time zone,
    grace_period_end date,
    unique_id text NOT NULL
);


--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenants_id_seq OWNED BY public.tenants.id;


--
-- Name: user_associations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_associations (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "entityType" public."enum_user_associations_entityType" NOT NULL,
    "entityId" integer NOT NULL,
    role public.enum_user_associations_role NOT NULL,
    "isPrimary" boolean DEFAULT false,
    status public.enum_user_associations_status DEFAULT 'active'::public.enum_user_associations_status,
    "startDate" timestamp with time zone,
    "endDate" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    permissions jsonb DEFAULT '{}'::jsonb,
    "createdBy" integer,
    notes text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    corporate_unique_id character varying(20)
);


--
-- Name: user_associations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_associations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_associations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_associations_id_seq OWNED BY public.user_associations.id;


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: uuid_id_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uuid_id_map (
    entity_type character varying(50) NOT NULL,
    integer_id integer NOT NULL,
    uuid_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_v2_refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_v2_refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.api_v2_refresh_tokens_id_seq'::regclass);


--
-- Name: corporates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates ALTER COLUMN id SET DEFAULT nextval('public.corporates_id_seq'::regclass);


--
-- Name: crm_activities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities ALTER COLUMN id SET DEFAULT nextval('public.crm_activities_id_seq'::regclass);


--
-- Name: crm_agencies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agencies ALTER COLUMN id SET DEFAULT nextval('public.crm_agencies_id_seq'::regclass);


--
-- Name: crm_agent_memories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agent_memories ALTER COLUMN id SET DEFAULT nextval('public.crm_agent_memories_id_seq'::regclass);


--
-- Name: crm_agents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agents ALTER COLUMN id SET DEFAULT nextval('public.crm_agents_id_seq'::regclass);


--
-- Name: crm_ai_email_communications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_ai_email_communications ALTER COLUMN id SET DEFAULT nextval('public.crm_ai_email_communications_id_seq'::regclass);


--
-- Name: crm_ai_growth_recommendations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_ai_growth_recommendations ALTER COLUMN id SET DEFAULT nextval('public.crm_ai_growth_recommendations_id_seq'::regclass);


--
-- Name: crm_appointment_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_appointment_links ALTER COLUMN id SET DEFAULT nextval('public.crm_appointment_links_id_seq'::regclass);


--
-- Name: crm_approval_workflows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_approval_workflows ALTER COLUMN id SET DEFAULT nextval('public.crm_approval_workflows_id_seq'::regclass);


--
-- Name: crm_assignment_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_assignment_rules ALTER COLUMN id SET DEFAULT nextval('public.crm_assignment_rules_id_seq'::regclass);


--
-- Name: crm_attribution_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_attribution_results ALTER COLUMN id SET DEFAULT nextval('public.crm_attribution_results_id_seq'::regclass);


--
-- Name: crm_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_audit_log ALTER COLUMN id SET DEFAULT nextval('public.crm_audit_log_id_seq'::regclass);


--
-- Name: crm_automation_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automation_executions ALTER COLUMN id SET DEFAULT nextval('public.crm_automation_executions_id_seq'::regclass);


--
-- Name: crm_automations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automations ALTER COLUMN id SET DEFAULT nextval('public.crm_automations_id_seq'::regclass);


--
-- Name: crm_business_hours id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_business_hours ALTER COLUMN id SET DEFAULT nextval('public.crm_business_hours_id_seq'::regclass);


--
-- Name: crm_calculation_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_calculation_runs ALTER COLUMN id SET DEFAULT nextval('public.crm_calculation_runs_id_seq'::regclass);


--
-- Name: crm_campaign_costs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaign_costs ALTER COLUMN id SET DEFAULT nextval('public.crm_campaign_costs_id_seq'::regclass);


--
-- Name: crm_campaign_performance_mart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaign_performance_mart ALTER COLUMN id SET DEFAULT nextval('public.crm_campaign_performance_mart_id_seq'::regclass);


--
-- Name: crm_campaigns_unified id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaigns_unified ALTER COLUMN id SET DEFAULT nextval('public.crm_campaigns_unified_id_seq'::regclass);


--
-- Name: crm_channel_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_channel_metrics ALTER COLUMN id SET DEFAULT nextval('public.crm_channel_metrics_id_seq'::regclass);


--
-- Name: crm_chatwoot_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_conversations ALTER COLUMN id SET DEFAULT nextval('public.crm_chatwoot_conversations_id_seq'::regclass);


--
-- Name: crm_chatwoot_inboxes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_inboxes ALTER COLUMN id SET DEFAULT nextval('public.crm_chatwoot_inboxes_id_seq'::regclass);


--
-- Name: crm_chatwoot_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_jobs ALTER COLUMN id SET DEFAULT nextval('public.crm_chatwoot_jobs_id_seq'::regclass);


--
-- Name: crm_commissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_commissions ALTER COLUMN id SET DEFAULT nextval('public.crm_commissions_id_seq'::regclass);


--
-- Name: crm_communication_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_events ALTER COLUMN id SET DEFAULT nextval('public.crm_communication_events_id_seq'::regclass);


--
-- Name: crm_communication_hub_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_hub_alerts ALTER COLUMN id SET DEFAULT nextval('public.crm_communication_hub_alerts_id_seq'::regclass);


--
-- Name: crm_communication_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_templates ALTER COLUMN id SET DEFAULT nextval('public.crm_communication_templates_id_seq'::regclass);


--
-- Name: crm_consent_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_consent_records ALTER COLUMN id SET DEFAULT nextval('public.crm_consent_records_id_seq'::regclass);


--
-- Name: crm_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts ALTER COLUMN id SET DEFAULT nextval('public.crm_contacts_id_seq'::regclass);


--
-- Name: crm_contacts_v2 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts_v2 ALTER COLUMN id SET DEFAULT nextval('public.crm_contacts_v2_id_seq'::regclass);


--
-- Name: crm_content_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_content_assets ALTER COLUMN id SET DEFAULT nextval('public.crm_content_assets_id_seq'::regclass);


--
-- Name: crm_content_calendar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_content_calendar ALTER COLUMN id SET DEFAULT nextval('public.crm_content_calendar_id_seq'::regclass);


--
-- Name: crm_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversations ALTER COLUMN id SET DEFAULT nextval('public.crm_conversations_id_seq'::regclass);


--
-- Name: crm_corporate_health_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_corporate_health_plans ALTER COLUMN id SET DEFAULT nextval('public.crm_corporate_health_plans_id_seq'::regclass);


--
-- Name: crm_daily_funnel_mart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_daily_funnel_mart ALTER COLUMN id SET DEFAULT nextval('public.crm_daily_funnel_mart_id_seq'::regclass);


--
-- Name: crm_data_quality_issues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_data_quality_issues ALTER COLUMN id SET DEFAULT nextval('public.crm_data_quality_issues_id_seq'::regclass);


--
-- Name: crm_deals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals ALTER COLUMN id SET DEFAULT nextval('public.crm_deals_id_seq'::regclass);


--
-- Name: crm_diagnostic_booking_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_booking_events ALTER COLUMN id SET DEFAULT nextval('public.crm_diagnostic_booking_events_id_seq'::regclass);


--
-- Name: crm_diagnostic_bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_bookings ALTER COLUMN id SET DEFAULT nextval('public.crm_diagnostic_bookings_id_seq'::regclass);


--
-- Name: crm_diagnostic_centres id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_centres ALTER COLUMN id SET DEFAULT nextval('public.crm_diagnostic_centres_id_seq'::regclass);


--
-- Name: crm_diagnostic_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_products ALTER COLUMN id SET DEFAULT nextval('public.crm_diagnostic_products_id_seq'::regclass);


--
-- Name: crm_doctor_service_line_mart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_doctor_service_line_mart ALTER COLUMN id SET DEFAULT nextval('public.crm_doctor_service_line_mart_id_seq'::regclass);


--
-- Name: crm_email_inbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_inbox ALTER COLUMN id SET DEFAULT nextval('public.crm_email_inbox_id_seq'::regclass);


--
-- Name: crm_email_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_settings ALTER COLUMN id SET DEFAULT nextval('public.crm_email_settings_id_seq'::regclass);


--
-- Name: crm_email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_templates ALTER COLUMN id SET DEFAULT nextval('public.crm_email_templates_id_seq'::regclass);


--
-- Name: crm_employee_performance_mart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_performance_mart ALTER COLUMN id SET DEFAULT nextval('public.crm_employee_performance_mart_id_seq'::regclass);


--
-- Name: crm_employee_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_profiles ALTER COLUMN id SET DEFAULT nextval('public.crm_employee_profiles_id_seq'::regclass);


--
-- Name: crm_employee_targets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_targets ALTER COLUMN id SET DEFAULT nextval('public.crm_employee_targets_id_seq'::regclass);


--
-- Name: crm_feedback_responses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_responses ALTER COLUMN id SET DEFAULT nextval('public.crm_feedback_responses_id_seq'::regclass);


--
-- Name: crm_feedback_surveys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_surveys ALTER COLUMN id SET DEFAULT nextval('public.crm_feedback_surveys_id_seq'::regclass);


--
-- Name: crm_flow_edges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_edges ALTER COLUMN id SET DEFAULT nextval('public.crm_flow_edges_id_seq'::regclass);


--
-- Name: crm_flow_nodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_nodes ALTER COLUMN id SET DEFAULT nextval('public.crm_flow_nodes_id_seq'::regclass);


--
-- Name: crm_flow_run_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_run_events ALTER COLUMN id SET DEFAULT nextval('public.crm_flow_run_events_id_seq'::regclass);


--
-- Name: crm_frequency_counters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_frequency_counters ALTER COLUMN id SET DEFAULT nextval('public.crm_frequency_counters_id_seq'::regclass);


--
-- Name: crm_funnel_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_funnel_events ALTER COLUMN id SET DEFAULT nextval('public.crm_funnel_events_id_seq'::regclass);


--
-- Name: crm_growth_daily_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_growth_daily_metrics ALTER COLUMN id SET DEFAULT nextval('public.crm_growth_daily_metrics_id_seq'::regclass);


--
-- Name: crm_growth_recovery_cases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_growth_recovery_cases ALTER COLUMN id SET DEFAULT nextval('public.crm_growth_recovery_cases_id_seq'::regclass);


--
-- Name: crm_identity_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_identity_keys ALTER COLUMN id SET DEFAULT nextval('public.crm_identity_keys_id_seq'::regclass);


--
-- Name: crm_incentive_payouts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_incentive_payouts ALTER COLUMN id SET DEFAULT nextval('public.crm_incentive_payouts_id_seq'::regclass);


--
-- Name: crm_incentive_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_incentive_rules ALTER COLUMN id SET DEFAULT nextval('public.crm_incentive_rules_id_seq'::regclass);


--
-- Name: crm_insurance_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_insurance_products ALTER COLUMN id SET DEFAULT nextval('public.crm_insurance_products_id_seq'::regclass);


--
-- Name: crm_integration_errors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_integration_errors ALTER COLUMN id SET DEFAULT nextval('public.crm_integration_errors_id_seq'::regclass);


--
-- Name: crm_integration_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_integration_runs ALTER COLUMN id SET DEFAULT nextval('public.crm_integration_runs_id_seq'::regclass);


--
-- Name: crm_journey_enrollments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_enrollments ALTER COLUMN id SET DEFAULT nextval('public.crm_journey_enrollments_id_seq'::regclass);


--
-- Name: crm_journey_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_events ALTER COLUMN id SET DEFAULT nextval('public.crm_journey_events_id_seq'::regclass);


--
-- Name: crm_journey_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_steps ALTER COLUMN id SET DEFAULT nextval('public.crm_journey_steps_id_seq'::regclass);


--
-- Name: crm_journeys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journeys ALTER COLUMN id SET DEFAULT nextval('public.crm_journeys_id_seq'::regclass);


--
-- Name: crm_kpi_actuals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_actuals ALTER COLUMN id SET DEFAULT nextval('public.crm_kpi_actuals_id_seq'::regclass);


--
-- Name: crm_kpi_definitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_definitions ALTER COLUMN id SET DEFAULT nextval('public.crm_kpi_definitions_id_seq'::regclass);


--
-- Name: crm_landing_page_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_landing_page_events ALTER COLUMN id SET DEFAULT nextval('public.crm_landing_page_events_id_seq'::regclass);


--
-- Name: crm_landing_pages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_landing_pages ALTER COLUMN id SET DEFAULT nextval('public.crm_landing_pages_id_seq'::regclass);


--
-- Name: crm_lead_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_assignments ALTER COLUMN id SET DEFAULT nextval('public.crm_lead_assignments_id_seq'::regclass);


--
-- Name: crm_lead_merge_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_merge_audit ALTER COLUMN id SET DEFAULT nextval('public.crm_lead_merge_audit_id_seq'::regclass);


--
-- Name: crm_lead_score_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_score_events ALTER COLUMN id SET DEFAULT nextval('public.crm_lead_score_events_id_seq'::regclass);


--
-- Name: crm_lead_score_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_score_rules ALTER COLUMN id SET DEFAULT nextval('public.crm_lead_score_rules_id_seq'::regclass);


--
-- Name: crm_lead_sla_instances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_sla_instances ALTER COLUMN id SET DEFAULT nextval('public.crm_lead_sla_instances_id_seq'::regclass);


--
-- Name: crm_leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads ALTER COLUMN id SET DEFAULT nextval('public.crm_leads_id_seq'::regclass);


--
-- Name: crm_leads_v2 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2 ALTER COLUMN id SET DEFAULT nextval('public.crm_leads_v2_id_seq'::regclass);


--
-- Name: crm_login_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_login_attempts ALTER COLUMN id SET DEFAULT nextval('public.crm_login_attempts_id_seq'::regclass);


--
-- Name: crm_marketing_budgets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_budgets ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_budgets_id_seq'::regclass);


--
-- Name: crm_marketing_campaign_recipients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaign_recipients ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_campaign_recipients_id_seq'::regclass);


--
-- Name: crm_marketing_campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaigns ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_campaigns_id_seq'::regclass);


--
-- Name: crm_marketing_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_events ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_events_id_seq'::regclass);


--
-- Name: crm_marketing_imports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_imports ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_imports_id_seq'::regclass);


--
-- Name: crm_marketing_integrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_integrations ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_integrations_id_seq'::regclass);


--
-- Name: crm_marketing_list_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_list_members ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_list_members_id_seq'::regclass);


--
-- Name: crm_marketing_lists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_lists ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_lists_id_seq'::regclass);


--
-- Name: crm_marketing_senders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_senders ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_senders_id_seq'::regclass);


--
-- Name: crm_marketing_suppressions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_suppressions ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_suppressions_id_seq'::regclass);


--
-- Name: crm_marketing_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_templates ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_templates_id_seq'::regclass);


--
-- Name: crm_offline_campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_offline_campaigns ALTER COLUMN id SET DEFAULT nextval('public.crm_offline_campaigns_id_seq'::regclass);


--
-- Name: crm_org_units id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_org_units ALTER COLUMN id SET DEFAULT nextval('public.crm_org_units_id_seq'::regclass);


--
-- Name: crm_person_identities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_person_identities ALTER COLUMN id SET DEFAULT nextval('public.crm_person_identities_id_seq'::regclass);


--
-- Name: crm_product_coverage_matrix id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_product_coverage_matrix ALTER COLUMN id SET DEFAULT nextval('public.crm_product_coverage_matrix_id_seq'::regclass);


--
-- Name: crm_product_tc_master id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_product_tc_master ALTER COLUMN id SET DEFAULT nextval('public.crm_product_tc_master_id_seq'::regclass);


--
-- Name: crm_provider_referrals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_provider_referrals ALTER COLUMN id SET DEFAULT nextval('public.crm_provider_referrals_id_seq'::regclass);


--
-- Name: crm_quotes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_quotes ALTER COLUMN id SET DEFAULT nextval('public.crm_quotes_id_seq'::regclass);


--
-- Name: crm_refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.crm_refresh_tokens_id_seq'::regclass);


--
-- Name: crm_reputation_mart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reputation_mart ALTER COLUMN id SET DEFAULT nextval('public.crm_reputation_mart_id_seq'::regclass);


--
-- Name: crm_reputation_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reputation_tasks ALTER COLUMN id SET DEFAULT nextval('public.crm_reputation_tasks_id_seq'::regclass);


--
-- Name: crm_revenue_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_revenue_events ALTER COLUMN id SET DEFAULT nextval('public.crm_revenue_events_id_seq'::regclass);


--
-- Name: crm_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reviews ALTER COLUMN id SET DEFAULT nextval('public.crm_reviews_id_seq'::regclass);


--
-- Name: crm_rfq_analysis_cache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_analysis_cache ALTER COLUMN id SET DEFAULT nextval('public.crm_rfq_analysis_cache_id_seq'::regclass);


--
-- Name: crm_rfq_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_audit_log ALTER COLUMN id SET DEFAULT nextval('public.crm_rfq_audit_log_id_seq'::regclass);


--
-- Name: crm_rfq_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_claims ALTER COLUMN id SET DEFAULT nextval('public.crm_rfq_claims_id_seq'::regclass);


--
-- Name: crm_rfq_files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_files ALTER COLUMN id SET DEFAULT nextval('public.crm_rfq_files_id_seq'::regclass);


--
-- Name: crm_rfq_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_members ALTER COLUMN id SET DEFAULT nextval('public.crm_rfq_members_id_seq'::regclass);


--
-- Name: crm_rfq_policy_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_policy_history ALTER COLUMN id SET DEFAULT nextval('public.crm_rfq_policy_history_id_seq'::regclass);


--
-- Name: crm_rfq_underwriting id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_underwriting ALTER COLUMN id SET DEFAULT nextval('public.crm_rfq_underwriting_id_seq'::regclass);


--
-- Name: crm_rfqs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfqs ALTER COLUMN id SET DEFAULT nextval('public.crm_rfqs_id_seq'::regclass);


--
-- Name: crm_segment_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segment_members ALTER COLUMN id SET DEFAULT nextval('public.crm_segment_members_id_seq'::regclass);


--
-- Name: crm_segments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segments ALTER COLUMN id SET DEFAULT nextval('public.crm_segments_id_seq'::regclass);


--
-- Name: crm_service_line_targets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_service_line_targets ALTER COLUMN id SET DEFAULT nextval('public.crm_service_line_targets_id_seq'::regclass);


--
-- Name: crm_sla_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_events ALTER COLUMN id SET DEFAULT nextval('public.crm_sla_events_id_seq'::regclass);


--
-- Name: crm_sla_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_policies ALTER COLUMN id SET DEFAULT nextval('public.crm_sla_policies_id_seq'::regclass);


--
-- Name: crm_sla_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_rules ALTER COLUMN id SET DEFAULT nextval('public.crm_sla_rules_id_seq'::regclass);


--
-- Name: crm_social_post_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_post_comments ALTER COLUMN id SET DEFAULT nextval('public.crm_social_post_comments_id_seq'::regclass);


--
-- Name: crm_social_post_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_post_events ALTER COLUMN id SET DEFAULT nextval('public.crm_social_post_events_id_seq'::regclass);


--
-- Name: crm_social_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_posts ALTER COLUMN id SET DEFAULT nextval('public.crm_social_posts_id_seq'::regclass);


--
-- Name: crm_source_taxonomy id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_source_taxonomy ALTER COLUMN id SET DEFAULT nextval('public.crm_source_taxonomy_id_seq'::regclass);


--
-- Name: crm_specialty_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_specialty_profiles ALTER COLUMN id SET DEFAULT nextval('public.crm_specialty_profiles_id_seq'::regclass);


--
-- Name: crm_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks ALTER COLUMN id SET DEFAULT nextval('public.crm_tasks_id_seq'::regclass);


--
-- Name: crm_touchpoints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_touchpoints ALTER COLUMN id SET DEFAULT nextval('public.crm_touchpoints_id_seq'::regclass);


--
-- Name: crm_vendors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_vendors ALTER COLUMN id SET DEFAULT nextval('public.crm_vendors_id_seq'::regclass);


--
-- Name: crm_visit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_visit_events ALTER COLUMN id SET DEFAULT nextval('public.crm_visit_events_id_seq'::regclass);


--
-- Name: doctors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors ALTER COLUMN id SET DEFAULT nextval('public.doctors_id_seq'::regclass);


--
-- Name: insurance_brokers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_brokers ALTER COLUMN id SET DEFAULT nextval('public.insurance_brokers_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: social_inbox_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_inbox_conversations ALTER COLUMN id SET DEFAULT nextval('public.social_inbox_conversations_id_seq'::regclass);


--
-- Name: social_inbox_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_inbox_messages ALTER COLUMN id SET DEFAULT nextval('public.social_inbox_messages_id_seq'::regclass);


--
-- Name: team_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members ALTER COLUMN id SET DEFAULT nextval('public.team_members_id_seq'::regclass);


--
-- Name: tenants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants ALTER COLUMN id SET DEFAULT nextval('public.tenants_id_seq'::regclass);


--
-- Name: user_associations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_associations ALTER COLUMN id SET DEFAULT nextval('public.user_associations_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: api_v2_refresh_tokens api_v2_refresh_tokens_jti_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_v2_refresh_tokens
    ADD CONSTRAINT api_v2_refresh_tokens_jti_key UNIQUE (jti);


--
-- Name: api_v2_refresh_tokens api_v2_refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_v2_refresh_tokens
    ADD CONSTRAINT api_v2_refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: corporates corporates_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT corporates_email_key UNIQUE (email);


--
-- Name: corporates corporates_gstNumber_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT "corporates_gstNumber_key" UNIQUE ("gstNumber");


--
-- Name: corporates corporates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT corporates_pkey PRIMARY KEY (id);


--
-- Name: corporates corporates_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT corporates_uid_key UNIQUE (uid);


--
-- Name: corporates corporates_unique_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT corporates_unique_id_key UNIQUE (unique_id);


--
-- Name: crm_activities crm_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);


--
-- Name: crm_agencies crm_agencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agencies
    ADD CONSTRAINT crm_agencies_pkey PRIMARY KEY (id);


--
-- Name: crm_agent_memories crm_agent_memories_entity_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agent_memories
    ADD CONSTRAINT crm_agent_memories_entity_uid_key UNIQUE (entity_uid);


--
-- Name: crm_agent_memories crm_agent_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agent_memories
    ADD CONSTRAINT crm_agent_memories_pkey PRIMARY KEY (id);


--
-- Name: crm_agent_proposals crm_agent_proposals_entity_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agent_proposals
    ADD CONSTRAINT crm_agent_proposals_entity_uid_key UNIQUE (entity_uid);


--
-- Name: crm_agent_proposals crm_agent_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agent_proposals
    ADD CONSTRAINT crm_agent_proposals_pkey PRIMARY KEY (id);


--
-- Name: crm_agents crm_agents_agent_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agents
    ADD CONSTRAINT crm_agents_agent_code_key UNIQUE (agent_code);


--
-- Name: crm_agents crm_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agents
    ADD CONSTRAINT crm_agents_pkey PRIMARY KEY (id);


--
-- Name: crm_ai_email_communications crm_ai_email_communications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_ai_email_communications
    ADD CONSTRAINT crm_ai_email_communications_pkey PRIMARY KEY (id);


--
-- Name: crm_ai_growth_recommendations crm_ai_growth_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_ai_growth_recommendations
    ADD CONSTRAINT crm_ai_growth_recommendations_pkey PRIMARY KEY (id);


--
-- Name: crm_appointment_links crm_appointment_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_appointment_links
    ADD CONSTRAINT crm_appointment_links_pkey PRIMARY KEY (id);


--
-- Name: crm_approval_workflows crm_approval_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_approval_workflows
    ADD CONSTRAINT crm_approval_workflows_pkey PRIMARY KEY (id);


--
-- Name: crm_assignment_rules crm_assignment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_assignment_rules
    ADD CONSTRAINT crm_assignment_rules_pkey PRIMARY KEY (id);


--
-- Name: crm_assignment_rules crm_assignment_rules_tenant_id_rule_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_assignment_rules
    ADD CONSTRAINT crm_assignment_rules_tenant_id_rule_name_key UNIQUE (tenant_id, rule_name);


--
-- Name: crm_attribution_results crm_attribution_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_attribution_results
    ADD CONSTRAINT crm_attribution_results_pkey PRIMARY KEY (id);


--
-- Name: crm_audit_log crm_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_audit_log
    ADD CONSTRAINT crm_audit_log_pkey PRIMARY KEY (id);


--
-- Name: crm_automation_executions crm_automation_executions_automation_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automation_executions
    ADD CONSTRAINT crm_automation_executions_automation_id_lead_id_key UNIQUE (automation_id, lead_id);


--
-- Name: crm_automation_executions crm_automation_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automation_executions
    ADD CONSTRAINT crm_automation_executions_pkey PRIMARY KEY (id);


--
-- Name: crm_automations crm_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automations
    ADD CONSTRAINT crm_automations_pkey PRIMARY KEY (id);


--
-- Name: crm_automations crm_automations_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automations
    ADD CONSTRAINT crm_automations_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_business_hours crm_business_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_business_hours
    ADD CONSTRAINT crm_business_hours_pkey PRIMARY KEY (id);


--
-- Name: crm_business_hours crm_business_hours_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_business_hours
    ADD CONSTRAINT crm_business_hours_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_calculation_runs crm_calculation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_calculation_runs
    ADD CONSTRAINT crm_calculation_runs_pkey PRIMARY KEY (id);


--
-- Name: crm_campaign_costs crm_campaign_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaign_costs
    ADD CONSTRAINT crm_campaign_costs_pkey PRIMARY KEY (id);


--
-- Name: crm_campaign_performance_mart crm_campaign_performance_mart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaign_performance_mart
    ADD CONSTRAINT crm_campaign_performance_mart_pkey PRIMARY KEY (id);


--
-- Name: crm_campaign_performance_mart crm_campaign_performance_mart_tenant_id_period_start_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaign_performance_mart
    ADD CONSTRAINT crm_campaign_performance_mart_tenant_id_period_start_period_key UNIQUE (tenant_id, period_start, period_end, campaign_id, source_id);


--
-- Name: crm_campaigns_unified crm_campaigns_unified_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaigns_unified
    ADD CONSTRAINT crm_campaigns_unified_pkey PRIMARY KEY (id);


--
-- Name: crm_campaigns_unified crm_campaigns_unified_tenant_id_platform_external_campaign__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaigns_unified
    ADD CONSTRAINT crm_campaigns_unified_tenant_id_platform_external_campaign__key UNIQUE (tenant_id, platform, external_campaign_id);


--
-- Name: crm_channel_metrics crm_channel_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_channel_metrics
    ADD CONSTRAINT crm_channel_metrics_pkey PRIMARY KEY (id);


--
-- Name: crm_channel_metrics crm_channel_metrics_tenant_id_provider_metric_date_external_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_channel_metrics
    ADD CONSTRAINT crm_channel_metrics_tenant_id_provider_metric_date_external_key UNIQUE (tenant_id, provider, metric_date, external_ref);


--
-- Name: crm_chatwoot_accounts crm_chatwoot_accounts_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_accounts
    ADD CONSTRAINT crm_chatwoot_accounts_account_id_key UNIQUE (account_id);


--
-- Name: crm_chatwoot_accounts crm_chatwoot_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_accounts
    ADD CONSTRAINT crm_chatwoot_accounts_pkey PRIMARY KEY (tenant_id);


--
-- Name: crm_chatwoot_conversations crm_chatwoot_conversations_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_conversations
    ADD CONSTRAINT crm_chatwoot_conversations_id_tenant_id_key UNIQUE (id, tenant_id);


--
-- Name: crm_chatwoot_conversations crm_chatwoot_conversations_integration_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_conversations
    ADD CONSTRAINT crm_chatwoot_conversations_integration_id_customer_id_key UNIQUE (integration_id, customer_id);


--
-- Name: crm_chatwoot_conversations crm_chatwoot_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_conversations
    ADD CONSTRAINT crm_chatwoot_conversations_pkey PRIMARY KEY (id);


--
-- Name: crm_chatwoot_conversations crm_chatwoot_conversations_tenant_id_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_conversations
    ADD CONSTRAINT crm_chatwoot_conversations_tenant_id_conversation_id_key UNIQUE (tenant_id, conversation_id);


--
-- Name: crm_chatwoot_inboxes crm_chatwoot_inboxes_channel_channel_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_inboxes
    ADD CONSTRAINT crm_chatwoot_inboxes_channel_channel_address_key UNIQUE (channel, channel_address);


--
-- Name: crm_chatwoot_inboxes crm_chatwoot_inboxes_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_inboxes
    ADD CONSTRAINT crm_chatwoot_inboxes_id_tenant_id_key UNIQUE (id, tenant_id);


--
-- Name: crm_chatwoot_inboxes crm_chatwoot_inboxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_inboxes
    ADD CONSTRAINT crm_chatwoot_inboxes_pkey PRIMARY KEY (id);


--
-- Name: crm_chatwoot_inboxes crm_chatwoot_inboxes_tenant_id_inbox_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_inboxes
    ADD CONSTRAINT crm_chatwoot_inboxes_tenant_id_inbox_id_key UNIQUE (tenant_id, inbox_id);


--
-- Name: crm_chatwoot_jobs crm_chatwoot_jobs_bridge_conversation_id_direction_external_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_jobs
    ADD CONSTRAINT crm_chatwoot_jobs_bridge_conversation_id_direction_external_key UNIQUE (bridge_conversation_id, direction, external_id);


--
-- Name: crm_chatwoot_jobs crm_chatwoot_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_jobs
    ADD CONSTRAINT crm_chatwoot_jobs_pkey PRIMARY KEY (id);


--
-- Name: crm_commissions crm_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_commissions
    ADD CONSTRAINT crm_commissions_pkey PRIMARY KEY (id);


--
-- Name: crm_communication_events crm_communication_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_events
    ADD CONSTRAINT crm_communication_events_pkey PRIMARY KEY (id);


--
-- Name: crm_communication_hub_alerts crm_communication_hub_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_hub_alerts
    ADD CONSTRAINT crm_communication_hub_alerts_pkey PRIMARY KEY (id);


--
-- Name: crm_communication_templates crm_communication_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_templates
    ADD CONSTRAINT crm_communication_templates_pkey PRIMARY KEY (id);


--
-- Name: crm_communication_templates crm_communication_templates_tenant_id_name_channel_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_templates
    ADD CONSTRAINT crm_communication_templates_tenant_id_name_channel_version_key UNIQUE (tenant_id, name, channel, version);


--
-- Name: crm_consent_records crm_consent_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_consent_records
    ADD CONSTRAINT crm_consent_records_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts_v2 crm_contacts_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts_v2
    ADD CONSTRAINT crm_contacts_v2_pkey PRIMARY KEY (id);


--
-- Name: crm_content_assets crm_content_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_content_assets
    ADD CONSTRAINT crm_content_assets_pkey PRIMARY KEY (id);


--
-- Name: crm_content_calendar crm_content_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_content_calendar
    ADD CONSTRAINT crm_content_calendar_pkey PRIMARY KEY (id);


--
-- Name: crm_conversations crm_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversations
    ADD CONSTRAINT crm_conversations_pkey PRIMARY KEY (id);


--
-- Name: crm_corporate_health_plans crm_corporate_health_plans_contract_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_corporate_health_plans
    ADD CONSTRAINT crm_corporate_health_plans_contract_ref_key UNIQUE (contract_ref);


--
-- Name: crm_corporate_health_plans crm_corporate_health_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_corporate_health_plans
    ADD CONSTRAINT crm_corporate_health_plans_pkey PRIMARY KEY (id);


--
-- Name: crm_daily_funnel_mart crm_daily_funnel_mart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_daily_funnel_mart
    ADD CONSTRAINT crm_daily_funnel_mart_pkey PRIMARY KEY (id);


--
-- Name: crm_daily_funnel_mart crm_daily_funnel_mart_tenant_id_metric_date_grain_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_daily_funnel_mart
    ADD CONSTRAINT crm_daily_funnel_mart_tenant_id_metric_date_grain_key_key UNIQUE (tenant_id, metric_date, grain_key);


--
-- Name: crm_data_quality_issues crm_data_quality_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_data_quality_issues
    ADD CONSTRAINT crm_data_quality_issues_pkey PRIMARY KEY (id);


--
-- Name: crm_deals crm_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_pkey PRIMARY KEY (id);


--
-- Name: crm_diagnostic_booking_events crm_diagnostic_booking_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_booking_events
    ADD CONSTRAINT crm_diagnostic_booking_events_pkey PRIMARY KEY (id);


--
-- Name: crm_diagnostic_bookings crm_diagnostic_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_bookings
    ADD CONSTRAINT crm_diagnostic_bookings_pkey PRIMARY KEY (id);


--
-- Name: crm_diagnostic_centres crm_diagnostic_centres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_centres
    ADD CONSTRAINT crm_diagnostic_centres_pkey PRIMARY KEY (id);


--
-- Name: crm_diagnostic_centres crm_diagnostic_centres_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_centres
    ADD CONSTRAINT crm_diagnostic_centres_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: crm_diagnostic_products crm_diagnostic_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_products
    ADD CONSTRAINT crm_diagnostic_products_pkey PRIMARY KEY (id);


--
-- Name: crm_diagnostic_products crm_diagnostic_products_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_products
    ADD CONSTRAINT crm_diagnostic_products_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: crm_doctor_service_line_mart crm_doctor_service_line_mart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_doctor_service_line_mart
    ADD CONSTRAINT crm_doctor_service_line_mart_pkey PRIMARY KEY (id);


--
-- Name: crm_doctor_service_line_mart crm_doctor_service_line_mart_tenant_id_period_start_period__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_doctor_service_line_mart
    ADD CONSTRAINT crm_doctor_service_line_mart_tenant_id_period_start_period__key UNIQUE (tenant_id, period_start, period_end, doctor_id, service_line_id);


--
-- Name: crm_email_inbox crm_email_inbox_crm_user_id_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_inbox
    ADD CONSTRAINT crm_email_inbox_crm_user_id_message_id_key UNIQUE (crm_user_id, message_id);


--
-- Name: crm_email_inbox crm_email_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_inbox
    ADD CONSTRAINT crm_email_inbox_pkey PRIMARY KEY (id);


--
-- Name: crm_email_settings crm_email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_settings
    ADD CONSTRAINT crm_email_settings_pkey PRIMARY KEY (id);


--
-- Name: crm_email_templates crm_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_templates
    ADD CONSTRAINT crm_email_templates_pkey PRIMARY KEY (id);


--
-- Name: crm_employee_performance_mart crm_employee_performance_mart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_performance_mart
    ADD CONSTRAINT crm_employee_performance_mart_pkey PRIMARY KEY (id);


--
-- Name: crm_employee_performance_mart crm_employee_performance_mart_tenant_id_period_start_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_performance_mart
    ADD CONSTRAINT crm_employee_performance_mart_tenant_id_period_start_period_key UNIQUE (tenant_id, period_start, period_end, employee_profile_id);


--
-- Name: crm_employee_profiles crm_employee_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_profiles
    ADD CONSTRAINT crm_employee_profiles_pkey PRIMARY KEY (id);


--
-- Name: crm_employee_profiles crm_employee_profiles_tenant_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_profiles
    ADD CONSTRAINT crm_employee_profiles_tenant_id_user_id_key UNIQUE (tenant_id, user_id);


--
-- Name: crm_employee_targets crm_employee_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_targets
    ADD CONSTRAINT crm_employee_targets_pkey PRIMARY KEY (id);


--
-- Name: crm_employee_targets crm_employee_targets_tenant_id_employee_profile_id_kpi_defi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_targets
    ADD CONSTRAINT crm_employee_targets_tenant_id_employee_profile_id_kpi_defi_key UNIQUE (tenant_id, employee_profile_id, kpi_definition_id, period_start, period_end);


--
-- Name: crm_feedback_responses crm_feedback_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_responses
    ADD CONSTRAINT crm_feedback_responses_pkey PRIMARY KEY (id);


--
-- Name: crm_feedback_surveys crm_feedback_surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_surveys
    ADD CONSTRAINT crm_feedback_surveys_pkey PRIMARY KEY (id);


--
-- Name: crm_feedback_surveys crm_feedback_surveys_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_surveys
    ADD CONSTRAINT crm_feedback_surveys_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_flow_definitions crm_flow_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_definitions
    ADD CONSTRAINT crm_flow_definitions_pkey PRIMARY KEY (id);


--
-- Name: crm_flow_definitions crm_flow_definitions_tenant_uid_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_definitions
    ADD CONSTRAINT crm_flow_definitions_tenant_uid_name_version_key UNIQUE (tenant_uid, name, version);


--
-- Name: crm_flow_edges crm_flow_edges_flow_id_from_node_key_to_node_key_branch_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_edges
    ADD CONSTRAINT crm_flow_edges_flow_id_from_node_key_to_node_key_branch_key_key UNIQUE (flow_id, from_node_key, to_node_key, branch_key);


--
-- Name: crm_flow_edges crm_flow_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_edges
    ADD CONSTRAINT crm_flow_edges_pkey PRIMARY KEY (id);


--
-- Name: crm_flow_nodes crm_flow_nodes_flow_id_node_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_nodes
    ADD CONSTRAINT crm_flow_nodes_flow_id_node_key_key UNIQUE (flow_id, node_key);


--
-- Name: crm_flow_nodes crm_flow_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_nodes
    ADD CONSTRAINT crm_flow_nodes_pkey PRIMARY KEY (id);


--
-- Name: crm_flow_run_events crm_flow_run_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_run_events
    ADD CONSTRAINT crm_flow_run_events_pkey PRIMARY KEY (id);


--
-- Name: crm_flow_runs crm_flow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_runs
    ADD CONSTRAINT crm_flow_runs_pkey PRIMARY KEY (id);


--
-- Name: crm_frequency_counters crm_frequency_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_frequency_counters
    ADD CONSTRAINT crm_frequency_counters_pkey PRIMARY KEY (id);


--
-- Name: crm_frequency_counters crm_frequency_counters_tenant_id_identity_id_channel_purpos_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_frequency_counters
    ADD CONSTRAINT crm_frequency_counters_tenant_id_identity_id_channel_purpos_key UNIQUE (tenant_id, identity_id, channel, purpose, window_start, window_end);


--
-- Name: crm_funnel_events crm_funnel_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_funnel_events
    ADD CONSTRAINT crm_funnel_events_pkey PRIMARY KEY (id);


--
-- Name: crm_growth_daily_metrics crm_growth_daily_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_growth_daily_metrics
    ADD CONSTRAINT crm_growth_daily_metrics_pkey PRIMARY KEY (id);


--
-- Name: crm_growth_daily_metrics crm_growth_daily_metrics_tenant_id_metric_date_dimensions_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_growth_daily_metrics
    ADD CONSTRAINT crm_growth_daily_metrics_tenant_id_metric_date_dimensions_key UNIQUE (tenant_id, metric_date, dimensions);


--
-- Name: crm_growth_recovery_cases crm_growth_recovery_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_growth_recovery_cases
    ADD CONSTRAINT crm_growth_recovery_cases_pkey PRIMARY KEY (id);


--
-- Name: crm_identity_keys crm_identity_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_identity_keys
    ADD CONSTRAINT crm_identity_keys_pkey PRIMARY KEY (id);


--
-- Name: crm_identity_keys crm_identity_keys_tenant_id_key_type_normalized_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_identity_keys
    ADD CONSTRAINT crm_identity_keys_tenant_id_key_type_normalized_value_key UNIQUE (tenant_id, key_type, normalized_value);


--
-- Name: crm_incentive_payouts crm_incentive_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_incentive_payouts
    ADD CONSTRAINT crm_incentive_payouts_pkey PRIMARY KEY (id);


--
-- Name: crm_incentive_rules crm_incentive_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_incentive_rules
    ADD CONSTRAINT crm_incentive_rules_pkey PRIMARY KEY (id);


--
-- Name: crm_incentive_rules crm_incentive_rules_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_incentive_rules
    ADD CONSTRAINT crm_incentive_rules_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_insurance_products crm_insurance_products_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_insurance_products
    ADD CONSTRAINT crm_insurance_products_code_key UNIQUE (code);


--
-- Name: crm_insurance_products crm_insurance_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_insurance_products
    ADD CONSTRAINT crm_insurance_products_pkey PRIMARY KEY (id);


--
-- Name: crm_integration_errors crm_integration_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_integration_errors
    ADD CONSTRAINT crm_integration_errors_pkey PRIMARY KEY (id);


--
-- Name: crm_integration_runs crm_integration_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_integration_runs
    ADD CONSTRAINT crm_integration_runs_pkey PRIMARY KEY (id);


--
-- Name: crm_journey_enrollments crm_journey_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_enrollments
    ADD CONSTRAINT crm_journey_enrollments_pkey PRIMARY KEY (id);


--
-- Name: crm_journey_enrollments crm_journey_enrollments_tenant_id_journey_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_enrollments
    ADD CONSTRAINT crm_journey_enrollments_tenant_id_journey_id_lead_id_key UNIQUE (tenant_id, journey_id, lead_id);


--
-- Name: crm_journey_events crm_journey_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_events
    ADD CONSTRAINT crm_journey_events_pkey PRIMARY KEY (id);


--
-- Name: crm_journey_steps crm_journey_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_steps
    ADD CONSTRAINT crm_journey_steps_pkey PRIMARY KEY (id);


--
-- Name: crm_journey_steps crm_journey_steps_tenant_id_journey_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_steps
    ADD CONSTRAINT crm_journey_steps_tenant_id_journey_id_step_order_key UNIQUE (tenant_id, journey_id, step_order);


--
-- Name: crm_journeys crm_journeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journeys
    ADD CONSTRAINT crm_journeys_pkey PRIMARY KEY (id);


--
-- Name: crm_journeys crm_journeys_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journeys
    ADD CONSTRAINT crm_journeys_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_kpi_actuals crm_kpi_actuals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_actuals
    ADD CONSTRAINT crm_kpi_actuals_pkey PRIMARY KEY (id);


--
-- Name: crm_kpi_actuals crm_kpi_actuals_tenant_id_employee_profile_id_kpi_definitio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_actuals
    ADD CONSTRAINT crm_kpi_actuals_tenant_id_employee_profile_id_kpi_definitio_key UNIQUE (tenant_id, employee_profile_id, kpi_definition_id, period_start, period_end);


--
-- Name: crm_kpi_definitions crm_kpi_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_definitions
    ADD CONSTRAINT crm_kpi_definitions_pkey PRIMARY KEY (id);


--
-- Name: crm_kpi_definitions crm_kpi_definitions_tenant_id_kpi_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_definitions
    ADD CONSTRAINT crm_kpi_definitions_tenant_id_kpi_code_key UNIQUE (tenant_id, kpi_code);


--
-- Name: crm_landing_page_events crm_landing_page_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_landing_page_events
    ADD CONSTRAINT crm_landing_page_events_pkey PRIMARY KEY (id);


--
-- Name: crm_landing_pages crm_landing_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_landing_pages
    ADD CONSTRAINT crm_landing_pages_pkey PRIMARY KEY (id);


--
-- Name: crm_landing_pages crm_landing_pages_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_landing_pages
    ADD CONSTRAINT crm_landing_pages_tenant_id_slug_key UNIQUE (tenant_id, slug);


--
-- Name: crm_lead_assignments crm_lead_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_assignments
    ADD CONSTRAINT crm_lead_assignments_pkey PRIMARY KEY (id);


--
-- Name: crm_lead_merge_audit crm_lead_merge_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_merge_audit
    ADD CONSTRAINT crm_lead_merge_audit_pkey PRIMARY KEY (id);


--
-- Name: crm_lead_score_events crm_lead_score_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_score_events
    ADD CONSTRAINT crm_lead_score_events_pkey PRIMARY KEY (id);


--
-- Name: crm_lead_score_rules crm_lead_score_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_score_rules
    ADD CONSTRAINT crm_lead_score_rules_pkey PRIMARY KEY (id);


--
-- Name: crm_lead_score_rules crm_lead_score_rules_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_score_rules
    ADD CONSTRAINT crm_lead_score_rules_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_lead_sla_instances crm_lead_sla_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_sla_instances
    ADD CONSTRAINT crm_lead_sla_instances_pkey PRIMARY KEY (id);


--
-- Name: crm_lead_sla_instances crm_lead_sla_instances_tenant_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_sla_instances
    ADD CONSTRAINT crm_lead_sla_instances_tenant_id_lead_id_key UNIQUE (tenant_id, lead_id);


--
-- Name: crm_leads crm_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_pkey PRIMARY KEY (id);


--
-- Name: crm_leads_v2 crm_leads_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT crm_leads_v2_pkey PRIMARY KEY (id);


--
-- Name: crm_login_attempts crm_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_login_attempts
    ADD CONSTRAINT crm_login_attempts_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_budgets crm_marketing_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_budgets
    ADD CONSTRAINT crm_marketing_budgets_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_campaign_lists crm_marketing_campaign_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaign_lists
    ADD CONSTRAINT crm_marketing_campaign_lists_pkey PRIMARY KEY (campaign_id, list_id, mode);


--
-- Name: crm_marketing_campaign_recipients crm_marketing_campaign_recipients_campaign_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaign_recipients
    ADD CONSTRAINT crm_marketing_campaign_recipients_campaign_id_email_key UNIQUE (campaign_id, email);


--
-- Name: crm_marketing_campaign_recipients crm_marketing_campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaign_recipients
    ADD CONSTRAINT crm_marketing_campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_campaigns crm_marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaigns
    ADD CONSTRAINT crm_marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_events crm_marketing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_events
    ADD CONSTRAINT crm_marketing_events_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_imports crm_marketing_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_imports
    ADD CONSTRAINT crm_marketing_imports_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_integrations crm_marketing_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_integrations
    ADD CONSTRAINT crm_marketing_integrations_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_integrations crm_marketing_integrations_tenant_id_provider_integration_t_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_integrations
    ADD CONSTRAINT crm_marketing_integrations_tenant_id_provider_integration_t_key UNIQUE (tenant_id, provider, integration_type);


--
-- Name: crm_marketing_list_members crm_marketing_list_members_list_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_list_members
    ADD CONSTRAINT crm_marketing_list_members_list_id_email_key UNIQUE (list_id, email);


--
-- Name: crm_marketing_list_members crm_marketing_list_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_list_members
    ADD CONSTRAINT crm_marketing_list_members_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_lists crm_marketing_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_lists
    ADD CONSTRAINT crm_marketing_lists_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_senders crm_marketing_senders_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_senders
    ADD CONSTRAINT crm_marketing_senders_email_key UNIQUE (email);


--
-- Name: crm_marketing_senders crm_marketing_senders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_senders
    ADD CONSTRAINT crm_marketing_senders_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_suppressions crm_marketing_suppressions_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_suppressions
    ADD CONSTRAINT crm_marketing_suppressions_email_key UNIQUE (email);


--
-- Name: crm_marketing_suppressions crm_marketing_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_suppressions
    ADD CONSTRAINT crm_marketing_suppressions_pkey PRIMARY KEY (id);


--
-- Name: crm_marketing_templates crm_marketing_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_templates
    ADD CONSTRAINT crm_marketing_templates_pkey PRIMARY KEY (id);


--
-- Name: crm_offline_campaigns crm_offline_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_offline_campaigns
    ADD CONSTRAINT crm_offline_campaigns_pkey PRIMARY KEY (id);


--
-- Name: crm_org_units crm_org_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_org_units
    ADD CONSTRAINT crm_org_units_pkey PRIMARY KEY (id);


--
-- Name: crm_org_units crm_org_units_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_org_units
    ADD CONSTRAINT crm_org_units_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: crm_person_identities crm_person_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_person_identities
    ADD CONSTRAINT crm_person_identities_pkey PRIMARY KEY (id);


--
-- Name: crm_product_coverage_matrix crm_product_coverage_matrix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_product_coverage_matrix
    ADD CONSTRAINT crm_product_coverage_matrix_pkey PRIMARY KEY (id);


--
-- Name: crm_product_tc_master crm_product_tc_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_product_tc_master
    ADD CONSTRAINT crm_product_tc_master_pkey PRIMARY KEY (id);


--
-- Name: crm_provider_referrals crm_provider_referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_provider_referrals
    ADD CONSTRAINT crm_provider_referrals_pkey PRIMARY KEY (id);


--
-- Name: crm_quotes crm_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_quotes
    ADD CONSTRAINT crm_quotes_pkey PRIMARY KEY (id);


--
-- Name: crm_quotes crm_quotes_quote_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_quotes
    ADD CONSTRAINT crm_quotes_quote_number_key UNIQUE (quote_number);


--
-- Name: crm_refresh_tokens crm_refresh_tokens_jti_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_refresh_tokens
    ADD CONSTRAINT crm_refresh_tokens_jti_key UNIQUE (jti);


--
-- Name: crm_refresh_tokens crm_refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_refresh_tokens
    ADD CONSTRAINT crm_refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: crm_reputation_mart crm_reputation_mart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reputation_mart
    ADD CONSTRAINT crm_reputation_mart_pkey PRIMARY KEY (id);


--
-- Name: crm_reputation_mart crm_reputation_mart_tenant_id_period_start_period_end_grain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reputation_mart
    ADD CONSTRAINT crm_reputation_mart_tenant_id_period_start_period_end_grain_key UNIQUE (tenant_id, period_start, period_end, grain_key);


--
-- Name: crm_reputation_tasks crm_reputation_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reputation_tasks
    ADD CONSTRAINT crm_reputation_tasks_pkey PRIMARY KEY (id);


--
-- Name: crm_revenue_events crm_revenue_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_revenue_events
    ADD CONSTRAINT crm_revenue_events_pkey PRIMARY KEY (id);


--
-- Name: crm_reviews crm_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reviews
    ADD CONSTRAINT crm_reviews_pkey PRIMARY KEY (id);


--
-- Name: crm_rfq_analysis_cache crm_rfq_analysis_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_analysis_cache
    ADD CONSTRAINT crm_rfq_analysis_cache_pkey PRIMARY KEY (id);


--
-- Name: crm_rfq_audit_log crm_rfq_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_audit_log
    ADD CONSTRAINT crm_rfq_audit_log_pkey PRIMARY KEY (id);


--
-- Name: crm_rfq_claims crm_rfq_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_claims
    ADD CONSTRAINT crm_rfq_claims_pkey PRIMARY KEY (id);


--
-- Name: crm_rfq_files crm_rfq_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_files
    ADD CONSTRAINT crm_rfq_files_pkey PRIMARY KEY (id);


--
-- Name: crm_rfq_members crm_rfq_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_members
    ADD CONSTRAINT crm_rfq_members_pkey PRIMARY KEY (id);


--
-- Name: crm_rfq_policy_history crm_rfq_policy_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_policy_history
    ADD CONSTRAINT crm_rfq_policy_history_pkey PRIMARY KEY (id);


--
-- Name: crm_rfq_policy_history crm_rfq_policy_history_rfq_id_year_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_policy_history
    ADD CONSTRAINT crm_rfq_policy_history_rfq_id_year_label_key UNIQUE (rfq_id, year_label);


--
-- Name: crm_rfq_underwriting crm_rfq_underwriting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_underwriting
    ADD CONSTRAINT crm_rfq_underwriting_pkey PRIMARY KEY (id);


--
-- Name: crm_rfqs crm_rfqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfqs
    ADD CONSTRAINT crm_rfqs_pkey PRIMARY KEY (id);


--
-- Name: crm_rfqs crm_rfqs_rfq_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfqs
    ADD CONSTRAINT crm_rfqs_rfq_number_key UNIQUE (rfq_number);


--
-- Name: crm_segment_members crm_segment_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segment_members
    ADD CONSTRAINT crm_segment_members_pkey PRIMARY KEY (id);


--
-- Name: crm_segment_members crm_segment_members_segment_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segment_members
    ADD CONSTRAINT crm_segment_members_segment_id_lead_id_key UNIQUE (segment_id, lead_id);


--
-- Name: crm_segments crm_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segments
    ADD CONSTRAINT crm_segments_pkey PRIMARY KEY (id);


--
-- Name: crm_segments crm_segments_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segments
    ADD CONSTRAINT crm_segments_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_service_line_targets crm_service_line_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_service_line_targets
    ADD CONSTRAINT crm_service_line_targets_pkey PRIMARY KEY (id);


--
-- Name: crm_service_line_targets crm_service_line_targets_tenant_id_service_line_id_period_s_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_service_line_targets
    ADD CONSTRAINT crm_service_line_targets_tenant_id_service_line_id_period_s_key UNIQUE (tenant_id, service_line_id, period_start, period_end);


--
-- Name: crm_sla_events crm_sla_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_events
    ADD CONSTRAINT crm_sla_events_pkey PRIMARY KEY (id);


--
-- Name: crm_sla_policies crm_sla_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_policies
    ADD CONSTRAINT crm_sla_policies_pkey PRIMARY KEY (id);


--
-- Name: crm_sla_policies crm_sla_policies_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_policies
    ADD CONSTRAINT crm_sla_policies_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_sla_rules crm_sla_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_rules
    ADD CONSTRAINT crm_sla_rules_pkey PRIMARY KEY (id);


--
-- Name: crm_sla_rules crm_sla_rules_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_rules
    ADD CONSTRAINT crm_sla_rules_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: crm_social_automation_pauses crm_social_automation_pauses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_automation_pauses
    ADD CONSTRAINT crm_social_automation_pauses_pkey PRIMARY KEY (id);


--
-- Name: crm_social_automation_pauses crm_social_automation_pauses_tenant_uid_conversation_id_res_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_automation_pauses
    ADD CONSTRAINT crm_social_automation_pauses_tenant_uid_conversation_id_res_key UNIQUE (tenant_uid, conversation_id, resumed_at);


--
-- Name: crm_social_erasure_requests crm_social_erasure_requests_entity_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_erasure_requests
    ADD CONSTRAINT crm_social_erasure_requests_entity_uid_key UNIQUE (entity_uid);


--
-- Name: crm_social_erasure_requests crm_social_erasure_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_erasure_requests
    ADD CONSTRAINT crm_social_erasure_requests_pkey PRIMARY KEY (id);


--
-- Name: crm_social_identities crm_social_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_identities
    ADD CONSTRAINT crm_social_identities_pkey PRIMARY KEY (id);


--
-- Name: crm_social_identities crm_social_identities_tenant_uid_channel_external_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_identities
    ADD CONSTRAINT crm_social_identities_tenant_uid_channel_external_user_id_key UNIQUE (tenant_uid, channel, external_user_id);


--
-- Name: crm_social_inbox_reminders crm_social_inbox_reminders_entity_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_inbox_reminders
    ADD CONSTRAINT crm_social_inbox_reminders_entity_uid_key UNIQUE (entity_uid);


--
-- Name: crm_social_inbox_reminders crm_social_inbox_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_inbox_reminders
    ADD CONSTRAINT crm_social_inbox_reminders_pkey PRIMARY KEY (id);


--
-- Name: crm_social_inbox_rules crm_social_inbox_rules_entity_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_inbox_rules
    ADD CONSTRAINT crm_social_inbox_rules_entity_uid_key UNIQUE (entity_uid);


--
-- Name: crm_social_inbox_rules crm_social_inbox_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_inbox_rules
    ADD CONSTRAINT crm_social_inbox_rules_pkey PRIMARY KEY (id);


--
-- Name: crm_social_inbox_rules crm_social_inbox_rules_tenant_uid_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_inbox_rules
    ADD CONSTRAINT crm_social_inbox_rules_tenant_uid_name_key UNIQUE (tenant_uid, name);


--
-- Name: crm_social_post_comments crm_social_post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_post_comments
    ADD CONSTRAINT crm_social_post_comments_pkey PRIMARY KEY (id);


--
-- Name: crm_social_post_events crm_social_post_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_post_events
    ADD CONSTRAINT crm_social_post_events_pkey PRIMARY KEY (id);


--
-- Name: crm_social_posts crm_social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_posts
    ADD CONSTRAINT crm_social_posts_pkey PRIMARY KEY (id);


--
-- Name: crm_social_posts crm_social_posts_tenant_uid_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_posts
    ADD CONSTRAINT crm_social_posts_tenant_uid_id_key UNIQUE (tenant_uid, id);


--
-- Name: crm_social_scheduled_replies crm_social_scheduled_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_scheduled_replies
    ADD CONSTRAINT crm_social_scheduled_replies_pkey PRIMARY KEY (id);


--
-- Name: crm_social_triggers crm_social_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_triggers
    ADD CONSTRAINT crm_social_triggers_pkey PRIMARY KEY (id);


--
-- Name: crm_social_triggers crm_social_triggers_tenant_uid_trigger_type_channel_trigger_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_triggers
    ADD CONSTRAINT crm_social_triggers_tenant_uid_trigger_type_channel_trigger_key UNIQUE (tenant_uid, trigger_type, channel, trigger_key);


--
-- Name: crm_source_taxonomy crm_source_taxonomy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_source_taxonomy
    ADD CONSTRAINT crm_source_taxonomy_pkey PRIMARY KEY (id);


--
-- Name: crm_specialty_profiles crm_specialty_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_specialty_profiles
    ADD CONSTRAINT crm_specialty_profiles_pkey PRIMARY KEY (id);


--
-- Name: crm_specialty_profiles crm_specialty_profiles_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_specialty_profiles
    ADD CONSTRAINT crm_specialty_profiles_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: crm_tasks crm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);


--
-- Name: crm_touchpoints crm_touchpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_touchpoints
    ADD CONSTRAINT crm_touchpoints_pkey PRIMARY KEY (id);


--
-- Name: crm_vendors crm_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_vendors
    ADD CONSTRAINT crm_vendors_pkey PRIMARY KEY (id);


--
-- Name: crm_vendors crm_vendors_tenant_id_vendor_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_vendors
    ADD CONSTRAINT crm_vendors_tenant_id_vendor_name_key UNIQUE (tenant_id, vendor_name);


--
-- Name: crm_visit_events crm_visit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_visit_events
    ADD CONSTRAINT crm_visit_events_pkey PRIMARY KEY (id);


--
-- Name: crm_whatsapp_templates crm_whatsapp_templates_entity_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_whatsapp_templates
    ADD CONSTRAINT crm_whatsapp_templates_entity_uid_key UNIQUE (entity_uid);


--
-- Name: crm_whatsapp_templates crm_whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_whatsapp_templates
    ADD CONSTRAINT crm_whatsapp_templates_pkey PRIMARY KEY (id);


--
-- Name: crm_whatsapp_templates crm_whatsapp_templates_tenant_uid_name_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_whatsapp_templates
    ADD CONSTRAINT crm_whatsapp_templates_tenant_uid_name_language_key UNIQUE (tenant_uid, name, language);


--
-- Name: doctors doctors_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_email_key UNIQUE (email);


--
-- Name: doctors doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);


--
-- Name: doctors doctors_registrationNumber_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT "doctors_registrationNumber_key" UNIQUE ("registrationNumber");


--
-- Name: doctors doctors_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_uid_key UNIQUE (uid);


--
-- Name: doctors doctors_uniqueId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT "doctors_uniqueId_key" UNIQUE ("uniqueId");


--
-- Name: doctors doctors_unique_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_unique_id_key UNIQUE (unique_id);


--
-- Name: doctors doctors_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT "doctors_userId_key" UNIQUE ("userId");


--
-- Name: email_settings email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_pkey PRIMARY KEY (id);


--
-- Name: entity_kinds entity_kinds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_kinds
    ADD CONSTRAINT entity_kinds_pkey PRIMARY KEY (kind);


--
-- Name: entity_registry entity_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_registry
    ADD CONSTRAINT entity_registry_pkey PRIMARY KEY (uid);


--
-- Name: entity_uid_aliases entity_uid_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_uid_aliases
    ADD CONSTRAINT entity_uid_aliases_pkey PRIMARY KEY (old_uid);


--
-- Name: entity_uid_rules entity_uid_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_uid_rules
    ADD CONSTRAINT entity_uid_rules_pkey PRIMARY KEY (table_name);


--
-- Name: insurance_brokers insurance_brokers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_brokers
    ADD CONSTRAINT insurance_brokers_email_key UNIQUE (email);


--
-- Name: insurance_brokers insurance_brokers_irdai_license_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_brokers
    ADD CONSTRAINT insurance_brokers_irdai_license_number_key UNIQUE (irdai_license_number);


--
-- Name: insurance_brokers insurance_brokers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_brokers
    ADD CONSTRAINT insurance_brokers_pkey PRIMARY KEY (id);


--
-- Name: insurance_brokers insurance_brokers_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_brokers
    ADD CONSTRAINT insurance_brokers_uid_key UNIQUE (uid);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: portal_refresh_tokens portal_refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_refresh_tokens
    ADD CONSTRAINT portal_refresh_tokens_pkey PRIMARY KEY (jti);


--
-- Name: social_inbox_conversations social_inbox_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_inbox_conversations
    ADD CONSTRAINT social_inbox_conversations_pkey PRIMARY KEY (id);


--
-- Name: social_inbox_messages social_inbox_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_inbox_messages
    ADD CONSTRAINT social_inbox_messages_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_email_key UNIQUE (email);


--
-- Name: team_members team_members_employeeId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT "team_members_employeeId_key" UNIQUE ("employeeId");


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_unique_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_unique_id_key UNIQUE (unique_id);


--
-- Name: team_members team_members_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT "team_members_userId_key" UNIQUE ("userId");


--
-- Name: tenants tenants_aggregator_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_aggregator_uid_key UNIQUE (aggregator_uid);


--
-- Name: tenants tenants_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_custom_domain_key UNIQUE (custom_domain);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: tenants tenants_subdomain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_subdomain_key UNIQUE (subdomain);


--
-- Name: tenants tenants_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_uid_key UNIQUE (uid);


--
-- Name: user_associations user_associations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_associations
    ADD CONSTRAINT user_associations_pkey PRIMARY KEY (id);


--
-- Name: users users_abhaHealthId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_abhaHealthId_key" UNIQUE ("abhaHealthId");


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_unique_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_unique_id_key UNIQUE (unique_id);


--
-- Name: uuid_id_map uuid_id_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uuid_id_map
    ADD CONSTRAINT uuid_id_map_pkey PRIMARY KEY (entity_type, integer_id);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_resource_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_resource_type_idx ON public.audit_logs USING btree (resource_type);


--
-- Name: audit_logs_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_timestamp_idx ON public.audit_logs USING btree ("timestamp" DESC);


--
-- Name: audit_logs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);


--
-- Name: corporates_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX corporates_assigned_to ON public.corporates USING btree ("assignedTo");


--
-- Name: corporates_company_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX corporates_company_name ON public.corporates USING btree ("companyName");


--
-- Name: corporates_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX corporates_email ON public.corporates USING btree (email);


--
-- Name: corporates_package_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX corporates_package_type ON public.corporates USING btree ("packageType");


--
-- Name: corporates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX corporates_status ON public.corporates USING btree (status);


--
-- Name: doctors_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX doctors_email ON public.doctors USING btree (email);


--
-- Name: doctors_is_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doctors_is_verified ON public.doctors USING btree ("isVerified");


--
-- Name: doctors_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doctors_organization_id ON public.doctors USING btree (organization_id);


--
-- Name: doctors_organization_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doctors_organization_type ON public.doctors USING btree (organization_type);


--
-- Name: doctors_registration_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX doctors_registration_number ON public.doctors USING btree ("registrationNumber");


--
-- Name: doctors_specialization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doctors_specialization ON public.doctors USING btree (specialization);


--
-- Name: doctors_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doctors_status ON public.doctors USING btree (status);


--
-- Name: doctors_uuid_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX doctors_uuid_id_idx ON public.doctors USING btree (uuid_id);


--
-- Name: idx_activities_deal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_deal ON public.crm_activities USING btree (deal_id);


--
-- Name: idx_activities_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_lead ON public.crm_activities USING btree (lead_id);


--
-- Name: idx_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_type ON public.crm_activities USING btree (type);


--
-- Name: idx_ai_email_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_email_created ON public.crm_ai_email_communications USING btree (created_at DESC);


--
-- Name: idx_ai_email_deal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_email_deal ON public.crm_ai_email_communications USING btree (deal_id);


--
-- Name: idx_ai_email_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_email_entity ON public.crm_ai_email_communications USING btree (entity_type, entity_id);


--
-- Name: idx_ai_email_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_email_lead ON public.crm_ai_email_communications USING btree (lead_id);


--
-- Name: idx_ai_email_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_email_status ON public.crm_ai_email_communications USING btree (status);


--
-- Name: idx_ai_email_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_email_team ON public.crm_ai_email_communications USING btree (created_by, entity_type, created_at DESC);


--
-- Name: idx_ai_email_team_entity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_email_team_entity_created ON public.crm_ai_email_communications USING btree (created_by, entity_type, entity_id, created_at DESC);


--
-- Name: idx_ai_email_team_score_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_email_team_score_created ON public.crm_ai_email_communications USING btree (created_by, entity_type, engagement_score DESC, created_at DESC);


--
-- Name: idx_analysis_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analysis_rfq ON public.crm_rfq_analysis_cache USING btree (rfq_id);


--
-- Name: idx_api_v2_refresh_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_v2_refresh_tokens_expires_at ON public.api_v2_refresh_tokens USING btree (expires_at);


--
-- Name: idx_api_v2_refresh_tokens_revoked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_v2_refresh_tokens_revoked ON public.api_v2_refresh_tokens USING btree (revoked);


--
-- Name: idx_api_v2_refresh_tokens_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_v2_refresh_tokens_tenant ON public.api_v2_refresh_tokens USING btree (tenant_id);


--
-- Name: idx_api_v2_refresh_tokens_tenant_uid_8e87a58; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_v2_refresh_tokens_tenant_uid_8e87a58 ON public.api_v2_refresh_tokens USING btree (tenant_uid);


--
-- Name: idx_api_v2_refresh_tokens_user_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_v2_refresh_tokens_user_role ON public.api_v2_refresh_tokens USING btree (user_id, role);


--
-- Name: idx_chatwoot_jobs_conversation_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatwoot_jobs_conversation_active ON public.crm_chatwoot_jobs USING btree (bridge_conversation_id, id) WHERE ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('uncertain'::character varying)::text]));


--
-- Name: idx_chatwoot_jobs_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatwoot_jobs_pending ON public.crm_chatwoot_jobs USING btree (available_at, id) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_cla_email_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cla_email_ts ON public.crm_login_attempts USING btree (email, created_at);


--
-- Name: idx_contacts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_company ON public.crm_contacts USING btree (company);


--
-- Name: idx_contacts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_email ON public.crm_contacts USING btree (email);


--
-- Name: idx_corp_plans_corporate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corp_plans_corporate ON public.crm_corporate_health_plans USING btree (corporate_id);


--
-- Name: idx_corp_plans_renewal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corp_plans_renewal ON public.crm_corporate_health_plans USING btree (renewal_of_id);


--
-- Name: idx_corp_plans_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corp_plans_rfq ON public.crm_corporate_health_plans USING btree (rfq_id);


--
-- Name: idx_corp_plans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corp_plans_status ON public.crm_corporate_health_plans USING btree (status);


--
-- Name: idx_corp_plans_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corp_plans_year ON public.crm_corporate_health_plans USING btree (plan_year);


--
-- Name: idx_corporates_address_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_address_gin ON public.corporates USING gin (address);


--
-- Name: idx_corporates_aggregator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_aggregator ON public.corporates USING btree (aggregator_id, aggregator_type);


--
-- Name: idx_corporates_aggregator_uid_6433f6a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_aggregator_uid_6433f6a ON public.corporates USING btree (aggregator_uid);


--
-- Name: idx_corporates_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_email ON public.corporates USING btree (email);


--
-- Name: idx_corporates_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_metadata_gin ON public.corporates USING gin (metadata);


--
-- Name: idx_corporates_onboarded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_onboarded_by ON public.corporates USING btree (onboarded_by, onboarded_by_id);


--
-- Name: idx_corporates_owned_by_tenant_uid_853d9cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_owned_by_tenant_uid_853d9cb ON public.corporates USING btree (owned_by_tenant_uid);


--
-- Name: idx_corporates_services_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_services_gin ON public.corporates USING gin (services);


--
-- Name: idx_corporates_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_tenant_id ON public.corporates USING btree (tenant_id);


--
-- Name: idx_corporates_tenant_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_tenant_uid ON public.corporates USING btree (tenant_uid);


--
-- Name: idx_corporates_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_uid ON public.corporates USING btree (uid);


--
-- Name: idx_corporates_unique_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporates_unique_id ON public.corporates USING btree (unique_id);


--
-- Name: idx_coverage_matrix_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coverage_matrix_product ON public.crm_product_coverage_matrix USING btree (product_id);


--
-- Name: idx_coverage_matrix_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coverage_matrix_status ON public.crm_product_coverage_matrix USING btree (status);


--
-- Name: idx_crm_activities_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_contact ON public.crm_activities USING btree (tenant_uid, contact_id);


--
-- Name: idx_crm_activities_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_corporate_uid ON public.crm_activities USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_activities_tenant_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_activities_tenant_uid ON public.crm_activities USING btree (tenant_uid);


--
-- Name: idx_crm_agencies_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agencies_city ON public.crm_agencies USING btree (city);


--
-- Name: idx_crm_agencies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agencies_status ON public.crm_agencies USING btree (status);


--
-- Name: idx_crm_agent_memories_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agent_memories_actor ON public.crm_agent_memories USING btree (tenant_uid, actor_user_id, updated_at DESC);


--
-- Name: idx_crm_agent_memories_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agent_memories_corporate_uid ON public.crm_agent_memories USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_agent_memories_scope_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_agent_memories_scope_key ON public.crm_agent_memories USING btree (tenant_uid, COALESCE(corporate_uid, ''::text), actor_user_id, category, memory_key);


--
-- Name: idx_crm_agent_proposals_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agent_proposals_corporate_uid ON public.crm_agent_proposals USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_agent_proposals_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agent_proposals_pending ON public.crm_agent_proposals USING btree (tenant_uid, actor_user_id, status, expires_at);


--
-- Name: idx_crm_agents_agency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agents_agency ON public.crm_agents USING btree (agency_id);


--
-- Name: idx_crm_agents_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agents_channel ON public.crm_agents USING btree (channel_type);


--
-- Name: idx_crm_agents_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agents_city ON public.crm_agents USING btree (city);


--
-- Name: idx_crm_agents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_agents_status ON public.crm_agents USING btree (status);


--
-- Name: idx_crm_ai_growth_recommendations_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_ai_growth_recommendations_queue ON public.crm_ai_growth_recommendations USING btree (tenant_id, status, created_at DESC);


--
-- Name: idx_crm_appointment_link_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_appointment_link_lead ON public.crm_appointment_links USING btree (tenant_id, lead_id);


--
-- Name: idx_crm_appointment_link_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_appointment_link_source ON public.crm_appointment_links USING btree (tenant_id, source_system, source_ref) WHERE (source_ref IS NOT NULL);


--
-- Name: idx_crm_appointment_link_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_appointment_link_status ON public.crm_appointment_links USING btree (tenant_id, appointment_status, scheduled_at);


--
-- Name: idx_crm_approval_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_approval_queue ON public.crm_approval_workflows USING btree (tenant_id, status, entity_type, created_at DESC);


--
-- Name: idx_crm_attribution_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_attribution_campaign ON public.crm_attribution_results USING btree (tenant_id, campaign_id, model);


--
-- Name: idx_crm_attribution_revenue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_attribution_revenue ON public.crm_attribution_results USING btree (tenant_id, revenue_event_id);


--
-- Name: idx_crm_attribution_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_attribution_source ON public.crm_attribution_results USING btree (tenant_id, source_id, model);


--
-- Name: idx_crm_audit_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_audit_actor ON public.crm_audit_log USING btree (tenant_id, actor_user_id, created_at DESC);


--
-- Name: idx_crm_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_audit_entity ON public.crm_audit_log USING btree (tenant_id, entity_type, entity_id, created_at DESC);


--
-- Name: idx_crm_audit_log_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_audit_log_corporate_uid ON public.crm_audit_log USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_audit_log_tenant_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_audit_log_tenant_uid ON public.crm_audit_log USING btree (tenant_uid, created_at DESC);


--
-- Name: idx_crm_audit_log_tenant_uid_05298e9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_audit_log_tenant_uid_05298e9 ON public.crm_audit_log USING btree (tenant_uid);


--
-- Name: idx_crm_automation_exec_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_automation_exec_due ON public.crm_automation_executions USING btree (status, scheduled_at);


--
-- Name: idx_crm_campaign_cost_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_campaign_cost_date ON public.crm_campaign_costs USING btree (tenant_id, cost_date, campaign_id);


--
-- Name: idx_crm_campaign_cost_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_campaign_cost_external ON public.crm_campaign_costs USING btree (tenant_id, external_spend_id) WHERE (external_spend_id IS NOT NULL);


--
-- Name: idx_crm_campaigns_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_campaigns_code ON public.crm_campaigns_unified USING btree (tenant_id, campaign_code) WHERE (campaign_code IS NOT NULL);


--
-- Name: idx_crm_campaigns_unified_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_campaigns_unified_tenant_status ON public.crm_campaigns_unified USING btree (tenant_id, lifecycle_status, starts_at DESC);


--
-- Name: idx_crm_channel_metrics_rollup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_channel_metrics_rollup ON public.crm_channel_metrics USING btree (tenant_id, provider, metric_date DESC);


--
-- Name: idx_crm_commissions_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_commissions_agent ON public.crm_commissions USING btree (agent_id);


--
-- Name: idx_crm_commissions_eligible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_commissions_eligible ON public.crm_commissions USING btree (eligible_date);


--
-- Name: idx_crm_commissions_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_commissions_plan ON public.crm_commissions USING btree (plan_code);


--
-- Name: idx_crm_commissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_commissions_status ON public.crm_commissions USING btree (status);


--
-- Name: idx_crm_communication_events_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_communication_events_corporate_uid ON public.crm_communication_events USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_communication_events_tenant_uid_0d07a7f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_communication_events_tenant_uid_0d07a7f ON public.crm_communication_events USING btree (tenant_uid);


--
-- Name: idx_crm_communication_hub_alerts_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_communication_hub_alerts_queue ON public.crm_communication_hub_alerts USING btree (tenant_id, status, severity, last_seen_at DESC);


--
-- Name: idx_crm_communication_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_communication_identity ON public.crm_communication_events USING btree (tenant_id, identity_id, created_at DESC);


--
-- Name: idx_crm_communication_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_communication_lead ON public.crm_communication_events USING btree (tenant_id, lead_id, created_at DESC);


--
-- Name: idx_crm_communication_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_communication_provider ON public.crm_communication_events USING btree (tenant_id, provider, provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: idx_crm_communication_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_communication_queue ON public.crm_communication_events USING btree (tenant_id, channel, status, created_at DESC);


--
-- Name: idx_crm_communication_templates_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_communication_templates_queue ON public.crm_communication_templates USING btree (tenant_id, channel, status, updated_at DESC);


--
-- Name: idx_crm_consent_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_consent_channel ON public.crm_consent_records USING btree (tenant_id, channel, status);


--
-- Name: idx_crm_consent_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_consent_current ON public.crm_consent_records USING btree (tenant_id, identity_id, channel, purpose) WHERE (withdrawn_at IS NULL);


--
-- Name: idx_crm_contacts_tenant_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_tenant_uid ON public.crm_contacts USING btree (tenant_uid);


--
-- Name: idx_crm_contacts_v2_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_v2_corporate_uid ON public.crm_contacts_v2 USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_contacts_v2_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_v2_email ON public.crm_contacts_v2 USING btree (tenant_id, lower((email)::text));


--
-- Name: idx_crm_contacts_v2_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_v2_phone ON public.crm_contacts_v2 USING btree (tenant_id, phone_e164);


--
-- Name: idx_crm_contacts_v2_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_v2_tags ON public.crm_contacts_v2 USING gin (tags);


--
-- Name: idx_crm_contacts_v2_tenant_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_v2_tenant_name ON public.crm_contacts_v2 USING btree (tenant_id, lower((name)::text));


--
-- Name: idx_crm_contacts_v2_tenant_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_v2_tenant_person ON public.crm_contacts_v2 USING btree (tenant_id, person_id);


--
-- Name: idx_crm_contacts_v2_tenant_uid_bd5f089; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_v2_tenant_uid_bd5f089 ON public.crm_contacts_v2 USING btree (tenant_uid);


--
-- Name: idx_crm_content_calendar_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_content_calendar_queue ON public.crm_content_calendar USING btree (tenant_id, workflow_status, scheduled_at);


--
-- Name: idx_crm_conversations_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_conversations_corporate_uid ON public.crm_conversations USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_conversations_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_conversations_external ON public.crm_conversations USING btree (tenant_id, channel, external_thread_id) WHERE (external_thread_id IS NOT NULL);


--
-- Name: idx_crm_conversations_id_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_conversations_id_tenant ON public.crm_conversations USING btree (id, tenant_id);


--
-- Name: idx_crm_conversations_tenant_uid_0e5b6fc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_conversations_tenant_uid_0e5b6fc ON public.crm_conversations USING btree (tenant_uid);


--
-- Name: idx_crm_data_quality_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_data_quality_queue ON public.crm_data_quality_issues USING btree (tenant_id, status, severity, detected_at DESC);


--
-- Name: idx_crm_deals_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_contact ON public.crm_deals USING btree (tenant_uid, contact_id);


--
-- Name: idx_crm_deals_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_corporate_uid ON public.crm_deals USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_deals_tenant_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_deals_tenant_uid ON public.crm_deals USING btree (tenant_uid);


--
-- Name: idx_crm_diagnostic_booking_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_diagnostic_booking_events ON public.crm_diagnostic_booking_events USING btree (tenant_id, booking_id, event_at DESC);


--
-- Name: idx_crm_diagnostic_bookings_dimensions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_diagnostic_bookings_dimensions ON public.crm_diagnostic_bookings USING btree (tenant_id, centre_id, product_id, campaign_id);


--
-- Name: idx_crm_diagnostic_bookings_funnel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_diagnostic_bookings_funnel ON public.crm_diagnostic_bookings USING btree (tenant_id, booking_status, collection_mode, scheduled_at);


--
-- Name: idx_crm_diagnostic_bookings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_diagnostic_bookings_source ON public.crm_diagnostic_bookings USING btree (tenant_id, source_system, source_ref) WHERE (source_ref IS NOT NULL);


--
-- Name: idx_crm_diagnostic_centres_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_diagnostic_centres_location ON public.crm_diagnostic_centres USING btree (tenant_id, city, region, status);


--
-- Name: idx_crm_diagnostic_products_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_diagnostic_products_type ON public.crm_diagnostic_products USING btree (tenant_id, product_type, category, status);


--
-- Name: idx_crm_email_inbox_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_email_inbox_folder ON public.crm_email_inbox USING btree (crm_user_id, folder);


--
-- Name: idx_crm_email_inbox_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_email_inbox_user ON public.crm_email_inbox USING btree (crm_user_id, received_at DESC);


--
-- Name: idx_crm_email_settings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_email_settings_user ON public.crm_email_settings USING btree (crm_user_id);


--
-- Name: idx_crm_email_templates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_email_templates_user ON public.crm_email_templates USING btree (crm_user_id);


--
-- Name: idx_crm_feedback_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_feedback_score ON public.crm_feedback_responses USING btree (tenant_id, score, service_line_id);


--
-- Name: idx_crm_feedback_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_feedback_time ON public.crm_feedback_responses USING btree (tenant_id, received_at DESC);


--
-- Name: idx_crm_flow_definitions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_flow_definitions_tenant ON public.crm_flow_definitions USING btree (tenant_uid, status, updated_at DESC);


--
-- Name: idx_crm_flow_edges_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_flow_edges_flow ON public.crm_flow_edges USING btree (flow_id, from_node_key);


--
-- Name: idx_crm_flow_run_events_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_flow_run_events_run ON public.crm_flow_run_events USING btree (run_id, created_at);


--
-- Name: idx_crm_flow_runs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_flow_runs_tenant ON public.crm_flow_runs USING btree (tenant_uid, status, next_run_at);


--
-- Name: idx_crm_funnel_events_dimensions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_funnel_events_dimensions ON public.crm_funnel_events USING btree (tenant_id, hospital_id, branch_id, service_line_id, event_at DESC);


--
-- Name: idx_crm_funnel_events_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_funnel_events_idempotency ON public.crm_funnel_events USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_crm_funnel_events_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_funnel_events_identity ON public.crm_funnel_events USING btree (tenant_id, identity_id, event_at DESC);


--
-- Name: idx_crm_funnel_events_lead_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_funnel_events_lead_time ON public.crm_funnel_events USING btree (tenant_id, lead_id, occurred_at DESC);


--
-- Name: idx_crm_funnel_events_stage_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_funnel_events_stage_time ON public.crm_funnel_events USING btree (tenant_id, event_type, occurred_at DESC);


--
-- Name: idx_crm_growth_recovery_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_growth_recovery_open ON public.crm_growth_recovery_cases USING btree (tenant_id, lead_id, case_type) WHERE ((status)::text = ANY (ARRAY[('open'::character varying)::text, ('in_progress'::character varying)::text]));


--
-- Name: idx_crm_growth_recovery_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_growth_recovery_queue ON public.crm_growth_recovery_cases USING btree (tenant_id, status, priority, due_at);


--
-- Name: idx_crm_identity_keys_active_value; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_identity_keys_active_value ON public.crm_identity_keys USING btree (tenant_id, key_type, normalized_value) WHERE (normalized_value IS NOT NULL);


--
-- Name: idx_crm_identity_keys_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_identity_keys_identity ON public.crm_identity_keys USING btree (tenant_id, identity_id);


--
-- Name: idx_crm_identity_keys_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_identity_keys_person ON public.crm_identity_keys USING btree (tenant_id, person_id);


--
-- Name: idx_crm_identity_keys_tenant_uid_9336245; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_identity_keys_tenant_uid_9336245 ON public.crm_identity_keys USING btree (tenant_uid);


--
-- Name: idx_crm_integration_errors_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_integration_errors_queue ON public.crm_integration_errors USING btree (tenant_id, status, next_retry_at);


--
-- Name: idx_crm_integration_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_integration_runs_status ON public.crm_integration_runs USING btree (tenant_id, integration_name, status, started_at DESC);


--
-- Name: idx_crm_journey_enrollments_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_journey_enrollments_queue ON public.crm_journey_enrollments USING btree (tenant_id, status, next_run_at);


--
-- Name: idx_crm_journey_events_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_journey_events_queue ON public.crm_journey_events USING btree (tenant_id, status, scheduled_at);


--
-- Name: idx_crm_journey_steps_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_journey_steps_order ON public.crm_journey_steps USING btree (tenant_id, journey_id, step_order);


--
-- Name: idx_crm_journeys_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_journeys_status ON public.crm_journeys USING btree (tenant_id, status, journey_type);


--
-- Name: idx_crm_landing_page_events_rollup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_landing_page_events_rollup ON public.crm_landing_page_events USING btree (tenant_id, landing_page_id, event_type, event_at DESC);


--
-- Name: idx_crm_landing_pages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_landing_pages_status ON public.crm_landing_pages USING btree (tenant_id, status, campaign_id);


--
-- Name: idx_crm_lead_assignments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_lead_assignments_active ON public.crm_lead_assignments USING btree (tenant_id, lead_id, assignment_type) WHERE (unassigned_at IS NULL);


--
-- Name: idx_crm_lead_assignments_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_assignments_assignee ON public.crm_lead_assignments USING btree (tenant_id, assignee_user_id, unassigned_at);


--
-- Name: idx_crm_lead_merge_audit_tenant_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_merge_audit_tenant_time ON public.crm_lead_merge_audit USING btree (tenant_id, created_at DESC);


--
-- Name: idx_crm_lead_score_events_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_score_events_lead ON public.crm_lead_score_events USING btree (tenant_id, lead_id, created_at DESC);


--
-- Name: idx_crm_lead_score_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_score_rules_active ON public.crm_lead_score_rules USING btree (tenant_id, is_active, priority);


--
-- Name: idx_crm_lead_sla_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_sla_due ON public.crm_lead_sla_instances USING btree (tenant_id, status, first_response_due_at, next_action_due_at);


--
-- Name: idx_crm_leads_v2_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_campaign ON public.crm_leads_v2 USING btree (tenant_id, campaign_id);


--
-- Name: idx_crm_leads_v2_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_corporate_uid ON public.crm_leads_v2 USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_leads_v2_dimensions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_dimensions ON public.crm_leads_v2 USING btree (tenant_id, hospital_id, branch_id, service_line_id);


--
-- Name: idx_crm_leads_v2_legacy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_leads_v2_legacy ON public.crm_leads_v2 USING btree (tenant_id, legacy_lead_id) WHERE (legacy_lead_id IS NOT NULL);


--
-- Name: idx_crm_leads_v2_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_metadata ON public.crm_leads_v2 USING gin (metadata);


--
-- Name: idx_crm_leads_v2_next_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_next_action ON public.crm_leads_v2 USING btree (tenant_id, next_action_at) WHERE ((status)::text = 'open'::text);


--
-- Name: idx_crm_leads_v2_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_leads_v2_number ON public.crm_leads_v2 USING btree (tenant_id, lead_number) WHERE (lead_number IS NOT NULL);


--
-- Name: idx_crm_leads_v2_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_person ON public.crm_leads_v2 USING btree (tenant_id, person_id, created_at DESC);


--
-- Name: idx_crm_leads_v2_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_source ON public.crm_leads_v2 USING btree (tenant_id, source_taxonomy_id);


--
-- Name: idx_crm_leads_v2_tenant_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_tenant_owner ON public.crm_leads_v2 USING btree (tenant_id, owner_user_id, status, next_action_at);


--
-- Name: idx_crm_leads_v2_tenant_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_tenant_stage ON public.crm_leads_v2 USING btree (tenant_id, lifecycle_stage, status, updated_at DESC);


--
-- Name: idx_crm_leads_v2_tenant_uid_daffd77; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_leads_v2_tenant_uid_daffd77 ON public.crm_leads_v2 USING btree (tenant_uid);


--
-- Name: idx_crm_marketing_budgets_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_marketing_budgets_period ON public.crm_marketing_budgets USING btree (tenant_id, period_start, period_end, approval_status);


--
-- Name: idx_crm_marketing_integrations_communication; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_marketing_integrations_communication ON public.crm_marketing_integrations USING btree (tenant_id, integration_type, provider);


--
-- Name: idx_crm_marketing_integrations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_marketing_integrations_status ON public.crm_marketing_integrations USING btree (tenant_id, status, last_sync_at);


--
-- Name: idx_crm_mlm_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_mlm_list ON public.crm_marketing_list_members USING btree (list_id);


--
-- Name: idx_crm_org_units_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_org_units_tenant_status ON public.crm_org_units USING btree (tenant_id, status);


--
-- Name: idx_crm_org_units_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_org_units_type ON public.crm_org_units USING btree (tenant_id, unit_type, is_active);


--
-- Name: idx_crm_person_identities_legacy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_person_identities_legacy ON public.crm_person_identities USING btree (tenant_id, legacy_patient_id) WHERE (legacy_patient_id IS NOT NULL);


--
-- Name: idx_crm_person_identities_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_person_identities_tenant ON public.crm_person_identities USING btree (tenant_id, status, created_at DESC);


--
-- Name: idx_crm_person_identities_tenant_uid_5069bdd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_person_identities_tenant_uid_5069bdd ON public.crm_person_identities USING btree (tenant_uid);


--
-- Name: idx_crm_person_identity_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_person_identity_email ON public.crm_person_identities USING btree (tenant_id, lower((primary_email)::text));


--
-- Name: idx_crm_person_identity_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_person_identity_metadata ON public.crm_person_identities USING gin (metadata);


--
-- Name: idx_crm_person_identity_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_person_identity_phone ON public.crm_person_identities USING btree (tenant_id, primary_phone_e164);


--
-- Name: idx_crm_provider_referrals_performance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_provider_referrals_performance ON public.crm_provider_referrals USING btree (tenant_id, referral_type, provider_name, status);


--
-- Name: idx_crm_reputation_tasks_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_reputation_tasks_queue ON public.crm_reputation_tasks USING btree (tenant_id, status, priority, due_at);


--
-- Name: idx_crm_revenue_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_revenue_date ON public.crm_revenue_events USING btree (tenant_id, revenue_date);


--
-- Name: idx_crm_revenue_doctor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_revenue_doctor ON public.crm_revenue_events USING btree (tenant_id, doctor_id, revenue_date);


--
-- Name: idx_crm_revenue_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_revenue_lead ON public.crm_revenue_events USING btree (tenant_id, lead_id);


--
-- Name: idx_crm_revenue_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_revenue_service ON public.crm_revenue_events USING btree (tenant_id, service_line_id, revenue_date);


--
-- Name: idx_crm_revenue_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_revenue_source ON public.crm_revenue_events USING btree (tenant_id, source_system, source_ref) WHERE (source_ref IS NOT NULL);


--
-- Name: idx_crm_reviews_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_reviews_external ON public.crm_reviews USING btree (tenant_id, platform, external_review_id) WHERE (external_review_id IS NOT NULL);


--
-- Name: idx_crm_reviews_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_reviews_queue ON public.crm_reviews USING btree (tenant_id, response_status, severity, reviewed_at DESC);


--
-- Name: idx_crm_segment_members_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_segment_members_lead ON public.crm_segment_members USING btree (tenant_id, lead_id);


--
-- Name: idx_crm_segment_members_segment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_segment_members_segment ON public.crm_segment_members USING btree (segment_id);


--
-- Name: idx_crm_sla_events_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_sla_events_lead ON public.crm_sla_events USING btree (tenant_id, lead_id, due_at DESC);


--
-- Name: idx_crm_sla_events_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_sla_events_queue ON public.crm_sla_events USING btree (tenant_id, status, due_at);


--
-- Name: idx_crm_social_erasure_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_erasure_status ON public.crm_social_erasure_requests USING btree (tenant_uid, status, created_at);


--
-- Name: idx_crm_social_identities_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_identities_tenant ON public.crm_social_identities USING btree (tenant_uid, channel, updated_at DESC);


--
-- Name: idx_crm_social_pauses_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_pauses_active ON public.crm_social_automation_pauses USING btree (tenant_uid, conversation_id) WHERE (resumed_at IS NULL);


--
-- Name: idx_crm_social_post_comments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_post_comments ON public.crm_social_post_comments USING btree (tenant_uid, post_id, created_at);


--
-- Name: idx_crm_social_post_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_post_events ON public.crm_social_post_events USING btree (tenant_uid, post_id, created_at);


--
-- Name: idx_crm_social_posts_calendar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_posts_calendar ON public.crm_social_posts USING btree (tenant_uid, planned_at);


--
-- Name: idx_crm_social_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_posts_status ON public.crm_social_posts USING btree (tenant_uid, status, updated_at DESC);


--
-- Name: idx_crm_social_reminders_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_reminders_due ON public.crm_social_inbox_reminders USING btree (tenant_uid, status, remind_at);


--
-- Name: idx_crm_social_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_rules_active ON public.crm_social_inbox_rules USING btree (tenant_uid, active, priority);


--
-- Name: idx_crm_social_scheduled_replies_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_scheduled_replies_due ON public.crm_social_scheduled_replies USING btree (tenant_uid, status, send_at);


--
-- Name: idx_crm_social_triggers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_social_triggers_active ON public.crm_social_triggers USING btree (tenant_uid, active, trigger_type);


--
-- Name: idx_crm_source_taxonomy_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_source_taxonomy_identity ON public.crm_source_taxonomy USING btree (tenant_id, channel, source, COALESCE(medium, ''::character varying), COALESCE(campaign, ''::character varying));


--
-- Name: idx_crm_source_taxonomy_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_source_taxonomy_lookup ON public.crm_source_taxonomy USING btree (tenant_id, channel, source, active);


--
-- Name: idx_crm_source_taxonomy_tenant_uid_b751c42; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_source_taxonomy_tenant_uid_b751c42 ON public.crm_source_taxonomy USING btree (tenant_uid);


--
-- Name: idx_crm_specialty_profiles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_specialty_profiles_active ON public.crm_specialty_profiles USING btree (tenant_id, is_active, display_name);


--
-- Name: idx_crm_specialty_profiles_tenant_uid_9bf1d47; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_specialty_profiles_tenant_uid_9bf1d47 ON public.crm_specialty_profiles USING btree (tenant_uid);


--
-- Name: idx_crm_tasks_corporate_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_corporate_uid ON public.crm_tasks USING btree (tenant_uid, corporate_uid) WHERE (corporate_uid IS NOT NULL);


--
-- Name: idx_crm_tasks_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_queue ON public.crm_tasks USING btree (tenant_id, assigned_to_user_id, status, due_at);


--
-- Name: idx_crm_tasks_tenant_uid_fd7c033; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_tasks_tenant_uid_fd7c033 ON public.crm_tasks USING btree (tenant_uid);


--
-- Name: idx_crm_touchpoint_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_touchpoint_campaign ON public.crm_touchpoints USING btree (tenant_id, campaign_id, event_at DESC);


--
-- Name: idx_crm_touchpoint_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_crm_touchpoint_external ON public.crm_touchpoints USING btree (tenant_id, external_event_id) WHERE (external_event_id IS NOT NULL);


--
-- Name: idx_crm_touchpoint_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_touchpoint_identity ON public.crm_touchpoints USING btree (tenant_id, identity_id, event_at DESC);


--
-- Name: idx_crm_touchpoint_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_touchpoint_lead ON public.crm_touchpoints USING btree (tenant_id, lead_id, event_at DESC);


--
-- Name: idx_crm_visit_identity_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_visit_identity_time ON public.crm_visit_events USING btree (tenant_id, identity_id, event_at DESC);


--
-- Name: idx_crm_visit_lead_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_visit_lead_time ON public.crm_visit_events USING btree (tenant_id, lead_id, event_at DESC);


--
-- Name: idx_crm_visit_type_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_visit_type_time ON public.crm_visit_events USING btree (tenant_id, event_type, event_at DESC);


--
-- Name: idx_crm_whatsapp_templates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_whatsapp_templates_status ON public.crm_whatsapp_templates USING btree (tenant_uid, status, updated_at DESC);


--
-- Name: idx_crt_jti; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crt_jti ON public.crm_refresh_tokens USING btree (jti);


--
-- Name: idx_crt_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crt_user_id ON public.crm_refresh_tokens USING btree (user_id);


--
-- Name: idx_deals_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_assigned ON public.crm_deals USING btree (assigned_to);


--
-- Name: idx_deals_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_lead ON public.crm_deals USING btree (lead_id);


--
-- Name: idx_deals_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_stage ON public.crm_deals USING btree (stage);


--
-- Name: idx_doctors_consultation_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_consultation_types ON public.doctors USING gin ("consultationTypes");


--
-- Name: idx_doctors_emergency_online; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_emergency_online ON public.doctors USING btree (accepts_emergency_calls, "isOnline") WHERE ((accepts_emergency_calls = true) AND ("isOnline" = true));


--
-- Name: idx_doctors_languages; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_languages ON public.doctors USING gin (languages);


--
-- Name: idx_doctors_linked_user_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_doctors_linked_user_uid ON public.doctors USING btree (linked_user_uid) WHERE (linked_user_uid IS NOT NULL);


--
-- Name: idx_doctors_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_metadata ON public.doctors USING gin (metadata);


--
-- Name: idx_doctors_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_org_status ON public.doctors USING btree (organization_id, status);


--
-- Name: idx_doctors_organization_uid_9e22ff4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_organization_uid_9e22ff4 ON public.doctors USING btree (organization_uid);


--
-- Name: idx_doctors_reviews; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_reviews ON public.doctors USING gin (reviews_json);


--
-- Name: idx_doctors_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_search ON public.doctors USING gin (search_vector);


--
-- Name: idx_doctors_specializations; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_specializations ON public.doctors USING gin (specializations);


--
-- Name: idx_doctors_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_tenant_id ON public.doctors USING btree (tenant_id);


--
-- Name: idx_doctors_tenant_uid_393db01; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_tenant_uid_393db01 ON public.doctors USING btree (tenant_uid);


--
-- Name: idx_doctors_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_uid ON public.doctors USING btree (uid);


--
-- Name: idx_doctors_unique_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_unique_id ON public.doctors USING btree (unique_id);


--
-- Name: idx_doctors_weekly_availability; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_weekly_availability ON public.doctors USING gin ("weeklyAvailability");


--
-- Name: idx_doctors_weekly_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_weekly_schedule ON public.doctors USING gin ("weeklySchedule");


--
-- Name: idx_email_settings_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_email ON public.email_settings USING btree (email);


--
-- Name: idx_email_settings_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_is_active ON public.email_settings USING btree (is_active);


--
-- Name: idx_email_settings_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_is_deleted ON public.email_settings USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_email_settings_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_provider ON public.email_settings USING btree (provider);


--
-- Name: idx_email_settings_user_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_user_default ON public.email_settings USING btree (user_id, is_default);


--
-- Name: idx_email_settings_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_user_email ON public.email_settings USING btree (user_id, email);


--
-- Name: idx_email_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_settings_user_id ON public.email_settings USING btree (user_id);


--
-- Name: idx_entity_registry_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_registry_kind ON public.entity_registry USING btree (kind);


--
-- Name: idx_entity_uid_aliases_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_uid_aliases_uid ON public.entity_uid_aliases USING btree (uid);


--
-- Name: idx_ins_products_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ins_products_code ON public.crm_insurance_products USING btree (code);


--
-- Name: idx_insurance_brokers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_brokers_email ON public.insurance_brokers USING btree (email);


--
-- Name: idx_insurance_brokers_license; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_brokers_license ON public.insurance_brokers USING btree (irdai_license_number);


--
-- Name: idx_insurance_brokers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_brokers_status ON public.insurance_brokers USING btree (status);


--
-- Name: idx_insurance_brokers_tenant_uid_8271d2f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_brokers_tenant_uid_8271d2f ON public.insurance_brokers USING btree (tenant_uid);


--
-- Name: idx_insurance_brokers_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_brokers_uid ON public.insurance_brokers USING btree (uid);


--
-- Name: idx_leads_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_assigned ON public.crm_leads USING btree (assigned_to);


--
-- Name: idx_leads_leadgen_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_leads_leadgen_id ON public.crm_leads USING btree (((custom_fields ->> 'leadgen_id'::text))) WHERE (((custom_fields ->> 'leadgen_id'::text) IS NOT NULL) AND ((custom_fields ->> 'leadgen_id'::text) <> ''::text));


--
-- Name: idx_leads_next_followup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_next_followup ON public.crm_leads USING btree (next_followup);


--
-- Name: idx_leads_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_score ON public.crm_leads USING btree (score);


--
-- Name: idx_leads_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_source ON public.crm_leads USING btree (source);


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status ON public.crm_leads USING btree (status);


--
-- Name: idx_notifications_channels_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_channels_gin ON public.notifications USING gin (channels);


--
-- Name: idx_notifications_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_data_gin ON public.notifications USING gin (data);


--
-- Name: idx_notifications_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_metadata_gin ON public.notifications USING gin (metadata);


--
-- Name: idx_notifications_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_tenant_id ON public.notifications USING btree (tenant_id);


--
-- Name: idx_notifications_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_type ON public.notifications USING btree ("userId", "userType");


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree ("userId", "isRead", "createdAt");


--
-- Name: idx_one_active_corporate_admin_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_active_corporate_admin_per_org ON public.users USING btree (organization_id) WHERE (((role)::text = 'corporate_admin'::text) AND (organization_type = 'corporate'::public.enum_users_organization_type) AND (status = 'active'::public.enum_users_status));


--
-- Name: idx_one_active_corporate_admin_per_org_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_active_corporate_admin_per_org_uid ON public.users USING btree (organization_uid) WHERE (((role)::text = 'corporate_admin'::text) AND (status = 'active'::public.enum_users_status) AND (organization_uid IS NOT NULL));


--
-- Name: idx_policy_hist_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_hist_rfq ON public.crm_rfq_policy_history USING btree (rfq_id);


--
-- Name: idx_prt_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prt_expires ON public.portal_refresh_tokens USING btree (expires_at);


--
-- Name: idx_prt_jti; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prt_jti ON public.portal_refresh_tokens USING btree (jti);


--
-- Name: idx_prt_user_portal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prt_user_portal ON public.portal_refresh_tokens USING btree (user_id, portal);


--
-- Name: idx_quotes_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_rfq ON public.crm_quotes USING btree (rfq_id);


--
-- Name: idx_quotes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotes_status ON public.crm_quotes USING btree (status);


--
-- Name: idx_rfq_audit_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_audit_rfq ON public.crm_rfq_audit_log USING btree (rfq_id);


--
-- Name: idx_rfq_audit_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_audit_ts ON public.crm_rfq_audit_log USING btree (created_at);


--
-- Name: idx_rfq_claims_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_claims_date ON public.crm_rfq_claims USING btree (claim_date);


--
-- Name: idx_rfq_claims_emp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_claims_emp ON public.crm_rfq_claims USING btree (emp_code);


--
-- Name: idx_rfq_claims_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_claims_rfq ON public.crm_rfq_claims USING btree (rfq_id);


--
-- Name: idx_rfq_claims_svc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_claims_svc ON public.crm_rfq_claims USING btree (service_type);


--
-- Name: idx_rfq_files_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_files_rfq ON public.crm_rfq_files USING btree (rfq_id);


--
-- Name: idx_rfq_members_emp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_members_emp ON public.crm_rfq_members USING btree (emp_code);


--
-- Name: idx_rfq_members_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_members_rfq ON public.crm_rfq_members USING btree (rfq_id);


--
-- Name: idx_rfq_uw_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_uw_rfq ON public.crm_rfq_underwriting USING btree (rfq_id);


--
-- Name: idx_rfq_uw_rfq_product; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_rfq_uw_rfq_product ON public.crm_rfq_underwriting USING btree (rfq_id, product_code);


--
-- Name: idx_rfqs_insured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_insured ON public.crm_rfqs USING btree (insured_name);


--
-- Name: idx_rfqs_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_number ON public.crm_rfqs USING btree (rfq_number);


--
-- Name: idx_rfqs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_status ON public.crm_rfqs USING btree (status);


--
-- Name: idx_social_inbox_conv_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_inbox_conv_tenant ON public.social_inbox_conversations USING btree (tenant_uid, updated_at DESC);


--
-- Name: idx_social_inbox_conv_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_inbox_conv_tenant_status ON public.social_inbox_conversations USING btree (tenant_uid, status, last_message_at DESC);


--
-- Name: idx_social_inbox_conv_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_inbox_conv_updated ON public.social_inbox_conversations USING btree (updated_at DESC);


--
-- Name: idx_social_inbox_msg_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_inbox_msg_conv ON public.social_inbox_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_tc_master_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tc_master_active ON public.crm_product_tc_master USING btree (is_active);


--
-- Name: idx_tc_master_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tc_master_pending ON public.crm_product_tc_master USING btree (is_pending);


--
-- Name: idx_tc_master_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tc_master_product ON public.crm_product_tc_master USING btree (product_type);


--
-- Name: idx_tenants_aggregator_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_aggregator_uid ON public.tenants USING btree (aggregator_uid);


--
-- Name: idx_tenants_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_parent_id ON public.tenants USING btree (parent_id);


--
-- Name: idx_tenants_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_uid ON public.tenants USING btree (uid);


--
-- Name: idx_users_aggregator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_aggregator ON public.users USING btree (aggregator_id, aggregator_type);


--
-- Name: idx_users_aggregator_uid_87db5eb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_aggregator_uid_87db5eb ON public.users USING btree (aggregator_uid);


--
-- Name: idx_users_corporate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_corporate_id ON public.users USING btree (corporate_id);


--
-- Name: idx_users_corporate_uid_8e7cb5d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_corporate_uid_8e7cb5d ON public.users USING btree (corporate_uid);


--
-- Name: idx_users_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_employee_id ON public.users USING btree (employee_id);


--
-- Name: idx_users_iscorporate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_iscorporate ON public.users USING btree ("isCorporate") WHERE ("isCorporate" = true);


--
-- Name: idx_users_isteam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_isteam ON public.users USING btree ("isTeam") WHERE ("isTeam" = true);


--
-- Name: idx_users_medical_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_medical_history ON public.users USING gin ("medicalHistory");


--
-- Name: idx_users_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_metadata ON public.users USING gin (metadata);


--
-- Name: idx_users_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_org_status ON public.users USING btree (organization_id, status);


--
-- Name: idx_users_organization_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_organization_uid ON public.users USING btree (organization_uid);


--
-- Name: idx_users_preferences; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_preferences ON public.users USING gin (preferences);


--
-- Name: idx_users_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_search ON public.users USING gin (search_vector);


--
-- Name: idx_users_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant_id ON public.users USING btree (tenant_id);


--
-- Name: idx_users_tenant_uid_c8262b1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant_uid_c8262b1 ON public.users USING btree (tenant_uid);


--
-- Name: idx_users_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_uid ON public.users USING btree (uid);


--
-- Name: idx_users_unique_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_unique_id ON public.users USING btree (unique_id);


--
-- Name: notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_at ON public.notifications USING btree ("createdAt");


--
-- Name: notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_is_read ON public.notifications USING btree ("isRead");


--
-- Name: notifications_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_priority ON public.notifications USING btree (priority);


--
-- Name: notifications_scheduled_for; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_scheduled_for ON public.notifications USING btree ("scheduledFor");


--
-- Name: notifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_status ON public.notifications USING btree (status);


--
-- Name: notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_type ON public.notifications USING btree (type);


--
-- Name: notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_id ON public.notifications USING btree ("userId");


--
-- Name: team_members_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX team_members_email ON public.team_members USING btree (email);


--
-- Name: team_members_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX team_members_employee_id ON public.team_members USING btree ("employeeId");


--
-- Name: team_members_employment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_employment_status ON public.team_members USING btree ("employmentStatus");


--
-- Name: team_members_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_role ON public.team_members USING btree (role);


--
-- Name: team_members_unique_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX team_members_unique_id ON public.team_members USING btree (unique_id);


--
-- Name: tenants_custom_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_custom_domain ON public.tenants USING btree (custom_domain) WHERE (custom_domain IS NOT NULL);


--
-- Name: tenants_features; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenants_features ON public.tenants USING gin (features);


--
-- Name: tenants_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenants_plan ON public.tenants USING btree (plan);


--
-- Name: tenants_settings; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenants_settings ON public.tenants USING gin (settings);


--
-- Name: tenants_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_slug ON public.tenants USING btree (slug);


--
-- Name: tenants_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenants_status ON public.tenants USING btree (status);


--
-- Name: tenants_subdomain; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_subdomain ON public.tenants USING btree (subdomain) WHERE (subdomain IS NOT NULL);


--
-- Name: tenants_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenants_type ON public.tenants USING btree (type);


--
-- Name: uniq_active_corporate_normalized_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_active_corporate_normalized_name ON public.corporates USING btree (lower(regexp_replace(("companyName")::text, '[^a-zA-Z0-9]'::text, ''::text, 'g'::text))) WHERE ((lower((status)::text) = ANY (ARRAY['active'::text, 'pending'::text])) AND (length(regexp_replace(("companyName")::text, '[^a-zA-Z0-9]'::text, ''::text, 'g'::text)) > 0));


--
-- Name: uniq_corporate_normalized_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_corporate_normalized_email ON public.corporates USING btree (lower(TRIM(BOTH FROM email))) WHERE ((email IS NOT NULL) AND (TRIM(BOTH FROM email) <> ''::text));


--
-- Name: unique_user_entity_role; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_user_entity_role ON public.user_associations USING btree ("userId", "entityType", "entityId", role);


--
-- Name: uq_crm_diagnostic_centres_unique_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_diagnostic_centres_unique_id ON public.crm_diagnostic_centres USING btree (unique_id);


--
-- Name: uq_crm_flow_definitions_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_flow_definitions_entity_uid ON public.crm_flow_definitions USING btree (entity_uid);


--
-- Name: uq_crm_flow_edges_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_flow_edges_entity_uid ON public.crm_flow_edges USING btree (entity_uid);


--
-- Name: uq_crm_flow_nodes_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_flow_nodes_entity_uid ON public.crm_flow_nodes USING btree (entity_uid);


--
-- Name: uq_crm_flow_run_events_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_flow_run_events_entity_uid ON public.crm_flow_run_events USING btree (entity_uid);


--
-- Name: uq_crm_flow_runs_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_flow_runs_entity_uid ON public.crm_flow_runs USING btree (entity_uid);


--
-- Name: uq_crm_social_automation_pauses_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_social_automation_pauses_entity_uid ON public.crm_social_automation_pauses USING btree (entity_uid);


--
-- Name: uq_crm_social_identities_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_social_identities_entity_uid ON public.crm_social_identities USING btree (entity_uid);


--
-- Name: uq_crm_social_pauses_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_social_pauses_active ON public.crm_social_automation_pauses USING btree (tenant_uid, conversation_id) WHERE (resumed_at IS NULL);


--
-- Name: uq_crm_social_posts_unique_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_social_posts_unique_id ON public.crm_social_posts USING btree (unique_id);


--
-- Name: uq_crm_social_scheduled_replies_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_social_scheduled_replies_entity_uid ON public.crm_social_scheduled_replies USING btree (entity_uid);


--
-- Name: uq_crm_social_triggers_entity_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_crm_social_triggers_entity_uid ON public.crm_social_triggers USING btree (entity_uid);


--
-- Name: uq_entity_kinds_org_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_entity_kinds_org_prefix ON public.entity_kinds USING btree (prefix) WHERE is_org;


--
-- Name: uq_entity_kinds_tenant_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_entity_kinds_tenant_type ON public.entity_kinds USING btree (tenant_type) WHERE (tenant_type IS NOT NULL);


--
-- Name: uq_entity_registry_active_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_entity_registry_active_source ON public.entity_registry USING btree (source_table, source_id) WHERE (retired_at IS NULL);


--
-- Name: uq_insurance_brokers_broker_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_insurance_brokers_broker_uid ON public.insurance_brokers USING btree (broker_uid);


--
-- Name: uq_social_inbox_legacy_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_social_inbox_legacy_identity ON public.social_inbox_conversations USING btree (channel, external_user_id) WHERE (tenant_uid IS NULL);


--
-- Name: uq_social_inbox_tenant_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_social_inbox_tenant_identity ON public.social_inbox_conversations USING btree (tenant_uid, channel, external_user_id) WHERE (tenant_uid IS NOT NULL);


--
-- Name: uq_tenants_unique_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tenants_unique_id ON public.tenants USING btree (unique_id);


--
-- Name: uq_user_assoc_corp_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_user_assoc_corp_employee ON public.user_associations USING btree ("userId", "entityType", "entityId", role) WHERE ("entityType" = 'corporate'::public."enum_user_associations_entityType");


--
-- Name: user_associations_entity_type_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_associations_entity_type_entity_id ON public.user_associations USING btree ("entityType", "entityId");


--
-- Name: user_associations_is_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_associations_is_primary ON public.user_associations USING btree ("isPrimary");


--
-- Name: user_associations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_associations_status ON public.user_associations USING btree (status);


--
-- Name: user_associations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_associations_user_id ON public.user_associations USING btree ("userId");


--
-- Name: users_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_created_at ON public.users USING btree ("createdAt");


--
-- Name: users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email ON public.users USING btree (email);


--
-- Name: users_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_organization_id ON public.users USING btree (organization_id);


--
-- Name: users_organization_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_organization_type ON public.users USING btree (organization_type);


--
-- Name: users_phone_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_phone_number ON public.users USING btree ("phoneNumber");


--
-- Name: users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_status ON public.users USING btree (status);


--
-- Name: users_username_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_lower_unique ON public.users USING btree (lower((username)::text)) WHERE (username IS NOT NULL);


--
-- Name: users_uuid_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_uuid_id_idx ON public.users USING btree (uuid_id);


--
-- Name: uuid_id_map_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uuid_id_map_uuid ON public.uuid_id_map USING btree (uuid_id);


--
-- Name: doctors doctors_fts_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER doctors_fts_trigger BEFORE INSERT OR UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.doctors_fts_update();


--
-- Name: doctors doctors_search_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER doctors_search_update BEFORE INSERT OR UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.doctors_search_trigger();


--
-- Name: doctors doctors_uuid_sync_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER doctors_uuid_sync_trigger AFTER INSERT ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.sync_uuid_id_map();


--
-- Name: corporates trg_entity_uid_ad; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_ad AFTER DELETE ON public.corporates FOR EACH ROW EXECUTE FUNCTION public.entity_uid_retire();


--
-- Name: crm_diagnostic_centres trg_entity_uid_ad; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_ad AFTER DELETE ON public.crm_diagnostic_centres FOR EACH ROW EXECUTE FUNCTION public.entity_uid_retire();


--
-- Name: crm_social_posts trg_entity_uid_ad; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_ad AFTER DELETE ON public.crm_social_posts FOR EACH ROW EXECUTE FUNCTION public.entity_uid_retire();


--
-- Name: doctors trg_entity_uid_ad; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_ad AFTER DELETE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.entity_uid_retire();


--
-- Name: insurance_brokers trg_entity_uid_ad; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_ad AFTER DELETE ON public.insurance_brokers FOR EACH ROW EXECUTE FUNCTION public.entity_uid_retire();


--
-- Name: team_members trg_entity_uid_ad; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_ad AFTER DELETE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.entity_uid_retire();


--
-- Name: tenants trg_entity_uid_ad; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_ad AFTER DELETE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.entity_uid_retire();


--
-- Name: users trg_entity_uid_ad; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_ad AFTER DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.entity_uid_retire();


--
-- Name: corporates trg_entity_uid_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bi BEFORE INSERT ON public.corporates FOR EACH ROW EXECUTE FUNCTION public.entity_uid_before('corporate', 'unique_id', 'strict', '');


--
-- Name: crm_diagnostic_centres trg_entity_uid_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bi BEFORE INSERT ON public.crm_diagnostic_centres FOR EACH ROW EXECUTE FUNCTION public.entity_uid_before('diagnostic_centre', 'unique_id', 'strict', '');


--
-- Name: crm_social_posts trg_entity_uid_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bi BEFORE INSERT ON public.crm_social_posts FOR EACH ROW EXECUTE FUNCTION public.entity_uid_before('crm_social_post', 'unique_id', 'relaxed', '');


--
-- Name: doctors trg_entity_uid_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bi BEFORE INSERT ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.entity_uid_before('doctor', 'unique_id', 'relaxed', '');


--
-- Name: insurance_brokers trg_entity_uid_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bi BEFORE INSERT ON public.insurance_brokers FOR EACH ROW EXECUTE FUNCTION public.entity_uid_before('broker', 'broker_uid', 'strict', '');


--
-- Name: team_members trg_entity_uid_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bi BEFORE INSERT ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.entity_uid_before('team', 'unique_id', 'relaxed', '');


--
-- Name: tenants trg_entity_uid_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bi BEFORE INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.entity_uid_before('', 'unique_id', 'strict', 'type');


--
-- Name: users trg_entity_uid_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bi BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.entity_uid_before('user', 'unique_id', 'relaxed', '');


--
-- Name: corporates trg_entity_uid_bu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bu BEFORE UPDATE ON public.corporates FOR EACH ROW WHEN ((((old.unique_id)::text IS DISTINCT FROM (new.unique_id)::text) OR (new.unique_id IS NULL))) EXECUTE FUNCTION public.entity_uid_before('corporate', 'unique_id', 'strict', '');


--
-- Name: crm_diagnostic_centres trg_entity_uid_bu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bu BEFORE UPDATE ON public.crm_diagnostic_centres FOR EACH ROW WHEN (((old.unique_id IS DISTINCT FROM new.unique_id) OR (new.unique_id IS NULL))) EXECUTE FUNCTION public.entity_uid_before('diagnostic_centre', 'unique_id', 'strict', '');


--
-- Name: crm_social_posts trg_entity_uid_bu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bu BEFORE UPDATE ON public.crm_social_posts FOR EACH ROW WHEN (((old.unique_id IS DISTINCT FROM new.unique_id) OR (new.unique_id IS NULL))) EXECUTE FUNCTION public.entity_uid_before('crm_social_post', 'unique_id', 'relaxed', '');


--
-- Name: doctors trg_entity_uid_bu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bu BEFORE UPDATE ON public.doctors FOR EACH ROW WHEN ((((old.unique_id)::text IS DISTINCT FROM (new.unique_id)::text) OR (new.unique_id IS NULL))) EXECUTE FUNCTION public.entity_uid_before('doctor', 'unique_id', 'relaxed', '');


--
-- Name: insurance_brokers trg_entity_uid_bu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bu BEFORE UPDATE ON public.insurance_brokers FOR EACH ROW WHEN ((((old.broker_uid)::text IS DISTINCT FROM (new.broker_uid)::text) OR (new.broker_uid IS NULL))) EXECUTE FUNCTION public.entity_uid_before('broker', 'broker_uid', 'strict', '');


--
-- Name: team_members trg_entity_uid_bu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bu BEFORE UPDATE ON public.team_members FOR EACH ROW WHEN ((((old.unique_id)::text IS DISTINCT FROM (new.unique_id)::text) OR (new.unique_id IS NULL))) EXECUTE FUNCTION public.entity_uid_before('team', 'unique_id', 'relaxed', '');


--
-- Name: tenants trg_entity_uid_bu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bu BEFORE UPDATE ON public.tenants FOR EACH ROW WHEN (((old.unique_id IS DISTINCT FROM new.unique_id) OR (new.unique_id IS NULL))) EXECUTE FUNCTION public.entity_uid_before('', 'unique_id', 'strict', 'type');


--
-- Name: users trg_entity_uid_bu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entity_uid_bu BEFORE UPDATE ON public.users FOR EACH ROW WHEN ((((old.unique_id)::text IS DISTINCT FROM (new.unique_id)::text) OR (new.unique_id IS NULL))) EXECUTE FUNCTION public.entity_uid_before('user', 'unique_id', 'relaxed', '');


--
-- Name: corporates trg_uid_ref_aggregator_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_aggregator_uid BEFORE INSERT OR UPDATE OF aggregator_id, aggregator_uid ON public.corporates FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('aggregator_id', 'aggregator_uid', 'insurance_brokers', 'broker_uid');


--
-- Name: users trg_uid_ref_aggregator_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_aggregator_uid BEFORE INSERT OR UPDATE OF aggregator_id, aggregator_uid ON public.users FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('aggregator_id', 'aggregator_uid', 'insurance_brokers', 'broker_uid');


--
-- Name: users trg_uid_ref_corporate_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_corporate_uid BEFORE INSERT OR UPDATE OF corporate_id, corporate_uid ON public.users FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('corporate_id', 'corporate_uid', 'corporates', 'unique_id');


--
-- Name: doctors trg_uid_ref_organization_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_organization_uid BEFORE INSERT OR UPDATE OF organization_id, organization_uid ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('organization_id', 'organization_uid', 'tenants', 'unique_id');


--
-- Name: corporates trg_uid_ref_owned_by_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_owned_by_tenant_uid BEFORE INSERT OR UPDATE OF owned_by_tenant_id, owned_by_tenant_uid ON public.corporates FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('owned_by_tenant_id', 'owned_by_tenant_uid', 'tenants', 'unique_id');


--
-- Name: api_v2_refresh_tokens trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.api_v2_refresh_tokens FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: corporates trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.corporates FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_audit_log trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_audit_log FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_communication_events trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_communication_events FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_contacts_v2 trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_contacts_v2 FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_conversations trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_conversations FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_identity_keys trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_identity_keys FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_leads_v2 trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_leads_v2 FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_person_identities trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_person_identities FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_source_taxonomy trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_source_taxonomy FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_specialty_profiles trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_specialty_profiles FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: crm_tasks trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: doctors trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: insurance_brokers trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.insurance_brokers FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: users trg_uid_ref_tenant_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_uid_ref_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id, tenant_uid ON public.users FOR EACH ROW EXECUTE FUNCTION public.uid_ref_sync('tenant_id', 'tenant_uid', 'tenants', 'unique_id');


--
-- Name: users trg_users_organization_uid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_organization_uid BEFORE INSERT OR UPDATE OF organization_id, organization_type, organization_uid, role ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_organization_uid_guard();


--
-- Name: users trg_users_organization_uid_ohc; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_organization_uid_ohc BEFORE INSERT OR UPDATE OF organization_id, organization_type, organization_uid, role ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_ohc_role_guard();


--
-- Name: users users_fts_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_fts_trigger BEFORE INSERT OR UPDATE OF "firstName", "lastName", email, "phoneNumber" ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_fts_update();


--
-- Name: users users_search_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_search_update BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_search_trigger();


--
-- Name: users users_uuid_sync_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_uuid_sync_trigger AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_uuid_id_map();


--
-- Name: corporates corporates_aggregator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT corporates_aggregator_id_fkey FOREIGN KEY (aggregator_id) REFERENCES public.insurance_brokers(id) ON DELETE RESTRICT;


--
-- Name: corporates corporates_owned_by_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT corporates_owned_by_tenant_id_fkey FOREIGN KEY (owned_by_tenant_id) REFERENCES public.tenants(id);


--
-- Name: corporates corporates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT corporates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_agents crm_agents_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_agents
    ADD CONSTRAINT crm_agents_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.crm_agencies(id) ON DELETE SET NULL;


--
-- Name: crm_appointment_links crm_appointment_links_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_appointment_links
    ADD CONSTRAINT crm_appointment_links_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_appointment_links crm_appointment_links_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_appointment_links
    ADD CONSTRAINT crm_appointment_links_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_assignment_rules crm_assignment_rules_sla_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_assignment_rules
    ADD CONSTRAINT crm_assignment_rules_sla_fk FOREIGN KEY (sla_rule_id) REFERENCES public.crm_sla_rules(id) ON DELETE SET NULL;


--
-- Name: crm_attribution_results crm_attribution_results_calculation_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_attribution_results
    ADD CONSTRAINT crm_attribution_results_calculation_run_id_fkey FOREIGN KEY (calculation_run_id) REFERENCES public.crm_calculation_runs(id) ON DELETE SET NULL;


--
-- Name: crm_attribution_results crm_attribution_results_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_attribution_results
    ADD CONSTRAINT crm_attribution_results_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_attribution_results crm_attribution_results_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_attribution_results
    ADD CONSTRAINT crm_attribution_results_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_attribution_results crm_attribution_results_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_attribution_results
    ADD CONSTRAINT crm_attribution_results_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_attribution_results crm_attribution_results_revenue_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_attribution_results
    ADD CONSTRAINT crm_attribution_results_revenue_event_id_fkey FOREIGN KEY (revenue_event_id) REFERENCES public.crm_revenue_events(id) ON DELETE SET NULL;


--
-- Name: crm_attribution_results crm_attribution_results_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_attribution_results
    ADD CONSTRAINT crm_attribution_results_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.crm_source_taxonomy(id) ON DELETE SET NULL;


--
-- Name: crm_automation_executions crm_automation_executions_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automation_executions
    ADD CONSTRAINT crm_automation_executions_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.crm_automations(id) ON DELETE CASCADE;


--
-- Name: crm_automation_executions crm_automation_executions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_automation_executions
    ADD CONSTRAINT crm_automation_executions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_campaign_costs crm_campaign_costs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaign_costs
    ADD CONSTRAINT crm_campaign_costs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_campaign_costs crm_campaign_costs_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaign_costs
    ADD CONSTRAINT crm_campaign_costs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.crm_source_taxonomy(id) ON DELETE SET NULL;


--
-- Name: crm_campaign_costs crm_campaign_costs_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaign_costs
    ADD CONSTRAINT crm_campaign_costs_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.crm_vendors(id) ON DELETE SET NULL;


--
-- Name: crm_chatwoot_conversations crm_chatwoot_conversations_crm_conversation_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_conversations
    ADD CONSTRAINT crm_chatwoot_conversations_crm_conversation_id_tenant_id_fkey FOREIGN KEY (crm_conversation_id, tenant_id) REFERENCES public.crm_conversations(id, tenant_id);


--
-- Name: crm_chatwoot_conversations crm_chatwoot_conversations_integration_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_conversations
    ADD CONSTRAINT crm_chatwoot_conversations_integration_id_tenant_id_fkey FOREIGN KEY (integration_id, tenant_id) REFERENCES public.crm_chatwoot_inboxes(id, tenant_id);


--
-- Name: crm_chatwoot_inboxes crm_chatwoot_inboxes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_inboxes
    ADD CONSTRAINT crm_chatwoot_inboxes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.crm_chatwoot_accounts(tenant_id);


--
-- Name: crm_chatwoot_jobs crm_chatwoot_jobs_bridge_conversation_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_chatwoot_jobs
    ADD CONSTRAINT crm_chatwoot_jobs_bridge_conversation_id_tenant_id_fkey FOREIGN KEY (bridge_conversation_id, tenant_id) REFERENCES public.crm_chatwoot_conversations(id, tenant_id);


--
-- Name: crm_commissions crm_commissions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_commissions
    ADD CONSTRAINT crm_commissions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.crm_agents(id) ON DELETE SET NULL;


--
-- Name: crm_communication_events crm_communication_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_events
    ADD CONSTRAINT crm_communication_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_communication_events crm_communication_events_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_events
    ADD CONSTRAINT crm_communication_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts_v2(id) ON DELETE SET NULL;


--
-- Name: crm_communication_events crm_communication_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_events
    ADD CONSTRAINT crm_communication_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.crm_conversations(id) ON DELETE SET NULL;


--
-- Name: crm_communication_events crm_communication_events_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_events
    ADD CONSTRAINT crm_communication_events_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_communication_events crm_communication_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_events
    ADD CONSTRAINT crm_communication_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_consent_records crm_consent_records_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_consent_records
    ADD CONSTRAINT crm_consent_records_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts_v2(id) ON DELETE SET NULL;


--
-- Name: crm_consent_records crm_consent_records_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_consent_records
    ADD CONSTRAINT crm_consent_records_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE CASCADE;


--
-- Name: crm_contacts_v2 crm_contacts_v2_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts_v2
    ADD CONSTRAINT crm_contacts_v2_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_contacts_v2 crm_contacts_v2_org_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts_v2
    ADD CONSTRAINT crm_contacts_v2_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES public.crm_org_units(id) ON DELETE SET NULL;


--
-- Name: crm_contacts_v2 crm_contacts_v2_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts_v2
    ADD CONSTRAINT crm_contacts_v2_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_content_calendar crm_content_calendar_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_content_calendar
    ADD CONSTRAINT crm_content_calendar_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_conversations crm_conversations_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversations
    ADD CONSTRAINT crm_conversations_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_conversations crm_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversations
    ADD CONSTRAINT crm_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_corporate_health_plans crm_corporate_health_plans_renewal_of_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_corporate_health_plans
    ADD CONSTRAINT crm_corporate_health_plans_renewal_of_id_fkey FOREIGN KEY (renewal_of_id) REFERENCES public.crm_corporate_health_plans(id) ON DELETE SET NULL;


--
-- Name: crm_corporate_health_plans crm_corporate_health_plans_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_corporate_health_plans
    ADD CONSTRAINT crm_corporate_health_plans_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE SET NULL;


--
-- Name: crm_deals crm_deals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT crm_deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE SET NULL;


--
-- Name: crm_diagnostic_booking_events crm_diagnostic_booking_events_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_booking_events
    ADD CONSTRAINT crm_diagnostic_booking_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.crm_diagnostic_bookings(id) ON DELETE CASCADE;


--
-- Name: crm_diagnostic_bookings crm_diagnostic_bookings_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_bookings
    ADD CONSTRAINT crm_diagnostic_bookings_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_diagnostic_bookings crm_diagnostic_bookings_centre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_bookings
    ADD CONSTRAINT crm_diagnostic_bookings_centre_id_fkey FOREIGN KEY (centre_id) REFERENCES public.crm_diagnostic_centres(id) ON DELETE SET NULL;


--
-- Name: crm_diagnostic_bookings crm_diagnostic_bookings_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_bookings
    ADD CONSTRAINT crm_diagnostic_bookings_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_diagnostic_bookings crm_diagnostic_bookings_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_bookings
    ADD CONSTRAINT crm_diagnostic_bookings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_diagnostic_bookings crm_diagnostic_bookings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_bookings
    ADD CONSTRAINT crm_diagnostic_bookings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.crm_diagnostic_products(id) ON DELETE SET NULL;


--
-- Name: crm_diagnostic_bookings crm_diagnostic_bookings_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_diagnostic_bookings
    ADD CONSTRAINT crm_diagnostic_bookings_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.crm_source_taxonomy(id) ON DELETE SET NULL;


--
-- Name: crm_email_inbox crm_email_inbox_settings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_email_inbox
    ADD CONSTRAINT crm_email_inbox_settings_id_fkey FOREIGN KEY (settings_id) REFERENCES public.crm_email_settings(id) ON DELETE SET NULL;


--
-- Name: crm_employee_targets crm_employee_targets_employee_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_targets
    ADD CONSTRAINT crm_employee_targets_employee_profile_id_fkey FOREIGN KEY (employee_profile_id) REFERENCES public.crm_employee_profiles(id) ON DELETE CASCADE;


--
-- Name: crm_employee_targets crm_employee_targets_kpi_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_employee_targets
    ADD CONSTRAINT crm_employee_targets_kpi_definition_id_fkey FOREIGN KEY (kpi_definition_id) REFERENCES public.crm_kpi_definitions(id) ON DELETE CASCADE;


--
-- Name: crm_feedback_responses crm_feedback_responses_appointment_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_responses
    ADD CONSTRAINT crm_feedback_responses_appointment_link_id_fkey FOREIGN KEY (appointment_link_id) REFERENCES public.crm_appointment_links(id) ON DELETE SET NULL;


--
-- Name: crm_feedback_responses crm_feedback_responses_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_responses
    ADD CONSTRAINT crm_feedback_responses_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_feedback_responses crm_feedback_responses_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_responses
    ADD CONSTRAINT crm_feedback_responses_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_feedback_responses crm_feedback_responses_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_responses
    ADD CONSTRAINT crm_feedback_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.crm_feedback_surveys(id) ON DELETE SET NULL;


--
-- Name: crm_feedback_responses crm_feedback_responses_visit_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_feedback_responses
    ADD CONSTRAINT crm_feedback_responses_visit_event_id_fkey FOREIGN KEY (visit_event_id) REFERENCES public.crm_visit_events(id) ON DELETE SET NULL;


--
-- Name: crm_flow_edges crm_flow_edges_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_edges
    ADD CONSTRAINT crm_flow_edges_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.crm_flow_definitions(id) ON DELETE CASCADE;


--
-- Name: crm_flow_nodes crm_flow_nodes_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_nodes
    ADD CONSTRAINT crm_flow_nodes_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.crm_flow_definitions(id) ON DELETE CASCADE;


--
-- Name: crm_flow_run_events crm_flow_run_events_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_run_events
    ADD CONSTRAINT crm_flow_run_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.crm_flow_runs(id) ON DELETE CASCADE;


--
-- Name: crm_flow_runs crm_flow_runs_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_flow_runs
    ADD CONSTRAINT crm_flow_runs_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.crm_flow_definitions(id) ON DELETE CASCADE;


--
-- Name: crm_frequency_counters crm_frequency_counters_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_frequency_counters
    ADD CONSTRAINT crm_frequency_counters_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE CASCADE;


--
-- Name: crm_funnel_events crm_funnel_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_funnel_events
    ADD CONSTRAINT crm_funnel_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_funnel_events crm_funnel_events_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_funnel_events
    ADD CONSTRAINT crm_funnel_events_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_funnel_events crm_funnel_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_funnel_events
    ADD CONSTRAINT crm_funnel_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_funnel_events crm_funnel_events_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_funnel_events
    ADD CONSTRAINT crm_funnel_events_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_growth_recovery_cases crm_growth_recovery_cases_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_growth_recovery_cases
    ADD CONSTRAINT crm_growth_recovery_cases_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_growth_recovery_cases crm_growth_recovery_cases_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_growth_recovery_cases
    ADD CONSTRAINT crm_growth_recovery_cases_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_identity_keys crm_identity_keys_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_identity_keys
    ADD CONSTRAINT crm_identity_keys_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.crm_person_identities(id) ON DELETE CASCADE;


--
-- Name: crm_incentive_payouts crm_incentive_payouts_employee_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_incentive_payouts
    ADD CONSTRAINT crm_incentive_payouts_employee_profile_id_fkey FOREIGN KEY (employee_profile_id) REFERENCES public.crm_employee_profiles(id) ON DELETE CASCADE;


--
-- Name: crm_integration_errors crm_integration_errors_integration_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_integration_errors
    ADD CONSTRAINT crm_integration_errors_integration_run_id_fkey FOREIGN KEY (integration_run_id) REFERENCES public.crm_integration_runs(id) ON DELETE CASCADE;


--
-- Name: crm_journey_enrollments crm_journey_enrollments_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_enrollments
    ADD CONSTRAINT crm_journey_enrollments_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_journey_enrollments crm_journey_enrollments_journey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_enrollments
    ADD CONSTRAINT crm_journey_enrollments_journey_id_fkey FOREIGN KEY (journey_id) REFERENCES public.crm_journeys(id) ON DELETE CASCADE;


--
-- Name: crm_journey_enrollments crm_journey_enrollments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_enrollments
    ADD CONSTRAINT crm_journey_enrollments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_journey_events crm_journey_events_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_events
    ADD CONSTRAINT crm_journey_events_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.crm_journey_enrollments(id) ON DELETE CASCADE;


--
-- Name: crm_journey_events crm_journey_events_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_events
    ADD CONSTRAINT crm_journey_events_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.crm_journey_steps(id) ON DELETE SET NULL;


--
-- Name: crm_journey_steps crm_journey_steps_journey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_journey_steps
    ADD CONSTRAINT crm_journey_steps_journey_id_fkey FOREIGN KEY (journey_id) REFERENCES public.crm_journeys(id) ON DELETE CASCADE;


--
-- Name: crm_kpi_actuals crm_kpi_actuals_calculation_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_actuals
    ADD CONSTRAINT crm_kpi_actuals_calculation_run_id_fkey FOREIGN KEY (calculation_run_id) REFERENCES public.crm_calculation_runs(id) ON DELETE SET NULL;


--
-- Name: crm_kpi_actuals crm_kpi_actuals_employee_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_actuals
    ADD CONSTRAINT crm_kpi_actuals_employee_profile_id_fkey FOREIGN KEY (employee_profile_id) REFERENCES public.crm_employee_profiles(id) ON DELETE CASCADE;


--
-- Name: crm_kpi_actuals crm_kpi_actuals_kpi_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_kpi_actuals
    ADD CONSTRAINT crm_kpi_actuals_kpi_definition_id_fkey FOREIGN KEY (kpi_definition_id) REFERENCES public.crm_kpi_definitions(id) ON DELETE CASCADE;


--
-- Name: crm_landing_page_events crm_landing_page_events_landing_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_landing_page_events
    ADD CONSTRAINT crm_landing_page_events_landing_page_id_fkey FOREIGN KEY (landing_page_id) REFERENCES public.crm_landing_pages(id) ON DELETE CASCADE;


--
-- Name: crm_landing_page_events crm_landing_page_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_landing_page_events
    ADD CONSTRAINT crm_landing_page_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_landing_pages crm_landing_pages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_landing_pages
    ADD CONSTRAINT crm_landing_pages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_lead_assignments crm_lead_assignments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_assignments
    ADD CONSTRAINT crm_lead_assignments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_lead_score_events crm_lead_score_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_score_events
    ADD CONSTRAINT crm_lead_score_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_lead_score_events crm_lead_score_events_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_score_events
    ADD CONSTRAINT crm_lead_score_events_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.crm_lead_score_rules(id) ON DELETE SET NULL;


--
-- Name: crm_lead_sla_instances crm_lead_sla_instances_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_sla_instances
    ADD CONSTRAINT crm_lead_sla_instances_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_lead_sla_instances crm_lead_sla_instances_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_sla_instances
    ADD CONSTRAINT crm_lead_sla_instances_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.crm_sla_policies(id) ON DELETE SET NULL;


--
-- Name: crm_leads_v2 crm_leads_v2_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT crm_leads_v2_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_leads_v2 crm_leads_v2_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT crm_leads_v2_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts_v2(id) ON DELETE SET NULL;


--
-- Name: crm_leads_v2 crm_leads_v2_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT crm_leads_v2_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_leads_v2 crm_leads_v2_merged_into_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT crm_leads_v2_merged_into_lead_id_fkey FOREIGN KEY (merged_into_lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_leads_v2 crm_leads_v2_org_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT crm_leads_v2_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES public.crm_org_units(id) ON DELETE SET NULL;


--
-- Name: crm_leads_v2 crm_leads_v2_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT crm_leads_v2_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_leads_v2 crm_leads_v2_source_taxonomy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT crm_leads_v2_source_taxonomy_id_fkey FOREIGN KEY (source_taxonomy_id) REFERENCES public.crm_source_taxonomy(id) ON DELETE SET NULL;


--
-- Name: crm_marketing_budgets crm_marketing_budgets_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_budgets
    ADD CONSTRAINT crm_marketing_budgets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_marketing_campaign_lists crm_marketing_campaign_lists_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaign_lists
    ADD CONSTRAINT crm_marketing_campaign_lists_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_marketing_campaigns(id) ON DELETE CASCADE;


--
-- Name: crm_marketing_campaign_lists crm_marketing_campaign_lists_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaign_lists
    ADD CONSTRAINT crm_marketing_campaign_lists_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.crm_marketing_lists(id) ON DELETE CASCADE;


--
-- Name: crm_marketing_campaign_recipients crm_marketing_campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaign_recipients
    ADD CONSTRAINT crm_marketing_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_marketing_campaigns(id) ON DELETE CASCADE;


--
-- Name: crm_marketing_campaigns crm_marketing_campaigns_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaigns
    ADD CONSTRAINT crm_marketing_campaigns_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.crm_marketing_senders(id) ON DELETE SET NULL;


--
-- Name: crm_marketing_campaigns crm_marketing_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_campaigns
    ADD CONSTRAINT crm_marketing_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.crm_marketing_templates(id) ON DELETE SET NULL;


--
-- Name: crm_marketing_events crm_marketing_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_events
    ADD CONSTRAINT crm_marketing_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_marketing_campaigns(id) ON DELETE CASCADE;


--
-- Name: crm_marketing_events crm_marketing_events_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_events
    ADD CONSTRAINT crm_marketing_events_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.crm_marketing_campaign_recipients(id) ON DELETE CASCADE;


--
-- Name: crm_marketing_imports crm_marketing_imports_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_imports
    ADD CONSTRAINT crm_marketing_imports_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.crm_marketing_lists(id) ON DELETE CASCADE;


--
-- Name: crm_marketing_list_members crm_marketing_list_members_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_list_members
    ADD CONSTRAINT crm_marketing_list_members_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.crm_marketing_lists(id) ON DELETE CASCADE;


--
-- Name: crm_marketing_suppressions crm_marketing_suppressions_source_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marketing_suppressions
    ADD CONSTRAINT crm_marketing_suppressions_source_campaign_id_fkey FOREIGN KEY (source_campaign_id) REFERENCES public.crm_marketing_campaigns(id) ON DELETE SET NULL;


--
-- Name: crm_offline_campaigns crm_offline_campaigns_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_offline_campaigns
    ADD CONSTRAINT crm_offline_campaigns_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_org_units crm_org_units_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_org_units
    ADD CONSTRAINT crm_org_units_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.crm_org_units(id) ON DELETE SET NULL;


--
-- Name: crm_person_identities crm_person_identities_merged_into_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_person_identities
    ADD CONSTRAINT crm_person_identities_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_product_coverage_matrix crm_product_coverage_matrix_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_product_coverage_matrix
    ADD CONSTRAINT crm_product_coverage_matrix_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.crm_insurance_products(id) ON DELETE CASCADE;


--
-- Name: crm_product_tc_master crm_product_tc_master_source_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_product_tc_master
    ADD CONSTRAINT crm_product_tc_master_source_rfq_id_fkey FOREIGN KEY (source_rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE SET NULL;


--
-- Name: crm_provider_referrals crm_provider_referrals_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_provider_referrals
    ADD CONSTRAINT crm_provider_referrals_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.crm_diagnostic_bookings(id) ON DELETE SET NULL;


--
-- Name: crm_provider_referrals crm_provider_referrals_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_provider_referrals
    ADD CONSTRAINT crm_provider_referrals_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_quotes crm_quotes_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_quotes
    ADD CONSTRAINT crm_quotes_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE CASCADE;


--
-- Name: crm_reputation_tasks crm_reputation_tasks_feedback_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reputation_tasks
    ADD CONSTRAINT crm_reputation_tasks_feedback_response_id_fkey FOREIGN KEY (feedback_response_id) REFERENCES public.crm_feedback_responses(id) ON DELETE CASCADE;


--
-- Name: crm_reputation_tasks crm_reputation_tasks_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reputation_tasks
    ADD CONSTRAINT crm_reputation_tasks_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.crm_reviews(id) ON DELETE CASCADE;


--
-- Name: crm_revenue_events crm_revenue_events_appointment_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_revenue_events
    ADD CONSTRAINT crm_revenue_events_appointment_link_id_fkey FOREIGN KEY (appointment_link_id) REFERENCES public.crm_appointment_links(id) ON DELETE SET NULL;


--
-- Name: crm_revenue_events crm_revenue_events_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_revenue_events
    ADD CONSTRAINT crm_revenue_events_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_revenue_events crm_revenue_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_revenue_events
    ADD CONSTRAINT crm_revenue_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_revenue_events crm_revenue_events_visit_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_revenue_events
    ADD CONSTRAINT crm_revenue_events_visit_event_id_fkey FOREIGN KEY (visit_event_id) REFERENCES public.crm_visit_events(id) ON DELETE SET NULL;


--
-- Name: crm_reviews crm_reviews_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_reviews
    ADD CONSTRAINT crm_reviews_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_rfq_analysis_cache crm_rfq_analysis_cache_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_analysis_cache
    ADD CONSTRAINT crm_rfq_analysis_cache_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE CASCADE;


--
-- Name: crm_rfq_claims crm_rfq_claims_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_claims
    ADD CONSTRAINT crm_rfq_claims_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE CASCADE;


--
-- Name: crm_rfq_files crm_rfq_files_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_files
    ADD CONSTRAINT crm_rfq_files_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE CASCADE;


--
-- Name: crm_rfq_members crm_rfq_members_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_members
    ADD CONSTRAINT crm_rfq_members_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE CASCADE;


--
-- Name: crm_rfq_policy_history crm_rfq_policy_history_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_policy_history
    ADD CONSTRAINT crm_rfq_policy_history_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE CASCADE;


--
-- Name: crm_rfq_underwriting crm_rfq_underwriting_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_underwriting
    ADD CONSTRAINT crm_rfq_underwriting_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.crm_insurance_products(id);


--
-- Name: crm_rfq_underwriting crm_rfq_underwriting_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_rfq_underwriting
    ADD CONSTRAINT crm_rfq_underwriting_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.crm_rfqs(id) ON DELETE CASCADE;


--
-- Name: crm_segment_members crm_segment_members_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segment_members
    ADD CONSTRAINT crm_segment_members_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_segment_members crm_segment_members_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segment_members
    ADD CONSTRAINT crm_segment_members_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.crm_segments(id) ON DELETE CASCADE;


--
-- Name: crm_sla_events crm_sla_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_events
    ADD CONSTRAINT crm_sla_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_sla_events crm_sla_events_sla_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_events
    ADD CONSTRAINT crm_sla_events_sla_rule_id_fkey FOREIGN KEY (sla_rule_id) REFERENCES public.crm_sla_rules(id) ON DELETE SET NULL;


--
-- Name: crm_sla_rules crm_sla_rules_business_hours_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_sla_rules
    ADD CONSTRAINT crm_sla_rules_business_hours_id_fkey FOREIGN KEY (business_hours_id) REFERENCES public.crm_business_hours(id) ON DELETE SET NULL;


--
-- Name: crm_social_post_comments crm_social_post_comments_tenant_uid_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_post_comments
    ADD CONSTRAINT crm_social_post_comments_tenant_uid_post_id_fkey FOREIGN KEY (tenant_uid, post_id) REFERENCES public.crm_social_posts(tenant_uid, id) ON DELETE CASCADE;


--
-- Name: crm_social_post_events crm_social_post_events_tenant_uid_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_post_events
    ADD CONSTRAINT crm_social_post_events_tenant_uid_post_id_fkey FOREIGN KEY (tenant_uid, post_id) REFERENCES public.crm_social_posts(tenant_uid, id) ON DELETE CASCADE;


--
-- Name: crm_social_triggers crm_social_triggers_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_social_triggers
    ADD CONSTRAINT crm_social_triggers_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.crm_flow_definitions(id) ON DELETE SET NULL;


--
-- Name: crm_tasks crm_tasks_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_tasks crm_tasks_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE CASCADE;


--
-- Name: crm_touchpoints crm_touchpoints_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_touchpoints
    ADD CONSTRAINT crm_touchpoints_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns_unified(id) ON DELETE SET NULL;


--
-- Name: crm_touchpoints crm_touchpoints_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_touchpoints
    ADD CONSTRAINT crm_touchpoints_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.crm_contacts_v2(id) ON DELETE SET NULL;


--
-- Name: crm_touchpoints crm_touchpoints_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_touchpoints
    ADD CONSTRAINT crm_touchpoints_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_touchpoints crm_touchpoints_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_touchpoints
    ADD CONSTRAINT crm_touchpoints_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: crm_touchpoints crm_touchpoints_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_touchpoints
    ADD CONSTRAINT crm_touchpoints_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.crm_source_taxonomy(id) ON DELETE SET NULL;


--
-- Name: crm_visit_events crm_visit_events_appointment_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_visit_events
    ADD CONSTRAINT crm_visit_events_appointment_link_id_fkey FOREIGN KEY (appointment_link_id) REFERENCES public.crm_appointment_links(id) ON DELETE SET NULL;


--
-- Name: crm_visit_events crm_visit_events_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_visit_events
    ADD CONSTRAINT crm_visit_events_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.crm_person_identities(id) ON DELETE SET NULL;


--
-- Name: crm_visit_events crm_visit_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_visit_events
    ADD CONSTRAINT crm_visit_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.crm_leads_v2(id) ON DELETE SET NULL;


--
-- Name: doctors doctors_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: doctors doctors_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT "doctors_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: entity_registry entity_registry_kind_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_registry
    ADD CONSTRAINT entity_registry_kind_fkey FOREIGN KEY (kind) REFERENCES public.entity_kinds(kind);


--
-- Name: entity_uid_aliases entity_uid_aliases_old_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_uid_aliases
    ADD CONSTRAINT entity_uid_aliases_old_uid_fkey FOREIGN KEY (old_uid) REFERENCES public.entity_registry(uid);


--
-- Name: entity_uid_aliases entity_uid_aliases_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_uid_aliases
    ADD CONSTRAINT entity_uid_aliases_uid_fkey FOREIGN KEY (uid) REFERENCES public.entity_registry(uid);


--
-- Name: api_v2_refresh_tokens fk_api_v2_refresh_tokens_tenant_uid_8e87a58; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_v2_refresh_tokens
    ADD CONSTRAINT fk_api_v2_refresh_tokens_tenant_uid_8e87a58 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: corporates fk_corporates_aggregator_uid_6433f6a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT fk_corporates_aggregator_uid_6433f6a FOREIGN KEY (aggregator_uid) REFERENCES public.entity_registry(uid);


--
-- Name: corporates fk_corporates_owned_by_tenant_uid_853d9cb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT fk_corporates_owned_by_tenant_uid_853d9cb FOREIGN KEY (owned_by_tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: corporates fk_corporates_tenant_uid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporates
    ADD CONSTRAINT fk_corporates_tenant_uid FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_activities fk_crm_activities_tenant_uid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT fk_crm_activities_tenant_uid FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_audit_log fk_crm_audit_log_tenant_uid_05298e9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_audit_log
    ADD CONSTRAINT fk_crm_audit_log_tenant_uid_05298e9 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_communication_events fk_crm_communication_events_tenant_uid_0d07a7f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communication_events
    ADD CONSTRAINT fk_crm_communication_events_tenant_uid_0d07a7f FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_contacts fk_crm_contacts_tenant_uid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT fk_crm_contacts_tenant_uid FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_contacts_v2 fk_crm_contacts_v2_tenant_uid_bd5f089; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts_v2
    ADD CONSTRAINT fk_crm_contacts_v2_tenant_uid_bd5f089 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_conversations fk_crm_conversations_tenant_uid_0e5b6fc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversations
    ADD CONSTRAINT fk_crm_conversations_tenant_uid_0e5b6fc FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_deals fk_crm_deals_tenant_uid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_deals
    ADD CONSTRAINT fk_crm_deals_tenant_uid FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_identity_keys fk_crm_identity_keys_tenant_uid_9336245; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_identity_keys
    ADD CONSTRAINT fk_crm_identity_keys_tenant_uid_9336245 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_leads_v2 fk_crm_leads_v2_tenant_uid_daffd77; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads_v2
    ADD CONSTRAINT fk_crm_leads_v2_tenant_uid_daffd77 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_person_identities fk_crm_person_identities_tenant_uid_5069bdd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_person_identities
    ADD CONSTRAINT fk_crm_person_identities_tenant_uid_5069bdd FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_source_taxonomy fk_crm_source_taxonomy_tenant_uid_b751c42; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_source_taxonomy
    ADD CONSTRAINT fk_crm_source_taxonomy_tenant_uid_b751c42 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_specialty_profiles fk_crm_specialty_profiles_tenant_uid_9bf1d47; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_specialty_profiles
    ADD CONSTRAINT fk_crm_specialty_profiles_tenant_uid_9bf1d47 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: crm_tasks fk_crm_tasks_tenant_uid_fd7c033; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT fk_crm_tasks_tenant_uid_fd7c033 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: doctors fk_doctors_linked_user_uid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT fk_doctors_linked_user_uid FOREIGN KEY (linked_user_uid) REFERENCES public.entity_registry(uid) NOT VALID;


--
-- Name: doctors fk_doctors_organization_uid_9e22ff4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT fk_doctors_organization_uid_9e22ff4 FOREIGN KEY (organization_uid) REFERENCES public.entity_registry(uid);


--
-- Name: doctors fk_doctors_tenant_uid_393db01; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT fk_doctors_tenant_uid_393db01 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: insurance_brokers fk_insurance_brokers_tenant_uid_8271d2f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_brokers
    ADD CONSTRAINT fk_insurance_brokers_tenant_uid_8271d2f FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: users fk_users_aggregator_uid_87db5eb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_aggregator_uid_87db5eb FOREIGN KEY (aggregator_uid) REFERENCES public.entity_registry(uid);


--
-- Name: users fk_users_corporate_uid_8e7cb5d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_corporate_uid_8e7cb5d FOREIGN KEY (corporate_uid) REFERENCES public.entity_registry(uid);


--
-- Name: users fk_users_organization_uid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_organization_uid FOREIGN KEY (organization_uid) REFERENCES public.entity_registry(uid);


--
-- Name: users fk_users_tenant_uid_c8262b1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_tenant_uid_c8262b1 FOREIGN KEY (tenant_uid) REFERENCES public.entity_registry(uid);


--
-- Name: insurance_brokers insurance_brokers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_brokers
    ADD CONSTRAINT insurance_brokers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_userid_fkey FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: social_inbox_messages social_inbox_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_inbox_messages
    ADD CONSTRAINT social_inbox_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.social_inbox_conversations(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tenants tenants_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.users(id);


--
-- Name: tenants tenants_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: user_associations user_associations_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_associations
    ADD CONSTRAINT "user_associations_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_corporate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_corporate_id_fkey FOREIGN KEY (corporate_id) REFERENCES public.corporates(id) ON DELETE SET NULL;


--
-- Name: users users_primary_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_primary_doctor_id_fkey FOREIGN KEY (primary_doctor_id) REFERENCES public.doctors(id);


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_platform_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_platform_admin ON public.audit_logs TO PUBLIC USING ((public.is_platform_admin() = true));


--
-- Name: audit_logs audit_logs_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_tenant_isolation ON public.audit_logs TO PUBLIC USING ((user_id = (public.current_app_user_id())::text));


--
-- Name: corporates corporate_rls_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY corporate_rls_select ON public.corporates FOR SELECT USING (((current_setting('app.current_tenant'::text, true) = ''::text) OR (current_setting('app.current_tenant'::text, true) IS NULL) OR (owned_by_tenant_id IS NULL) OR (owned_by_tenant_id = ANY (public.get_tenant_scope((NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::integer))) OR (tenant_id = ANY (public.get_tenant_scope((NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::integer)))));


--
-- Name: corporates corporate_rls_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY corporate_rls_write ON public.corporates USING (((current_setting('app.current_tenant'::text, true) = ''::text) OR (current_setting('app.current_tenant'::text, true) IS NULL) OR (owned_by_tenant_id IS NULL) OR (owned_by_tenant_id = (NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::integer) OR (tenant_id = (NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::integer))) WITH CHECK (((current_setting('app.current_tenant'::text, true) = ''::text) OR (current_setting('app.current_tenant'::text, true) IS NULL) OR (owned_by_tenant_id IS NULL) OR (owned_by_tenant_id = (NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::integer) OR (tenant_id = (NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::integer)));


--
-- Name: corporates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.corporates ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_platform_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_platform_admin ON public.users TO PUBLIC USING ((public.is_platform_admin() = true));


--
-- Name: users users_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_tenant_isolation ON public.users TO PUBLIC USING (((organization_id = public.current_org_id()) OR (id = public.current_app_user_id()) OR (organization_id IS NULL)));


--
-- PostgreSQL database dump complete
--


