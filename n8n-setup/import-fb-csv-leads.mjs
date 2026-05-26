/**
 * import-fb-csv-leads.mjs
 * Imports leads from a Facebook Lead Ads CSV export into crm_leads.
 * Deduplicates by email. Normalises Indian phone numbers to E.164.
 *
 * Usage: node n8n-setup/import-fb-csv-leads.mjs [path/to/fb_leads.csv]
 */

import fs   from 'fs';
import path from 'path';
import pg   from 'pg';

const { Pool } = pg;
const CSV_PATH = process.argv[2] || path.join(import.meta.dirname, 'fb_leads.csv');

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'mediczy_ai',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper',
});

// ─── Parse CSV (handles quoted fields with commas) ────────────────────────────
function parseCSV(text) {
  // strip BOM
  const clean = text.replace(/^﻿/, '').replace(/\r/g, '');
  const lines  = clean.split('\n').filter(l => l.trim());
  const header = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    return Object.fromEntries(header.map((h, i) => [h.trim(), (vals[i] || '').trim()]));
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inQ) { inQ = true; continue; }
    if (c === '"' && inQ)  { inQ = false; continue; }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

// ─── Phone normalisation ──────────────────────────────────────────────────────
function toE164(raw = '') {
  const s = String(raw).trim().replace(/[\s\-().]/g, '');
  if (!s) return null;

  // strip leading + for digit counting
  const digits = s.startsWith('+') ? s.slice(1) : s;

  // Valid Indian mobile: 10 digits starting with 6-9
  // Numbers with 91 prefix: 12 digits
  // Some entries have typos (extra digits) — take last 10 if >12
  let core;
  if (digits.startsWith('91') && digits.length === 12) {
    core = digits.slice(2);
  } else if (digits.startsWith('91') && digits.length > 12) {
    core = digits.slice(-10);          // trim typo digits from front
  } else if (digits.length === 10) {
    core = digits;
  } else if (digits.length > 10) {
    core = digits.slice(-10);
  } else {
    return null;
  }

  if (!/^[6-9]\d{9}$/.test(core)) return null;
  return `+91${core}`;
}

// ─── Parse FB date string ─────────────────────────────────────────────────────
function parseFBDate(str) {
  // "05/22/2026 9:21pm"  →  Date
  if (!str) return new Date();
  try {
    const [datePart, timePart] = str.split(' ');
    const [mm, dd, yyyy] = datePart.split('/');
    const ampm = timePart.slice(-2).toLowerCase();
    let [hh, min] = timePart.slice(0, -2).split(':').map(Number);
    if (ampm === 'pm' && hh !== 12) hh += 12;
    if (ampm === 'am' && hh === 12) hh = 0;
    return new Date(`${yyyy}-${mm}-${dd}T${String(hh).padStart(2,'0')}:${String(min).padStart(2,'0')}:00+05:30`);
  } catch { return new Date(); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  const raw  = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCSV(raw);
  console.log(`\n📋  Parsed ${rows.length} rows from CSV\n`);

  // existing emails to deduplicate
  const { rows: existing } = await pool.query(
    `SELECT email FROM crm_leads WHERE source = 'facebook-lead-ads' AND email IS NOT NULL`
  );
  const existingEmails = new Set(existing.map(r => r.email.toLowerCase()));

  let inserted = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    const name  = row['Name']          || 'Unknown';
    const email = row['Email address'] || null;
    const phone = toE164(row['Phone']);
    const createdAt = parseFBDate(row['Created']);
    const form  = row['Form']          || 'MediQzy Facebook Lead Ad';

    if (email && existingEmails.has(email.toLowerCase())) {
      console.log(`   ⤻  Skip (duplicate): ${name} — ${email}`);
      skipped++;
      continue;
    }

    const tags = JSON.stringify(['facebook-lead-ads', 'fb-leads', 'marketing']);
    const custom = JSON.stringify({
      source:      'facebook-lead-ads',
      fb_form:     form,
      fb_channel:  row['Channel'] || 'Email address',
      fb_stage:    row['Stage']   || 'Intake',
      capturedAt:  createdAt.toISOString(),
      importedVia: 'csv',
    });

    try {
      await pool.query(
        `INSERT INTO crm_leads
           (name, email, phone, source, status, priority, tags, custom_fields, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,'facebook-lead-ads','new','high',$4,$5,0,$6,$6)`,
        [name, email || null, phone, tags, custom, createdAt],
      );
      if (email) existingEmails.add(email.toLowerCase());
      inserted++;
      console.log(`   ✓  ${name.padEnd(45)} ${phone || '(no phone)'}`);
    } catch (err) {
      console.warn(`   ✗  ${name}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n' + '─'.repeat(55));
  console.log(`✅  Done.  Inserted: ${inserted}  |  Skipped: ${skipped}  |  Errors: ${errors}`);
  console.log('\n   CRM → Leads → filter "Facebook Ads" to see them.\n');
  await pool.end();
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
