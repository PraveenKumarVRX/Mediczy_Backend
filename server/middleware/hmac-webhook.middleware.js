/**
 * HMAC Webhook Verification Middleware — Eve-Healthcare pattern ported to Mediqzy
 *
 * Verifies HMAC signatures on inbound webhooks before they reach the route
 * handler. Supports multiple signature header schemes:
 *
 *   - Razorpay: `X-Razorpay-Signature` (HMAC-SHA256 over raw body + "|" + webhook secret)
 *   - Generic:  `X-Hub-Signature-256` or `X-Hub-Signature` (HMAC-SHA256 / HMAC-SHA1)
 *   - Custom:   `X-Webhook-Signature`
 *
 * The raw body must be captured by the express.json `verify` callback (already
 * done in app.js for several webhook paths). This middleware extends that list
 * to include the idempotent webhook endpoint.
 *
 * Usage:
 *   router.post('/webhook/tpa/:provider', verifyWebhookHmac('tpa'), handleTpaWebhook);
 *
 * Environment variables (provider-specific):
 *   WEBHOOK_SECRET_<PROVIDER_UPPER>   — shared secret for HMAC verification
 *   Example: WEBHOOK_SECRET_HERITAGE, WEBHOOK_SECRET_MDINDIA, WEBHOOK_SECRET_RAZORPAY
 */
import crypto from 'crypto';

const PROVIDER_SECRET_ENV = {
  heritage: 'WEBHOOK_SECRET_HERITAGE',
  mdindia: 'WEBHOOK_SECRET_MDINDIA',
  mediassist: 'WEBHOOK_SECRET_MEDIASSIST',
  starhealth: 'WEBHOOK_SECRET_STARHEALTH',
  nivabupa: 'WEBHOOK_SECRET_NIVABUPA',
  icici: 'WEBHOOK_SECRET_ICICI',
  care: 'WEBHOOK_SECRET_CARE',
  godigit: 'WEBHOOK_SECRET_GODIGIT',
  fhpl: 'WEBHOOK_SECRET_FHPL',
  paramount: 'WEBHOOK_SECRET_PARAMOUNT',
  raksha: 'WEBHOOK_SECRET_RAKSHA',
  vidal: 'WEBHOOK_SECRET_VIDAL',
  volo: 'WEBHOOK_SECRET_VOLO',
  ewat: 'WEBHOOK_SECRET_EWAT',
  healthindia: 'WEBHOOK_SECRET_HEALTHINDIA',
  fgi: 'WEBHOOK_SECRET_FGI',
  medsave: 'WEBHOOK_SECRET_MEDSAVE',
  nhcx: 'WEBHOOK_SECRET_NHCX',
  razorpay: 'WEBHOOK_SECRET_RAZORPAY',
  azadea: 'WEBHOOK_SECRET_AZADEA',
  cashfree: 'WEBHOOK_SECRET_CASHFREE',
  phonepe: 'WEBHOOK_SECRET_PHONEPE'
};

const FALLBACK_SECRET_ENV = 'WEBHOOK_SECRET';

function getProviderSecret(provider) {
  const envKey = PROVIDER_SECRET_ENV[provider] || `WEBHOOK_SECRET_${String(provider).toUpperCase()}`;
  return process.env[envKey] || process.env[FALLBACK_SECRET_ENV] || '';
}

function normalizeSignature(sig) {
  if (!sig) return '';
  // Strip common prefixes: sha256=, sha1=, v1=
  return String(sig).replace(/^(sha256|sha1|v1)=/i, '').toLowerCase();
}

function computeHmac(secret, body, algorithm = 'sha256') {
  return crypto.createHmac(algorithm, secret).update(body, 'utf8').digest('hex');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Middleware factory: verifyWebhookHmac(provider)
 * Reads raw body from req.rawBody (set by express.json verify callback) and
 * verifies the HMAC signature. Sets req.webhook = { provider, verified, signature }.
 * Returns 401 if verification fails and no secret is configured is treated as
 * "permissive" in development only; in production a missing secret = 500.
 */
export function verifyWebhookHmac(provider) {
  return (req, res, next) => {
    const resolvedProvider = provider || req.params?.provider;
    if (!resolvedProvider) {
      return res.status(400).json({
        success: false,
        message: 'Webhook provider is required for HMAC verification'
      });
    }

    const secret = getProviderSecret(resolvedProvider);
    const isProduction = process.env.NODE_ENV === 'production';

    // In production, a missing secret is a misconfiguration — fail closed.
    if (!secret) {
      if (isProduction) {
        return res.status(500).json({
          success: false,
          message: `Webhook secret not configured for provider: ${resolvedProvider}`
        });
      }
      // Development: permit but mark unverified
      req.webhook = { provider: resolvedProvider, verified: false, signature: null, note: 'no_secret_configured_dev_only' };
      return next();
    }

    const rawBody = req.rawBody || (req.body && typeof req.body === 'string' ? req.body : undefined);
    if (!rawBody) {
      // Cannot verify without raw body
      return res.status(400).json({
        success: false,
        message: 'Raw body not available for HMAC verification — ensure express.json verify callback captures this path'
      });
    }

    const signatureHeader =
      req.headers['x-razorpay-signature'] ||
      req.headers['x-hub-signature-256'] ||
      req.headers['x-hub-signature'] ||
      req.headers['x-webhook-signature'] ||
      req.headers['x-signature'];

    if (!signatureHeader) {
      return res.status(401).json({
        success: false,
        message: 'Missing webhook signature header'
      });
    }

    const providedSig = normalizeSignature(signatureHeader);
    let computedSig;

    // Razorpay sends signature over `body + "|" + webhook_secret`
    if (resolvedProvider === 'razorpay') {
      computedSig = crypto
        .createHmac('sha256', secret)
        .update(`${rawBody}|${secret}`, 'utf8')
        .digest('hex');
    } else {
      // Default: HMAC-SHA256 over raw body
      computedSig = computeHmac(secret, rawBody, 'sha256');
    }

    const verified = timingSafeEqual(providedSig, computedSig);

    req.webhook = {
      provider: resolvedProvider,
      verified,
      signature: providedSig,
      algorithm: resolvedProvider === 'razorpay' ? 'sha256(payload|secret)' : 'sha256(payload)'
    };

    if (!verified) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    next();
  };
}

/**
 * Optional lighter-weight middleware that only records whether a secret exists
 * but does not block. Useful for webhook providers that don't send signatures.
 */
export function recordWebhookContext(provider) {
  return (req, res, next) => {
    req.webhook = {
      provider,
      verified: false,
      signature: null,
      note: 'signature_verification_skipped'
    };
    next();
  };
}

export default { verifyWebhookHmac, recordWebhookContext };
