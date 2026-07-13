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
const SERVER_DIR = path.join(ROOT_DIR, 'server');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const raw = trimmed.slice(idx + 1).trim();
      const val = raw.replace(/^(['"])(.*)\1$/, '$2');
      if (key) process.env[key] = val; // env file is source of truth for PM2 launches
    });
}

// Load .env so PM2 always picks up the latest values regardless of how it was invoked
loadEnvFile(path.join(ROOT_DIR, '.env'));
loadEnvFile(path.join(SERVER_DIR, '.env'));
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
      exec_mode: 'fork',
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
        POSTGRES_DATABASE: process.env.POSTGRES_DATABASE || 'mediczy_ai',
        POSTGRES_DB: process.env.POSTGRES_DB || 'mediczy_ai',
        POSTGRES_USER: process.env.POSTGRES_USER || 'mediczy_helper',
        POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
        POSTGRES_SSL: process.env.POSTGRES_SSL || 'true',
        REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
        REDIS_URL: process.env.REDIS_URL,
        DISABLE_KAFKA: 'true',
      },
      error_file: path.join(LOGS_DIR, 'server-error.log'),
      out_file: path.join(LOGS_DIR, 'server-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '3G',  // RSS exceeds 2.5GB in steady state because model/native memory sits outside V8
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
        POSTGRES_HOST: process.env.POSTGRES_HOST || '127.0.0.1',
        POSTGRES_PORT: process.env.POSTGRES_PORT || '5432',
        POSTGRES_DATABASE: process.env.POSTGRES_DATABASE || 'mediczy_ai',
        POSTGRES_DB: process.env.POSTGRES_DB || 'mediczy_ai',
        POSTGRES_USER: process.env.POSTGRES_USER || 'mediczy_helper',
        POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
        POSTGRES_SSL: process.env.POSTGRES_SSL || 'true',
        DUCKDB_ENABLED: 'true',
        DUCKDB_PATH: ':memory:',
        PGVECTOR_DIMENSION: process.env.PGVECTOR_DIMENSION || '1536',
        LOG_LEVEL: 'INFO',
        LOGURU_LEVEL: 'WARNING',
        SIB_LANGGRAPH_ENABLED: 'true'
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

    // ==================== AI Platform Gateway (optional, port 8000) ====================
    // Aggregates health from sib-fastapi (8001), scribe-service (8005), offline-scribe (8006).
    // Start manually when needed:  pm2 start ecosystem.config.js --only ai-platform-gateway
    {
      name: 'ai-platform-gateway',
      script: 'gateway.py',
      cwd: path.join(ROOT_DIR, 'ai-platform'),
      instances: 1,
      exec_mode: 'fork',
      interpreter: path.join(AI_ENGINE_DIR, 'doctor_bot', 'venv', 'bin', 'python3'),
      autorestart: false,  // opt-in only; don't run in prod by default
      env: {
        PYTHONUNBUFFERED: '1',
        GATEWAY_PORT: 8000,
        SIB_PORT: 8001,
        SCRIBE_GPU_PORT: 8005,
        SCRIBE_PORT: 8006,
        LOG_LEVEL: 'INFO',
      },
      error_file: path.join(LOGS_DIR, 'ai-gateway-error.log'),
      out_file: path.join(LOGS_DIR, 'ai-gateway-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '200M',
      watch: false,
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
        WORKER_CONCURRENCY: 10,
        DISABLE_KAFKA: 'true'
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

    // ==================== Feedback Intelligence Worker ====================
    {
      name: 'feedback-intelligence',
      script: './workers/feedback-intelligence.worker.mjs',
      cwd: SERVER_DIR,
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',
      env: {
        NODE_ENV: 'production',
        DISABLE_KAFKA: 'true',
      },
      error_file: path.join(LOGS_DIR, 'feedback-intel-error.log'),
      out_file:   path.join(LOGS_DIR, 'feedback-intel-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '500M',
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 10000,
      restart_delay: 5000,
      autorestart: true,
    },

    // ==================== Offline AI Scribe ====================
    {
      name: 'offline-scribe',
      script: 'main.py',
      cwd: path.join(ROOT_DIR, 'offline_scribe'),
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'python3',
      env: {
        SCRIBE_HOST: '0.0.0.0',
        SCRIBE_PORT: 8006,
        MODELS_DIR: '/home/ubuntu/models',
        LOG_DIR: path.join(LOGS_DIR, 'offline-scribe'),
        STT_BACKEND: 'whisper-cpp',
        WHISPER_CPP_BIN: path.join(ROOT_DIR, 'whisper.cpp', 'build', 'bin', 'whisper-cli'),
        WHISPER_MODEL: process.env.WHISPER_MODEL || 'medium',
        STT_MODEL_STRATEGY: process.env.STT_MODEL_STRATEGY || 'default',
        STT_ENABLE_CHUNKING: 'true',
        STT_CHUNK_DURATION: process.env.STT_CHUNK_DURATION || '30',
        LOG_LEVEL: 'INFO',
        PYTHONUNBUFFERED: '1'
      },
      error_file: path.join(LOGS_DIR, 'offline-scribe-error.log'),
      out_file: path.join(LOGS_DIR, 'offline-scribe-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '5G',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      min_uptime: '30s',
      restart_delay: 5000,
      kill_timeout: 15000
    },

    // LiveKit: using LiveKit Cloud (wss://msh-kw9tvxa9.livekit.cloud).
    // Token generation is in mediczy-server via livekit-server-sdk — no local server needed.
    // To remove an existing PM2 process: pm2 delete livekit-server && pm2 save

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
        N8N_ENCRYPTION_KEY: process.env.N8N_ENCRYPTION_KEY,
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
