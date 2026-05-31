#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import XLSX from '../utils/excel-compat.js';

const SOURCE_FILE = path.resolve('server/db/Master Data/Hospitals Data/Hospital list.xlsx');
const OUTPUT_DIR = '/tmp/rag_cache/all_providers/hospitals';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'hospital';
}

function buildContact(row) {
  const phone = row.Telephone || row.Mobile || row.Phone || '';
  const mobile = row.Mobile || '';
  const email = row.Email || row['E-mail (Admin user)'] || '';
  
  return {
    phone: String(phone || '').trim(),
    mobile: String(mobile || '').trim(),
    email: String(email || '').trim()
  };
}

function calculateQualityScore(row) {
  let score = 0;
  const fields = [
    row['Entity Name'],
    row.Address,
    row['City/Location'],
    row.State,
    row.Pincode,
    row.Telephone || row.Mobile,
    row.Email
  ];
  const filledFields = fields.filter(f => f && String(f).trim()).length;
  score = filledFields / fields.length;
  return Math.round(score * 10) / 10;
}

function mapRowToProfile(row, index) {
  const name = row['Entity Name'] || row.Name || 'Unknown';
  const id = `hospital-${100000 + index}`;
  
  return {
    id,
    basic_info: {
      name,
      address: row.Address || '',
      city: row['City/Location'] || row.City || '',
      state: row.State || '',
      pincode: row.Pincode || '',
      coordinates: { 
        latitude: row.LATITUDE || null, 
        longitude: row.LONGITUDE || null 
      },
      contact: buildContact(row)
    },
    services: [],
    classification: { 
      type: row['Entity Type']?.toLowerCase() || 'hospital' 
    },
    quality_indicators: { 
      overall_score: calculateQualityScore(row) 
    },
    metadata: {
      registration_number: row['PAN No.'] || '',
      website: row['Web Address'] || '',
      active: row.Active === 'Y/N' || true
    },
    source: 'hospital_master_list',
    timestamp: new Date().toISOString()
  };
}

async function main() {
  const workbook = await XLSX.readFile(SOURCE_FILE);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let written = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const profile = mapRowToProfile(rows[i], i);
    const filePath = path.join(OUTPUT_DIR, `${profile.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(profile, null, 2));
    written += 1;
    if (written % 500 === 0) {
      process.stdout.write(`Written ${written}/${rows.length}\n`);
    }
  }

  console.log(`✅ Seeded ${written} hospitals to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error('❌ Seeding failed:', error.message);
  process.exit(1);
});
