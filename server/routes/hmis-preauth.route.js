/**
 * Deprecated 2026-08-15 — consolidated into `pre_authorizations`.
 * This route had zero confirmed callers (no client UI, no ADT/OT workflow ever
 * wired to it); kept as a 410 stub instead of deleting outright in case an
 * external caller (e.g. a saved API collection) still points here.
 */
import express from 'express';

const router = express.Router();

router.all('*', (req, res) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint moved. Pre-authorization is unified under /api/hospital/insurance/pre-auth/*.',
  });
});

export default router;
