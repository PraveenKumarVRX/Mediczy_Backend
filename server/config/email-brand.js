/**
 * The brand members see in every email (owner rule, 2026-11-22): "My SmartHealth", sent from an
 * @mysmarthealth.in address, never "Mediqzy"/"Mediczy" or an @mediqzy.com address. mediqzy.com is
 * the web address of the app and portals, so links to it stay; it is not a name or a sender.
 *
 * mysmarthealth.in is the verified sending identity in Amazon SES (mediqzy.com is not), so mail
 * from it passes the SES identity check; see services/welcome-email.service.js coerceSesFrom.
 */
export const BRAND_NAME = process.env.EMAIL_BRAND_NAME || 'My SmartHealth';
export const BRAND_FROM_EMAIL = process.env.SES_FROM_ADDRESS || 'hello@mysmarthealth.in';
export const BRAND_SUPPORT_EMAIL = process.env.EMAIL_SUPPORT_ADDRESS || 'care@mysmarthealth.in';
export const BRAND_APP_URL = (process.env.PATIENT_APP_URL || process.env.FRONTEND_URL || 'https://app.mediqzy.com').replace(/\/$/, '');

/** "My SmartHealth" <hello@mysmarthealth.in>, or "My SmartHealth <label>" for internal alerts. */
export const brandFrom = (label = '') => `"${label ? `${BRAND_NAME} ${label}` : BRAND_NAME}" <${BRAND_FROM_EMAIL}>`;

export default { BRAND_NAME, BRAND_FROM_EMAIL, BRAND_SUPPORT_EMAIL, BRAND_APP_URL, brandFrom };
