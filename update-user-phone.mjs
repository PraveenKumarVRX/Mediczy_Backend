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

console.log('Updating user@mediczy.com with phone number 9884089921...\n');

const result = await client.query(
  `UPDATE users SET "phoneNumber" = $1 WHERE LOWER(email) = $2 RETURNING id, "firstName", "lastName", email, "phoneNumber"`,
  ['9884089921', 'user@mediczy.com']
);

if (result.rowCount > 0) {
  const user = result.rows[0];
  console.log('✅ User updated successfully:');
  console.log('   ID:', user.id);
  console.log('   Name:', user.firstName, user.lastName);
  console.log('   Email:', user.email);
  console.log('   Phone:', user.phoneNumber);
} else {
  console.log('❌ User not found with email: user@mediczy.com');
}

await client.end();
