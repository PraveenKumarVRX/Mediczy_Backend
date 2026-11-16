/** Implements the "approved calling connector" protocol server/services/contact-center/providers.js
 * expects for mode:'connector' providers (TeleCMI, Tata Teleservices here): a signed HTTPS endpoint
 * that takes a normalized {operation, ...payload} envelope and returns a normalized call record.
 * No pre-existing Mediqzy-operated connector exists to talk to, so this instance hosts its own. */
import express from 'express';
import crypto from 'node:crypto';
import * as telecmi from '../services/voice-providers/telecmi.js';
import * as tata from '../services/voice-providers/tata.js';

const DIALERS = { telecmi, tata };
const PREFIXES = { telecmi: 'VOICE_TELECMI', tata: 'VOICE_TATA' };

function signedSend(res, status, body, secret, timestamp, nonce) {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.${raw}`).digest('hex');
  res.set('X-Voice-Signature', signature).status(status).type('application/json').send(raw);
}

export function buildVoiceConnectorRouter() {
  const router = express.Router();
  router.use(express.raw({ type: '*/*', limit: '64kb' }));

  router.post('/:provider', async (req, res) => {
    const key = req.params.provider;
    const impl = DIALERS[key];
    const prefix = PREFIXES[key];
    if (!impl || !prefix) return res.status(404).json({ error: true, msg: 'Unknown connector' });

    const secret = process.env[`${prefix}_CONNECTOR_SECRET`];
    const account = process.env[`${prefix}_CONNECTOR_ACCOUNT`];
    if (!secret || !account) return res.status(503).json({ error: true, msg: 'Connector not configured' });

    const timestamp = req.get('X-Voice-Timestamp');
    const nonce = req.get('X-Voice-Nonce');
    const signature = req.get('X-Voice-Signature');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!timestamp || !nonce || !signature || !rawBody.length) return res.status(400).json({ error: true, msg: 'Malformed connector request' });

    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.${rawBody}`).digest('hex');
    let sigBuf, expBuf;
    try { sigBuf = Buffer.from(signature, 'hex'); expBuf = Buffer.from(expected, 'hex'); } catch { return res.status(401).json({ error: true, msg: 'Invalid signature encoding' }); }
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return res.status(401).json({ error: true, msg: 'Invalid signature' });

    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch { return res.status(400).json({ error: true, msg: 'Invalid JSON' }); }
    if (payload.account !== account) return res.status(401).json({ error: true, msg: 'Account mismatch' });

    const respond = (status, call) => signedSend(res, status, { provider: payload.provider, account, tenantUid: payload.tenantUid, call, ...(status >= 400 ? { rejected: status < 500 } : {}) }, secret, timestamp, nonce);

    try {
      if (payload.operation === 'dial') return respond(200, await impl.dial(payload));
      if (payload.operation === 'details') return respond(200, await impl.details({ callId: payload.callId }));
      return respond(400, null);
    } catch (error) {
      return respond(error.rejected ? 400 : 502, null);
    }
  });

  return router;
}
