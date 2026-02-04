#!/usr/bin/env node
/**
 * Mediczy Server Startup Wrapper
 * Ensures port 8000 is free before starting the server
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 8000;
const SERVER_DIR = '/home/ubuntu/Mediczy/server';

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
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
    
    // Import and run the actual server
    process.chdir(SERVER_DIR);
    require('./index.js');
}

main().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
});
