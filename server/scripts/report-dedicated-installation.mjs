#!/usr/bin/env node
// One report per invocation. The caller retains the same report file/eventId on retry.
// No application environment loader, database access, or patient-data extraction.
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateReport, INSTALLATION_PROFILES } from '../config/dedicated-installation-profiles.js';

export async function sendInstallationReport({ origin, token, profile, report, fetcher = fetch }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Control-plane URL must be an HTTPS origin');
  if (!Object.hasOwn(INSTALLATION_PROFILES, profile)) throw new Error('Explicit CRM or lab profile required');
  if (!/^mdi_[a-f0-9]{64}$/.test(token)) throw new Error('Invalid connector credential');
  const payload = validateReport(report, profile);
  const response = await fetcher(new URL('/api/admin/dedicated-installations/reports', url), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Report rejected (HTTP ${response.status}); retain the report file for reconciliation`);
  const result = await response.json();
  if (result.success !== true) throw new Error('Control plane did not acknowledge the report');
  return { success: true, replayed: result.replayed === true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { DEDICATED_CONTROL_PLANE_URL, DEDICATED_CONNECTOR_TOKEN_FILE, DEDICATED_PROFILE } = process.env;
    if (!DEDICATED_CONTROL_PLANE_URL || !DEDICATED_CONNECTOR_TOKEN_FILE || !process.argv[2]) throw new Error('Supply control-plane origin, token file, profile and persisted JSON report file');
    const info = await stat(DEDICATED_CONNECTOR_TOKEN_FILE);
    if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('Credential file must be private (mode 0600 or 0400)');
    const token = (await readFile(DEDICATED_CONNECTOR_TOKEN_FILE, 'utf8')).trim();
    const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
    console.log(JSON.stringify(await sendInstallationReport({ origin: DEDICATED_CONTROL_PLANE_URL, token, profile: DEDICATED_PROFILE, report })));
  } catch (error) {
    // Do not print provider response bodies, request bodies or credentials.
    console.error(error.message?.startsWith('Report rejected') ? error.message : 'Reporting failed. Check configuration, private credential file and aggregate report schema.');
    process.exitCode = 1;
  }
}
