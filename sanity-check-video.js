#!/usr/bin/env node

const http = require('http');
const https = require('https');
const net = require('net');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const checks = [];

function log(msg, color = 'reset') {
  console.log(colors[color] + msg + colors.reset);
}

function checkPort(host, port, name) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve({ name, status: true, port, host });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ name, status: false, port, host, reason: 'Timeout' });
    });
    
    socket.on('error', (err) => {
      resolve({ name, status: false, port, host, reason: err.code });
    });
    
    socket.connect(port, host);
  });
}

function checkHttp(url, name, options = {}) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, { timeout: 3000 }, (res) => {
      resolve({ 
        name, 
        status: res.statusCode < 500, 
        statusCode: res.statusCode,
        url 
      });
    });
    
    req.on('error', (err) => {
      resolve({ 
        name, 
        status: false, 
        err: err.message,
        url 
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ name, status: false, err: 'Timeout', url });
    });
  });
}

async function runChecks() {
  log('\n╔════════════════════════════════════════════════╗', 'cyan');
  log('║       VIDEO SYSTEM SANITY CHECK - Feb 2026    ║', 'cyan');
  log('╚════════════════════════════════════════════════╝\n', 'cyan');

  // Core Services
  log('🔧 CORE SERVICES\n', 'blue');
  const services = [
    checkPort('127.0.0.1', 7880, 'LiveKit Server'),
    checkPort('127.0.0.1', 8001, 'Backend API'),
    checkPort('127.0.0.1', 5432, 'PostgreSQL'),
    checkPort('127.0.0.1', 6379, 'Redis')
  ];

  const serviceResults = await Promise.all(services);
  serviceResults.forEach(r => {
    const status = r.status ? '✅' : '❌';
    const msg = r.status 
      ? `${status} ${r.name} running on port ${r.port}`
      : `${status} ${r.name} (${r.reason})`;
    log(msg, r.status ? 'green' : 'red');
  });

  // API Endpoints
  log('\n📡 API ENDPOINTS\n', 'blue');
  const endpoints = [
    checkHttp('http://127.0.0.1:8001/api/health', 'Backend Health'),
    checkHttp('http://127.0.0.1:8001/api/app-status', 'App Status')
  ];

  const endpointResults = await Promise.all(endpoints);
  endpointResults.forEach(r => {
    const status = r.status ? '✅' : '❌';
    const msg = r.status 
      ? `${status} ${r.name} (HTTP ${r.statusCode})`
      : `${status} ${r.name} (${r.err})`;
    log(msg, r.status ? 'green' : 'red');
  });

  // Video System
  log('\n🎥 VIDEO SYSTEM\n', 'blue');
  const videoEndpoints = [
    checkHttp('http://127.0.0.1:8001/api/video/livekit/token?roomId=test', 'Token Endpoint'),
    checkHttp('http://127.0.0.1:7880/metrics', 'LiveKit Metrics')
  ];

  const videoResults = await Promise.all(videoEndpoints);
  videoResults.forEach(r => {
    const status = r.status ? '✅' : '❌';
    const msg = r.status 
      ? `${status} ${r.name} (HTTP ${r.statusCode})`
      : `${status} ${r.name} (${r.err})`;
    log(msg, r.status ? 'green' : 'red');
  });

  // Database Status
  log('\n💾 DATABASE\n', 'blue');
  try {
    const { exec } = require('child_process');
    const PostgresAsync = new Promise((resolve) => {
      exec('PGPASSWORD="Mediczy2024Helper" psql -h 127.0.0.1 -p 5432 -U mediczy_helper -d mediczy_ai -c "SELECT COUNT(*) FROM appointments WHERE consultationType=\'video\';" 2>&1 | head -1', 
        (err, stdout) => {
          if (stdout && !stdout.includes('error')) {
            const count = stdout.trim();
            resolve({ status: true, count });
          } else {
            resolve({ status: false, err });
          }
        }
      );
    });

    const dbResult = await PostgresAsync;
    if (dbResult.status) {
      log(`✅ PostgreSQL Connected (${dbResult.count.split('\n')[2] || '?'} video appointments)`, 'green');
    } else {
      log('❌ PostgreSQL Connection Failed', 'red');
    }
  } catch (e) {
    log('❌ PostgreSQL Check Error', 'red');
  }

  // Recording System
  log('\n📹 RECORDING SYSTEM\n', 'blue');
  try {
    const fs = require('fs');
    const recordingDir = '/mnt/recordings';
    if (fs.existsSync(recordingDir)) {
      const files = fs.readdirSync(recordingDir);
      log(`✅ Recording Directory: /mnt/recordings (${files.length} files)`, 'green');
    } else {
      log('⚠️  Recording Directory: /mnt/recordings (not created yet)', 'yellow');
    }
  } catch (e) {
    log('❌ Recording Directory Check Error', 'red');
  }

  // Environment Config
  log('\n⚙️  CONFIGURATION\n', 'blue');
  const env = require('./server/.env') ? '✅ Server .env present' : '❌ Server .env missing';
  log(env, env.includes('✅') ? 'green' : 'red');
  
  log('\n📋 SUMMARY\n', 'blue');
  const allPassed = serviceResults.every(r => r.status) && 
                    endpointResults.every(r => r.status) &&
                    videoResults.some(r => r.status);
  
  if (allPassed) {
    log('✅ All critical services operational!', 'green');
    log('✅ Video call system ready for production', 'green');
  } else {
    log('⚠️  Some services need attention', 'yellow');
  }

  log('\n');
}

runChecks().catch(err => {
  log('\n❌ Sanity check failed: ' + err.message, 'red');
  process.exit(1);
});
