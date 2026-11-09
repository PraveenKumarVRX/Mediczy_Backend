/**
 * Guards on the Team email inbox sync path.
 *
 * These are source-level invariants. The things that went wrong here are
 * structural — a call placed outside a guard, a flag left out of a WHERE
 * clause, a test that never opens a socket — and each is cheap to assert
 * directly and expensive to stand up a provider for. The same approach is
 * already used by response-shape-consistency.test.js.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('autonomous patient-facing email actions are gated', () => {
  const src = read('services/inboundEmailService.js');

  test('autoUpdatePortal is only ever called behind the enable flag', () => {
    // autoUpdatePortal() emails the sender, writes a patient record, books a
    // real appointment and sends an email + WhatsApp confirmation, off one LLM
    // intent guess. It must not run because a mailbox was switched on.
    const calls = [...src.matchAll(/^.*\bawait autoUpdatePortal\(/gm)];
    expect(calls).toHaveLength(1);

    // The nearest enclosing `if` must test the flag.
    const callIndex = calls[0].index;
    const guard = src.lastIndexOf('if (', callIndex);
    const condition = src.slice(guard, callIndex);
    expect(condition).toContain('AUTO_ACTIONS_ENABLED');
  });

  test('the flag is opt-in: anything but the string "true" leaves it off', () => {
    const decl = src.match(/const AUTO_ACTIONS_ENABLED\s*=\s*([^;]+);/);
    expect(decl).not.toBeNull();
    // Must compare against 'true' rather than coercing a truthy string, so
    // EMAIL_AI_AUTO_ACTIONS_ENABLED=false does not switch it ON.
    expect(decl[1]).toMatch(/===\s*'true'/);
    expect(decl[1]).toContain('EMAIL_AI_AUTO_ACTIONS_ENABLED');

    // Spot-check the semantics the declaration encodes.
    const evaluate = (value) => String(value || '').toLowerCase() === 'true';
    expect(evaluate(undefined)).toBe(false);
    expect(evaluate('false')).toBe(false);
    expect(evaluate('0')).toBe(false);
    expect(evaluate('yes')).toBe(false);
    expect(evaluate('TRUE')).toBe(true);
  });

  test('AI analysis itself is not gated — only acting on it', () => {
    // The summary/intent/sentiment labels are what make the inbox triageable.
    expect(src).toMatch(/aiProcessed:\s*true/);
    const analysis = src.indexOf('aiProcessed: true');
    const gate = src.indexOf('AUTO_ACTIONS_ENABLED &&');
    expect(analysis).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(analysis); // labels are written before the gate
  });
});

describe('the periodic sync worker honours the UI switches', () => {
  const src = read('workers/email-sync.worker.js');

  test('syncEnabled is part of the selection, not just isActive', () => {
    // Selecting on isActive alone meant turning sync off in the UI did nothing.
    expect(src).toMatch(/where:\s*\{[^}]*isActive:\s*true[^}]*syncEnabled:\s*true[^}]*\}/);
  });

  test('a failure reason is no longer truncated to 50 characters', () => {
    // VARCHAR(50) stored Zoho's message as "...yet to enable IMAP for " with the
    // mailbox name and the instruction cut off.
    expect(src).not.toMatch(/\.slice\(0,\s*50\)/);
    expect(src).toMatch(/\.slice\(0,\s*255\)/);
  });
});

describe('the SMTP/IMAP connection test really connects', () => {
  const src = read('routes/emailSettings.route.js');

  test('the "validation only" stub is gone', () => {
    // It set smtpConnected/imapConnected to true whenever the host, port and
    // username fields were non-empty, and stored testResult:'success'.
    expect(src).not.toContain('validation only');
    expect(src).not.toContain('Simulate test');
  });

  test('it authenticates over SMTP and opens IMAP', () => {
    expect(src).toMatch(/transporter\.verify\(\)/);
    expect(src).toMatch(/imap\.connect\(\)/);
  });

  test('IMAP selects INBOX, not merely connects', () => {
    // Zoho accepts the TLS connection and only refuses on mailbox select, so a
    // connect-only probe passes a mailbox that can never sync.
    expect(src).toMatch(/openBox\(\s*'INBOX'/);
  });
});

describe('manual sync covers every configured mailbox', () => {
  const src = read('routes/teamEmail.route.js');

  test('it iterates mailboxes instead of picking the first', () => {
    // A .find() meant a team with care@ plus a second address only ever synced
    // whichever row sorted first by isDefault.
    expect(src).toMatch(/const syncable = activeSettings\.filter\(/);
    expect(src).toMatch(/for \(const config of syncable\)/);
  });

  test('one dead mailbox does not hide the others', () => {
    expect(src).toMatch(/perMailbox\.push\(\{\s*email: config\.email,\s*ok: false/);
    expect(src).toMatch(/failed === syncable\.length/);
  });
});
