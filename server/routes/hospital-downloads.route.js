/**
 * Public hospital documentation downloads (Word / PowerPoint).
 * No auth — marketing / ops collateral for greenfield deployments.
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOAD_DIR = path.join(__dirname, '../public/downloads/hospital');

const FILES = [
  {
    id: 'workflow-charts-docx',
    filename: 'MediQzy_Hospital_OS_Workflow_Charts.docx',
    title: 'Hospital OS — Patient & Operations Workflow Charts (Word)',
    format: 'docx',
  },
  {
    id: 'workflow-charts-pptx',
    filename: 'MediQzy_Hospital_OS_Workflow_Charts.pptx',
    title: 'Hospital OS — Patient & Operations Workflow Charts (PowerPoint)',
    format: 'pptx',
  },
  {
    id: 'gaps-docx',
    filename: 'MediQzy_Greenfield_Hospital_Gaps_Implementation.docx',
    title: 'Greenfield Hospital — Gaps Implementation (Word)',
    format: 'docx',
  },
  {
    id: 'gaps-pptx',
    filename: 'MediQzy_Greenfield_Hospital_Gaps_Implementation.pptx',
    title: 'Greenfield Hospital — Gaps Implementation (PowerPoint)',
    format: 'pptx',
  },
];

const ALLOWED = new Set(FILES.map((f) => f.filename));

const MIME = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const router = express.Router();

router.get('/', (_req, res) => {
  const files = FILES.map((f) => {
    const fp = path.join(DOWNLOAD_DIR, f.filename);
    const exists = fs.existsSync(fp);
    return {
      ...f,
      exists,
      sizeBytes: exists ? fs.statSync(fp).size : 0,
      url: `/api/downloads/hospital/${encodeURIComponent(f.filename)}`,
    };
  });
  res.json({
    success: true,
    description: 'MediQzy Hospital OS documentation — public downloads',
    files,
  });
});

router.get('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!ALLOWED.has(filename)) {
    return res.status(404).json({ success: false, message: 'Unknown file' });
  }
  const filePath = path.join(DOWNLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'File not deployed on this server yet. Pull latest release or run scripts/docs/export-hospital-docs.sh',
      filename,
    });
  }
  const ext = path.extname(filename).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

export default router;
