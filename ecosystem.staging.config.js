// PM2 Ecosystem Configuration for the Staging Environment (WP-0.6).
// Usage: pm2 start ecosystem.staging.config.js
//
// Fixed from the previous version of this file, which pointed at ./server/index.js and
// ./server/worker.js — neither exists. The real entrypoints (matching ecosystem.config.js, the
// production config) are server/start-wrapper.cjs and server/worker-wrapper.cjs.
//
// This assumes the "same host, different port" staging layout described in
// docs/deployment/STAGING_ENVIRONMENT.md: a second git checkout at STAGING_HOME (default
// /home/ubuntu/Mediczy-staging), its own server/.env.staging (copy server/.env.staging.example —
// see that file for the required POSTGRES_* keys), and an nginx server block for
// staging.mediqzy.com proxying to PORT below. None of that host/DNS/nginx setup is done by this
// file — see the runbook for the one-time steps.

const path = require('path');

const STAGING_HOME = process.env.STAGING_HOME || '/home/ubuntu/Mediczy-staging';
const SERVER_DIR = path.join(STAGING_HOME, 'server');
const LOGS_DIR = path.join(STAGING_HOME, 'logs');

module.exports = {
  apps: [
    {
      name: 'mediqzy-staging',
      script: './start-wrapper.cjs',
      cwd: SERVER_DIR,
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=1024',
      env: {
        NODE_ENV: 'staging',
        PORT: process.env.STAGING_PORT || 8100,
      },
      // start-wrapper.cjs / the app's own dotenv loading picks up server/.env.staging when
      // NODE_ENV=staging — see docs/deployment/STAGING_ENVIRONMENT.md for how that file is chosen.
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,
      listen_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: path.join(LOGS_DIR, 'staging-error.log'),
      out_file: path.join(LOGS_DIR, 'staging-out.log'),
      merge_logs: true,
    },

    {
      name: 'mediqzy-staging-worker',
      script: './worker-wrapper.cjs',
      cwd: SERVER_DIR,
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'staging',
        DISABLE_KAFKA: 'true',
      },
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 2000,
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: path.join(LOGS_DIR, 'staging-worker-error.log'),
      out_file: path.join(LOGS_DIR, 'staging-worker-out.log'),
      merge_logs: true,
    },
  ],

  deploy: {
    staging: {
      user: 'ubuntu',
      host: 'staging.mediqzy.com',
      ref: 'origin/main',
      repo: 'git@github.com:MySmartHealth/Mediczy.git',
      path: '/home/ubuntu/Mediczy-staging',
      'pre-deploy': 'git fetch --all',
      'post-deploy':
        'cd server && npm ci && cd ../client && npm ci --include=dev && npm run build && pm2 reload ecosystem.staging.config.js --env staging',
      'pre-setup': 'mkdir -p /home/ubuntu/Mediczy-staging/logs',
      env: { NODE_ENV: 'staging' },
    },
  },
};
