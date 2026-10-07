-- uid twins for the five queue/device tables whose organization_id mixes id-spaces.  (2026-10-07)
--
-- display_devices, hospital_queue_entries, hospital_queue_token_sequences, hospital_uhid_sequences,
-- kiosk_registration_invites. The lead first answered "directory hospital"; measured against production the column
-- holds the logged-in user's TENANT id (ids 1, 2, 3, 4, 11 are Apollo Chennai, a test clinic, SmartHealth Clinic,
-- the ACME aggregator and Smart Hospital), and the same integers are DIFFERENT hospitals in the `hospitals` directory
-- (#4 Smart Hospital Bangalore, #11 Suretech Nagpur). The lead then confirmed: twin to `tenants`.
-- (docs/architecture/ENTITY_REFERENCE_AUDIT.md, 2026-10-07)
--
-- Rows whose integer matches no tenant (2368 "Rado Labs"' id, 11332 QA data: 36 rows) are left with a NULL uid: the sync
-- trigger never refuses a dangling integer, so the queue module keeps working for them, and the CI verifier reports them as
-- "unfilled" (a warning, not a violation) until someone decides what those rows are.
SELECT attach_uid_reference('display_devices',                 'organization_id', 'organization_uid', 'tenants');
SELECT attach_uid_reference('hospital_queue_entries',          'organization_id', 'organization_uid', 'tenants');
SELECT attach_uid_reference('hospital_queue_token_sequences',  'organization_id', 'organization_uid', 'tenants');
SELECT attach_uid_reference('hospital_uhid_sequences',         'organization_id', 'organization_uid', 'tenants');
SELECT attach_uid_reference('kiosk_registration_invites',      'organization_id', 'organization_uid', 'tenants');
