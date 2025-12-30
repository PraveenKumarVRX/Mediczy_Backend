/**
 * Request Logging Middleware
 * Provides detailed logging for debugging, monitoring, and audit trails
 * Supports multiple output formats and destinations
 */

import fs from 'fs';
import path from 'path';

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

/**
 * Colorize output for terminal
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const methodColors = {
  GET: colors.green,
  POST: colors.blue,
  PUT: colors.yellow,
  PATCH: colors.yellow,
  DELETE: colors.red
};

const statusColors = {
  2: colors.green,  // 2xx
  3: colors.cyan,   // 3xx
  4: colors.yellow, // 4xx
  5: colors.red     // 5xx
};

/**
 * Format bytes to human readable
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format duration
 */
const formatDuration = (ms) => {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * Sanitize sensitive data from logs
 */
const sanitize = (obj, sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie', 'apiKey', 'api_key']) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitize(sanitized[key], sensitiveKeys);
    }
  }
  
  return sanitized;
};

/**
 * Generate request ID
 */
const generateRequestId = () => {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get client info
 */
const getClientInfo = (req) => {
  return {
    ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
    referer: req.headers.referer
  };
};

/**
 * Main request logger middleware
 */
export const requestLogger = (options = {}) => {
  const {
    format = 'combined', // 'combined', 'short', 'json', 'dev'
    skip = () => false,
    logBody = false,
    logHeaders = false,
    maxBodySize = 1000,
    outputStream = process.stdout
  } = options;

  return (req, res, next) => {
    // Skip logging if condition met
    if (skip(req, res)) {
      return next();
    }

    // Generate request ID
    req.requestId = req.headers['x-request-id'] || generateRequestId();
    res.setHeader('X-Request-ID', req.requestId);

    const startTime = process.hrtime();
    const startTimestamp = new Date();

    // Capture response body if needed
    const originalSend = res.send;
    let responseBody;
    
    if (logBody && currentLogLevel >= LOG_LEVELS.DEBUG) {
      res.send = function (body) {
        responseBody = body;
        return originalSend.call(this, body);
      };
    }

    // Log on response finish
    res.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const duration = seconds * 1000 + nanoseconds / 1000000;
      
      const logData = buildLogData(req, res, {
        startTimestamp,
        duration,
        responseBody,
        logBody,
        logHeaders,
        maxBodySize
      });

      // Format and output
      const output = formatLog(logData, format);
      outputStream.write(output + '\n');

      // Emit log event for external handlers
      if (options.onLog) {
        options.onLog(logData);
      }
    });

    next();
  };
};

/**
 * Build log data object
 */
const buildLogData = (req, res, options) => {
  const { startTimestamp, duration, responseBody, logBody, logHeaders, maxBodySize } = options;
  
  const data = {
    requestId: req.requestId,
    timestamp: startTimestamp.toISOString(),
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    statusCode: res.statusCode,
    duration: duration,
    durationFormatted: formatDuration(duration),
    contentLength: res.getHeader('content-length'),
    contentLengthFormatted: formatBytes(parseInt(res.getHeader('content-length')) || 0),
    client: getClientInfo(req),
    user: req.user ? { id: req.user.id, role: req.user.role } : undefined,
    tenant: req.tenantId || undefined
  };

  if (logHeaders && currentLogLevel >= LOG_LEVELS.DEBUG) {
    data.requestHeaders = sanitize(req.headers);
    data.responseHeaders = sanitize(res.getHeaders());
  }

  if (logBody && currentLogLevel >= LOG_LEVELS.DEBUG) {
    if (req.body && Object.keys(req.body).length > 0) {
      const bodyStr = JSON.stringify(sanitize(req.body));
      data.requestBody = bodyStr.length > maxBodySize 
        ? bodyStr.substring(0, maxBodySize) + '...[truncated]'
        : sanitize(req.body);
    }
    
    if (responseBody && typeof responseBody === 'string') {
      data.responseBody = responseBody.length > maxBodySize
        ? responseBody.substring(0, maxBodySize) + '...[truncated]'
        : responseBody;
    }
  }

  return data;
};

/**
 * Format log output
 */
const formatLog = (data, format) => {
  switch (format) {
    case 'json':
      return JSON.stringify(data);
      
    case 'dev':
      return formatDevLog(data);
      
    case 'short':
      return `${data.method} ${data.url} ${data.statusCode} ${data.durationFormatted}`;
      
    case 'combined':
    default:
      return formatCombinedLog(data);
  }
};

/**
 * Development format with colors
 */
const formatDevLog = (data) => {
  const methodColor = methodColors[data.method] || colors.gray;
  const statusColor = statusColors[Math.floor(data.statusCode / 100)] || colors.gray;
  
  let line = `${colors.gray}${data.timestamp}${colors.reset} `;
  line += `${methodColor}${data.method.padEnd(7)}${colors.reset} `;
  line += `${data.url} `;
  line += `${statusColor}${data.statusCode}${colors.reset} `;
  line += `${colors.cyan}${data.durationFormatted}${colors.reset}`;
  
  if (data.contentLengthFormatted !== '0 B') {
    line += ` ${colors.gray}${data.contentLengthFormatted}${colors.reset}`;
  }
  
  if (data.user) {
    line += ` ${colors.magenta}[${data.user.role}:${data.user.id}]${colors.reset}`;
  }
  
  return line;
};

/**
 * Combined Apache-like format
 */
const formatCombinedLog = (data) => {
  const ip = data.client?.ip || '-';
  const user = data.user?.id || '-';
  const time = data.timestamp;
  const request = `${data.method} ${data.url}`;
  const status = data.statusCode;
  const size = data.contentLength || 0;
  const referer = data.client?.referer || '-';
  const userAgent = data.client?.userAgent || '-';
  
  return `${ip} - ${user} [${time}] "${request}" ${status} ${size} "${referer}" "${userAgent}" ${data.durationFormatted}`;
};

/**
 * File logger - writes to file with rotation
 */
export const fileLogger = (logDir = './logs') => {
  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const getLogFileName = () => {
    const date = new Date().toISOString().split('T')[0];
    return path.join(logDir, `access-${date}.log`);
  };

  return requestLogger({
    format: 'json',
    outputStream: {
      write: (data) => {
        fs.appendFileSync(getLogFileName(), data);
      }
    }
  });
};

/**
 * Error logger - logs only errors
 */
export const errorLogger = (options = {}) => {
  return (err, req, res, next) => {
    const logData = {
      level: 'ERROR',
      requestId: req.requestId || generateRequestId(),
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      error: {
        name: err.name,
        message: err.message,
        code: err.code,
        statusCode: err.statusCode || 500,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      },
      client: getClientInfo(req),
      user: req.user ? { id: req.user.id, role: req.user.role } : undefined
    };

    console.error(JSON.stringify(logData));
    
    next(err);
  };
};

/**
 * Audit logger for sensitive operations
 */
export const auditLogger = (action, options = {}) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(body) {
      // Log after successful operation
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const auditLog = {
          type: 'AUDIT',
          action,
          timestamp: new Date().toISOString(),
          user: req.user ? {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role
          } : null,
          tenant: req.tenantId,
          resource: {
            type: options.resourceType,
            id: req.params.id || options.getResourceId?.(req)
          },
          changes: options.getChanges?.(req, body),
          client: getClientInfo(req),
          requestId: req.requestId
        };

        // In production, send to audit log service
        console.log('[AUDIT]', JSON.stringify(auditLog));
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
};

/**
 * Performance logger for slow requests
 */
export const performanceLogger = (threshold = 1000) => {
  return (req, res, next) => {
    const start = process.hrtime();
    
    res.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(start);
      const duration = seconds * 1000 + nanoseconds / 1000000;
      
      if (duration > threshold) {
        console.warn(`[SLOW REQUEST] ${req.method} ${req.url} took ${duration.toFixed(0)}ms`);
      }
    });
    
    next();
  };
};

export default {
  requestLogger,
  fileLogger,
  errorLogger,
  auditLogger,
  performanceLogger
};
