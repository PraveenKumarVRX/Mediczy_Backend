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
      script: './server.js',
      cwd: '/home/ubuntu/Mediczy/server',
      instances: 'max',
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
      max_memory_restart: '1G',
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 3000
    },

    // ==================== SIB FastAPI Service ====================
    {
      name: 'sib-fastapi',
      script: 'app.py',
      interpreter: '/home/ubuntu/Mediczy/ai-engine/doctor_bot/venv/bin/python3',
      cwd: '/home/ubuntu/Mediczy/ai-engine/doctor_bot',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PYTHONUNBUFFERED: '1',
        PORT: 8001,
        POSTGRES_HOST: '127.0.0.1',
        POSTGRES_PORT: '5432',
        POSTGRES_DB: 'mediczy',
        POSTGRES_USER: 'mediczy_helper',
        POSTGRES_PASSWORD: 'Mediczy2024Helper'
      },
      error_file: './logs/sib-error.log',
      out_file: './logs/sib-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '2G',
      watch: false,
      ignore_watch: ['node_modules', '__pycache__', '.git'],
      max_restarts: 10,
      min_uptime: '10s',
      args: '-m uvicorn app:app --host 0.0.0.0 --port 8001 --reload'
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
