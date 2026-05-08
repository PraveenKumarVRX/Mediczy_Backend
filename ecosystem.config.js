/**
 * PM2 Ecosystem Configuration
 * ============================
 * 
 * Manages all Mediczy services:
 * - Node.js Backend (Express)
 * - SIB FastAPI Service (Python)
 * - Background Workers
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart all
 *   pm2 logs
 *   pm2 monitor
 */

const path = require('path');
const fs = require('fs');

const ROOT_DIR = process.env.MEDICZY_HOME || __dirname;

// Load .env so PM2 always picks up the latest values regardless of how it was invoked
const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const raw = trimmed.slice(idx + 1).trim();
      // Strip surrounding matching quotes (dotenv-style: "value" or 'value' -> value)
      const val = raw.replace(/^(['"])(.*)\1$/, '$2');
      if (key) process.env[key] = val; // .env file is source of truth; always override cached values
    });
}
const SERVER_DIR = path.join(ROOT_DIR, 'server');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');
const AI_ENGINE_DIR = path.join(ROOT_DIR, 'ai-engine', 'doctor_bot');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

module.exports = {
  apps: [
    // ==================== Node.js Backend ====================
    {
      name: 'mediczy-server',
      script: './start-wrapper.cjs',
      cwd: SERVER_DIR,
      instances: 1,  // Single instance to save memory (LaBSE model needs ~1.5GB)
      exec_mode: 'cluster',
      node_args: '--max-old-space-size=1536',  // Limit heap to 1.5GB (LaBSE embeddings need headroom)
      env: {
        // Spread ALL vars from .env first, then apply explicit overrides below.
        // This ensures secrets (RAZORPAY, TWILIO, JWT, etc.) are always present
        // without maintaining a brittle allowlist here.
        ...process.env,
        // Explicit overrides
        NODE_ENV: 'production',
        PORT: 8888,
        SIB_URL: 'http://localhost:8001',
        POSTGRES_POOL_MAX: process.env.POSTGRES_POOL_MAX || '25',
        POSTGRES_POOL_MIN: process.env.POSTGRES_POOL_MIN || '5',
        POSTGRES_HOST: process.env.POSTGRES_HOST || '127.0.0.1',
        POSTGRES_PORT: process.env.POSTGRES_PORT || '5432',
      },
      error_file: path.join(LOGS_DIR, 'server-error.log'),
      out_file: path.join(LOGS_DIR, 'server-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '2G',  // Restart if RSS exceeds 2GB (LaBSE model loads into memory)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
      max_restarts: 15,
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 10000,
      restart_delay: 3000
    },

    // ==================== SIB FastAPI Service ====================
    {
      name: 'sib-fastapi',
      script: path.join(SCRIPTS_DIR, 'sib-fastapi-start.sh'),
      cwd: AI_ENGINE_DIR,
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'bash',
      env: {
        PYTHONUNBUFFERED: '1',
        PORT: 8001,
        POSTGRES_HOST: '127.0.0.1',
        POSTGRES_PORT: '5432',
        POSTGRES_DB: 'mediczy_ai',
        POSTGRES_USER: 'mediczy_helper',
        POSTGRES_PASSWORD: 'Mediczy2024Helper'
      },
      error_file: path.join(LOGS_DIR, 'sib-error.log'),
      out_file: path.join(LOGS_DIR, 'sib-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '2G',
      watch: false,
      ignore_watch: ['node_modules', '__pycache__', '.git'],
      max_restarts: 50,
      min_uptime: '60s',         // App needs 20-25s to load ClinicalBERT
      kill_timeout: 15000,       // Give time for graceful shutdown
      restart_delay: 10000,      // Wait 10s before restart to release port
      autorestart: true,
      exp_backoff_restart_delay: 1000  // Exponential backoff on crashes
    },

    // ==================== Background Worker ====================
    {
      name: 'mediczy-worker',
      script: './worker-wrapper.cjs',
      cwd: SERVER_DIR,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WORKER_CONCURRENCY: 10
      },
      error_file: path.join(LOGS_DIR, 'worker-error.log'),
      out_file: path.join(LOGS_DIR, 'worker-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '500M',
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 10000,
      restart_delay: 2000
    },

    // ==================== LiveKit Video Server ====================
    {
      name: 'livekit-server',
      script: path.join(SCRIPTS_DIR, 'livekit-start.sh'),
      cwd: '/home/ubuntu',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'bash',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/tmp/livekit-error.log',
      out_file: '/tmp/livekit-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      min_uptime: '15s',
      restart_delay: 5000,
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000
    },

    // ==================== n8n Workflow Automation ====================
    {
      name: 'n8n-server',
      script: path.join(SCRIPTS_DIR, 'n8n-start.sh'),
      cwd: '/home/ubuntu',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'bash',
      env: {
        N8N_PORT: 5678,
        N8N_PROTOCOL: 'http',
        N8N_HOST: 'localhost',
        GENERIC_TIMEZONE: 'Asia/Kolkata',
        N8N_ENCRYPTION_KEY: 'C6l9z3FSU3zJsUop9TL57bJZk/LB7Vzo',
        N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'false'
      },
      error_file: '/tmp/n8n-error.log',
      out_file: '/tmp/n8n-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '15s',
      restart_delay: 5000,
      kill_timeout: 10000
    }
  ],

  // ==================== Global Settings ====================
  deploy: {
    production: {
      user: 'ubuntu',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:MySmartHealth/Mediczy.git',
      path: '/home/ubuntu/Mediczy',
      'post-deploy': 'npm install && pm2 restart ecosystem.config.js'
    }
  }
};
