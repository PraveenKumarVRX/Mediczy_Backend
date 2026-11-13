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
 *
 * Two kinds of policy:
 *   - Mediqzy's own (insurance_policies rows HR or ops entered). The window
 *     dates and top-ups come from here. Mode is 'web' when the employer's
 *     binding says enrolment happens on SmartCRM's web portal, else 'off' —
 *     never 'in_app', because the in-app flow only exists through SmartCRM.
 *     A web binding needs no partner key, so a pilot employer can show
 *     "Enrol now" before any SmartCRM read is switched on.
 *   - Projected from SmartCRM (source 'smartcrm'): the binding's mode, which
 *     may be 'in_app' once SmartCRM's write endpoints exist.
 */
import { SOURCE_SYSTEM, effectiveEnrolmentMode, loadBindings } from './config.js';
import { describeLink, getActiveLink } from './member-link.service.js';
import { lastSubmission } from './enrolment.service.js';

const today = () => new Date().toISOString().slice(0, 10);

export function windowStatus(enrolment) {
  if (!enrolment?.from || !enrolment?.to) return 'not_set';
  if (enrolment.open) return 'open';
  return enrolment.from > today() ? 'upcoming' : 'closed';
}

/**
 * @param {number} userId
 * @param {object[]} policies           shaped wallet policies (mutated)
 * @param {Map<string, number>} corporateOf  policy id -> corporate id
 */
export async function applyEnrolmentOverlay(userId, policies, corporateOf = new Map()) {
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
    const corporateIds = [...new Set([...corporateOf.values(), link?.corporate_id].filter(Boolean))];
    const bindings = await loadBindings(corporateIds);
    if (link) insurance = describeLink(link, bindings.get(Number(link.corporate_id)) || null);

    let submission;
    for (const policy of policies) {
      const binding = bindings.get(Number(corporateOf.get(policy.id))) || null;
      if (!binding) continue;
      if (policy.source === SOURCE_SYSTEM) {
        const mode = effectiveEnrolmentMode(binding);
        policy.enrolment.mode = mode;
        policy.enrolment.webUrl = mode === 'web' ? binding.web_enrolment_url : null;
        // SmartCRM owns the window and the dates are not projected, so the
        // app asks GET /api/employee/enrolment/window when mode is in_app.
        if (policy.enrolment.status === 'not_set' && mode === 'in_app') policy.enrolment.status = 'live_check';
        if (submission === undefined) submission = await lastSubmission(userId);
        policy.enrolment.submission = submission;
        policy.enrolment.requestId = submission?.state === 'pending_hr' ? submission.requestId : null;
      } else if (binding.enrolment_mode === 'web' && binding.web_enrolment_url) {
        policy.enrolment.mode = 'web';
        policy.enrolment.webUrl = binding.web_enrolment_url;
      }
    }
  } catch (error) {
    console.error(`[smartcrm-overlay] user ${userId}: ${error.message}`);
  }
  return insurance;
}

export default { applyEnrolmentOverlay, windowStatus };
