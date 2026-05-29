module.exports = {
  apps: [
    // LiveKit SFU Video Server (Ports 7880/7881)
    {
      name: 'livekit',
      script: '/usr/local/bin/livekit-server',
      args: '--config /home/ubuntu/livekit-config.yaml',
      cwd: '/home/ubuntu',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      kill_timeout: 8000,       // 8s to fully release ports 7880/7881
      restart_delay: 5000,      // 5s between restart attempts
      max_restarts: 5,
      min_uptime: '10s',
      error_file: '/home/ubuntu/.pm2/logs/livekit-error.log',
      out_file: '/home/ubuntu/.pm2/logs/livekit-out.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Production server - cluster mode (uses all CPU cores)
    {
      name: 'mediczy-server',
      script: 'scripts/ssm-env-loader.mjs',
      args: 'index.js',
      cwd: '/home/ubuntu/Mediczy/server',
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',
      watch: false,
      instances: 1,       // Single instance to avoid memory-threshold restart loops
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        AWS_REGION: 'ap-south-1',
        SSM_PARAM_PATH: '/mediczy/prod',
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
      name: 'mediczy-worker',
      script: 'worker-wrapper.cjs',
      cwd: '/home/ubuntu/Mediczy/server',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '../logs/mediczy-worker-error.log',
      out_file: '../logs/mediczy-worker-out.log',
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
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        POSTGRES_HOST: process.env.POSTGRES_HOST || '127.0.0.1',
        POSTGRES_PORT: process.env.POSTGRES_PORT || '5432',
        POSTGRES_DATABASE: process.env.POSTGRES_DATABASE || 'mediczy_ai',
        POSTGRES_DB: process.env.POSTGRES_DATABASE || 'mediczy_ai',
        POSTGRES_USER: process.env.POSTGRES_USER || 'mediczy_helper',
        POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined),
        DUCKDB_ENABLED: 'true',
        DUCKDB_PATH: ':memory:',
        PGVECTOR_DIMENSION: process.env.PGVECTOR_DIMENSION || '1536',
        SIB_PORT: '8001',
        SIB_HOST: '0.0.0.0',
        PYTHONUNBUFFERED: '1',
        LOG_LEVEL: 'INFO',
        LOGURU_LEVEL: 'WARNING',
        SIB_LANGGRAPH_ENABLED: 'true'
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
        N8N_BASIC_AUTH_USER: process.env.N8N_BASIC_AUTH_USER || 'admin',
        N8N_BASIC_AUTH_PASSWORD: process.env.N8N_BASIC_AUTH_PASSWORD,
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
        DB_POSTGRESDB_PASSWORD: process.env.DB_POSTGRESDB_PASSWORD,
        DB_POSTGRESDB_SCHEMA: 'n8n',
        MEDICZY_API_URL: 'http://localhost:8000/api',
        MEDICZY_WEBHOOK_SECRET: process.env.MEDICZY_WEBHOOK_SECRET,
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
