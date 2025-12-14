const os = require('os');
const homeDir = os.homedir();
const basePath = `${homeDir}/Mediczy`;

module.exports = {
  apps: [
    {
      name: 'mediczy-server',
      script: './index.js',
      cwd: `${basePath}/server`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      min_uptime: '10s',
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 8000
      }
    },
    {
      name: 'bullmq-workers',
      script: './worker-process.js',
      cwd: `${basePath}/server`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      min_uptime: '10s',
      max_restarts: 10,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'prometheus',
      script: '/opt/prometheus/prometheus',
      args: '--config.file=/opt/prometheus/prometheus.yml --storage.tsdb.path=/var/lib/prometheus',
      cwd: '/opt/prometheus',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      min_uptime: '20s',
      max_restarts: 10,
      env: {
        HOME: '/home/ubuntu'
      }
    },
    {
      name: 'llm-orchestrator',
      script: '/usr/bin/python3',
      args: 'llm_orchestrator.py',
      cwd: `${basePath}/docsgpt`,
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_memory_restart: '4G',
      restart_delay: 5000,
      min_uptime: '20s',
      max_restarts: 10,
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: `${basePath}/docsgpt`,
        FLASK_ENV: 'production'
      }
    }
  ]
};
