#!/usr/bin/env node
/**
 * MediQzy Surveillance Edge Agent
 * ----------------------------------------------------------------------------
 * Runs INSIDE the hospital network next to the DVR/NVR. It pulls a still frame
 * from each camera channel the cloud asks for and posts it to MediQzy for vision
 * analytics, forwards DVR alarms, and reports camera/recorder health.
 *
 *   - Recorder passwords stay in this machine's config file. They are never sent.
 *   - Frames are held in memory only; nothing is written to disk.
 *   - Which cameras to poll, and how often, is decided in the MediQzy portal.
 *
 * Usage:   node agent.mjs --config ./config.json [--once]
 * Needs:   Node 18+. ffmpeg is optional (RTSP capture and downscaling only).
 */
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const VERSION = '1.0.0';
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// ── config ───────────────────────────────────────────────────────────────────
function loadConfig(argv) {
  const i = argv.indexOf('--config');
  const file = i >= 0 ? argv[i + 1] : process.env.SURVEILLANCE_AGENT_CONFIG || './config.json';
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  cfg.gatewayKey = process.env.SURVEILLANCE_GATEWAY_KEY || cfg.gatewayKey;
  if (!cfg.cloudUrl || !cfg.gatewayKey) throw new Error('config needs cloudUrl and gatewayKey');
  cfg.cloudUrl = String(cfg.cloudUrl).replace(/\/+$/, '');
  cfg.recorders = cfg.recorders || {};
  cfg.heartbeatSeconds = cfg.heartbeatSeconds || 60;
  cfg.configRefreshSeconds = cfg.configRefreshSeconds || 300;
  return cfg;
}

// ── tiny HTTP client (supports Basic and Digest auth for DVRs) ───────────────
function rawRequest(urlStr, { method = 'GET', headers = {}, body, timeoutMs = 15000, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers, timeout: timeoutMs, rejectUnauthorized: !process.env.SURVEILLANCE_ALLOW_SELF_SIGNED }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const buf = Buffer.concat(chunks); resolve({ status: res.statusCode, headers: res.headers, body: binary ? buf : buf.toString('utf8') }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function digestHeader(challenge, { username, password, method, uri }) {
  const p = {};
  for (const m of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]*))/g)) p[m[1]] = m[2] ?? m[3];
  const cnonce = crypto.randomBytes(8).toString('hex');
  const nc = '00000001';
  const ha1 = md5(`${username}:${p.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const qop = p.qop ? p.qop.split(',')[0].trim() : null;
  const response = qop ? md5(`${ha1}:${p.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${p.nonce}:${ha2}`);
  let h = `Digest username="${username}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", response="${response}"`;
  if (qop) h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (p.opaque) h += `, opaque="${p.opaque}"`;
  return h;
}

async function authedGet(urlStr, { username, password }, opts = {}) {
  let res = await rawRequest(urlStr, { ...opts, binary: true });
  if (res.status !== 401 || !username) return res;
  const challenge = String(res.headers['www-authenticate'] || '');
  const u = new URL(urlStr);
  if (/^digest/i.test(challenge)) {
    const auth = digestHeader(challenge.replace(/^digest\s+/i, ''), { username, password, method: 'GET', uri: u.pathname + u.search });
    res = await rawRequest(urlStr, { ...opts, headers: { ...(opts.headers || {}), Authorization: auth }, binary: true });
  } else if (/^basic/i.test(challenge)) {
    res = await rawRequest(urlStr, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }, binary: true });
  }
  return res;
}

// ── frame capture ────────────────────────────────────────────────────────────
const SNAPSHOT_PATHS = {
  hikvision: (ch) => `/ISAPI/Streaming/channels/${ch * 100 + 1}/picture`,
  dahua: (ch) => `/cgi-bin/snapshot.cgi?channel=${ch}`,
  cpplus: (ch) => `/cgi-bin/snapshot.cgi?channel=${ch}`,
  axis: (ch) => `/axis-cgi/jpg/image.cgi?camera=${ch}`,
};
const isJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8;

function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-loglevel', 'error', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg timeout')); }, 20000);
    p.stdout.on('data', (c) => out.push(c)); p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => { clearTimeout(timer); reject(e.code === 'ENOENT' ? new Error('ffmpeg is not installed') : e); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg: ${err.slice(0, 200)}`)); });
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

async function captureFrame(rec, channel) {
  let buf;
  if (rec.rtspUrlTemplate) {
    const url = rec.rtspUrlTemplate.replaceAll('{channel}', String(channel));
    buf = await ffmpeg(['-rtsp_transport', 'tcp', '-i', url, '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1']);
  } else {
    const pathFn = rec.snapshotPath ? (ch) => rec.snapshotPath.replaceAll('{channel}', String(ch)) : SNAPSHOT_PATHS[rec.vendor];
    if (!pathFn) throw new Error(`no snapshot method for vendor "${rec.vendor}" (set snapshotPath or rtspUrlTemplate)`);
    const url = `${rec.scheme || 'http'}://${rec.host}${rec.port ? `:${rec.port}` : ''}${pathFn(channel)}`;
    const res = await authedGet(url, { username: rec.username, password: rec.password });
    if (res.status !== 200) throw new Error(`recorder answered HTTP ${res.status}`);
    buf = res.body;
  }
  if (!isJpeg(buf)) throw new Error('recorder did not return a JPEG image');
  return buf;
}

async function shrink(buf, maxWidth) {
  if (!maxWidth) return buf;
  try { return await ffmpeg(['-i', 'pipe:0', '-vf', `scale='min(${maxWidth},iw)':-2`, '-q:v', '5', '-f', 'mjpeg', 'pipe:1'], buf); } catch { return buf; }
}

// ── cloud API ────────────────────────────────────────────────────────────────
function makeCloud(cfg) {
  const call = async (method, path, body) => {
    const res = await rawRequest(`${cfg.cloudUrl}/api/surveillance/edge${path}`, {
      method, timeoutMs: 30000,
      headers: { 'X-Gateway-Key': cfg.gatewayKey, 'X-Agent-Version': VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = JSON.parse(res.body); } catch { /* not json */ }
    if (res.status === 429) { const e = new Error('rate limited'); e.retryAfter = Number(res.headers['retry-after']) || 60; throw e; }
    if (res.status >= 400) throw new Error(`cloud ${res.status}: ${json?.message || String(res.body).slice(0, 100)}`);
    return json?.data;
  };
  return { config: () => call('GET', '/config'), heartbeat: (b) => call('POST', '/heartbeat', b), frame: (b) => call('POST', '/frames', b), events: (b) => call('POST', '/events', b) };
}

// ── agent ────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const cfg = loadConfig(argv);
  const once = argv.includes('--once');
  const cloud = makeCloud(cfg);

  let cameras = [];
  const status = new Map();      // cameraId -> online boolean (last capture result)
  const pausedUntil = new Map(); // cameraId -> ms timestamp
  let recorderStatus = new Map();

  const refreshConfig = async () => {
    const data = await cloud.config();
    cameras = data.cameras;
    log(`config: ${cameras.length} camera(s) assigned to gateway "${data.gateway.name}"`);
  };

  const captureAndSend = async (cam) => {
    const rec = cfg.recorders[cam.recorder];
    if (!rec) { log(`camera ${cam.cameraId}: recorder "${cam.recorder}" is not in the local config`); status.set(cam.cameraId, false); return; }
    let jpeg;
    try {
      jpeg = await shrink(await captureFrame(rec, cam.channelNo), cfg.maxWidth);
      status.set(cam.cameraId, true); recorderStatus.set(cam.recorder, true);
    } catch (e) {
      status.set(cam.cameraId, false); recorderStatus.set(cam.recorder, false);
      log(`camera ${cam.cameraId} (${cam.name}): capture failed — ${e.message}`);
      return;
    }
    if (!cam.wantsFrames) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await cloud.frame({ cameraId: cam.cameraId, imageBase64: jpeg.toString('base64'), mimeType: 'image/jpeg' });
        log(`camera ${cam.cameraId} (${cam.name}): ${out.outcome}${out.events?.length ? ` — ${out.events.length} event(s)` : ''}`);
        if (out.retryAfterSeconds) pausedUntil.set(cam.cameraId, Date.now() + out.retryAfterSeconds * 1000);
        return;
      } catch (e) {
        if (e.retryAfter) { pausedUntil.set(cam.cameraId, Date.now() + e.retryAfter * 1000); log(`cloud rate limit; pausing ${e.retryAfter}s`); return; }
        if (attempt === 1) log(`camera ${cam.cameraId}: upload failed — ${e.message}`); else await sleep(2000);
      }
    }
  };

  const sendHeartbeat = async () => {
    try {
      await cloud.heartbeat({
        cameras: [...status].map(([cameraId, online]) => ({ cameraId, online })),
        recorders: [...recorderStatus].map(([name, online]) => ({ name, online })),
      });
    } catch (e) { log(`heartbeat failed — ${e.message}`); }
  };

  await refreshConfig();

  if (once) {
    for (const cam of cameras) await captureAndSend(cam);
    await sendHeartbeat();
    return;
  }

  // Per-camera loops, staggered so a DVR is not hit by every channel at once.
  const running = new Set();
  const startLoop = (cam, idx) => {
    if (running.has(cam.cameraId)) return;
    running.add(cam.cameraId);
    (async () => {
      await sleep((idx % 20) * 500);
      for (;;) {
        const live = cameras.find((c) => c.cameraId === cam.cameraId);
        if (!live) { running.delete(cam.cameraId); return; }
        if (Date.now() >= (pausedUntil.get(cam.cameraId) || 0)) await captureAndSend(live);
        await sleep(Math.max(10, live.intervalSeconds) * 1000);
      }
    })();
  };
  cameras.forEach(startLoop);
  setInterval(() => refreshConfig().then(() => cameras.forEach(startLoop)).catch((e) => log(`config refresh failed — ${e.message}`)), cfg.configRefreshSeconds * 1000);
  setInterval(sendHeartbeat, cfg.heartbeatSeconds * 1000);

  // Optional LAN listener: a DVR's "HTTP alarm push" or a script can POST
  // {"recorder":"Main DVR","channel":3,"type":"intrusion"} to /alarm?token=...
  if (cfg.alarmListener?.port) {
    const { port, host = '0.0.0.0', token } = cfg.alarmListener;
    if (!token) throw new Error('alarmListener needs a token');
    http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (req.method !== 'POST' || url.pathname !== '/alarm' || url.searchParams.get('token') !== token) { res.statusCode = 404; return res.end(); }
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
      req.on('end', async () => {
        try {
          const a = JSON.parse(body);
          const cam = cameras.find((c) => c.recorder === a.recorder && c.channelNo === Number(a.channel));
          if (!cam) { res.statusCode = 404; return res.end('unknown camera'); }
          await cloud.events({ events: [{ cameraId: cam.cameraId, type: String(a.type) }] });
          res.statusCode = 204; res.end();
        } catch (e) { res.statusCode = 400; res.end('bad request'); }
      });
    }).listen(port, host, () => log(`alarm listener on ${host}:${port}`));
  }
  log(`agent ${VERSION} running`);
}

main().catch((e) => { console.error(new Date().toISOString(), 'fatal:', e.message); process.exit(1); });
