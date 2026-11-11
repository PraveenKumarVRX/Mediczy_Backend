/**
 * Every automated sender must file its delivery in the Team Sent folder.
 *
 * The folder is written only by code that creates an EmailInbox row. Anything
 * calling sendOutboundEmail without one is invisible to the desk — which is how
 * five real Equitas invitations went out and left an empty Sent folder, with no
 * fallback record anywhere (EmailLog is in-memory, email_logs is not written on
 * that path).
 *
 * This reads the sources, so a new sender added without recording fails here.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Every file that calls sendOutboundEmail, found rather than listed. */
const callers = execFileSync('grep', ['-rl', 'sendOutboundEmail(', 'services', 'routes', 'controller'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter(f => !f.endsWith('services/emailService.js'));          // the implementation itself

/**
 * Senders that deliberately do not file, each for a stated reason. Adding a
 * file here is a decision; forgetting one is a bug, and the test below is the
 * difference.
 */
const EXEMPT = {
  'routes/teamEmail.route.js': 'writes its own EmailInbox row directly, with the template-test label',
  'controller/appointment.controller.js': 'notifies team users inbound; it arrives in their own inbox already',
};

describe('automated email senders file into the Sent folder', () => {
  it('finds the senders by searching, not from a hardcoded list', () => {
    expect(callers.length).toBeGreaterThanOrEqual(6);
    expect(callers).toEqual(expect.arrayContaining([
      'services/corporate-ahc-entitlement-notification.service.js',
      'services/health-checkup-notify.service.js',
      'routes/corporate-bookings.route.js',
    ]));
  });

  it.each(callers)('%s records its sends', (file) => {
    if (EXEMPT[file]) {
      expect(typeof EXEMPT[file]).toBe('string');
      return;
    }
    const source = read(file);
    expect(source).toMatch(/recordAutomatedSend|recordSentEmail|EmailInbox\.create/);
  });

  it('every recorder import resolves to the real service', () => {
    for (const file of callers) {
      if (EXEMPT[file]) continue;
      const source = read(file);
      if (!/recordAutomatedSend/.test(source)) continue;
      const imported = /import \{[^}]*recordAutomatedSend[^}]*\} from '([^']+)'/.exec(source);
      expect(imported).not.toBeNull();
      const resolved = path.resolve(ROOT, path.dirname(file), imported[1]);
      expect(fs.existsSync(resolved)).toBe(true);
    }
  });

  it('does not file one-time codes, password resets or campaigns', () => {
    // These carry a secret or run at campaign volume; a shared Sent folder is
    // the wrong place for either.
    for (const file of ['services/twilio-otp.service.js', 'services/crm-campaign-dispatcher.service.js', 'services/welcome-email.service.js']) {
      if (!fs.existsSync(path.join(ROOT, file))) continue;
      expect(read(file)).not.toMatch(/recordAutomatedSend/);
    }
  });

  it('the recorder itself never throws out of a successful send', () => {
    const source = read('services/team-sent-folder.service.js');
    // recordSentEmail wraps its write; a bookkeeping failure must not surface
    // as a send failure.
    expect(source).toMatch(/try \{[\s\S]*EmailInbox\.create[\s\S]*\} catch/);
    expect(source).toMatch(/console\.warn\('\[sent-folder\]/);
  });

  it('refuses to guess an owner when several team members could own it', () => {
    const source = read('services/team-sent-folder.service.js');
    expect(source).toMatch(/rows\.length === 1 \? rows\[0\]\.teamMemberId : null/);
    expect(source).toMatch(/rows\.length === 1 \? rows\[0\]\.id : null/);
  });
});
