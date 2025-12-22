module.exports = {
  apps: [
    // Production server - no auto-reload
    {
      name: 'mediczy-server',
      script: 'index.js',
      cwd: '/home/ubuntu/Mediczy/server',
      interpreter: 'node',
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '../logs/mediczy-server-error.log',
      out_file: '../logs/mediczy-server-out.log',
      log_file: '../logs/mediczy-server-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    
    // Development server - with nodemon auto-reload
    {
      name: 'mediczy-server-dev',
      script: './node_modules/.bin/nodemon',
      args: 'index.js',
      cwd: '/home/ubuntu/Mediczy/server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      error_file: '../logs/mediczy-server-dev-error.log',
      out_file: '../logs/mediczy-server-dev-out.log',
      log_file: '../logs/mediczy-server-dev-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'bullmq-workers',
      script: 'worker-process.js',
      cwd: '/home/ubuntu/Mediczy/server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '../logs/bullmq-workers-error.log',
      out_file: '../logs/bullmq-workers-out.log',
      time: true
    },
    {
      name: 'llm-orchestrator',
      script: '/home/ubuntu/Mediczy/ai-engine/llm_orchestrator.py',
      interpreter: 'python3',
      cwd: '/home/ubuntu/Mediczy/ai-engine',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        PYTHONUNBUFFERED: '1'
      },
      error_file: '../logs/llm-orchestrator-error.log',
      out_file: '../logs/llm-orchestrator-out.log',
      time: true
    },
    // Frontend application (React + Vite)
    {
      name: 'mediczy-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/ubuntu/Mediczy/client',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      error_file: '../logs/mediczy-frontend-error.log',
      out_file: '../logs/mediczy-frontend-out.log',
      log_file: '../logs/mediczy-frontend-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    // SIB Brain (AI Medical Pipeline - Port 8001)
    {
      name: 'mediczy-sib',
      script: './venv/bin/python',
      args: '-m uvicorn sib_app:app --host 0.0.0.0 --port 8001',
      cwd: '/home/ubuntu/Mediczy/ai-engine/doctor_bot',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '6G',
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        GROQ_API_KEY: process.env.GROQ_API_KEY || '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',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'AIzaSyCVa8eKHpCzWvyFrd4jKKxkomxHI8iAp48',
        SIB_PORT: '8001',
        SIB_HOST: '0.0.0.0',
        PYTHONUNBUFFERED: '1',
        LOG_LEVEL: 'INFO'
      },
      error_file: '/home/ubuntu/Mediczy/ai-engine/doctor_bot/logs/sib-error.log',
      out_file: '/home/ubuntu/Mediczy/ai-engine/doctor_bot/logs/sib-out.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    // MiroTalk SFU Video Server (Port 3010)
    {
      name: 'mirotalk-sfu',
      script: 'node',
      args: 'app/src/Server.js',
      cwd: '/home/ubuntu/mirotalk-sfu',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: '3010'
      },
      error_file: '/home/ubuntu/Mediczy/logs/mirotalk-error.log',
      out_file: '/home/ubuntu/Mediczy/logs/mirotalk-out.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    // n8n Workflow Automation (Port 5678)
    {
      name: 'mediczy-n8n',
      script: 'n8n',
      args: 'start',
      cwd: process.env.HOME + '/.n8n',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        N8N_BASIC_AUTH_ACTIVE: 'true',
        N8N_BASIC_AUTH_USER: 'admin',
        N8N_BASIC_AUTH_PASSWORD: 'MediczyN8N2025!',
        N8N_HOST: 'localhost',
        N8N_PROTOCOL: 'http',
        N8N_PORT: '5678',
        WEBHOOK_URL: 'http://localhost:5678',
        GENERIC_TIMEZONE: 'Asia/Kolkata',
        N8N_LOG_LEVEL: 'info',
        EXECUTIONS_DATA_SAVE_ON_ERROR: 'all',
        EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'all',
        EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS: 'true',
        DB_TYPE: 'postgresdb',
        DB_POSTGRESDB_HOST: 'localhost',
        DB_POSTGRESDB_PORT: '5432',
        DB_POSTGRESDB_DATABASE: 'mediczy_ai',
        DB_POSTGRESDB_USER: 'mediczy_helper',
        DB_POSTGRESDB_PASSWORD: 'Mediczy2024Helper',
        DB_POSTGRESDB_SCHEMA: 'n8n',
        MEDICZY_API_URL: 'http://localhost:8000/api',
        MEDICZY_WEBHOOK_SECRET: 'mediczy_n8n_webhook_2025',
        N8N_METRICS: 'true',
        N8N_SECURE_COOKIE: 'false'
      },
      error_file: process.env.HOME + '/.n8n/logs/error.log',
      out_file: process.env.HOME + '/.n8n/logs/out.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
