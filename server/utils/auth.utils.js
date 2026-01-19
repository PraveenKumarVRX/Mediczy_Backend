/**
 * Centralized Authentication Utilities
 * Standardized authentication functions used across all login endpoints
 * Fixes: Inconsistent JWT generation, password validation issues, duplicate code
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { JWT_CONFIG, PASSWORD_CONFIG, RATE_LIMIT_CONFIG } from '../config/auth.config.js';
import { logger, authLogger } from '../utils/logger.js';
import { debug } from '../utils/debugger.js';

// Rate limiting storage
const loginAttempts = new Map();

/**
 * Check rate limiting for login attempts
 */
export const checkRateLimit = (identifier) => {
    const now = Date.now();
    const attempts = loginAttempts.get(identifier) || {
        count: 0,
        resetTime: now + RATE_LIMIT_CONFIG.WINDOW_MS
    };

    // Reset if window has passed
    if (now > attempts.resetTime) {
        loginAttempts.set(identifier, {
            count: 1,
            resetTime: now + RATE_LIMIT_CONFIG.WINDOW_MS
        });
        return { allowed: true, remaining: RATE_LIMIT_CONFIG.MAX_ATTEMPTS - 1 };
    }

    // Check if max attempts exceeded
    if (attempts.count >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS) {
        const retryAfter = Math.ceil((attempts.resetTime - now) / 1000 / 60); // minutes
        return {
            allowed: false,
            remaining: 0,
            retryAfter
        };
    }

    // Increment attempt count
    attempts.count += 1;
    loginAttempts.set(identifier, attempts);

    return {
        allowed: true,
        remaining: RATE_LIMIT_CONFIG.MAX_ATTEMPTS - attempts.count
    };
};

/**
 * Reset rate limiting for a specific identifier
 */
export const resetRateLimit = (identifier) => {
    loginAttempts.delete(identifier);
};

/**
 * Generate JWT token with consistent configuration
 * CRITICAL: This ensures ALL tokens use the same JWT_SECRET
 */
export const generateToken = (payload, options = {}) => {
    try {
        const tokenPayload = {
            id: payload.id,
            email: payload.email,
            role: payload.role,
            ...payload
        };

        const tokenOptions = {
            expiresIn: options.expiresIn || JWT_CONFIG.EXPIRY.NORMAL,
            algorithm: JWT_CONFIG.ALGORITHM
        };

        const token = jwt.sign(tokenPayload, JWT_CONFIG.SECRET, tokenOptions);

        authLogger.debug('Token generated', {
            userId: payload.id,
            role: payload.role,
            expiresIn: tokenOptions.expiresIn
        });

        return token;
    } catch (error) {
        authLogger.error('Token generation failed', { error: error.message });
        throw new Error('Failed to generate authentication token');
    }
};

/**
 * Verify JWT token with consistent configuration
 */
export const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_CONFIG.SECRET, {
            algorithms: [JWT_CONFIG.ALGORITHM]
        });

        authLogger.debug('Token verified', { userId: decoded.id, role: decoded.role });

        return { success: true, decoded };
    } catch (error) {
        authLogger.warn('Token verification failed', { error: error.message });

        if (error.name === 'TokenExpiredError') {
            return { success: false, error: 'TOKEN_EXPIRED' };
        }
        if (error.name === 'JsonWebTokenError') {
            return { success: false, error: 'INVALID_TOKEN' };
        }

        return { success: false, error: 'VERIFICATION_FAILED' };
    }
};

/**
 * Hash password with consistent configuration
 */
export const hashPassword = async (password) => {
    try {
        if (!password || password.length < PASSWORD_CONFIG.MIN_LENGTH) {
            throw new Error(`Password must be at least ${PASSWORD_CONFIG.MIN_LENGTH} characters`);
        }

        if (password.length > PASSWORD_CONFIG.MAX_LENGTH) {
            throw new Error(`Password must not exceed ${PASSWORD_CONFIG.MAX_LENGTH} characters`);
        }

        const hashedPassword = await bcrypt.hash(password, PASSWORD_CONFIG.SALT_ROUNDS);
        return hashedPassword;
    } catch (error) {
        authLogger.error('Password hashing failed', { error: error.message });
        throw error;
    }
};

/**
 * Compare password with hash
 * CRITICAL: This handles both plain text comparison (for migration) and bcrypt
 */
export const comparePassword = async (candidatePassword, hashedPassword) => {
    try {
        if (!candidatePassword || !hashedPassword) {
            return false;
        }

        // Check if the stored password is hashed (bcrypt hashes start with $2)
        if (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$')) {
            // Use bcrypt for hashed passwords
            const isMatch = await bcrypt.compare(candidatePassword, hashedPassword);
            return isMatch;
        } else {
            // TEMPORARY: Direct comparison for unhashed passwords (migration period)
            authLogger.warn('Unhashed password detected - migration needed', {
                passwordPrefix: hashedPassword.substring(0, 10)
            });
            return candidatePassword === hashedPassword;
        }
    } catch (error) {
        authLogger.error('Password comparison failed', { error: error.message });
        return false;
    }
};

/**
 * Validate password strength
 */
export const validatePassword = (password) => {
    if (!password) {
        return { valid: false, message: 'Password is required' };
    }

    if (password.length < PASSWORD_CONFIG.MIN_LENGTH) {
        return {
            valid: false,
            message: `Password must be at least ${PASSWORD_CONFIG.MIN_LENGTH} characters`
        };
    }

    if (password.length > PASSWORD_CONFIG.MAX_LENGTH) {
        return {
            valid: false,
            message: `Password must not exceed ${PASSWORD_CONFIG.MAX_LENGTH} characters`
        };
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one number'
        };
    }

    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one letter'
        };
    }

    return { valid: true };
};

/**
 * Standardized login response
 */
export const createLoginResponse = (user, token, additionalData = {}) => {
    return {
        success: true,
        message: 'Login successful',
        token,
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName || user.first_name,
            lastName: user.lastName || user.last_name,
            phone: user.phoneNumber || user.phone,
            role: user.role,
            ...additionalData
        }
    };
};

/**
 * Standardized error response
 */
export const createErrorResponse = (message, statusCode = 401, details = {}) => {
    return {
        success: false,
        message,
        statusCode,
        ...details
    };
};

/**
 * Log authentication event
 */
export const logAuthEvent = (event, data = {}) => {
    authLogger.info(`Auth Event: ${event}`, data);
};

export default {
    checkRateLimit,
    resetRateLimit,
    generateToken,
    verifyToken,
    hashPassword,
    comparePassword,
    validatePassword,
    createLoginResponse,
    createErrorResponse,
    logAuthEvent
};
