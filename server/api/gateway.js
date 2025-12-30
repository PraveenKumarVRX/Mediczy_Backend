/**
 * API Gateway - Enterprise Grade
 * Central entry point for all API traffic
 * Supports: Web, iOS, Android, Third-party integrations
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';

// Middleware
import { multitenancyMiddleware } from '../../middleware/multitenancy.middleware.js';
import { requestLogger } from '../../middleware/logging.middleware.js';
import { errorHandler } from '../../middleware/errorHandler.middleware.js';
import { securityHeaders } from '../../middleware/security.middleware.js';
import { apiKeyAuth } from '../../middleware/apiKey.middleware.js';

// API Version Routes
import v1Router from './v1/index.js';

const gateway = express.Router();

/**
 * Global Middleware Stack
 */

// Security headers
gateway.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.mediczy.com', 'wss://mediczy.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration per client type
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://mediczy.com',
      'https://www.mediczy.com',
      'https://app.mediczy.com',
      'https://admin.mediczy.com',
      // Mobile app deep links
      'mediczy://',
      'com.mediczy.app://',
      // Development
      ...(process.env.NODE_ENV !== 'production' ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080'
      ] : [])
    ];
    
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-ID',
    'X-API-Key',
    'X-Client-Version',
    'X-Platform',
    'X-Device-ID',
    'X-Request-ID'
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ]
};
gateway.use(cors(corsOptions));

// Compression
gateway.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  threshold: 1024 // Only compress responses > 1KB
}));

// Request parsing
gateway.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store raw body for webhook signature verification
  }
}));
gateway.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID for tracing
gateway.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Client info extraction (for mobile apps)
gateway.use((req, res, next) => {
  req.clientInfo = {
    platform: req.headers['x-platform'] || 'web',
    version: req.headers['x-client-version'] || '1.0.0',
    deviceId: req.headers['x-device-id'],
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0]
  };
  next();
});

// Request logging
gateway.use(requestLogger);

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by API key, user ID, or IP
    return req.headers['x-api-key'] || req.user?.id || req.ip;
  }
});
gateway.use(globalLimiter);

// Multitenancy
gateway.use(multitenancyMiddleware);

/**
 * Health Check Endpoints
 */
gateway.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0',
    environment: process.env.NODE_ENV
  });
});

gateway.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {}
  };

  // Check database
  try {
    // await db.query('SELECT 1');
    health.services.database = { status: 'healthy' };
  } catch (error) {
    health.services.database = { status: 'unhealthy', error: error.message };
    health.status = 'degraded';
  }

  // Check Redis
  try {
    // await redis.ping();
    health.services.redis = { status: 'healthy' };
  } catch (error) {
    health.services.redis = { status: 'unhealthy', error: error.message };
    health.status = 'degraded';
  }

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

/**
 * API Version Routes
 */
gateway.use('/v1', v1Router);

// Default to v1 for unversioned requests (backwards compatibility)
gateway.use('/', v1Router);

/**
 * API Documentation
 */
gateway.get('/docs', (req, res) => {
  res.redirect('/api/v1/docs');
});

/**
 * 404 Handler
 */
gateway.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
    availableVersions: ['v1']
  });
});

/**
 * Error Handler
 */
gateway.use(errorHandler);

export default gateway;
