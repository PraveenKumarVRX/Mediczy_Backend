/**
 * Phase 1 of ADR-001: tells the app, per policy, HOW the member can enrol —
 * in the app, on the web, or not at all — and what their last submission
 * said. Called by the policy wallet; never throws (a broken overlay must not
 * take the wallet down), and makes no call to SmartCRM.
 *
 * enrolment = {
 *   from, to, open,               // as before: the window the employer set
 *   status:  'open' | 'upcoming' | 'closed' | 'not_set' | 'live_check',
 *   mode:    'in_app' | 'web' | 'off',
 *   webUrl:  string | null,       // only when mode === 'web'
 *   submission: { state: 'saved'|'pending_hr'|'payment_pending'|'rejected', requestId, detail, at } | null,
 *   requestId: string | null,     // SmartCRM's HR request id, when pending HR
 * }
 */
import { SOURCE_SYSTEM, effectiveEnrolmentMode, loadBinding } from './config.js';
import { describeLink, getActiveLink } from './member-link.service.js';
import { lastSubmission } from './enrolment.service.js';

const today = () => new Date().toISOString().slice(0, 10);

export function windowStatus(enrolment) {
  if (!enrolment?.from || !enrolment?.to) return 'not_set';
  if (enrolment.open) return 'open';
  return enrolment.from > today() ? 'upcoming' : 'closed';
}

export async function applyEnrolmentOverlay(userId, policies) {
  // Native Mediqzy policies: no in-app enrolment flow exists for them yet, so
  // the mode is 'off' whatever the window says.
  for (const policy of policies) {
    policy.enrolment = {
      ...policy.enrolment,
      status: windowStatus(policy.enrolment),
      mode: 'off',
      webUrl: null,
      submission: null,
      requestId: null,
    };
  }

  let insurance = { linked: false };
  try {
    const link = await getActiveLink(userId);
    if (!link) return insurance;
    const binding = await loadBinding(link.corporate_id);
    insurance = describeLink(link, binding);
    const smartcrm = policies.filter((p) => p.source === SOURCE_SYSTEM);
    if (!smartcrm.length) return insurance;

    const mode = effectiveEnrolmentMode(binding);
    const submission = await lastSubmission(userId);
    for (const policy of smartcrm) {
      policy.enrolment.mode = mode;
      policy.enrolment.webUrl = mode === 'web' ? binding.web_enrolment_url : null;
      // SmartCRM owns the window; the dates are not projected, so the app
      // asks GET /api/employee/enrolment/window when mode is in_app.
      if (policy.enrolment.status === 'not_set' && mode === 'in_app') policy.enrolment.status = 'live_check';
      policy.enrolment.submission = submission;
      policy.enrolment.requestId = submission?.state === 'pending_hr' ? submission.requestId : null;
    }
  } catch (error) {
    console.error(`[smartcrm-overlay] user ${userId}: ${error.message}`);
  }
  return insurance;
}

export default { applyEnrolmentOverlay, windowStatus };
