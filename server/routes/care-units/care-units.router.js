/** Operator administration of care units (outreach clinics, medical centres, OHCs). Mounted at /api/care-units. Pure factory: auth is injected. */
import express from 'express';
import { handle, send } from '../lab/collection-http.js';

export function buildCareUnitsRouter({ service, authenticate }) {
  const router = express.Router();
  router.use(authenticate);   // sets req.operator = { type: 'operator', ownerUid, ref }
  const P = (req) => req.operator;

  router.get('/', handle(async (req, res) => res.json({ success: true, ...(await service.list(P(req), req.query)) })));
  router.post('/', handle(async (req, res) => send(res, await service.createUnit(P(req), req.body))));
  router.get('/:uid', handle(async (req, res) => res.json({ success: true, ...(await service.get(P(req), req.params.uid)) })));
  router.patch('/:uid', handle(async (req, res) => send(res, await service.updateUnit(P(req), req.params.uid, req.body))));
  router.get('/:uid/staff', handle(async (req, res) => res.json({ success: true, ...(await service.listStaff(P(req), req.params.uid)) })));
  router.post('/:uid/staff', handle(async (req, res) => send(res, await service.assignStaff(P(req), req.params.uid, req.body))));
  router.delete('/:uid/staff/:userUid', handle(async (req, res) => send(res, await service.removeStaff(P(req), req.params.uid, req.params.userUid))));
  router.post('/:uid/end-contract', handle(async (req, res) => send(res, await service.endContract(P(req), req.params.uid, req.body))));
  router.get('/:uid/access-log', handle(async (req, res) => res.json({ success: true, ...(await service.accessLog(P(req), req.params.uid, req.query)) })));
  return router;
}
