import express from 'express';
import crypto from 'crypto';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { InsuranceBroker } from '../models/insurance-broker.model.intelligent.js';
import BrokerIntegration from '../models/broker-integration.model.intelligent.js';
import {
  authenticateBrokerIntegration,
  verifyBrokerWebhookSignature
} from '../middleware/brokerIntegration.middleware.js';

const router = express.Router();

let integrationTableReady = false;
const ensureBrokerIntegrationTable = async () => {
  if (!integrationTableReady) {
    await BrokerIntegration.sync();
    integrationTableReady = true;
  }
};

const generateSecret = () => crypto.randomBytes(32).toString('hex');

const maskSecret = (value = '') => {
  const str = String(value || '');
  if (str.length <= 8) {
    return '********';
  }
  return `${str.slice(0, 4)}********${str.slice(-4)}`;
};

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'broker-integrations',
    timestamp: new Date().toISOString()
  });
});

router.post('/setup', authUser, requireRole('admin'), async (req, res) => {
  try {
    await ensureBrokerIntegrationTable();

    const {
      brokerId,
      integrationName,
      brokerBaseUrl,
      allowedIps = [],
      metadata = {}
    } = req.body;

    if (!brokerId || !brokerBaseUrl) {
      return res.status(400).json({
        success: false,
        message: 'brokerId and brokerBaseUrl are required'
      });
    }

    const broker = await InsuranceBroker.findByPk(brokerId);
    if (!broker) {
      return res.status(404).json({
        success: false,
        message: 'Insurance broker not found'
      });
    }

    const outboundApiKey = generateSecret();
    const webhookSecret = generateSecret();

    const [integration] = await BrokerIntegration.upsert({
      brokerId,
      integrationName: integrationName || `${broker.brokerName} Integration`,
      brokerBaseUrl,
      outboundApiKey,
      webhookSecret,
      allowedIps: Array.isArray(allowedIps) ? allowedIps : [],
      isActive: true,
      metadata
    }, { returning: true });

    return res.status(201).json({
      success: true,
      message: 'Broker integration configured',
      integration: {
        id: integration.id,
        brokerId: integration.brokerId,
        integrationName: integration.integrationName,
        brokerBaseUrl: integration.brokerBaseUrl,
        allowedIps: integration.allowedIps,
        isActive: integration.isActive,
        metadata: integration.metadata,
        outboundApiKey,
        webhookSecret,
        webhookSigningFormat: 'HMAC_SHA256(timestamp.nonce.payload)',
        requiredHeaders: [
          'x-broker-id',
          'x-broker-api-key',
          'x-signature',
          'x-timestamp',
          'x-nonce'
        ]
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to configure broker integration',
      error: error.message
    });
  }
});

router.get('/:brokerId', authUser, requireRole('admin'), async (req, res) => {
  try {
    await ensureBrokerIntegrationTable();

    const brokerId = Number(req.params.brokerId);
    const integration = await BrokerIntegration.findOne({ where: { brokerId } });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    return res.json({
      success: true,
      integration: {
        id: integration.id,
        brokerId: integration.brokerId,
        integrationName: integration.integrationName,
        brokerBaseUrl: integration.brokerBaseUrl,
        allowedIps: integration.allowedIps,
        isActive: integration.isActive,
        metadata: integration.metadata,
        outboundApiKey: maskSecret(integration.outboundApiKey),
        webhookSecret: maskSecret(integration.webhookSecret),
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch integration',
      error: error.message
    });
  }
});

router.post('/:brokerId/rotate-keys', authUser, requireRole('admin'), async (req, res) => {
  try {
    await ensureBrokerIntegrationTable();

    const brokerId = Number(req.params.brokerId);
    const integration = await BrokerIntegration.findOne({ where: { brokerId } });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const outboundApiKey = generateSecret();
    const webhookSecret = generateSecret();

    await integration.update({
      outboundApiKey,
      webhookSecret
    });

    return res.json({
      success: true,
      message: 'Integration keys rotated',
      keys: {
        outboundApiKey,
        webhookSecret
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to rotate keys',
      error: error.message
    });
  }
});

router.post('/:brokerId/test-outbound', authUser, requireRole('admin'), async (req, res) => {
  try {
    await ensureBrokerIntegrationTable();

    const brokerId = Number(req.params.brokerId);
    const integration = await BrokerIntegration.findOne({ where: { brokerId, isActive: true } });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Active integration not found'
      });
    }

    const testUrl = new URL('/health', integration.brokerBaseUrl).toString();
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${integration.outboundApiKey}`,
        'X-Request-Id': crypto.randomUUID()
      }
    });

    const text = await response.text();

    return res.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      endpoint: testUrl,
      bodyPreview: text.slice(0, 500)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Outbound integration test failed',
      error: error.message
    });
  }
});

router.post('/claims/submit', authenticateBrokerIntegration, async (req, res) => {
  try {
    const {
      externalClaimId,
      patientId,
      policyNumber,
      claimAmount,
      claimType,
      metadata = {}
    } = req.body;

    if (!externalClaimId || !patientId || !policyNumber || !claimAmount) {
      return res.status(400).json({
        success: false,
        message: 'externalClaimId, patientId, policyNumber, and claimAmount are required'
      });
    }

    return res.status(202).json({
      success: true,
      message: 'Claim received for processing',
      brokerId: req.brokerId,
      receivedAt: new Date().toISOString(),
      claim: {
        externalClaimId,
        patientId,
        policyNumber,
        claimAmount,
        claimType: claimType || 'standard',
        status: 'received',
        metadata
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to receive claim',
      error: error.message
    });
  }
});

router.post('/webhooks/claim-status', verifyBrokerWebhookSignature, async (req, res) => {
  try {
    const {
      externalClaimId,
      status,
      reason,
      insurerReference,
      updatedAt
    } = req.body;

    if (!externalClaimId || !status) {
      return res.status(400).json({
        success: false,
        message: 'externalClaimId and status are required'
      });
    }

    return res.status(202).json({
      success: true,
      message: 'Claim status webhook accepted',
      brokerId: req.brokerId,
      receivedAt: new Date().toISOString(),
      event: {
        externalClaimId,
        status,
        reason: reason || null,
        insurerReference: insurerReference || null,
        updatedAt: updatedAt || new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to process claim status webhook',
      error: error.message
    });
  }
});

router.post('/webhooks/member-eligibility', verifyBrokerWebhookSignature, async (req, res) => {
  try {
    const { memberId, policyNumber, eligible, notes } = req.body;

    if (!memberId || !policyNumber || typeof eligible !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'memberId, policyNumber, and eligible(boolean) are required'
      });
    }

    return res.status(202).json({
      success: true,
      message: 'Member eligibility webhook accepted',
      brokerId: req.brokerId,
      receivedAt: new Date().toISOString(),
      event: {
        memberId,
        policyNumber,
        eligible,
        notes: notes || null
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to process member eligibility webhook',
      error: error.message
    });
  }
});

export default router;
