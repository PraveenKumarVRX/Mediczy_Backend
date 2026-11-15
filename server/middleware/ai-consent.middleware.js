/**
 * Gate for the AI health assistant: the member must have given AI_ASSISTANT
 * consent for the current version (audit M22). Off until
 * AI_CONSENT_REQUIRED=true, so the live assistant is not cut off before the
 * app can ask; the 403 tells the app exactly what to request.
 */
import { hasConsent, AI_POLICY_VERSION } from '../services/patient-consent.service.js';

export const aiConsentRequired = () => String(process.env.AI_CONSENT_REQUIRED || '').trim().toLowerCase() === 'true';

export async function requireAiAssistantConsent(req, res, next) {
  if (!aiConsentRequired() || !req.user?.id) return next();
  try {
    if (await hasConsent(req.user.id, 'AI_ASSISTANT')) return next();
  } catch (error) {
    // Fail closed: without a readable consent record the assistant does not run.
    console.error('[ai-consent] could not read consent:', error.message);
  }
  return res.status(403).json({
    success: false,
    code: 'AI_CONSENT_REQUIRED',
    consentType: 'AI_ASSISTANT',
    policyVersion: AI_POLICY_VERSION,
    message: 'Please review and accept how the AI assistant uses your health information before continuing.',
  });
}

export default requireAiAssistantConsent;
