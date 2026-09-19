/**
 * Asset Tracking Service
 * =================================================================
 * Two event paths:
 *   - Manual: staff record events through recordEvent(); source is always
 *     'manual' (client-supplied source is ignored).
 *   - Reader: a registered reader device authenticates with an API key
 *     (authenticateReader) and pushes batches via ingestReaderScans(), the
 *     only path that writes source='reader'. No physical reader hardware is
 *     deployed yet; this side is ready for any RFID/IoT gateway.
 */

import crypto from 'crypto';
import pool from '../db/pgPool.js';

const READER_DEVICE_COLUMNS = `id, organization_id, device_name, location, is_active, last_seen_at, created_by, created_at`;
const READER_MAX_SCANS = 500;
const READER_ALLOWED_EVENT_TYPES = new Set(['location_update', 'checkin', 'checkout', 'found']);
const READER_DEDUPE_SECONDS = 5;
const READER_MAX_PAST_MS = 24 * 60 * 60 * 1000;
const READER_MAX_FUTURE_MS = 5 * 60 * 1000;

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey)).digest('hex');
}

// Device-reported time is untrusted: accept only [now-24h, now+5min], else use server time.
function clampScannedAt(value, nowMs) {
  if (value === undefined || value === null || value === '') return new Date(nowMs);
  const t = new Date(value).getTime();
  if (!Number.isFinite(t) || t < nowMs - READER_MAX_PAST_MS || t > nowMs + READER_MAX_FUTURE_MS) {
    return new Date(nowMs);
  }
  return new Date(t);
}

class AssetTrackingService {
  async registerTag({ organizationId, tagUid, assetType, label, linkedEntityType, linkedEntityId, registeredBy }) {
    const existing = await pool.query(
      `SELECT id FROM asset_tag WHERE organization_id = $1 AND tag_uid = $2`,
      [organizationId, tagUid]
    );
    if (existing.rows[0]) {
      throw new Error('Tag already registered');
    }
    const { rows } = await pool.query(
      `INSERT INTO asset_tag (organization_id, tag_uid, asset_type, label, linked_entity_type, linked_entity_id, registered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [organizationId, tagUid, assetType, label || null, linkedEntityType || null, linkedEntityId || null, registeredBy || null]
    );
    return rows[0];
  }

  async listTags(organizationId, { assetType = null, status = null } = {}) {
    const conditions = ['organization_id = $1'];
    const params = [organizationId];
    if (assetType) {
      params.push(assetType);
      conditions.push(`asset_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT * FROM asset_tag WHERE ${conditions.join(' AND ')} ORDER BY registered_at DESC`,
      params
    );
    return rows;
  }

  async getTagByUid(organizationId, tagUid) {
    const { rows } = await pool.query(
      `SELECT * FROM asset_tag WHERE organization_id = $1 AND tag_uid = $2`,
      [organizationId, tagUid]
    );
    const tag = rows[0];
    if (!tag) return null;
    const { rows: events } = await pool.query(
      `SELECT * FROM asset_tag_event WHERE tag_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [tag.id]
    );
    return { ...tag, recentEvents: events };
  }

  // Events created here come from the authenticated staff endpoint, so the source
  // is ALWAYS 'manual' — a client-supplied `source` is ignored on purpose. Only the
  // reader-authenticated path (ingestReaderScans) may write source='reader'.
  async recordEvent({ tagId, eventType, location, notes, recordedBy }) {
    const { rows } = await pool.query(
      `INSERT INTO asset_tag_event (tag_id, event_type, location, notes, source, recorded_by)
       VALUES ($1, $2, $3, $4, 'manual', $5)
       RETURNING *`,
      [tagId, eventType, location || null, notes || null, recordedBy || null]
    );
    return rows[0];
  }

  async updateTagStatus(tagId, status) {
    const { rows } = await pool.query(
      `UPDATE asset_tag SET status = $2 WHERE id = $1 RETURNING *`,
      [tagId, status]
    );
    return rows[0];
  }

  async getLastKnownLocation(tagId) {
    const { rows } = await pool.query(
      `SELECT * FROM asset_tag_event WHERE tag_id = $1 AND location IS NOT NULL ORDER BY recorded_at DESC LIMIT 1`,
      [tagId]
    );
    return rows[0] || null;
  }

  async getStats(organizationId) {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM asset_tag WHERE organization_id = $1 GROUP BY status`,
      [organizationId]
    );
    const stats = { totalTags: 0, active: 0, lost: 0, retired: 0 };
    for (const row of rows) {
      stats.totalTags += row.count;
      if (row.status in stats) stats[row.status] = row.count;
    }
    return stats;
  }

  // ── Reader devices ───────────────────────────────────────────────────────
  // The plaintext API key is returned once from registerReaderDevice() and is
  // never stored; only its sha256 hash is persisted.

  async registerReaderDevice({ organizationId, deviceName, location, createdBy }) {
    if (!deviceName || !String(deviceName).trim()) {
      throw new Error('deviceName is required');
    }
    const apiKey = crypto.randomBytes(32).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO asset_reader_device (organization_id, device_name, location, api_key_hash, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${READER_DEVICE_COLUMNS}`,
      [organizationId, String(deviceName).trim(), location || null, hashApiKey(apiKey), createdBy || null]
    );
    return { device: rows[0], apiKey };
  }

  async listReaderDevices(organizationId) {
    const { rows } = await pool.query(
      `SELECT ${READER_DEVICE_COLUMNS} FROM asset_reader_device
        WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );
    return rows;
  }

  async deactivateReaderDevice(id, organizationId) {
    const { rows } = await pool.query(
      `UPDATE asset_reader_device SET is_active = false
        WHERE id = $1 AND organization_id = $2
        RETURNING ${READER_DEVICE_COLUMNS}`,
      [id, organizationId]
    );
    return rows[0] || null;
  }

  // Returns the active device row (without the hash) or null. Matching is done on
  // the sha256 hash, so the plaintext key is never compared or logged.
  async authenticateReader(apiKey) {
    if (typeof apiKey !== 'string' || !apiKey || apiKey.length > 256) return null;
    const { rows } = await pool.query(
      `UPDATE asset_reader_device SET last_seen_at = NOW()
        WHERE api_key_hash = $1 AND is_active = true
        RETURNING ${READER_DEVICE_COLUMNS}`,
      [hashApiKey(apiKey)]
    );
    return rows[0] || null;
  }

  /**
   * Ingest a batch of reader scans for an authenticated device.
   * scans: [{ tagUid, eventType = 'location_update', rssi, scannedAt }] (max 500)
   * Unknown tags are counted and skipped (never auto-created); retired tags are
   * skipped silently (counted as rejected).
   * Returns { accepted, duplicates, unknownTags, rejected }.
   */
  async ingestReaderScans({ device, scans }) {
    if (!device?.id || !device.organization_id) throw new Error('Authenticated reader device required');
    if (!Array.isArray(scans)) throw new Error('scans must be an array');
    if (scans.length > READER_MAX_SCANS) throw new Error(`A maximum of ${READER_MAX_SCANS} scans per request is allowed`);

    const result = { accepted: 0, duplicates: 0, unknownTags: 0, rejected: 0 };
    const nowMs = Date.now();

    // 1. Normalise / validate each scan
    const candidates = [];
    for (const scan of scans) {
      const tagUid = typeof scan?.tagUid === 'string' ? scan.tagUid.trim() : '';
      const eventType = scan?.eventType || 'location_update';
      if (!tagUid || tagUid.length > 200 || !READER_ALLOWED_EVENT_TYPES.has(eventType)) {
        result.rejected++;
        continue;
      }
      const rssiNum = Number(scan.rssi);
      candidates.push({
        tagUid,
        eventType,
        rssi: scan.rssi === undefined || scan.rssi === null || !Number.isFinite(rssiNum) ? null : Math.round(rssiNum),
        scannedAt: clampScannedAt(scan.scannedAt, nowMs),
      });
    }
    if (candidates.length === 0) return result;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialise concurrent batches from the same device so de-duplication is race-free.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), $2)', ['asset_reader_ingest', device.id]);

      // 2. Batched tag lookup (org-scoped)
      const uids = [...new Set(candidates.map((c) => c.tagUid))];
      const { rows: tagRows } = await client.query(
        `SELECT id, tag_uid, status FROM asset_tag WHERE organization_id = $1 AND tag_uid = ANY($2::text[])`,
        [device.organization_id, uids]
      );
      const tagByUid = new Map(tagRows.map((t) => [t.tag_uid, t]));

      const resolved = [];
      for (const c of candidates) {
        const tag = tagByUid.get(c.tagUid);
        if (!tag) { result.unknownTags++; continue; }
        if (tag.status === 'retired') { result.rejected++; continue; }
        resolved.push({ ...c, tagId: tag.id });
      }
      if (resolved.length === 0) {
        await client.query('COMMIT');
        return result;
      }

      // 3. De-duplicate against existing events from this device
      const tagIds = [...new Set(resolved.map((r) => r.tagId))];
      const { rows: existing } = await client.query(
        `SELECT tag_id, scanned_at, (recorded_at > NOW() - make_interval(secs => $3)) AS is_recent
           FROM asset_tag_event
          WHERE reader_device_id = $1 AND tag_id = ANY($2::int[])
            AND (recorded_at > NOW() - make_interval(secs => $3) OR scanned_at = ANY($4::timestamptz[]))`,
        [device.id, tagIds, READER_DEDUPE_SECONDS, resolved.map((r) => r.scannedAt)]
      );
      const recentTags = new Set();
      const seen = new Set();
      for (const row of existing) {
        if (row.is_recent) recentTags.add(row.tag_id);
        if (row.scanned_at) seen.add(`${row.tag_id}|${new Date(row.scanned_at).getTime()}`);
      }

      const toInsert = [];
      for (const r of resolved) {
        const key = `${r.tagId}|${r.scannedAt.getTime()}`;
        if (recentTags.has(r.tagId) || seen.has(key)) { result.duplicates++; continue; }
        seen.add(key); // identical (tag, device, scannedAt) later in the same batch
        toInsert.push(r);
      }

      // 4. Single bulk insert
      if (toInsert.length > 0) {
        await client.query(
          `INSERT INTO asset_tag_event (tag_id, event_type, location, source, reader_device_id, rssi, scanned_at)
           SELECT t.tag_id, t.event_type, $1, 'reader', $2, t.rssi, t.scanned_at
             FROM unnest($3::int[], $4::text[], $5::int[], $6::timestamptz[]) AS t(tag_id, event_type, rssi, scanned_at)`,
          [
            device.location || null,
            device.id,
            toInsert.map((r) => r.tagId),
            toInsert.map((r) => r.eventType),
            toInsert.map((r) => r.rssi),
            toInsert.map((r) => r.scannedAt),
          ]
        );
        result.accepted = toInsert.length;
      }

      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export default new AssetTrackingService();
