/**
 * Exercises the HFR/HPR client code against a LOCAL mock ABDM gateway: auth
 * handshake, request bodies/headers, local persistence, status refresh, and
 * failure handling. It proves OUR code behaves correctly; it cannot prove NHA's
 * real endpoint paths/fields (those need sandbox credentials).
 * Run against a local DB only (see verify-waba-webhook.mjs header).
 */
import http from 'http';

const seen = [];
let failRegister = false;
const gateway = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, hip: req.headers['x-hip-id'], body: raw ? JSON.parse(raw) : null });
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/v0.5/sessions') return send(200, { accessToken: 'mock-token', expiresIn: 1800 });
    if (req.url === '/v1/facility/register') return failRegister ? send(500, { error: 'boom' }) : send(200, { facilityId: 'HFR-MOCK-1' });
    if (req.url.startsWith('/v1/facility/status/')) return send(200, { status: 'approved' });
    if (req.url === '/v1/hpr/register') return send(200, { hprId: 'HPR-MOCK-1' });
    if (req.url.startsWith('/v1/hpr/status/')) return send(200, { status: 'verified' });
    send(404, {});
  });
});
await new Promise((r) => gateway.listen(0, r));
process.env.ABDM_BASE_URL = `http://127.0.0.1:${gateway.address().port}`; // not *dev.abdm* => non-sandbox: errors must surface
process.env.ABDM_CLIENT_ID = 'mock-client'; process.env.ABDM_CLIENT_SECRET = 'mock-secret'; process.env.ABDM_HIP_ID = 'HIP-TEST';

const abdm = await import('../../server/services/abdm-client.service.js');
const pool = (await import('../../server/db/pgPool.js')).default;
const who = await pool.query('SELECT inet_server_addr() AS a'); if (who.rows[0].a !== null) { console.log('ABORT: not a local DB'); process.exit(2); }

const T = 987654; const DOC = 555;
const results = []; const check = (n, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? '  ' + extra : ''}`); };
try {
  const fac = await abdm.registerFacilityOnHfr(T, { facilityName: 'Test Hospital', address: 'X', ownershipType: 'private', facilityType: 'hospital' });
  const regCall = seen.find((s) => s.url === '/v1/facility/register');
  check('HFR register: bearer token + X-HIP-ID sent', regCall?.auth === 'Bearer mock-token' && regCall?.hip === 'HIP-TEST');
  check('HFR register: body carries facility fields', regCall?.body?.facilityName === 'Test Hospital' && regCall?.body?.hipId === 'HIP-TEST');
  check('HFR register: facility id persisted', fac.facility_id === 'HFR-MOCK-1' && fac.registration_status === 'submitted');

  const st = await abdm.getFacilityRegistryStatus(T);
  const after = (await pool.query('SELECT registration_status FROM hfr_facility_registrations WHERE tenant_id=$1', [T])).rows[0];
  check('HFR status: remote status returned and stored locally', st.remoteStatus?.status === 'approved' && after.registration_status === 'approved');

  const prov = await abdm.registerProviderOnHpr(T, { doctorId: DOC, providerName: 'Dr Test', qualification: 'MBBS', registrationCouncil: 'APMC', registrationNumber: '12345' });
  check('HPR register: hpr id persisted', prov.hpr_id === 'HPR-MOCK-1');
  const pst = await abdm.getProviderRegistryStatus(T, DOC);
  check('HPR status: remote status returned', pst.remoteStatus?.status === 'verified');
  const pAfter = (await pool.query('SELECT registration_status FROM hpr_provider_registrations WHERE tenant_id=$1 AND doctor_id=$2', [T, DOC])).rows[0];
  check('HPR status: stored locally', pAfter.registration_status === 'verified');

  failRegister = true;
  let threw = false; try { await abdm.registerFacilityOnHfr(T + 1, { facilityName: 'Fail', address: 'X', ownershipType: 'p', facilityType: 'h' }); } catch { threw = true; }
  check('HFR register: gateway 500 surfaces as an error in non-sandbox mode', threw);
  const ghost = (await pool.query('SELECT 1 FROM hfr_facility_registrations WHERE tenant_id=$1', [T + 1])).rowCount;
  check('HFR register: failed call leaves no phantom "submitted" record', ghost === 0);
} catch (e) { console.log('ERROR', e.message); results.push(false); }
finally {
  await pool.query('DELETE FROM hfr_facility_registrations WHERE tenant_id = ANY($1)', [[T, T + 1]]).catch(() => {});
  await pool.query('DELETE FROM hpr_provider_registrations WHERE tenant_id = $1', [T]).catch(() => {});
  gateway.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
