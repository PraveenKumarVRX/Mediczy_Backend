import crypto from 'crypto';
import BrokerIntegration from '../models/broker-integration.model.intelligent.js';

const WEBHOOK_SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = 10 * 60 * 1000;
const nonceStore = new Map();

const cleanupNonceStore = () => {
  const now = Date.now();
  for (const [key, expiresAt] of nonceStore.entries()) {
    if (expiresAt <= now) {
      nonceStore.delete(key);
    }
  }
};

const timingSafeEquals = (a = '', b = '') => {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const normalizeIp = (ip = '') => String(ip).replace('::ffff:', '');

const parseSignature = (signatureHeader = '') => {
  const sig = String(signatureHeader).trim();
  if (sig.startsWith('sha256=')) {
    return sig.slice(7);
  }
  return sig;
};

const getIntegrationFromHeaders = async (req) => {
  const brokerId = Number(req.headers['x-broker-id']);
  const apiKey = String(req.headers['x-broker-api-key'] || '');

  if (!brokerId || !apiKey) {
    return { error: 'Missing x-broker-id or x-broker-api-key header' };
  }

  const integration = await BrokerIntegration.findOne({
    where: {
      brokerId,
      isActive: true
    }
  });

  if (!integration) {
    return { error: 'No active integration found for broker' };
  }

  if (!timingSafeEquals(apiKey, integration.outboundApiKey)) {
    return { error: 'Invalid broker API key' };
  }

  const allowedIps = Array.isArray(integration.allowedIps) ? integration.allowedIps : [];
  const clientIp = normalizeIp(req.ip);
  if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
    return { error: `IP not allowlisted: ${clientIp}` };
  }

  return { integration, brokerId };
};

export const authenticateBrokerIntegration = async (req, res, next) => {
  try {
    const result = await getIntegrationFromHeaders(req);
    if (result.error) {
      return res.status(401).json({
        success: false,
        message: result.error
      });
    }

    req.brokerIntegration = result.integration;
    req.brokerId = result.brokerId;
    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to authenticate broker integration',
      error: error.message
    });
  }
};

export const verifyBrokerWebhookSignature = async (req, res, next) => {
  try {
    cleanupNonceStore();

    const result = await getIntegrationFromHeaders(req);
    if (result.error) {
      return res.status(401).json({
        success: false,
        message: result.error
      });
    }

    const signature = parseSignature(req.headers['x-signature']);
    const timestamp = Number(req.headers['x-timestamp']);
    const nonce = String(req.headers['x-nonce'] || '').trim();

    if (!signature || !timestamp || !nonce) {
      return res.status(400).json({
        success: false,
        message: 'Missing webhook headers: x-signature, x-timestamp, x-nonce'
      });
    }

    const now = Date.now();
    if (Math.abs(now - timestamp) > WEBHOOK_SKEW_MS) {
      return res.status(401).json({
        success: false,
        message: 'Webhook timestamp outside allowed window'
      });
    }

    const nonceKey = `${result.brokerId}:${nonce}`;
    if (nonceStore.has(nonceKey)) {
      return res.status(409).json({
        success: false,
        message: 'Replay detected (nonce already used)'
      });
    }

    const payload = JSON.stringify(req.body || {});
    const signedPayload = `${timestamp}.${nonce}.${payload}`;
    const expected = crypto
      .createHmac('sha256', result.integration.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    if (!timingSafeEquals(signature, expected)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    nonceStore.set(nonceKey, now + NONCE_TTL_MS);
    req.brokerIntegration = result.integration;
    req.brokerId = result.brokerId;
    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Webhook signature verification failed',
      error: error.message
    });
  }
};
