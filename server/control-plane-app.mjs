/**
 * Control Plane API - Standalone Entry Point
 * Runs as an ECS Fargate service; exposes superadmin tenant management endpoints.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import superAdminTenantRouter from './routes/super-admin-tenant.route.js';
import superadminClinicRouter from './routes/superadmin-clinic.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://mediczy.in,https://www.mediczy.in,https://app.mediqzy.com').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o.trim()))) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'control-plane-api' }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/superadmin/tenants', superAdminTenantRouter);
app.use('/api/superadmin/clinics', superadminClinicRouter);

// ── Serve React frontend (SPA) ────────────────────────────────────────────────
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Control Plane API listening on :${PORT}`);
});
