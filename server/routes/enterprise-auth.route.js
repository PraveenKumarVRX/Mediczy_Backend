/**
 * Enterprise SSO — SAML SP + OIDC exchange
 * GET  /api/enterprise/auth/providers
 * GET  /api/enterprise/auth/saml/login
 * POST /api/enterprise/auth/saml/acs
 * GET  /api/enterprise/auth/saml/metadata
 * POST /api/enterprise/auth/oidc/exchange
 */
import express from 'express';
import enterpriseAuth from '../services/enterprise-auth.service.js';

const router = express.Router();

router.get('/providers', (_req, res) => {
  res.json({ success: true, providers: enterpriseAuth.listProviders(), samlEnabled: enterpriseAuth.isSamlEnabled() });
});

router.get('/saml/login', async (req, res) => {
  try {
    const url = await enterpriseAuth.getSamlLoginUrl(req.query.relayState);
    res.redirect(url);
  } catch (e) {
    res.status(503).json({ success: false, message: e.message });
  }
});

router.post('/saml/acs', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const result = await enterpriseAuth.handleSamlAssertion(req.body);
    const relay = req.body.RelayState || '/hospital/dashboard';
    res.redirect(`${process.env.CLIENT_URL || ''}/enterprise/callback?token=${encodeURIComponent(result.accessToken)}&redirect=${encodeURIComponent(relay)}`);
  } catch (e) {
    console.error('[enterprise-saml]', e.message);
    res.status(401).send(`SAML authentication failed: ${e.message}`);
  }
});

router.get('/saml/metadata', async (_req, res) => {
  try {
    if (!enterpriseAuth.isSamlEnabled()) {
      return res.status(503).json({ success: false, message: 'SAML not configured' });
    }
    const { SAML } = await import('@node-saml/node-saml');
    const saml = new SAML({
      entryPoint: process.env.SAML_ENTRY_POINT,
      issuer: process.env.SAML_ISSUER || 'mediqzy-sp',
      callbackUrl: process.env.SAML_CALLBACK_URL || `${process.env.API_PUBLIC_URL || 'https://app.mediqzy.com'}/api/enterprise/auth/saml/acs`,
      idpCert: process.env.SAML_IDP_CERT,
    });
    const xml = saml.generateServiceProviderMetadata(null, null);
    res.type('application/xml').send(xml);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/oidc/exchange', async (req, res) => {
  try {
    const { token, provider } = req.body;
    if (!token || !provider) {
      return res.status(400).json({ success: false, message: 'token and provider required' });
    }
    const result = await enterpriseAuth.exchangeOidcToken(token, provider);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(401).json({ success: false, message: e.message });
  }
});

export default router;
