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

module.exports = {
  apps: [
    // ==================== Node.js Backend ====================
    {
      name: 'mediczy-server',
      script: './start-wrapper.cjs',
      cwd: '/home/ubuntu/Mediczy/server',
      instances: 2,  // Reduced from 'max' (4) to 2 to prevent CPU overload
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8000,
        SIB_URL: 'http://localhost:8001'
      },
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '800M',  // Reduced from 1G
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 8000,  // Increased from 3000 to allow slower startup
      kill_timeout: 10000,
      restart_delay: 3000
    },

    // ==================== SIB FastAPI Service ====================
    {
      name: 'sib-fastapi',
      script: '/home/ubuntu/Mediczy/scripts/sib-fastapi-start.sh',
      cwd: '/home/ubuntu/Mediczy/ai-engine/doctor_bot',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'bash',
      env: {
        PYTHONUNBUFFERED: '1',
        PORT: 8001,
        POSTGRES_HOST: '127.0.0.1',
        POSTGRES_PORT: '5432',
        POSTGRES_DB: 'mediczy',
        POSTGRES_USER: 'mediczy_helper',
        POSTGRES_PASSWORD: 'Mediczy2024Helper'
      },
      error_file: '/home/ubuntu/Mediczy/logs/sib-error.log',
      out_file: '/home/ubuntu/Mediczy/logs/sib-out.log',
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
      cwd: '/home/ubuntu/Mediczy/server',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WORKER_CONCURRENCY: 10
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
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
      script: '/home/ubuntu/Mediczy/scripts/livekit-start.sh',
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

    // ==================== Kafka Server ====================
    {
      name: 'kafka-server',
      script: '/home/ubuntu/Mediczy/scripts/kafka-start.sh',
      cwd: '/opt/kafka',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'bash',
      env: {
        KAFKA_HEAP_OPTS: '-Xmx512M -Xms256M'
      },
      error_file: '/tmp/kafka-error.log',
      out_file: '/tmp/kafka-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 10000,
      kill_timeout: 15000
    },

    // ==================== n8n Workflow Automation ====================
    {
      name: 'n8n-server',
      script: '/home/ubuntu/Mediczy/scripts/n8n-start.sh',
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
