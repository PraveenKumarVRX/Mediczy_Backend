// PM2 Ecosystem Configuration for Staging Environment
// Usage: pm2 start ecosystem.staging.config.js

module.exports = {
  apps: [
    {
      name: 'mediqzy-staging',
      script: './server/index.js',
      cwd: '/home/ubuntu/Mediczy',
      instances: 1,  // Single instance for staging (saves resources)
      exec_mode: 'fork',
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'staging',
        PORT: 8000
      },
      // Load environment from .env.staging
      env_file: './server/.env.staging',
      
      // Process management
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/staging-error.log',
      out_file: './logs/staging-out.log',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
      
      // Health monitoring
      exp_backoff_restart_delay: 100,
    },
    
    {
      name: 'mediqzy-staging-worker',
      script: './server/worker.js',
      cwd: '/home/ubuntu/Mediczy',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'staging',
      },
      env_file: './server/.env.staging',
      
      watch: false,
      max_memory_restart: '300M',
      min_uptime: '10s',
      max_restarts: 5,
      
      error_file: './logs/staging-worker-error.log',
      out_file: './logs/staging-worker-out.log',
      merge_logs: true,
    },
    
    // Optional: FastAPI service for AI features
    // {
    //   name: 'sib-fastapi-staging',
    //   script: 'uvicorn',
    //   args: 'main:app --host 0.0.0.0 --port 8001',
    //   cwd: '/home/ubuntu/Mediczy/sib-backend',
    //   interpreter: 'python3',
    //   env: {
    //     NODE_ENV: 'staging',
    //   },
    //   max_memory_restart: '500M',
    //   error_file: './logs/staging-fastapi-error.log',
    //   out_file: './logs/staging-fastapi-out.log',
    // },
  ],

  // Deployment configuration (optional)
  deploy: {
    staging: {
      user: 'ubuntu',
      host: 'staging.mediqzy.com',
      ref: 'origin/staging',
      repo: 'git@github.com:MySmartHealth/Mediczy.git',
      path: '/home/ubuntu/Mediczy',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'cd server && npm ci && cd ../client && npm ci && npm run build && pm2 reload ecosystem.staging.config.js --env staging',
      'pre-setup': 'mkdir -p /home/ubuntu/Mediczy/logs',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};
