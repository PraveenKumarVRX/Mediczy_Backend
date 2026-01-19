/**
 * Request Logger Middleware
 * Logs all incoming HTTP requests with detailed information
 */

import { logger } from '../utils/logger.js';
import { debug } from '../utils/debugger.js';

export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // Add request ID to request object
  req.requestId = requestId;
  
  // Log incoming request
  logger.http(`→ ${req.method} ${req.path}`, {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    contentType: req.get('content-type'),
    userId: req.user?.id
  });

  // Debug detailed request info
  if (process.env.LOG_LEVEL === 'debug') {
    debug.log(`Request [${requestId}]`, {
      headers: req.headers,
      body: req.body,
      params: req.params
    });
  }

  // Capture response
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function (data) {
    const duration = Date.now() - startTime;
    
    logger.http(`← ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      responseSize: data ? Buffer.byteLength(data) : 0
    });

    if (process.env.LOG_RESPONSE_TIME === 'true') {
      res.setHeader('X-Response-Time', `${duration}ms`);
      res.setHeader('X-Request-Id', requestId);
    }

    return originalSend.apply(res, arguments);
  };

  res.json = function (data) {
    const duration = Date.now() - startTime;
    
    logger.http(`← ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration
    });

    if (process.env.LOG_LEVEL === 'debug') {
      debug.log(`Response [${requestId}]`, {
        statusCode: res.statusCode,
        data: typeof data === 'object' ? JSON.stringify(data).substring(0, 500) : data
      });
    }

    if (process.env.LOG_RESPONSE_TIME === 'true') {
      res.setHeader('X-Response-Time', `${duration}ms`);
      res.setHeader('X-Request-Id', requestId);
    }

    return originalJson.apply(res, arguments);
  };

  next();
}

export default requestLogger;
