module.exports = {
  apps: [{
    name: 'mediczy-frontend',
    script: 'npm',
    args: 'run dev',
    cwd: '/home/ubuntu/Mediczy/client',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    error_file: '../logs/pm2-frontend-error.log',
    out_file: '../logs/pm2-frontend-out.log',
    log_file: '../logs/pm2-frontend-combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};