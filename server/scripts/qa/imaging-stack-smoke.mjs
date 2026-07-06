#!/usr/bin/env node
/** Imaging stack smoke — DICOMweb QIDO/WADO + Orthanc bridge health */
const BASE = process.env.MEDICZY_BASE_URL || 'https://mediqzy.com';
const EMAIL = process.env.DOCTOR_EMAIL || 'doctor@mediczy.com';
const PASSWORD = process.env.DOCTOR_PASSWORD || 'Doctor123';

let failed = 0;
const pass = (name, detail = '') => { console.log('✓', name, detail); };
const fail = (name, detail = '') => { console.log('✗', name, detail); failed += 1; };

async function login() {
  const res = await fetch(`${BASE}/api/doctors/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  if (!body.token) throw new Error('login failed');
  return body.token;
}

async function main() {
  console.log(`Imaging stack smoke — ${BASE}\n`);
  const token = await login();
  const auth = { Authorization: `Bearer ${token}` };

  const health = await fetch(`${BASE}/api/health`);
  health.ok ? pass('health', String(health.status)) : fail('health', String(health.status));

  const bridge = await fetch(`${BASE}/api/orthanc/health`);
  if (bridge.ok) pass('orthanc-bridge', 'reachable');
  else fail('orthanc-bridge', String(bridge.status));

  const qido = await fetch(`${BASE}/api/hypergrid/dicom/studies?limit=5`, {
    headers: { ...auth, Accept: 'application/dicom+json' },
  });
  if (qido.ok) {
    const studies = await qido.json();
    const count = Array.isArray(studies) ? studies.length : (studies.studies?.length || 0);
    pass('qido-studies', `count=${count} content-type=${qido.headers.get('content-type')}`);
    const uid = Array.isArray(studies) ? studies[0]?.['0020000D']?.Value?.[0] : studies.studies?.[0]?.study_instance_uid;
    if (uid) {
      const series = await fetch(`${BASE}/api/hypergrid/dicom/studies/${encodeURIComponent(uid)}/series`, {
        headers: { ...auth, Accept: 'application/dicom+json' },
      });
      series.ok ? pass('qido-series', String(series.status)) : fail('qido-series', String(series.status));
    }
  } else {
    fail('qido-studies', String(qido.status));
  }

  const wl = await fetch(`${BASE}/api/hypergrid/dicom/worklist`, { headers: auth });
  wl.ok ? pass('worklist', String(wl.status)) : fail('worklist', String(wl.status));

  console.log(failed ? `\nFAILED ${failed}` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
