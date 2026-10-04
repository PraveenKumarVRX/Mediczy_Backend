import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Custom format for production logs
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Human-readable format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create logs directory if it doesn't exist
import fs from 'fs';
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure winston logger
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: IS_PRODUCTION ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'mediczy-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true
    })
  ],
  exitOnError: false
});

// Add file transports in production
if (IS_PRODUCTION) {
  logger.add(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    })
  );
  
  logger.add(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    })
  );
}

// Monitoring scrapes were the single largest source of log volume: Prometheus polling
// /metrics/internal and the blackbox exporter polling /api/health produced ~63% of all lines
// (12.6k of a 20k-line sample), which buried real events and rotated useful history away early.
// These paths are logged only when they FAIL, so a broken health check is still visible, and
// LOG_MONITORING_REQUESTS=true restores the old behaviour for debugging.
const MONITORING_PATHS = new Set([
  '/api/health',
  '/health',
  '/healthz',
  '/metrics',
  '/metrics/internal',
]);

function isMonitoringRequest(req) {
  const rawPath = req.path || req.url || '';
  return MONITORING_PATHS.has(rawPath.split('?')[0]);
}

// Request logging middleware
export function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  req.requestId = requestId;
  req.logger = logger.child({ requestId });

  const quiet = isMonitoringRequest(req) && process.env.LOG_MONITORING_REQUESTS !== 'true';

  // Log request
  if (!quiet) {
    req.logger.info('Incoming request', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  }

  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    // A failing monitoring endpoint is exactly what we want to see, so quiet applies only to
    // successful scrapes.
    if (!quiet || res.statusCode >= 400) {
      const level = quiet ? 'warn' : 'info';
      req.logger[level]('Response sent', {
        ...(quiet ? { method: req.method, url: req.url } : {}),
        statusCode: res.statusCode,
        duration: `${duration}ms`
      });
    }
    return originalSend.call(this, data);
  };

  next();
}

// Error logging middleware
export function errorLogger(err, req, res, next) {
  const requestId = req.requestId || 'unknown';
  
  logger.error('Request error', {
    requestId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip
  });
  
  // Don't expose internal errors in production
  const statusCode = err.statusCode || 500;
  const message = IS_PRODUCTION && statusCode === 500
    ? 'Internal server error'
    : err.message;
  
  res.status(statusCode).json({
    success: false,
    message,
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

export default logger;
