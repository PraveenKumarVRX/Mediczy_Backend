import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { INSTALLATION_PROFILES, InstallationError, validateInstallation, validateReport, installationFreshness } from '../config/dedicated-installation-profiles.js';

const hash = value => createHash('sha256').update(value).digest('hex');

// Branding fields a dedicated installation accepts from the control plane (it rejects any other key, and
// any value that is not null or a string of at most 500 characters).
const BRANDING_KEYS = ['logo_url', 'favicon_url', 'primary_color', 'secondary_color'];
const publishableBranding = (branding) => {
  if (!branding || typeof branding !== 'object' || Array.isArray(branding)) return null;
  const out = {};
  for (const key of BRANDING_KEYS) {
    const value = branding[key];
    if (value === null || (typeof value === 'string' && value.length <= 500)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
};
const publicRow = row => {
  const { token_hash, ...rest } = row;
  return { ...rest, connector_enrolled: Boolean(token_hash), freshness: installationFreshness(row),
    scope_status: 'requested', billing_status: 'not_linked' };
};

export class DedicatedInstallationsService {
  constructor(pool) { this.pool = pool; }
  async transaction(fn) {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async audit(db, row, actor, action, changes) {
    await db.query(`INSERT INTO dedicated_installation_audit
      (installation_id, tenant_uid, actor_ref, action, changes) VALUES ($1,$2,$3,$4,$5)`,
    [row.id, row.tenant_uid, String(actor), action, JSON.stringify(changes)]);
  }
  async tenants(search = '') {
    const { rows } = await this.pool.query(`SELECT unique_id AS tenant_uid, name, type FROM tenants
      WHERE unique_id IS NOT NULL AND (name ILIKE $1 OR unique_id ILIKE $1) ORDER BY name LIMIT 50`, [`%${search.slice(0, 100)}%`]);
    return rows;
  }
  async list({ tenantUid, limit = 50, offset = 0 } = {}) {
    const { rows } = await this.pool.query(`SELECT i.*, t.name AS tenant_name FROM dedicated_installations i
      JOIN tenants t ON t.unique_id = i.tenant_uid WHERE ($1::text IS NULL OR i.tenant_uid = $1)
      ORDER BY i.created_at DESC, i.id LIMIT $2 OFFSET $3`, [tenantUid || null, limit, offset]);
    return rows.map(publicRow);
  }
  async detail(id) {
    const { rows } = await this.pool.query('SELECT * FROM dedicated_installations WHERE id=$1', [id]);
    if (!rows[0]) throw new InstallationError(404, 'not_found', 'Installation not found');
    const metrics = await this.pool.query(`SELECT day::text, observed_at, metrics FROM dedicated_installation_daily_metrics
      WHERE installation_id=$1 ORDER BY day DESC LIMIT 31`, [id]);
    const audit = await this.pool.query(`SELECT action, actor_ref, changes, created_at FROM dedicated_installation_audit
      WHERE installation_id=$1 ORDER BY id DESC LIMIT 50`, [id]);
    return { installation: publicRow(rows[0]), dailyMetrics: metrics.rows, audit: audit.rows };
  }
  async save(input, actor, id = null) {
    const value = validateInstallation(input);
    if (id && (!Number.isInteger(input.version) || input.version < 1)) throw new InstallationError(422, 'validation_failed', 'Current version is required');
    return this.transaction(async db => {
      const tenant = (await db.query('SELECT unique_id, type FROM tenants WHERE unique_id=$1', [value.tenantUid])).rows[0];
      if (!tenant || !INSTALLATION_PROFILES[value.profile].tenantTypes.includes(tenant.type)) throw new InstallationError(422, 'tenant_profile_mismatch', 'Select an existing organization compatible with this module profile');
      let before = null;
      if (id) {
        before = (await db.query('SELECT * FROM dedicated_installations WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!before) throw new InstallationError(404, 'not_found', 'Installation not found');
        if (before.version !== input.version) throw new InstallationError(409, 'version_conflict', 'Refresh the installation before saving');
        if (before.tenant_uid !== value.tenantUid || before.profile !== value.profile) throw new InstallationError(422, 'immutable_scope', 'Tenant and product profile cannot be changed; register a separate installation');
      }
      const args = [value.name, value.modules, value.domain, value.awsAccountId, value.region];
      const { rows } = id
        ? await db.query(`UPDATE dedicated_installations SET name=$1, modules=$2, domain=$3, aws_account_id=$4,
            region=$5, version=version+1, updated_at=NOW() WHERE id=$6 RETURNING *`, [...args, id])
        : await db.query(`INSERT INTO dedicated_installations (name,modules,domain,aws_account_id,region,id,tenant_uid,profile)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [...args, randomUUID(), value.tenantUid, value.profile]);
      const row = rows[0];
      await this.audit(db, row, actor, id ? 'configuration_updated' : 'registered', {
        before: before ? { name: before.name, modules: before.modules, domain: before.domain, awsAccountId: before.aws_account_id, region: before.region } : null,
        after: value,
      });
      return publicRow(row);
    });
  }
  async credential(id, version, actor, revoke = false) {
    if (!Number.isInteger(version) || version < 1) throw new InstallationError(422, 'validation_failed', 'Current version is required');
    return this.transaction(async db => {
      const row = (await db.query('SELECT * FROM dedicated_installations WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) throw new InstallationError(404, 'not_found', 'Installation not found');
      if (row.version !== version) throw new InstallationError(409, 'version_conflict', 'Refresh the installation before changing credentials');
      const token = revoke ? null : `mdi_${randomBytes(32).toString('hex')}`;
      const updated = (await db.query(`UPDATE dedicated_installations SET token_hash=$2, credential_rotated_at=NOW(),
        version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, token ? hash(token) : null])).rows[0];
      await this.audit(db, row, actor, revoke ? 'connector_revoked' : 'connector_rotated', {});
      return { installation: publicRow(updated), ...(token ? { token } : {}) };
    });
  }
  /**
   * GET /config: the settings a dedicated installation pulls from the control plane (it has no inbound
   * port). Contract, agreed with the installation (medstar-crm scripts/fetch-dedicated-config.mjs):
   * { revision, mobileApps, branding }, revision doubling as the ETag.
   *
   * Nothing is published unless the tenant record opts in per field: settings.dedicatedConfig.publish,
   * e.g. ["branding"]. The installation applies whatever it receives over its own copy, and on 2026-11-15
   * the central copies were stale (default branding with no logo; different app and deployment IDs, which
   * would break app sign-in). Reconcile a field with the installation, then add it to publish.
   */
  async config(token) {
    if (!/^mdi_[a-f0-9]{64}$/.test(token || '')) throw new InstallationError(401, 'invalid_connector', 'Invalid connector credential');
    const row = (await this.pool.query('SELECT id, tenant_uid FROM dedicated_installations WHERE token_hash=$1', [hash(token)])).rows[0];
    if (!row) throw new InstallationError(401, 'invalid_connector', 'Invalid connector credential');
    const tenant = (await this.pool.query('SELECT branding, settings FROM tenants WHERE unique_id=$1', [row.tenant_uid])).rows[0];
    const publish = Array.isArray(tenant?.settings?.dedicatedConfig?.publish) ? tenant.settings.dedicatedConfig.publish : [];
    const mobileApps = tenant?.settings?.mobileApps;
    const published = {
      mobileApps: publish.includes('mobileApps') && mobileApps && typeof mobileApps === 'object' && !Array.isArray(mobileApps) ? mobileApps : null,
      branding: publish.includes('branding') ? publishableBranding(tenant?.branding) : null,
    };
    return { revision: hash(JSON.stringify(published)).slice(0, 32), ...published };
  }

  async report(token, input) {
    if (!/^mdi_[a-f0-9]{64}$/.test(token || '')) throw new InstallationError(401, 'invalid_connector', 'Invalid connector credential');
    return this.transaction(async db => {
      // Lock serializes report ingestion with rotation/revocation and concurrent snapshots.
      const row = (await db.query('SELECT * FROM dedicated_installations WHERE token_hash=$1 FOR UPDATE', [hash(token)])).rows[0];
      if (!row) throw new InstallationError(401, 'invalid_connector', 'Invalid connector credential');
      const value = validateReport(input, row.profile);
      const digest = hash(JSON.stringify([value.observedAt, value.release, value.health, value.day, value.metrics]));
      const old = (await db.query('SELECT payload_hash FROM dedicated_installation_reports WHERE installation_id=$1 AND event_id=$2', [row.id, value.eventId])).rows[0];
      if (old) {
        if (old.payload_hash !== digest) throw new InstallationError(409, 'event_reuse', 'The event ID was already used for a different report');
        return { replayed: true, installationId: row.id };
      }
      await db.query(`INSERT INTO dedicated_installation_reports (installation_id,event_id,payload_hash,observed_at)
        VALUES ($1,$2,$3,$4)`, [row.id, value.eventId, digest, value.observedAt]);
      await db.query(`UPDATE dedicated_installations SET last_received_at=NOW(),
        release=CASE WHEN last_observed_at IS NULL OR last_observed_at < $2 THEN $3 ELSE release END,
        health=CASE WHEN last_observed_at IS NULL OR last_observed_at < $2 THEN $4 ELSE health END,
        last_observed_at=GREATEST(last_observed_at,$2::timestamptz) WHERE id=$1`, [row.id, value.observedAt, value.release, value.health]);
      // Reports are complete UTC-day snapshots, not deltas. Heartbeats with no metrics
      // cannot wipe a valid snapshot. Older deliveries never overwrite newer state.
      if (Object.keys(value.metrics).length) await db.query(`INSERT INTO dedicated_installation_daily_metrics
        (installation_id,day,observed_at,metrics) VALUES ($1,$2,$3,$4)
        ON CONFLICT (installation_id,day) DO UPDATE SET observed_at=EXCLUDED.observed_at, metrics=EXCLUDED.metrics
        WHERE dedicated_installation_daily_metrics.observed_at < EXCLUDED.observed_at`, [row.id, value.day, value.observedAt, JSON.stringify(value.metrics)]);
      return { replayed: false, installationId: row.id };
    });
  }
}
