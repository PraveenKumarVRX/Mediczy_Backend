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
      script: './index.js',
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
      kill_timeout: 5000
    },

    // ==================== SIB FastAPI Service ====================
    {
      name: 'sib-fastapi',
      script: '/home/ubuntu/Mediczy/ai-engine/doctor_bot/venv/bin/uvicorn',
      args: 'app:app --host 0.0.0.0 --port 8001',
      cwd: '/home/ubuntu/Mediczy/ai-engine/doctor_bot',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
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
      max_restarts: 10,
      min_uptime: '10s'
    },

    // ==================== Background Worker ====================
    {
      name: 'mediczy-worker',
      script: './worker-process.js',
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
      min_uptime: '10s'
    },

    // ==================== LiveKit Video Server ====================
    {
      name: 'livekit-server',
      script: '/usr/local/bin/livekit-server',
      args: '--config /home/ubuntu/livekit-config.yaml',
      cwd: '/home/ubuntu',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
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
      min_uptime: '10s',
      restart_delay: 5000
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
