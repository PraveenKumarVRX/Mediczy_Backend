module.exports = {
  apps: [{
    name: 'mediczy-n8n',
    script: 'n8n',
    args: 'start',
    cwd: process.env.HOME + '/.n8n',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      // n8n Authentication
      N8N_BASIC_AUTH_ACTIVE: 'true',
      N8N_BASIC_AUTH_USER: 'admin',
      N8N_BASIC_AUTH_PASSWORD: 'MediczyN8N2025!',
      
      // n8n Host Configuration
      N8N_HOST: 'localhost',
      N8N_PROTOCOL: 'http',
      N8N_PORT: '5678',
      WEBHOOK_URL: 'http://localhost:5678',
      GENERIC_TIMEZONE: 'Asia/Kolkata',
      N8N_LOG_LEVEL: 'info',
      
      // Execution Data Settings
      EXECUTIONS_DATA_SAVE_ON_ERROR: 'all',
      EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'all',
      EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS: 'true',
      
      // Core PostgreSQL Database Connection (mediczy_ai)
      DB_TYPE: 'postgresdb',
      DB_POSTGRESDB_HOST: 'localhost',
      DB_POSTGRESDB_PORT: '5432',
      DB_POSTGRESDB_DATABASE: 'mediczy_ai',
      DB_POSTGRESDB_USER: 'mediczy_helper',
      DB_POSTGRESDB_PASSWORD: 'Mediczy2024Helper',
      DB_POSTGRESDB_SCHEMA: 'n8n',
      
      // Mediczy API Configuration
      MEDICZY_API_URL: 'http://localhost:8000/api',
      MEDICZY_WEBHOOK_SECRET: 'mediczy_n8n_webhook_2025',
      
      // Performance
      N8N_METRICS: 'true',
      N8N_SECURE_COOKIE: 'false'
    },
    error_file: '~/.n8n/logs/error.log',
    out_file: '~/.n8n/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
