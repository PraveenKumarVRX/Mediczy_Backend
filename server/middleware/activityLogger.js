import express from 'express';
import jwt from 'jsonwebtoken';

// Activity logging middleware
const activityLogger = (options = {}) => {
  const { 
    includeBody = false, 
    excludePaths = ['/api/admin/activity-logs'],
    sensitiveFields = ['password', 'token', 'secret']
  } = options;

  return (req, res, next) => {
    // Skip logging for excluded paths
    if (excludePaths.includes(req.path)) {
      return next();
    }

    const originalSend = res.send;
    const originalJson = res.json;
    let responseBody = null;

    // Capture response body
    res.send = function(body) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.json = function(body) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Log activity after response is sent
    res.on('finish', () => {
      logActivity(req, res, responseBody, { includeBody, sensitiveFields });
    });

    next();
  };
};

// Function to log activity
const logActivity = async (req, res, responseBody, options) => {
  try {
    const { includeBody, sensitiveFields } = options;
    
    // Extract user info from token
    let userInfo = {
      userId: null,
      userType: 'system',
      email: null
    };

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded) {
          userInfo = {
            userId: decoded.id || decoded.userId,
            userType: decoded.isAdmin ? 'admin' : decoded.isDoctor ? 'doctor' : 'user',
            email: decoded.email
          };
        }
      } catch (err) {
        // Token decode failed, keep default values
      }
    }

    // Determine activity type and result
    const activity = determineActivity(req, res);
    const result = determineResult(res.statusCode);

    // Sanitize request body
    let requestBody = null;
    if (includeBody && req.body) {
      requestBody = sanitizeData(req.body, sensitiveFields);
    }

    // Sanitize response body
    let sanitizedResponse = null;
    if (includeBody && responseBody) {
      try {
        const parsedResponse = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
        sanitizedResponse = sanitizeData(parsedResponse, sensitiveFields);
      } catch (err) {
        sanitizedResponse = 'Response not JSON';
      }
    }

    // Create activity log entry
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      userId: userInfo.userId,
      userType: userInfo.userType,
      userEmail: userInfo.email,
      activity: activity.name,
      action: activity.action,
      resource: activity.resource,
      resourceId: extractResourceId(req),
      result,
      details: generateDetails(activity, result, req, res),
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - req.startTime,
      requestBody,
      responseBody: sanitizedResponse,
      metadata: {
        sessionId: req.sessionID || 'no-session',
        referrer: req.headers.referer,
        contentType: req.headers['content-type'],
        responseSize: JSON.stringify(responseBody || '').length
      }
    };

    // Store the log entry (implement your storage method)
    await storeActivityLog(logEntry);

  } catch (error) {
    console.error('Activity logging error:', error);
  }
};

// Determine activity type from request
const determineActivity = (req, res) => {
  const method = req.method.toLowerCase();
  const path = req.path.toLowerCase();

  // Authentication activities
  if (path.includes('/login')) {
    return { name: 'User Login', action: 'login', resource: 'authentication' };
  }
  if (path.includes('/logout')) {
    return { name: 'User Logout', action: 'logout', resource: 'authentication' };
  }
  if (path.includes('/register')) {
    return { name: 'User Registration', action: 'create', resource: 'user' };
  }

  // Admin activities
  if (path.includes('/admin/')) {
    const resource = extractAdminResource(path);
    const action = method === 'post' ? 'create' : 
                   method === 'put' || method === 'patch' ? 'update' : 
                   method === 'delete' ? 'delete' : 'view';
    return { 
      name: `Admin ${action} ${resource}`, 
      action, 
      resource: resource || 'admin'
    };
  }

  // User management
  if (path.includes('/users')) {
    const action = method === 'post' ? 'create' : 
                   method === 'put' || method === 'patch' ? 'update' : 
                   method === 'delete' ? 'delete' : 'view';
    return { name: `${action} User`, action, resource: 'user' };
  }

  // Doctor management
  if (path.includes('/doctors')) {
    const action = method === 'post' ? 'create' : 
                   method === 'put' || method === 'patch' ? 'update' : 
                   method === 'delete' ? 'delete' : 'view';
    return { name: `${action} Doctor`, action, resource: 'doctor' };
  }

  // Appointment management
  if (path.includes('/appointments')) {
    const action = method === 'post' ? 'create' : 
                   method === 'put' || method === 'patch' ? 'update' : 
                   method === 'delete' ? 'cancel' : 'view';
    return { name: `${action} Appointment`, action, resource: 'appointment' };
  }

  // Billing activities
  if (path.includes('/billing') || path.includes('/payments')) {
    const action = method === 'post' ? 'create' : 
                   method === 'put' || method === 'patch' ? 'update' : 
                   method === 'delete' ? 'delete' : 'view';
    return { name: `${action} Billing`, action, resource: 'billing' };
  }

  // Email activities
  if (path.includes('/email')) {
    const action = method === 'post' ? 'send' : 'view';
    return { name: `${action} Email`, action, resource: 'email' };
  }

  // Reports and exports
  if (path.includes('/export') || path.includes('/report')) {
    return { name: 'Export Data', action: 'export', resource: 'report' };
  }

  // Default activity
  return { 
    name: `${method.toUpperCase()} ${path}`, 
    action: method, 
    resource: 'system' 
  };
};

// Extract admin resource from path
const extractAdminResource = (path) => {
  const segments = path.split('/');
  const adminIndex = segments.indexOf('admin');
  if (adminIndex !== -1 && segments.length > adminIndex + 1) {
    return segments[adminIndex + 1];
  }
  return 'admin';
};

// Determine result based on status code
const determineResult = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode >= 400 && statusCode < 500) return 'failure';
  if (statusCode >= 500) return 'failure';
  return 'info';
};

// Extract resource ID from request
const extractResourceId = (req) => {
  const segments = req.path.split('/');
  const lastSegment = segments[segments.length - 1];
  
  // Check if last segment is an ID (number or UUID-like)
  if (/^[0-9]+$/.test(lastSegment) || /^[a-f0-9\-]+$/i.test(lastSegment)) {
    return lastSegment;
  }
  
  // Check for ID in query params
  return req.query.id || req.body?.id || null;
};

// Generate human-readable details
const generateDetails = (activity, result, req, res) => {
  const action = activity.action;
  const resource = activity.resource;
  
  // Detailed descriptions based on action and result
  const detailTemplates = {
    success: {
      login: `Successfully logged into the system`,
      logout: `Successfully logged out from the system`,
      create: `Successfully created new ${resource}`,
      update: `Successfully updated ${resource} information`,
      delete: `Successfully deleted ${resource}`,
      get: `Successfully retrieved ${resource} data`,
      view: `Successfully viewed ${resource} details`,
      export: `Successfully exported ${resource} data`,
      import: `Successfully imported ${resource} data`,
      post: `Successfully submitted ${resource} data`,
      put: `Successfully modified ${resource} record`,
      patch: `Successfully patched ${resource} data`
    },
    failure: {
      login: `Failed to login - invalid credentials or session error`,
      logout: `Logout failed due to session error`,
      create: `Failed to create ${resource} - validation or permission error`,
      update: `Failed to update ${resource} - insufficient permissions`,
      delete: `Failed to delete ${resource} - resource may be in use`,
      get: `Failed to retrieve ${resource} - not found or access denied`,
      view: `Failed to access ${resource} - not found`,
      export: `Failed to export ${resource} - database error`,
      import: `Failed to import ${resource} - invalid format`,
      post: `Failed to submit ${resource} - validation error`,
      put: `Failed to modify ${resource} - error occurred`,
      patch: `Failed to patch ${resource} - update rejected`
    },
    warning: {
      login: `Login with weak password or unusual location detected`,
      logout: `Session timeout warning issued`,
      create: `${resource} created with missing optional fields`,
      update: `${resource} updated with validation warnings`,
      delete: `${resource} deletion requires additional confirmation`,
      get: `${resource} retrieved with limited data`,
      view: `${resource} accessed with limited permissions`,
      export: `${resource} export completed with warnings`,
      import: `${resource} import completed with warnings`,
      post: `${resource} submitted with warnings`,
      put: `${resource} modification completed with warnings`,
      patch: `${resource} patch applied with warnings`
    },
    info: {
      login: `User login recorded for audit purposes`,
      logout: `User logout recorded for session tracking`,
      create: `New ${resource} creation initiated`,
      update: `${resource} update process started`,
      delete: `${resource} deletion process initiated`,
      get: `${resource} data access logged`,
      view: `${resource} view access logged`,
      export: `${resource} export process initiated`,
      import: `${resource} import process started`,
      post: `${resource} submission initiated`,
      put: `${resource} modification initiated`,
      patch: `${resource} patch initiated`
    }
  };
  
  const resultTemplates = detailTemplates[result] || detailTemplates.info;
  const detail = resultTemplates[action.toLowerCase()];
  
  if (detail) {
    return detail;
  }
  
  // Fallback with more context
  if (result === 'success') {
    return `Successfully performed ${action} on ${resource}`;
  } else if (result === 'failure') {
    return `Failed to ${action} ${resource} - HTTP ${res.statusCode}`;
  } else {
    return `${action} ${resource} completed with status: ${result}`;
  }
};

// Get client IP address
const getClientIP = (req) => {
  return req.headers['x-forwarded-for'] ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.connection?.socket?.remoteAddress ||
         req.ip ||
         'unknown';
};

// Sanitize sensitive data
const sanitizeData = (data, sensitiveFields) => {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = Array.isArray(data) ? [] : {};
  
  for (const key in data) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof data[key] === 'object') {
      sanitized[key] = sanitizeData(data[key], sensitiveFields);
    } else {
      sanitized[key] = data[key];
    }
  }
  
  return sanitized;
};

// Store activity log (implement based on your database)
const storeActivityLog = async (logEntry) => {
  try {
    // For now, store in memory (replace with actual database storage)
    if (!global.activityLogs) {
      global.activityLogs = [];
    }
    
    global.activityLogs.unshift(logEntry);
    
    // Keep only last 10000 logs in memory
    if (global.activityLogs.length > 10000) {
      global.activityLogs = global.activityLogs.slice(0, 10000);
    }
    
    // In production, save to database:
    // await db.collection('activity_logs').insertOne(logEntry);
    
  } catch (error) {
    console.error('Failed to store activity log:', error);
  }
};

// Activity logs API routes
const activityLogRoutes = express.Router();

// Get activity logs (admin only)
activityLogRoutes.get('/admin/activity-logs', async (req, res) => {
  try {
    // Verify admin token
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Authorization required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (!decoded.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // Get query parameters for filtering
    const {
      page = 1,
      limit = 20,
      userType,
      action,
      result,
      startDate,
      endDate,
      search
    } = req.query;

    // Get logs from storage (replace with actual database query)
    let logs = global.activityLogs || [];

    // Apply filters
    if (userType && userType !== 'all') {
      logs = logs.filter(log => log.userType === userType);
    }
    
    if (action && action !== 'all') {
      logs = logs.filter(log => log.action === action);
    }
    
    if (result && result !== 'all') {
      logs = logs.filter(log => log.result === result);
    }
    
    if (startDate) {
      logs = logs.filter(log => new Date(log.timestamp) >= new Date(startDate));
    }
    
    if (endDate) {
      logs = logs.filter(log => new Date(log.timestamp) <= new Date(endDate + 'T23:59:59'));
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => 
        log.activity.toLowerCase().includes(searchLower) ||
        log.details.toLowerCase().includes(searchLower) ||
        log.userEmail?.toLowerCase().includes(searchLower) ||
        log.ipAddress?.toLowerCase().includes(searchLower)
      );
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedLogs = logs.slice(startIndex, endIndex);

    res.json({
      logs: paginatedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: logs.length,
        pages: Math.ceil(logs.length / limit)
      },
      filters: {
        userType,
        action,
        result,
        startDate,
        endDate,
        search
      }
    });

  } catch (error) {
    console.error('Activity logs fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch activity logs' });
  }
});

// Activity stats endpoint
activityLogRoutes.get('/admin/activity-stats', async (req, res) => {
  try {
    const logs = global.activityLogs || [];
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
      total: logs.length,
      last24Hours: logs.filter(log => new Date(log.timestamp) > last24Hours).length,
      last7Days: logs.filter(log => new Date(log.timestamp) > last7Days).length,
      byResult: {
        success: logs.filter(log => log.result === 'success').length,
        failure: logs.filter(log => log.result === 'failure').length,
        warning: logs.filter(log => log.result === 'warning').length,
        info: logs.filter(log => log.result === 'info').length
      },
      byUserType: {
        admin: logs.filter(log => log.userType === 'admin').length,
        doctor: logs.filter(log => log.userType === 'doctor').length,
        user: logs.filter(log => log.userType === 'user').length,
        system: logs.filter(log => log.userType === 'system').length
      },
      topActions: getTopActions(logs),
      topResources: getTopResources(logs)
    };

    res.json({ stats });
  } catch (error) {
    console.error('Activity stats error:', error);
    res.status(500).json({ message: 'Failed to fetch activity stats' });
  }
});

// Helper functions for stats
const getTopActions = (logs) => {
  const actionCounts = logs.reduce((acc, log) => {
    acc[log.action] = (acc[log.action] || 0) + 1;
    return acc;
  }, {});
  
  return Object.entries(actionCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([action, count]) => ({ action, count }));
};

const getTopResources = (logs) => {
  const resourceCounts = logs.reduce((acc, log) => {
    acc[log.resource] = (acc[log.resource] || 0) + 1;
    return acc;
  }, {});
  
  return Object.entries(resourceCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([resource, count]) => ({ resource, count }));
};

export {
  activityLogger,
  activityLogRoutes,
  storeActivityLog
};