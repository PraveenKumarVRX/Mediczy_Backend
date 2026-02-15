#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = '/home/ubuntu/Mediczy/server';

dotenv.config({ path: path.join(serverDir, '.env') });

// Import the user controller directly
const { signInUser } = await import(path.join(serverDir, 'controller/user.controller.js'));

// Create mock request/response
const mockReq = {
  body: {
    email: 'care@mysmarthealth.in',
    password: 'Mayden@2025'
  }
};

const mockRes = {
  statusCode: 200,
  jsonData: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.jsonData = data;
    return this;
  }  
};

console.log('🧪 Direct test of signInUser controller\n');
console.log('Request body:', mockReq.body);
console.log('');

try {
  await signInUser(mockReq, mockRes);
  
  console.log('Response status:', mockRes.statusCode);
  console.log('Response data:');
  console.log(JSON.stringify(mockRes.jsonData, null, 2));
  
  if (mockRes.jsonData?.token) {
    console.log('\n✅ Login successful!');
    console.log('Token:', mockRes.jsonData.token.substring(0, 30) + '...');
  } else if (mockRes.statusCode === 200) {
    console.log('\n✅ Success response received');
  } else {
    console.log(`\n❌ Error (status ${mockRes.statusCode}): ${mockRes.jsonData?.message}`);
  }
  
} catch (error) {
  console.error('❌ Exception:', error.message);
  console.error(error.stack);
}
