#!/usr/bin/env node
/**
 * Mediczy Worker Startup Wrapper
 * Ensures no orphaned worker processes before starting
 */

const { execSync } = require('child_process');
const path = require('path');

const WORKER_DIR = path.resolve(__dirname);

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function killOrphanedWorkers() {
    try {
        // Find orphaned worker processes not managed by PM2
        const result = execSync('pgrep -f "worker-process.js" 2>/dev/null || true', { encoding: 'utf8' });
        const pids = result.trim().split('\n').filter(p => p);
        
        if (pids.length > 0) {
            // Get PM2 managed PID
            let pm2Pid = '';
            try {
                pm2Pid = execSync('cat /home/ubuntu/.pm2/pids/mediczy-worker-*.pid 2>/dev/null || true', { encoding: 'utf8' }).trim();
            } catch (e) {}
            
            for (const pid of pids) {
                if (pid && pid !== pm2Pid && pid !== process.pid.toString()) {
                    log(`Killing orphaned worker process: ${pid}`);
                    try {
                        execSync(`kill -9 ${pid} 2>/dev/null || true`);
                    } catch (e) {}
                }
            }
        }
    } catch (e) {
        // Ignore errors
    }
}

async function main() {
    log('Pre-start check: Cleaning orphaned worker processes...');
    
    killOrphanedWorkers();
    
    // Brief pause
    await new Promise(r => setTimeout(r, 500));
    
    log('Starting Mediczy worker...');
    
    // Import and run the actual worker
    process.chdir(WORKER_DIR);
    
    // Use dynamic import for ES module
    await import('./worker-process.js');
}

main().catch(err => {
    console.error('Worker startup failed:', err);
    process.exit(1);
});
