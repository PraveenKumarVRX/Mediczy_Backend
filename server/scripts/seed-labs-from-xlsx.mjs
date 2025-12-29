#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';

const SOURCE_FILE = path.resolve('server/db/Master Data/Labs/labs list.xlsx');
const OUTPUT_DIR = '/tmp/rag_cache/all_providers/labs';

function calculateQualityScore(row) {
  let score = 0;
  const fields = [
    row.entity_name,
    row.entity_address,
    row.city,
    row.state,
    row.pincode,
    row.Latitude,
    row.Longitude
  ];
  const filledFields = fields.filter(f => f && String(f).trim() && f !== 0).length;
  score = filledFields / fields.length;
  return Math.round(score * 10) / 10;
}

function mapRowToProfile(row, index) {
  const name = row.entity_name || 'Unknown';
  const id = `lab-${100000 + index}`;
  
  return {
    id,
    basic_info: {
      name,
      address: row.entity_address || '',
      city: row.city || '',
      state: row.state || '',
      pincode: row.pincode || '',
      coordinates: { 
        latitude: row.Latitude || null, 
        longitude: row.Longitude || null 
      },
      contact: {
        phone: '',
        email: row.userid_sameas_email || ''
      }
    },
    services: row.discipline ? [row.discipline] : [],
    classification: { 
      type: 'lab',
      discipline: row.discipline || ''
    },
    quality_indicators: { 
      overall_score: calculateQualityScore(row),
      data_quality: row.Latitude && row.Longitude ? 'good' : 'standard'
    },
    metadata: {
      active: true
    },
    source: 'labs_master_list',
    timestamp: new Date().toISOString()
  };
}

async function main() {
  const workbook = XLSX.readFile(SOURCE_FILE);
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

  console.log(`✅ Seeded ${written} labs to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error('❌ Seeding failed:', error.message);
  process.exit(1);
});
