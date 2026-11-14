/**
 * Unified Login Controller
 * Central login logic that all authentication endpoints should use
 * Fixes: Inconsistent login behavior, duplicate code, varying JWT secrets
 */

import { validationResult } from 'express-validator';
import {
    checkRateLimit,
    resetRateLimit,
    generateToken,
    comparePassword,
    createLoginResponse,
    createErrorResponse,
    logAuthEvent
} from '../utils/auth.utils.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLogger } from '../utils/logger.js';
import { debug } from '../utils/debugger.js';

/**
 * Universal Login Function
 * Works for any user type (doctor, nurse, patient, admin, etc.)
 * 
 * @param {Object} options Configuration options
 * @param {Function} options.findUserFn - Function to find user (async)
 * @param {Object} options.req - Express request object
 * @param {Object} options.res - Express response object
 * @param {String} options.role - Expected user role
 * @param {String} options.loginType - Login type for logging (e.g., 'doctor', 'patient')
 * @param {Function} options.extraValidation - Optional extra validation function
 * @param {Function} options.transformUser - Optional function to transform user data
 */
export const universalLogin = async (options) => {
    const { findUserFn, req, res, role, loginType, extraValidation, transformUser } = options;

    const loginDebug = debug.child(`LOGIN:${loginType.toUpperCase()}`);
    loginDebug.time('login-attempt');

    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            loginDebug.log('Validation failed', { errors: errors.array() });
            return res.status(400).json(createErrorResponse(
                'Validation error',
                400,
                { errors: errors.array() }
            ));
        }

        const { email, password } = req.body;
        const identifier = email.toLowerCase().trim();

        loginDebug.log('Login attempt', { email: identifier, role, loginType });
        logAuthEvent(`${loginType}_login_attempt`, { email: identifier, role });

        // Rate limiting check
        const rateLimit = checkRateLimit(identifier);
        if (!rateLimit.allowed) {
            loginDebug.log('Rate limit exceeded', { email: identifier });
            logAuthEvent(`${loginType}_rate_limit_exceeded`, { email: identifier });

            res.set('Retry-After', String(Math.max(1, Math.ceil(Number(rateLimit.retryAfter) || 1) * 60))); // retryAfter is minutes
            return res.status(429).json(createErrorResponse(
                `Too many login attempts. Please try again in ${rateLimit.retryAfter} minutes.`,
                429,
                { retryAfter: rateLimit.retryAfter }
            ));
        }

        // Find user using provided function
        loginDebug.time('find-user');
        const user = await findUserFn(identifier, req.body);
        loginDebug.timeEnd('find-user');

        if (!user) {
            loginDebug.log('User not found', { email: identifier });
            logAuthEvent(`${loginType}_user_not_found`, { email: identifier });

            return res.status(401).json(createErrorResponse(
                'Invalid email or password',
                401
            ));
        }

        // Check user status
        if (user.status && user.status !== 'active') {
            loginDebug.log('User inactive', { email: identifier, status: user.status });
            logAuthEvent(`${loginType}_inactive_user`, { email: identifier, status: user.status });

            return res.status(403).json(createErrorResponse(
                `Account is ${user.status}. Please contact support.`,
                403
            ));
        }

        // Verify role if specified
        if (role && user.role !== role) {
            loginDebug.log('Role mismatch', {
                email: identifier,
                expected: role,
                actual: user.role
            });
            logAuthEvent(`${loginType}_role_mismatch`, {
                email: identifier,
                expected: role,
                actual: user.role
            });

            return res.status(403).json(createErrorResponse(
                `Invalid account type. Expected ${role}, got ${user.role}.`,
                403
            ));
        }

        // Extra validation if provided
        if (extraValidation) {
            loginDebug.time('extra-validation');
            const validationResult = await extraValidation(user, req.body);
            loginDebug.timeEnd('extra-validation');

            if (!validationResult.valid) {
                loginDebug.log('Extra validation failed', { email: identifier });
                return res.status(validationResult.status || 403).json(
                    createErrorResponse(validationResult.message, validationResult.status || 403)
                );
            }
        }

        // Verify password
        loginDebug.time('verify-password');
        let isPasswordValid = false;

        // Handle different password storage methods
        if (user.verifyPassword && typeof user.verifyPassword === 'function') {
            // Model instance with verifyPassword method
            isPasswordValid = await user.verifyPassword(password);
        } else if (user.comparePassword && typeof user.comparePassword === 'function') {
            // Model instance with comparePassword method
            isPasswordValid = await user.comparePassword(password);
        } else if (user.password) {
            // Use utility function
            isPasswordValid = await comparePassword(password, user.password);
        } else {
            loginDebug.error('No password verification method available');
            throw new Error('Password verification not configured');
        }

        loginDebug.timeEnd('verify-password');

        if (!isPasswordValid) {
            loginDebug.log('Invalid password', { email: identifier });
            logAuthEvent(`${loginType}_invalid_password`, { email: identifier });

            return res.status(401).json(createErrorResponse(
                'Invalid email or password',
                401
            ));
        }

        // Password valid - reset rate limit
        resetRateLimit(identifier);

        // Prepare token payload
        const tokenPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            firstName: user.firstName || user.first_name,
            lastName: user.lastName || user.last_name
        };

        // Add organization/tenant info if present
        if (user.organization_id) tokenPayload.organization_id = user.organization_id;
        if (user.tenant_id) tokenPayload.tenant_id = user.tenant_id;
        if (user.clinic_id) tokenPayload.clinic_id = user.clinic_id;
        if (user.hospital_id) tokenPayload.hospital_id = user.hospital_id;

        // Generate JWT token with standard configuration
        loginDebug.time('generate-token');
        const token = generateToken(tokenPayload, {
            expiresIn: req.body.remember_me ? JWT_CONFIG.EXPIRY.LONG : JWT_CONFIG.EXPIRY.NORMAL
        });
        loginDebug.timeEnd('generate-token');

        // Transform user data if transformer provided
        let userData = user;
        if (transformUser) {
            loginDebug.time('transform-user');
            userData = await transformUser(user, req.body);
            loginDebug.timeEnd('transform-user');
        }

        // Update last login time
        if (user.update && typeof user.update === 'function') {
            try {
                await user.update({
                    metadata: {
                        ...user.metadata,
                        last_login: new Date().toISOString(),
                        login_source: req.body.login_source || 'web'
                    }
                });
            } catch (updateError) {
                // Log but don't fail login
                loginDebug.log('Failed to update last login', { error: updateError.message });
            }
        }

        const duration = loginDebug.timeEnd('login-attempt');

        loginDebug.log('Login successful', {
            email: identifier,
            userId: user.id,
            duration: `${duration}ms`
        });

        logAuthEvent(`${loginType}_login_success`, {
            email: identifier,
            userId: user.id,
            role: user.role
        });

        // Create standardized response
        const response = createLoginResponse(userData, token, {
            loginType,
            expiresIn: req.body.remember_me ? JWT_CONFIG.EXPIRY.LONG : JWT_CONFIG.EXPIRY.NORMAL
        });

        return res.status(200).json(response);

    } catch (error) {
        loginDebug.timeEnd('login-attempt');
        loginDebug.error('Login error', error);

        authLogger.error(`${loginType} login error`, {
            error: error.message,
            stack: error.stack
        });

        logAuthEvent(`${loginType}_login_error`, { error: error.message });

        return res.status(500).json(createErrorResponse(
            'Login failed due to server error',
            500,
            { error: process.env.NODE_ENV === 'development' ? error.message : undefined }
        ));
    }
};

/**
 * Logout Function
 * Handles token invalidation and cleanup
 */
export const universalLogout = async (req, res, options = {}) => {
    const { loginType = 'user' } = options;

    try {
        const userId = req.user?.id;
        const email = req.user?.email;

        logAuthEvent(`${loginType}_logout`, { userId, email });

        // Future: Add token blacklisting here
        // For now, client-side token removal is sufficient

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        authLogger.error(`${loginType} logout error`, { error: error.message });

        res.status(500).json(createErrorResponse(
            'Logout failed',
            500
        ));
    }
};

export default {
    universalLogin,
    universalLogout
};
