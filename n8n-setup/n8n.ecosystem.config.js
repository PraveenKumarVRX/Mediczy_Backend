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
      // n8n Host Configuration
      N8N_HOST: 'n8n.mediqzy.com',
      N8N_PROTOCOL: 'https',
      N8N_PORT: '5678',
      WEBHOOK_URL: 'https://n8n.mediqzy.com',
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
      N8N_SECURE_COOKIE: 'false',

      // Disable telemetry & AI assistant (community plan — avoids console noise)
      N8N_DIAGNOSTICS_ENABLED: 'false',
      N8N_VERSION_NOTIFICATIONS_ENABLED: 'true',
      N8N_TEMPLATES_ENABLED: 'false',
      N8N_AI_ENABLED: 'false'
    },
    error_file: '~/.n8n/logs/error.log',
    out_file: '~/.n8n/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
