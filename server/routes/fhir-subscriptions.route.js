/**
 * FHIR R4 Subscription Routes — ITEM-23
 *
 * Implements the FHIR Subscription resource interactions:
 *   POST   /fhir/Subscription       — create
 *   GET    /fhir/Subscription       — search/list
 *   GET    /fhir/Subscription/:id   — read
 *   DELETE /fhir/Subscription/:id   — cancel (sets status = 'off')
 *
 * Content-Type: application/fhir+json
 * Auth: Bearer JWT via authUser middleware
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import fhirSubscriptionService from '../services/fhir-subscription.service.js';

const router = express.Router();

// ── Content-Type + FHIR headers ──────────────────────────────────────────────
router.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/fhir+json; charset=utf-8');
  res.setHeader('X-FHIR-Version', '4.0.1');
  next();
});

// ── OperationOutcome builder ──────────────────────────────────────────────────
function outcome(severity, code, diagnostics) {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity, code, diagnostics }],
  };
}

// ── POST /fhir/Subscription — create ─────────────────────────────────────────
router.post('/', authUser, async (req, res) => {
  try {
    const body = req.body || {};

    // Accept both flat JSON and FHIR Subscription resource shape
    const criteria =
      body.criteria || (body.resourceType === 'Subscription' ? body.criteria : undefined);
    const channel = body.channel || {};
    const channel_type = body.channel_type || channel.type;
    const channel_endpoint = body.channel_endpoint || channel.endpoint || null;
    const channel_payload =
      body.channel_payload || channel.payload || 'application/fhir+json';
    const reason = body.reason || null;
    const contact = body.contact || null;
    const end_date = body.end || body.end_date || null;

    if (!criteria) {
      return res
        .status(400)
        .json(outcome('error', 'required', 'Missing required field: criteria'));
    }

    const validChannelTypes = ['rest-hook', 'websocket', 'email'];
    if (!channel_type || !validChannelTypes.includes(channel_type)) {
      return res.status(400).json(
        outcome(
          'error',
          'value',
          `channel.type must be one of: ${validChannelTypes.join(', ')}`
        )
      );
    }

    if (channel_type === 'rest-hook' && !channel_endpoint) {
      return res
        .status(400)
        .json(
          outcome('error', 'required', 'channel.endpoint is required for rest-hook subscriptions')
        );
    }

    const subscription = await fhirSubscriptionService.createSubscription({
      criteria,
      channel_type,
      channel_endpoint,
      channel_payload,
      reason,
      contact,
      end_date,
    });

    return res
      .status(201)
      .location(`/api/fhir/r4/Subscription/${subscription.id}`)
      .json(subscription);
  } catch (err) {
    console.error('[fhir-subscriptions] POST /fhir/Subscription error:', err);
    return res
      .status(500)
      .json(outcome('error', 'exception', err.message || 'Internal server error'));
  }
});

// ── GET /fhir/Subscription — list / search ────────────────────────────────────
router.get('/', authUser, async (req, res) => {
  try {
    const filters = {};

    if (req.query.status) {
      filters.status = req.query.status;
    }

    if (req.query.criteria) {
      filters.criteria = req.query.criteria;
    }

    const bundle = await fhirSubscriptionService.listSubscriptions(filters);
    return res.json(bundle);
  } catch (err) {
    console.error('[fhir-subscriptions] GET /fhir/Subscription error:', err);
    return res
      .status(500)
      .json(outcome('error', 'exception', err.message || 'Internal server error'));
  }
});

// ── GET /fhir/Subscription/:id — read ────────────────────────────────────────
router.get('/:id', authUser, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res
        .status(400)
        .json(outcome('error', 'value', 'Subscription id must be a positive integer'));
    }

    const subscription = await fhirSubscriptionService.getSubscription(id);

    if (!subscription) {
      return res
        .status(404)
        .json(outcome('error', 'not-found', `Subscription/${id} not found`));
    }

    return res.json(subscription);
  } catch (err) {
    console.error('[fhir-subscriptions] GET /fhir/Subscription/:id error:', err);
    return res
      .status(500)
      .json(outcome('error', 'exception', err.message || 'Internal server error'));
  }
});

// ── DELETE /fhir/Subscription/:id — cancel ───────────────────────────────────
router.delete('/:id', authUser, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res
        .status(400)
        .json(outcome('error', 'value', 'Subscription id must be a positive integer'));
    }

    const subscription = await fhirSubscriptionService.cancelSubscription(id);

    if (!subscription) {
      return res
        .status(404)
        .json(outcome('error', 'not-found', `Subscription/${id} not found`));
    }

    // FHIR DELETE: 200 with the updated resource (status='off') per R4 spec §2.21.0.3
    return res.status(200).json(subscription);
  } catch (err) {
    console.error('[fhir-subscriptions] DELETE /fhir/Subscription/:id error:', err);
    return res
      .status(500)
      .json(outcome('error', 'exception', err.message || 'Internal server error'));
  }
});

export default router;
