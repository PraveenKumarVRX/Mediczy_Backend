-- Migration: Multi-team member assignments with default clinics for corporates
-- Date: 2026-02-12
-- Purpose: Allow multiple team members to be assigned to a corporate, each with a default clinic
-- Create corporate_team_assignments table
CREATE TABLE IF NOT EXISTS corporate_team_assignments (
    id SERIAL PRIMARY KEY,
    corporate_id INTEGER NOT NULL,
    team_member_id INTEGER NOT NULL,
    clinic_id INTEGER,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_corporate_team_corporate FOREIGN KEY (corporate_id) REFERENCES corporates(id) ON DELETE CASCADE,
    CONSTRAINT unique_corporate_team_member UNIQUE (corporate_id, team_member_id)
);
-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_corporate_team_assignments_corporate_id ON corporate_team_assignments(corporate_id);
CREATE INDEX IF NOT EXISTS idx_corporate_team_assignments_team_member_id ON corporate_team_assignments(team_member_id);
-- Migration complete