/** GAP-API-001 / GAP-API-002 — Hospital HMIS OpenAPI (public integrator catalog) */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.get('/hospital-openapi.json', (_req, res) => {
  const yamlPath = path.join(__dirname, '../docs/hmis-openapi.yaml');
  const integratorPath = path.join(__dirname, '../docs/hospital-integrator-openapi.yaml');
  res.json({
    openapi: '3.0.3',
    info: { title: 'MediQzy HMIS API', version: '1.0.0', description: 'Greenfield hospital integrator contract' },
    sources: { hmis: fs.existsSync(yamlPath), integrator: fs.existsSync(integratorPath) },
    paths: {
      '/api/v1/adt/admit': { post: { summary: 'Admit patient (A01)' } },
      '/api/v1/adt/discharge': { post: { summary: 'Discharge (A03)' } },
      '/api/v1/beds/map': { get: { summary: 'Bed map' } },
      '/api/v1/emar/administer': { post: { summary: 'eMAR administer + pharmacy queue' } },
      '/api/v1/er/register': { post: { summary: 'ER registration' } },
      '/api/v1/charge-master/charges': { get: { summary: 'Charge master' } },
      '/api/v1/queue/checkin': { post: { summary: 'Unified queue' } },
      '/api/display/kiosk/register': { post: { summary: 'Paperless kiosk registration' } },
    },
  });
});

export default router;
