#!/usr/bin/env node

/**
 * Service Status Report
 * Shows which services are running and their status
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const http = require('http');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function makeRequest(url, timeout = 3000) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, data: null });
          }
        });
      });
      req.on('error', () => resolve({ status: 0, data: null }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: null }); });
      req.end();
    } catch (e) {
      resolve({ status: 0, data: null });
    }
  });
}

async function checkService(name, port, path = '/health') {
  const url = `http://localhost:${port}${path}`;
  const response = await makeRequest(url);
  
  if (response.status === 200) {
    return { running: true, status: 'ONLINE', port };
  } else if (response.status > 0) {
    return { running: true, status: `ERROR ${response.status}`, port };
  } else {
    return { running: false, status: 'OFFLINE', port };
  }
}

async function main() {
  log('\n' + '═'.repeat(70), colors.bold);
  log('Service Status Report', colors.bold);
  log('═'.repeat(70) + '\n', colors.bold);

  // Check PM2 processes
  log('\n📦 PM2 Managed Processes:', colors.blue);
  log('─'.repeat(70), colors.blue);
  
  try {
    const { stdout } = await execAsync('pm2 list');
    const lines = stdout.split('\n').filter(l => l.includes('│'));
    
    if (lines.length <= 2) {
      log('⚠️  Only core services in PM2', colors.yellow);
    }
    
    console.log(stdout);
  } catch (e) {
    log('Error checking PM2', colors.red);
  }

  // Check individual services
  log('\n🔍 Service Health Checks:', colors.blue);
  log('─'.repeat(70), colors.blue);

  const services = [
    { name: 'Mediczy Backend (OAuth)', port: 8888, path: '/oauth/.well-known/oauth-authorization-server' },
    { name: 'SIB FastAPI', port: 8001, path: '/health' },
    { name: 'Rocket.Chat', port: 3000, path: '/' },
    { name: 'LiveKit', port: 7880, path: '/version' },
    { name: 'PostgreSQL (Auth)', port: 5432, path: '' },
    { name: 'Redis', port: 6379, path: '' },
    { name: 'Prometheus', port: 9090, path: '/' }
  ];

  for (const service of services) {
    const result = await checkService(service.name, service.port, service.path);
    const symbol = result.running ? '✅' : '❌';
    const statusColor = result.running ? colors.green : colors.red;
    log(`${symbol} ${service.name.padEnd(30)} [ ${service.port} ] ${statusColor}${result.status}${colors.reset}`);
  }

  // Check processes
  log('\n\n🔎 Process Status (ps aux):', colors.blue);
  log('─'.repeat(70), colors.blue);

  const processes = [
    { name: 'mediczy-server (Node.js)', grep: 'mediczy-server' },
    { name: 'SIB FastAPI (Python)', grep: 'sib_app' },
    // LiveKit runs on LiveKit Cloud — no local livekit-server process
    { name: 'PostgreSQL', grep: 'postgres.*mediczy' },
    { name: 'Redis', grep: 'redis-server' },
    { name: 'Nginx', grep: 'nginx' }
  ];

  for (const proc of processes) {
    try {
      const { stdout } = await execAsync(`ps aux | grep "${proc.grep}" | grep -v grep | head -1`);
      if (stdout) {
        const parts = stdout.trim().split(/\s+/);
        const pid = parts[1];
        const mem = parts[5];
        const cpu = parts[2];
        log(`✅ ${proc.name.padEnd(30)} PID: ${pid} | CPU: ${cpu}% | Memory: ${mem}MB`, colors.green);
      } else {
        log(`❌ ${proc.name.padEnd(30)} NOT RUNNING`, colors.red);
      }
    } catch (e) {
      log(`❌ ${proc.name.padEnd(30)} NOT RUNNING`, colors.red);
    }
  }

  // System info
  log('\n\n📊 System Information:', colors.blue);
  log('─'.repeat(70), colors.blue);

  try {
    const { stdout: uptime } = await execAsync('uptime -p');
    log(`System Uptime: ${uptime.trim()}`, colors.yellow);
  } catch (e) {
    log('Could not get uptime', colors.yellow);
  }

  try {
    const { stdout: diskUsage } = await execAsync('df /home/ubuntu | tail -1 | awk "{print $5}"');
    log(`Disk Usage: ${diskUsage.trim()}`, colors.yellow);
  } catch (e) {
    log('Could not get disk usage', colors.yellow);
  }

  try {
    const { stdout: memInfo } = await execAsync('free -h | grep Mem');
    log(`Memory: ${memInfo.trim()}`, colors.yellow);
  } catch (e) {
    log('Could not get memory info', colors.yellow);
  }

  log('\n' + '═'.repeat(70), colors.bold);
  log('Report Complete', colors.bold);
  log('═'.repeat(70) + '\n', colors.bold);

  process.exit(0);
}

main().catch(e => {
  log(`Error: ${e.message}`, colors.red);
  process.exit(1);
});
