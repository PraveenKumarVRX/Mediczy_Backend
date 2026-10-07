/**
 * Lab-portal collection operations (dispatch, receipt, exceptions, reporting). Mounted at /api/lab/collection.
 *
 * The lab is identified by its login token and resolved to its uid on the server. There is no tenantId in the
 * URL, header or localStorage to trust — which is exactly the claim the legacy home-collection page relied on.
 */
import express from 'express';
import { toCsv } from '../../services/collection/collection.service.js';
import { forbidden } from '../../services/collection/errors.js';
import { handle, send, operationMeta } from './collection-http.js';

/** Pure router factory: authentication and owner resolution are injected so tests can drive it without a lab login. */
export function buildLabCollectionRouter({ collectionService, phlebotomistService, authenticate, resolveOwner }) {
  const router = express.Router();
  router.use(authenticate);
  router.use(resolveOwner);

  const P = (req) => req.collector;

  // ── dispatch board ─────────────────────────────────────────────────────────
  router.get('/ops', handle(async (req, res) => {
    res.json({ success: true, ...(await collectionService.board(P(req), req.query)) });
  }));

  router.get('/kpis', handle(async (req, res) => {
    res.json({ success: true, ...(await collectionService.kpis(P(req), { days: req.query.days })) });
  }));

  router.get('/partners', handle(async (req, res) => {
    res.json({ success: true, ...(await collectionService.partners(P(req))) });
  }));

  router.get('/export.csv', handle(async (req, res) => {
    const rows = await collectionService.exportRows(P(req), { from: req.query.from, to: req.query.to });
    const cols = ['id', 'mode', 'status', 'priority', 'source_kind', 'collector', 'specimens', 'rejected_specimens', 'created_at', 'collected_at', 'closed_at'];
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="collection-tasks.csv"').send(toCsv(rows, cols));
  }));

  router.post('/tasks', handle(async (req, res) => {
    send(res, await collectionService.createTask({ principal: P(req), input: req.body, ...operationMeta(req) }));
  }));

  router.get('/tasks/:id', handle(async (req, res) => {
    res.json({ success: true, ...(await collectionService.getTask(P(req), req.params.id)) });
  }));

  router.get('/tasks/:id/timeline', handle(async (req, res) => {
    res.json({ success: true, ...(await collectionService.timeline(P(req), req.params.id)) });
  }));

  for (const command of ['assign', 'reassign', 'cancel']) {
    router.post(`/tasks/:id/${command}`, handle(async (req, res) => {
      const { expectedVersion, ...payload } = req.body || {};
      send(res, await collectionService.command({
        principal: P(req), command, taskId: req.params.id, expectedVersion, payload, ...operationMeta(req),
      }));
    }));
  }

  router.post('/tasks/:id/redraw', handle(async (req, res) => {
    send(res, await collectionService.requestRedraw({ principal: P(req), taskId: req.params.id, input: req.body, ...operationMeta(req) }));
  }));

  // ── lab receipt ────────────────────────────────────────────────────────────
  router.post('/specimens/:id/receive', handle(async (req, res) => {
    send(res, await collectionService.receiveSpecimen({ principal: P(req), specimenId: req.params.id, input: req.body, ...operationMeta(req) }));
  }));

  // ── exceptions ─────────────────────────────────────────────────────────────
  router.get('/exceptions', handle(async (req, res) => {
    res.json({ success: true, ...(await collectionService.listExceptions(P(req), { status: req.query.status, limit: req.query.limit })) });
  }));

  router.post('/exceptions/:id/resolve', handle(async (req, res) => {
    send(res, await collectionService.resolveException({ principal: P(req), exceptionId: req.params.id, input: req.body, ...operationMeta(req) }));
  }));

  // ── collectors ─────────────────────────────────────────────────────────────
  router.get('/phlebotomists', handle(async (req, res) => {
    res.json({ success: true, ...(await phlebotomistService.list(P(req))) });
  }));

  router.post('/phlebotomists', handle(async (req, res) => {
    res.status(201).json({ success: true, phlebotomist: await phlebotomistService.create(P(req), req.body) });
  }));

  router.patch('/phlebotomists/:id/membership', handle(async (req, res) => {
    res.json({ success: true, ...(await phlebotomistService.updateMembership(P(req), req.params.id, req.body)) });
  }));

  router.post('/phlebotomists/:id/reset-password', handle(async (req, res) => {
    res.json({ success: true, ...(await phlebotomistService.resetPassword(P(req), req.params.id, req.body)) });
  }));



  return router;
}
