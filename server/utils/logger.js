/**
 * Advanced Logging Utility for Mediczy Application
 * Provides structured logging with multiple levels, file output, and console formatting
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
  constructor(options = {}) {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      HTTP: 3,
      DEBUG: 4,
      TRACE: 5
    };

    this.colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      HTTP: '\x1b[35m',  // Magenta
      DEBUG: '\x1b[32m', // Green
      TRACE: '\x1b[37m', // White
      RESET: '\x1b[0m'
    };

    this.context = options.context || 'APP';
    this.logLevel = this.levels[process.env.LOG_LEVEL?.toUpperCase()] ?? this.levels.INFO;
    this.enableFileLogging = process.env.ENABLE_FILE_LOGGING !== 'false';
    this.enableConsoleLogging = process.env.ENABLE_CONSOLE_LOGGING !== 'false';
    this.logDir = options.logDir || path.join(process.cwd(), 'logs');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;

    // Create logs directory if it doesn't exist
    if (this.enableFileLogging && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.currentLogFile = this.getLogFilePath();
  }

  getLogFilePath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${this.context.toLowerCase()}-${date}.log`);
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
    
    return {
      timestamp,
      level,
      context: this.context,
      message,
      ...meta,
      pid: process.pid
    };
  }

  shouldLog(level) {
    return this.levels[level] <= this.logLevel;
  }

  writeToFile(logEntry) {
    if (!this.enableFileLogging) return;

    try {
      const logFile = this.getLogFilePath();
      const logLine = JSON.stringify(logEntry) + '\n';

      // Check file size and rotate if needed
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxFileSize) {
          this.rotateLogFile(logFile);
        }
      }

      fs.appendFileSync(logFile, logLine, 'utf8');
    } catch (err) {
      console.error('Failed to write to log file:', err.message);
    }
  }

  rotateLogFile(logFile) {
    const timestamp = Date.now();
    const rotatedFile = logFile.replace('.log', `.${timestamp}.log`);
    
    try {
      fs.renameSync(logFile, rotatedFile);
      
      // Clean up old log files
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith(this.context.toLowerCase()) && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Delete oldest files if we exceed maxFiles
      if (files.length > this.maxFiles) {
        files.slice(this.maxFiles).forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (err) {
      console.error('Failed to rotate log file:', err.message);
    }
  }

  writeToConsole(level, message, meta = {}) {
    if (!this.enableConsoleLogging) return;

    const color = this.colors[level];
    const reset = this.colors.RESET;
    const timestamp = new Date().toISOString();
    const prefix = `${color}[${timestamp}] [${level}] [${this.context}]${reset}`;
    
    console.log(`${prefix} ${message}`);
    
    if (Object.keys(meta).length > 0) {
      console.log(`${color}Meta:${reset}`, meta);
    }
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const logEntry = this.formatMessage(level, message, meta);

    this.writeToConsole(level, message, meta);
    this.writeToFile(logEntry);

    return logEntry;
  }

  error(message, meta = {}) {
    return this.log('ERROR', message, meta);
  }

  warn(message, meta = {}) {
    return this.log('WARN', message, meta);
  }

  info(message, meta = {}) {
    return this.log('INFO', message, meta);
  }

  http(message, meta = {}) {
    return this.log('HTTP', message, meta);
  }

  debug(message, meta = {}) {
    return this.log('DEBUG', message, meta);
  }

  trace(message, meta = {}) {
    return this.log('TRACE', message, meta);
  }

  // Express middleware for HTTP request logging
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Log request
      this.http(`${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      // Capture response
      const originalSend = res.send;
      res.send = function (data) {
        const duration = Date.now() - startTime;
        
        this.log('HTTP', `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          responseSize: data ? data.length : 0
        });

        return originalSend.apply(res, arguments);
      }.bind(this);

      next();
    };
  }

  // Create a child logger with additional context
  child(additionalContext) {
    return new Logger({
      context: `${this.context}:${additionalContext}`,
      logDir: this.logDir,
      maxFileSize: this.maxFileSize,
      maxFiles: this.maxFiles
    });
  }
}

// Create default logger instances
export const logger = new Logger({ context: 'SERVER' });
export const dbLogger = new Logger({ context: 'DATABASE' });
export const aiLogger = new Logger({ context: 'AI' });
export const authLogger = new Logger({ context: 'AUTH' });
export const apiLogger = new Logger({ context: 'API' });

export default Logger;
