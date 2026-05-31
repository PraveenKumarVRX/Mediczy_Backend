#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import XLSX from '../utils/excel-compat.js';

const DENTAL_FILE = path.resolve('server/db/Master Data/Clinics/Dental Clinics/Clove dental 2.xlsx');
const POLY_FILE = path.resolve('server/db/Master Data/Clinics/Poly Clinics/clinics list.xlsx');
const OUTPUT_DIR = '/tmp/rag_cache/all_providers/clinics';

function toString(val) { return (val === null || val === undefined) ? '' : String(val).trim(); }

function calculateQualityScore(fields) {
  const filled = fields.filter(f => toString(f)).length;
  return Math.round((filled / fields.length) * 10) / 10;
}

function mapDental(row, index) {
  const name = row['NEW ENTITY NAME'] || row['CLINIC NAME'] || 'Unknown Clinic';
  const address = row['ADDRESS'] || '';
  const city = row['CITY'] || '';
  const state = row['STATE'] || '';
  const pincode = row['PIN CODE'] || '';
  const phone = row['PHONE'] || '';
  const email = row['EMAIL'] || '';
  const specialty = row['SPECIALTY'] || 'DENTAL';
  const id = `clinic-dental-${100000 + index}`;
  const quality = calculateQualityScore([name, address, city, state, pincode, phone, email]);
  return {
    id,
    basic_info: {
      name,
      address,
      city,
      state,
      pincode,
      coordinates: { latitude: null, longitude: null },
      contact: { phone: toString(phone), email: toString(email) }
    },
    services: specialty ? [specialty] : [],
    classification: { type: 'clinic', sub_type: 'dental' },
    quality_indicators: { overall_score: quality },
    metadata: { active: true },
    source: 'clinic_master_list_dental',
    timestamp: new Date().toISOString()
  };
}

function mapPoly(row, index) {
  const name = row['entity_name'] || 'Unknown Clinic';
  const address = row['entity_address'] || '';
  const city = row['city'] || '';
  const state = row['state'] || '';
  const pincode = row['pincode'] || '';
  const lat = row['Latitude'] || null;
  const lon = row['Longitude'] || null;
  const discipline = row['discipline'] || '';
  const email = row['userid_sameas_email'] || '';
  const id = `clinic-poly-${200000 + index}`;
  const quality = calculateQualityScore([name, address, city, state, pincode, lat, lon]);
  return {
    id,
    basic_info: {
      name,
      address,
      city,
      state,
      pincode,
      coordinates: { latitude: lat, longitude: lon },
      contact: { phone: '', email: toString(email) }
    },
    services: discipline ? [discipline] : [],
    classification: { type: 'clinic', sub_type: 'poly' },
    quality_indicators: { overall_score: quality },
    metadata: { active: true },
    source: 'clinic_master_list_poly',
    timestamp: new Date().toISOString()
  };
}

async function main() {
  const dentalWb = await XLSX.readFile(DENTAL_FILE);
  const polyWb = await XLSX.readFile(POLY_FILE);
  const dentalRows = XLSX.utils.sheet_to_json(dentalWb.Sheets[dentalWb.SheetNames[0]], { defval: '' });
  const polyRows = XLSX.utils.sheet_to_json(polyWb.Sheets[polyWb.SheetNames[0]], { defval: '' });

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let written = 0;
  for (let i = 0; i < dentalRows.length; i++) {
    const profile = mapDental(dentalRows[i], i);
    const filePath = path.join(OUTPUT_DIR, `${profile.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(profile, null, 2));
    written++;
    if (written % 200 === 0) process.stdout.write(`Dental written ${written}/${dentalRows.length + polyRows.length}\n`);
  }
  for (let j = 0; j < polyRows.length; j++) {
    const profile = mapPoly(polyRows[j], j);
    const filePath = path.join(OUTPUT_DIR, `${profile.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(profile, null, 2));
    written++;
    if (written % 200 === 0) process.stdout.write(`Poly written ${written}/${dentalRows.length + polyRows.length}\n`);
  }

  console.log(`✅ Seeded ${written} clinics to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error('❌ Seeding failed:', error.message);
  process.exit(1);
});
