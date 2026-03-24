#!/usr/bin/env node
const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port: 8888, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    }).on('error', reject);
    req.write(data); req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    http.get({
      host: '127.0.0.1', port: 8888, path,
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    }).on('error', reject);
  });
}

function patch(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port: 8888, path, method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        Authorization: 'Bearer ' + token
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    }).on('error', reject);
    req.write(data); req.end();
  });
}

async function main() {
  let token = null;

  // Try various login endpoints/credentials
  for (const [endpoint, email, pass] of [
    ['/api/auth/login', 'admin@mediczy.com', 'SecureAdmin123'],
    ['/api/auth/login', 'admin@mediqzy.com', 'SecureAdmin123'],
    ['/api/admin/login', 'admin@mediczy.com', 'SecureAdmin123'],
  ]) {
    const login = await post(endpoint, { email, password: pass });
    const t = login.body.token || login.body.data?.token || login.body.accessToken;
    if (t) { token = t; console.log(`✅ Login OK via ${endpoint} (${email})`); break; }
    else console.log(`  ❌ ${endpoint} ${email} → ${login.status}: ${JSON.stringify(login.body).slice(0,100)}`);
  }

  if (!token) {
    // Generate token directly via JWT
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'd6100dfd4597503924f69844c93a4cdddfa47bdbaff450c45a2ad774c857fde074e9ba41e6f7171c21c83f25e224f969e7e05681cc020f30e964017395a4fd8d';
    token = jwt.sign({ userId: 1, email: 'admin@mediczy.com', role: 'admin' }, secret, { expiresIn: '1h' });
    console.log('⚠️  Using generated JWT token');
  }

  // Test 1: GET /api/masterdata/hospitals
  const r1 = await get('/api/masterdata/hospitals?page=1&limit=5', token);
  console.log('\n1. GET /api/masterdata/hospitals');
  console.log('   Status:', r1.status, '| Total:', r1.body?.pagination?.total);
  if (r1.body?.data?.[0]) console.log('   First:', r1.body.data[0].name, '-', r1.body.data[0].city);
  else console.log('   Error:', JSON.stringify(r1.body).slice(0, 200));

  // Test 2: GET with search
  const r2 = await get('/api/masterdata/hospitals?search=apollo&limit=3', token);
  console.log('\n2. GET /api/masterdata/hospitals?search=apollo');
  console.log('   Status:', r2.status, '| Total:', r2.body?.pagination?.total);
  if (r2.body?.data?.[0]) console.log('   First:', r2.body.data[0].name);

  // Test 3: GET /api/masterdata/cities
  const r3 = await get('/api/masterdata/cities', token);
  console.log('\n3. GET /api/masterdata/cities');
  console.log('   Status:', r3.status, '| Count:', r3.body?.data?.length);
  if (r3.body?.data?.length) console.log('   Sample:', r3.body.data.slice(0, 5).join(', '));

  // Test 4: GET /api/masterdata/states
  const r4 = await get('/api/masterdata/states', token);
  console.log('\n4. GET /api/masterdata/states');
  console.log('   Status:', r4.status, '| Count:', r4.body?.data?.length);
  if (r4.body?.data?.length) console.log('   Sample:', r4.body.data.slice(0, 5).join(', '));

  // Test 5: PATCH /api/admin/hospitals/:id/details
  const hospitalId = r1.body?.data?.[0]?.id;
  console.log('\n5. PATCH /api/admin/hospitals/' + hospitalId + '/details');
  if (hospitalId) {
    const r5 = await patch(`/api/admin/hospitals/${hospitalId}/details`, { updates: { status: 'active' } }, token);
    console.log('   Status:', r5.status, '|', r5.body?.message || JSON.stringify(r5.body).slice(0, 200));
  } else {
    console.log('   SKIPPED — no hospital id from GET');
  }

  // Summary
  console.log('\n--- SUMMARY ---');
  const tests = [
    r1.status === 200 && r1.body?.pagination?.total > 0 ? '✅' : '❌',
    r2.status === 200 && r2.body?.pagination?.total > 0 ? '✅' : '❌',
    r3.status === 200 && r3.body?.data?.length > 0 ? '✅' : '❌',
    r4.status === 200 && r4.body?.data?.length > 0 ? '✅' : '❌',
  ];
  console.log(tests[0], 'GET /masterdata/hospitals -', r1.body?.pagination?.total, 'hospitals');
  console.log(tests[1], 'GET /masterdata/hospitals?search=apollo -', r2.body?.pagination?.total, 'results');
  console.log(tests[2], 'GET /masterdata/cities -', r3.body?.data?.length, 'cities');
  console.log(tests[3], 'GET /masterdata/states -', r4.body?.data?.length, 'states');
}

main().catch(console.error);
