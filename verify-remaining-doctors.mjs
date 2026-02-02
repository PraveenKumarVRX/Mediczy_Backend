#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim();
  }
});

const client = new Client({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: 5432,
  database: process.env.POSTGRES_DATABASE || 'mediczy_ai',
  user: process.env.POSTGRES_USER || 'mediczy_helper',
  password: process.env.POSTGRES_PASSWORD,
});

await client.connect();

console.log('\n📊 Remaining doctors in database:\n');

const result = await client.query(`
  SELECT 
    id,
    CONCAT("firstName", ' ', "lastName") as name,
    email,
    "isVerified",
    organization_id
  FROM doctors
  ORDER BY id
`);

console.log('Total doctors:', result.rows.length);
result.rows.forEach((doc, i) => {
  console.log(`${i+1}. [${doc.id}] ${doc.name} - ${doc.email} (Verified: ${doc.isVerified ? '✅' : '❌'})`);
});

await client.end();
