/**
 * SFTP / FTPS File Exchange API
 *
 * All routes require authentication. Partner credential management is
 * tenant-scoped. Credentials are stored AES-256-GCM encrypted.
 *
 * GET    /api/sftp/connections              List SFTP connections for tenant
 * POST   /api/sftp/connections              Register new SFTP partner
 * GET    /api/sftp/connections/:id          Connection detail + last health
 * PATCH  /api/sftp/connections/:id          Update connection config
 * DELETE /api/sftp/connections/:id          Remove connection
 * POST   /api/sftp/connections/:id/test     Test connectivity (validate config)
 * POST   /api/sftp/transfer/upload          Enqueue outbound file transfer
 * POST   /api/sftp/transfer/download        Enqueue inbound file retrieval
 * GET    /api/sftp/transfer/queue/:id       Queue state for a connection
 * GET    /api/sftp/transfers                Transfer history (tenant-wide)
 *
 * Standards: IHE XDR, HIPAA §164.312(e)(2)(ii)
 */

import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  ensureSftpTables,
  createConnection,
  listConnections,
  getConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  enqueueTransfer,
  getTransferQueue,
  listTransfers,
} from '../services/sftp-adapter.service.js';

const router = Router();

// Bootstrap DB tables on import (idempotent)
ensureSftpTables().catch(e => console.warn('[SFTP] Table init warning:', e.message));

// All routes require a logged-in user
router.use(authUser);

const tenantId = (req) => req.user?.tenant_id || req.user?.organization_id || req.user?.id;

// ── List connections ──────────────────────────────────────────────────────────
router.get('/connections', async (req, res) => {
  try {
    const connections = await listConnections(tenantId(req));
    res.json({ success: true, connections });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Register connection ───────────────────────────────────────────────────────
router.post('/connections', requireRole('hospital_admin', 'admin', 'super_admin'), async (req, res) => {
  try {
    const { name, partnerType, host, port, username, authType, password, privateKey, remoteBaseDir, protocol } = req.body;
    if (!host || !name) return res.status(400).json({ success: false, message: 'host and name are required' });
    const conn = await createConnection(tenantId(req), { name, partnerType, host, port, username, authType, password, privateKey, remoteBaseDir, protocol });
    res.status(201).json({ success: true, connection: conn });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get connection detail ─────────────────────────────────────────────────────
router.get('/connections/:id', async (req, res) => {
  try {
    const conn = await getConnection(Number(req.params.id), tenantId(req));
    // Never expose decrypted credentials in response
    const { password_enc, private_key_enc, ...safe } = conn;
    res.json({ success: true, connection: { ...safe, hasPassword: !!password_enc, hasPrivateKey: !!private_key_enc } });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Update connection ─────────────────────────────────────────────────────────
router.patch('/connections/:id', requireRole('hospital_admin', 'admin', 'super_admin'), async (req, res) => {
  try {
    const conn = await updateConnection(Number(req.params.id), tenantId(req), req.body);
    res.json({ success: true, connection: conn });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message });
  }
});

// ── Delete connection ─────────────────────────────────────────────────────────
router.delete('/connections/:id', requireRole('hospital_admin', 'admin', 'super_admin'), async (req, res) => {
  try {
    await deleteConnection(Number(req.params.id), tenantId(req));
    res.json({ success: true, message: 'Connection removed' });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Test connectivity ─────────────────────────────────────────────────────────
router.post('/connections/:id/test', async (req, res) => {
  try {
    const result = await testConnection(Number(req.params.id), tenantId(req));
    const httpStatus = result.status === 'config_error' ? 422 : 200;
    res.status(httpStatus).json({ success: result.status !== 'config_error', ...result });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Enqueue upload (outbound) ─────────────────────────────────────────────────
router.post('/transfer/upload', async (req, res) => {
  try {
    const { connectionId, remotePath, localPath, fileName, fileSizeBytes, metadata } = req.body;
    if (!connectionId || !remotePath) return res.status(400).json({ success: false, message: 'connectionId and remotePath are required' });
    // Verify connection belongs to this tenant
    await getConnection(Number(connectionId), tenantId(req));
    const transfer = await enqueueTransfer(Number(connectionId), 'upload', remotePath, { localPath, fileName, fileSizeBytes, metadata });
    res.status(202).json({ success: true, transfer, message: 'Upload enqueued' });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message });
  }
});

// ── Enqueue download (inbound) ────────────────────────────────────────────────
router.post('/transfer/download', async (req, res) => {
  try {
    const { connectionId, remotePath, localPath, fileName, metadata } = req.body;
    if (!connectionId || !remotePath) return res.status(400).json({ success: false, message: 'connectionId and remotePath are required' });
    await getConnection(Number(connectionId), tenantId(req));
    const transfer = await enqueueTransfer(Number(connectionId), 'download', remotePath, { localPath, fileName, metadata });
    res.status(202).json({ success: true, transfer, message: 'Download enqueued' });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message });
  }
});

// ── Queue state for a connection ──────────────────────────────────────────────
router.get('/transfer/queue/:connectionId', async (req, res) => {
  try {
    await getConnection(Number(req.params.connectionId), tenantId(req));
    const queue = await getTransferQueue(Number(req.params.connectionId));
    res.json({ success: true, queue, total: queue.length });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Transfer history ──────────────────────────────────────────────────────────
router.get('/transfers', async (req, res) => {
  try {
    const { status, direction, limit } = req.query;
    const transfers = await listTransfers(tenantId(req), { status, direction, limit });
    res.json({ success: true, transfers, total: transfers.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
