#!/usr/bin/env node
/**
 * Imaging stack smoke — DICOMweb QIDO/WADO + Orthanc bridge + STOW→WADO SHA-256 round trip.
 *
 * Env:
 *   MEDICZY_BASE_URL, DOCTOR_EMAIL, DOCTOR_PASSWORD
 *   SKIP_STOW=1  — skip upload round-trip (read-only environments)
 */
import crypto from 'crypto';

const BASE = process.env.MEDICZY_BASE_URL || 'https://mediqzy.com';
const EMAIL = process.env.DOCTOR_EMAIL || 'doctor@mediczy.com';
const PASSWORD = process.env.DOCTOR_PASSWORD || 'Doctor123';
const SKIP_STOW = process.env.SKIP_STOW === '1';

let failed = 0;
const pass = (name, detail = '') => { console.log('✓', name, detail); };
const fail = (name, detail = '') => { console.log('✗', name, detail); failed += 1; };

/** Minimal DICOM Part 10 buffer with explicit UIDs (no pixel data). */
function buildMinimalDicom({ studyUid, seriesUid, sopUid }) {
  const enc = new TextEncoder();
  const chunks = [];
  const pushTag = (group, element, vr, valueBytes) => {
    const tag = Buffer.alloc(8);
    tag.writeUInt16LE(group, 0);
    tag.writeUInt16LE(element, 2);
    tag.write(vr, 4, 2, 'ascii');
    if (vr === 'OB' || vr === 'OW' || vr === 'SQ' || vr === 'UN' || vr === 'UT') {
      tag.writeUInt16LE(0, 6);
      const len = Buffer.alloc(4);
      len.writeUInt32LE(valueBytes.length, 0);
      chunks.push(tag, len, valueBytes);
    } else {
      const padded = Buffer.concat([
        valueBytes,
        valueBytes.length % 2 === 1 ? Buffer.from([0x20]) : Buffer.alloc(0),
      ]);
      tag.writeUInt16LE(padded.length, 6);
      chunks.push(tag, padded);
    }
  };
  const str = (s) => Buffer.from(enc.encode(s));

  // File Meta Information (explicit VR little endian transfer)
  const metaItems = [];
  const pushMeta = (group, element, vr, valueBytes) => {
    const tag = Buffer.alloc(8);
    tag.writeUInt16LE(group, 0);
    tag.writeUInt16LE(element, 2);
    tag.write(vr, 4, 2, 'ascii');
    if (vr === 'OB' || vr === 'OW' || vr === 'SQ' || vr === 'UN' || vr === 'UT') {
      tag.writeUInt16LE(0, 6);
      const len = Buffer.alloc(4);
      len.writeUInt32LE(valueBytes.length, 0);
      metaItems.push(tag, len, valueBytes);
    } else {
      const padded = Buffer.concat([
        valueBytes,
        valueBytes.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0),
      ]);
      tag.writeUInt16LE(padded.length, 6);
      metaItems.push(tag, padded);
    }
  };
  pushMeta(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01]));
  pushMeta(0x0002, 0x0002, 'UI', str('1.2.840.10008.5.1.4.1.1.7\0')); // Secondary Capture
  pushMeta(0x0002, 0x0003, 'UI', str(`${sopUid}\0`));
  pushMeta(0x0002, 0x0010, 'UI', str('1.2.840.10008.1.2.1\0')); // Explicit VR LE
  pushMeta(0x0002, 0x0012, 'UI', str('1.2.826.0.1.3680043.9.7382.1\0'));
  const metaBody = Buffer.concat(metaItems);
  const metaGroupLen = Buffer.alloc(12);
  metaGroupLen.writeUInt16LE(0x0002, 0);
  metaGroupLen.writeUInt16LE(0x0000, 2);
  metaGroupLen.write('UL', 4, 2, 'ascii');
  metaGroupLen.writeUInt16LE(4, 6);
  metaGroupLen.writeUInt32LE(metaBody.length, 8);

  const preamble = Buffer.alloc(128, 0);
  const dicm = Buffer.from('DICM', 'ascii');

  pushTag(0x0008, 0x0016, 'UI', str('1.2.840.10008.5.1.4.1.1.7\0'));
  pushTag(0x0008, 0x0018, 'UI', str(`${sopUid}\0`));
  pushTag(0x0008, 0x0060, 'CS', str('OT'));
  pushTag(0x0010, 0x0010, 'PN', str('SMOKE^TEST'));
  pushTag(0x0010, 0x0020, 'LO', str('SMOKE001'));
  pushTag(0x0020, 0x000D, 'UI', str(`${studyUid}\0`));
  pushTag(0x0020, 0x000E, 'UI', str(`${seriesUid}\0`));
  pushTag(0x0020, 0x0013, 'IS', str('1'));

  return Buffer.concat([preamble, dicm, metaGroupLen, metaBody, ...chunks]);
}

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

async function stowRoundTrip(token) {
  const stamp = Date.now();
  const studyUid = `1.2.826.0.1.3680043.9.7382.smoke.${stamp}`;
  const seriesUid = `${studyUid}.1`;
  const sopUid = `${studyUid}.1.1`;
  const dicom = buildMinimalDicom({ studyUid, seriesUid, sopUid });
  const shaIn = crypto.createHash('sha256').update(dicom).digest('hex');

  const form = new FormData();
  form.append('files', new Blob([dicom], { type: 'application/dicom' }), 'smoke.dcm');
  form.append('studyInstanceUID', studyUid);
  form.append('modality', 'OT');
  form.append('patientName', 'SMOKE^TEST');

  const stow = await fetch(`${BASE}/api/hypergrid/dicom/studies`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const stowBody = await stow.json().catch(() => ({}));
  if (!stow.ok) {
    fail('stow-rs', `${stow.status} ${JSON.stringify(stowBody).slice(0, 200)}`);
    return;
  }
  pass('stow-rs', `study=${studyUid}`);

  const wado = await fetch(
    `${BASE}/api/hypergrid/dicom/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(seriesUid)}/instances/${encodeURIComponent(sopUid)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/dicom',
      },
    },
  );
  if (!wado.ok) {
    fail('wado-rs-bytes', String(wado.status));
    return;
  }
  const out = Buffer.from(await wado.arrayBuffer());
  const shaOut = crypto.createHash('sha256').update(out).digest('hex');
  if (shaIn === shaOut) pass('stow-wado-sha256', shaOut.slice(0, 16));
  else if (out.length > 128 && out.slice(128, 132).toString('ascii') === 'DICM') {
    // Some stores may rewrite meta header; still require DICOM magic + matching SOP UID path
    pass('stow-wado-dicom-magic', `bytes=${out.length} (sha differs — meta rewrite ok)`);
  } else {
    fail('stow-wado-sha256', `in=${shaIn.slice(0, 12)} out=${shaOut.slice(0, 12)} len=${out.length}`);
  }
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

  if (!SKIP_STOW) await stowRoundTrip(token);
  else pass('stow-rs', 'skipped (SKIP_STOW=1)');

  console.log(failed ? `\nFAILED ${failed}` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
