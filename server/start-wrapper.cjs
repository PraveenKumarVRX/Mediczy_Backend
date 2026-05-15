#!/usr/bin/env node
/**
 * Mediczy Server Startup Wrapper
 * Ensures port 8000 is free before starting the server
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const net = require('net');

const PORT = process.env.PORT || 8000;
const SERVER_DIR = path.resolve(__dirname);

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg) {
    console.error(`[${new Date().toISOString()}] ❌ ${msg}`);
}

/** TCP reachability probe — resolves true/false */
function tcpProbe(host, port, timeoutMs = 3000) {
    return new Promise(resolve => {
        const sock = new net.Socket();
        let done = false;
        const finish = (ok) => { if (!done) { done = true; sock.destroy(); resolve(ok); } };
        sock.setTimeout(timeoutMs);
        sock.on('connect', () => finish(true));
        sock.on('timeout', () => finish(false));
        sock.on('error', () => finish(false));
        sock.connect(parseInt(port, 10), host);
    });
}

/** Validate critical service connectivity before the app starts */
async function preflightChecks() {
    const checks = [
        {
            label: 'PostgreSQL',
            host: process.env.POSTGRES_HOST || '127.0.0.1',
            port: process.env.POSTGRES_PORT || '5432',
            required: true,
        },
        {
            label: 'Redis',
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || '6379',
            required: false, // app degrades gracefully without Redis
        },
    ];

    let fatal = false;
    for (const chk of checks) {
        const ok = await tcpProbe(chk.host, chk.port);
        if (ok) {
            log(`✅ Pre-flight: ${chk.label} reachable on ${chk.host}:${chk.port}`);
        } else {
            const msg = `Pre-flight: ${chk.label} NOT reachable on ${chk.host}:${chk.port}`;
            if (chk.required) { logError(msg + ' — ABORTING STARTUP'); fatal = true; }
            else              { log(`⚠️  ${msg} — continuing (non-critical)`); }
        }
    }
    if (fatal) process.exit(1);
}

function killProcessOnPort(port) {
    try {
        // Try to find and kill any process on the port
        execSync(`sudo fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
        log(`Checked port ${port} for stale processes`);
    } catch (e) {
        // Ignore errors - port might not be in use
    }
}

async function main() {
    // Pre-flight: validate critical services are reachable before importing app
    await preflightChecks();

    // Skip port cleaning in cluster mode - PM2 handles this
    const isClusterMode = process.env.exec_mode === 'cluster' || 
                          (process.env.instances && parseInt(process.env.instances) > 1) ||
                          process.env.PM2_INSTANCE_ID !== undefined;
    
    if (!isClusterMode) {
        log(`Pre-start check: Cleaning port ${PORT}...`);
        killProcessOnPort(PORT);
        await new Promise(r => setTimeout(r, 1000));
    } else {
        log(`Cluster mode detected (instance ${process.env.PM2_INSTANCE_ID || 0}), skipping port cleanup`);
    }
    
    log('Starting Mediczy server...');
    
    // Import and run the actual ESM server
    process.chdir(SERVER_DIR);
    await import('./index.js');
}

main().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
});
