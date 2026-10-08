/**
 * GPU scheduler metrics (superadmin only).
 *
 *   GET /api/ai/gpu/metrics — live in-process saturation and circuit-breaker state
 *   GET /api/ai/gpu/stats   — DB-backed history (needs migrations/20261008000100-ai-gpu-scheduler-log.sql)
 *
 * The scheduler itself only runs when AI_GPU_SCHEDULER_ENABLED=true; with it off the
 * counters stay at zero.
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { getMetrics, getDbStats, GPU } from '../services/ai-brain/gpu-scheduler.service.js';
import { getMetrics as getEmbedMetrics } from '../services/embedding.service.js';

const router = express.Router();
const requireAdmin = [authUser, requireRole('superadmin')];

router.get('/metrics', requireAdmin, (req, res) => {
  const metrics = getMetrics();
  const gpuList = Object.values(GPU);
  const anyCircuitOpen = gpuList.some((g) => metrics[g]?.circuitOpen);
  const anySaturated = gpuList.some((g) => metrics[g]?.utilizationPct >= 80);

  res.json({
    ts: new Date().toISOString(),
    schedulerEnabled: String(process.env.AI_GPU_SCHEDULER_ENABLED || '').toLowerCase() === 'true',
    status: anyCircuitOpen ? 'degraded' : (anySaturated ? 'warning' : 'healthy'),
    gpus: metrics,
    embeddings: getEmbedMetrics(),
    summary: {
      totalActiveRequests: gpuList.reduce((s, g) => s + (metrics[g]?.active || 0), 0),
      totalQueuedRequests: gpuList.reduce((s, g) => s + (metrics[g]?.queued || 0), 0),
      anyCircuitOpen,
      anySaturated,
    },
  });
});

router.get('/stats', requireAdmin, async (req, res) => {
  const hours = Math.min(Math.max(parseInt(req.query.hours || '24', 10) || 24, 1), 24 * 30);
  res.json({ hours, rows: await getDbStats(hours) });
});

export default router;
