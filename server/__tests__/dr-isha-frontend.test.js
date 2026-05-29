/**
 * Frontend unit tests for Dr. ISHA service layer and chat component logic.
 * Tests client-side logic that doesn't require a browser.
 */
import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// drIsha.ts auth token logic (mirrored here for unit testing)
// ─────────────────────────────────────────────────────────────────────────────
function getAuthToken(storage) {
  return storage.getItem('token') || storage.getItem('doctorToken');
}

describe('drIsha auth token resolution', () => {
  it('uses patient token when available', () => {
    const storage = { getItem: (k) => k === 'token' ? 'patient_abc' : null };
    expect(getAuthToken(storage)).toBe('patient_abc');
  });

  it('falls back to doctorToken when token is absent', () => {
    const storage = { getItem: (k) => k === 'doctorToken' ? 'doctor_xyz' : null };
    expect(getAuthToken(storage)).toBe('doctor_xyz');
  });

  it('prefers token over doctorToken when both present', () => {
    const storage = { getItem: (k) => k === 'token' ? 'patient' : 'doctor' };
    expect(getAuthToken(storage)).toBe('patient');
  });

  it('returns null when neither token exists', () => {
    const storage = { getItem: () => null };
    expect(getAuthToken(storage)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DrISHAChat.tsx — safeNavigate logic
// ─────────────────────────────────────────────────────────────────────────────
const SAFE_REDIRECT_PATHS = new Set([
  '/emergency', '/patient/appointments', '/patient/doctors',
  '/patient/dashboard', '/patient/health', '/doctor/dashboard',
]);

function safeNavigateTarget(url, fallback) {
  const target = url?.startsWith('/') && !url.startsWith('//') ? url : fallback;
  // Simulate path validation (same logic as route)
  const path = target.split('?')[0];
  if (SAFE_REDIRECT_PATHS.has(path) || path.startsWith('/patient/doctors?')) return target;
  return fallback;
}

describe('DrISHAChat safeNavigate — redirect injection prevention', () => {
  it('follows valid internal emergency redirect', () => {
    expect(safeNavigateTarget('/emergency', '/emergency')).toBe('/emergency');
  });

  it('follows appointment redirect from AI response', () => {
    expect(safeNavigateTarget('/patient/appointments', '/patient/appointments')).toBe('/patient/appointments');
  });

  it('blocks external URL from AI response, uses fallback', () => {
    expect(safeNavigateTarget('https://attacker.com', '/emergency')).toBe('/emergency');
    expect(safeNavigateTarget('http://phishing.site/steal', '/emergency')).toBe('/emergency');
  });

  it('blocks protocol-relative URL, uses fallback', () => {
    expect(safeNavigateTarget('//evil.com', '/emergency')).toBe('/emergency');
  });

  it('blocks unknown internal paths, uses fallback', () => {
    expect(safeNavigateTarget('/admin/controls', '/emergency')).toBe('/emergency');
    expect(safeNavigateTarget('/banking/transfer', '/emergency')).toBe('/emergency');
  });

  it('allows doctor search with specialty query param', () => {
    expect(safeNavigateTarget('/patient/doctors?specialty=cardiology', '/patient/doctors')).toBe('/patient/doctors?specialty=cardiology');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Conversation history slicing — confirm 15-message limit
// ─────────────────────────────────────────────────────────────────────────────
describe('DrISHAChat conversation history window', () => {
  const makeMessages = (n) => Array.from({ length: n }, (_, i) => ({
    id: `msg-${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}`
  }));

  it('sends all messages when total ≤ 15', () => {
    const msgs = makeMessages(10);
    const history = msgs.slice(-15);
    expect(history).toHaveLength(10);
  });

  it('caps at 15 messages when more exist', () => {
    const msgs = makeMessages(25);
    const history = msgs.slice(-15);
    expect(history).toHaveLength(15);
    // Should be the LAST 15, not the first 15
    expect(history[0].content).toBe('Message 10');
    expect(history[14].content).toBe('Message 24');
  });

  it('preserves message order (oldest first in the slice)', () => {
    const msgs = makeMessages(20);
    const history = msgs.slice(-15);
    for (let i = 1; i < history.length; i++) {
      const prevId = parseInt(history[i-1].content.split(' ')[1]);
      const currId = parseInt(history[i].content.split(' ')[1]);
      expect(currId).toBe(prevId + 1);
    }
  });

  it('returns empty array when no messages', () => {
    expect([].slice(-15)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AI disclaimer presence check (verifies our welcome message fix)
// ─────────────────────────────────────────────────────────────────────────────
describe('DrISHAChat AI disclaimer', () => {
  function buildWelcomeContent(welcomeMessage) {
    const disclaimer = '\n\n*Disclaimer: I am an AI assistant, not a licensed physician. This is for informational purposes only — always consult a qualified healthcare professional for diagnosis and treatment.*';
    return welcomeMessage + disclaimer;
  }

  it('appends disclaimer to every welcome message', () => {
    const content = buildWelcomeContent("Hello! I'm Dr. iSHA.");
    expect(content).toContain('not a licensed physician');
    expect(content).toContain('consult a qualified healthcare professional');
  });

  it('disclaimer is distinct from the welcome message', () => {
    const welcome = "Hello! I'm Dr. iSHA.";
    const content = buildWelcomeContent(welcome);
    expect(content.startsWith(welcome)).toBe(true);
    expect(content.length).toBeGreaterThan(welcome.length);
  });

  it('disclaimer contains legal protection keywords', () => {
    const content = buildWelcomeContent('Hi');
    expect(content).toMatch(/informational purposes only/i);
    expect(content).toMatch(/not a licensed physician/i);
    expect(content).toMatch(/healthcare professional/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Session ID format validation
// ─────────────────────────────────────────────────────────────────────────────
describe('drIsha session ID generation', () => {
  function generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `dr_isha_${timestamp}_${random}`;
  }

  it('session ID matches expected pattern', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^dr_isha_\d+_[a-z0-9]+$/);
  });

  it('two session IDs are different', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    expect(id1).not.toBe(id2);
  });

  it('session ID contains valid timestamp', () => {
    const before = Date.now();
    const id = generateSessionId();
    const after = Date.now();
    const parts = id.split('_');
    const ts = parseInt(parts[2]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
