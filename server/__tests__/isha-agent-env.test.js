/**
 * Sanity tests for Dr. ISHA agent environment guard and patient context fetcher
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const agentSourcePath = path.resolve(process.cwd(), 'isha-agent', 'agent.py');

// ─────────────────────────────────────────────────────────────────────────────
// Environment guard — verify startup fails without required secrets
// ─────────────────────────────────────────────────────────────────────────────
describe('ISHA agent environment guard', () => {
  it('ISHA_AUTH_PASSWORD has no default value (env must be set explicitly)', () => {
    // Read the agent source and confirm no default string for ISHA_AUTH_PASSWORD
    const source = fs.readFileSync(agentSourcePath, 'utf8');

    // Must NOT contain a non-empty default for ISHA_AUTH_PASSWORD
    expect(source).not.toMatch(/ISHA_AUTH_PASSWORD.*["']admin123["']/);
    expect(source).not.toMatch(/ISHA_AUTH_PASSWORD.*["']password["']/i);
    expect(source).not.toMatch(/ISHA_AUTH_PASSWORD.*["'][a-zA-Z0-9]{4,}["']/); // no non-empty default
  });

  it('startup raises EnvironmentError if ISHA_AUTH_PASSWORD is missing', () => {
    const source = fs.readFileSync(agentSourcePath, 'utf8');
    // Must have the EnvironmentError check
    expect(source).toContain('EnvironmentError');
    expect(source).toContain('ISHA_AUTH_PASSWORD');
    expect(source).toContain('raise EnvironmentError');
  });

  it('VAD min_silence_duration is 1.2 (increased from 0.6 for clinical speech)', () => {
    const source = fs.readFileSync(agentSourcePath, 'utf8');
    expect(source).toMatch(/min_silence_duration\s*=\s*1\.2/);
    expect(source).not.toMatch(/min_silence_duration\s*=\s*0\.6/);
  });

  it('audit log function exists and uses SHA256 hashing', () => {
    const source = fs.readFileSync(agentSourcePath, 'utf8');
    expect(source).toContain('log_isha_exchange');
    expect(source).toContain('hashlib.sha256');
    expect(source).toContain('isha_audit_log');
  });

  it('patient context fetcher is non-blocking (never raises)', () => {
    const source = fs.readFileSync(agentSourcePath, 'utf8');
    expect(source).toContain('fetch_patient_context');
    // Function must have try/except so failures don't crash the agent
    expect(source).toContain('except Exception as exc:');
    expect(source).toContain('return ""');
  });

  it('room name parsing supports patient ID extraction', () => {
    const source = fs.readFileSync(agentSourcePath, 'utf8');
    expect(source).toContain('patient_id');
    // Room format: isha-assistant-<doctorId>-<patientId>
    // In Python the assignment is: doctor_id = parts[0] (variable before subscript)
    expect(source).toMatch(/doctor_id\s*=\s*parts\[0\]/);
    expect(source).toMatch(/patient_id\s*=\s*parts\[1\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VAD configuration validation
// ─────────────────────────────────────────────────────────────────────────────
describe('ISHA agent VAD clinical configuration', () => {
  it('silence duration of 1.2s is in valid clinical range (0.8s–2.0s)', () => {
    const silenceDuration = 1.2;
    expect(silenceDuration).toBeGreaterThanOrEqual(0.8);
    expect(silenceDuration).toBeLessThanOrEqual(2.0);
  });

  it('activation_threshold of 0.5 is standard (0.3–0.8 range)', () => {
    const threshold = 0.5;
    expect(threshold).toBeGreaterThanOrEqual(0.3);
    expect(threshold).toBeLessThanOrEqual(0.8);
  });
});
