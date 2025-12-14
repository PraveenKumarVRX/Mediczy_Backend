const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

/**
 * Email service for sending transactional emails
 * Uses existing emailService for SMTP configuration
 * Supports both HTML templates and plain text
 */

// Import existing email service
let emailService;
try {
    emailService = require('./emailService.js');
} catch (e) {
    console.log('Existing emailService not found, using env config');
}

// Email configuration - use env or fallback
const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || 'noreply@mediczy.com',
        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || 'your-app-password'
    }
};

// Create reusable transporter
let transporter;

/**
 * Get email transporter - uses existing emailService if available
 * @returns {Promise<object>} - Nodemailer transporter
 */
async function getTransporter() {
    if (transporter) return transporter;
    
    // Try to use existing email service with database configs
    if (emailService && emailService.default) {
        try {
            const { EmailConfig } = require('../models/email.model.simple.js');
            const defaultConfig = await EmailConfig.findOne({ isDefault: true, isActive: true });
            
            if (defaultConfig) {
                console.log('Using database SMTP configuration:', defaultConfig.name);
                return emailService.default.getTransporter(defaultConfig);
            }
        } catch (error) {
            console.log('Could not load database email config, using env:', error.message);
        }
    }
    
    // Fallback to env configuration
    transporter = nodemailer.createTransport(emailConfig);
    return transporter;
}

/**
 * Load and populate email template with variables
 * @param {string} templateName - Name of the template file
 * @param {object} variables - Variables to replace in template
 * @returns {Promise<string>} - Populated HTML template
 */
async function loadTemplate(templateName, variables) {
    try {
        const templatePath = path.join(__dirname, '../templates/emails', templateName);
        let template = await fs.readFile(templatePath, 'utf-8');

        // Replace all {{variable}} placeholders with actual values
        Object.keys(variables).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            template = template.replace(regex, variables[key] || '');
        });

        return template;
    } catch (error) {
        console.error('Error loading email template:', error);
        throw new Error(`Failed to load email template: ${templateName}`);
    }
}

/**
 * Send welcome email to new member
 * @param {object} userData - User data object
 * @returns {Promise<object>} - Email send result
 */
async function sendWelcomeEmail(userData) {
    try {
        const {
            email,
            firstName,
            lastName,
            memberId,
            registrationDate
        } = userData;

        const variables = {
            firstName: firstName || 'Member',
            lastName: lastName || '',
            email,
            memberId,
            registrationDate: new Date(registrationDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }),
            loginUrl: `${process.env.FRONTEND_URL || 'https://mayden.in'}/login`,
            facebookUrl: 'https://facebook.com/mediczy',
            twitterUrl: 'https://twitter.com/mediczy',
            linkedinUrl: 'https://linkedin.com/company/mediczy',
            instagramUrl: 'https://instagram.com/mediczy',
            companyAddress: 'Bengaluru, Karnataka, India',
            unsubscribeUrl: `${process.env.FRONTEND_URL}/unsubscribe?email=${email}`,
            privacyUrl: `${process.env.FRONTEND_URL}/privacy`,
            termsUrl: `${process.env.FRONTEND_URL}/terms`
        };

        const htmlContent = await loadTemplate('welcome-email.html', variables);
        const mailTransporter = await getTransporter();

        const mailOptions = {
            from: `"Mediczy Healthcare" <${emailConfig.auth.user}>`,
            to: email,
            subject: `Welcome to Mediczy, ${firstName}! 🎉`,
            html: htmlContent,
            text: `Welcome to Mediczy, ${firstName}!\n\nYour account has been successfully created.\n\nEmail: ${email}\nMember ID: ${memberId}\n\nGet started now: ${variables.loginUrl}\n\nBest regards,\nThe Mediczy Team`
        };

        const info = await mailTransporter.sendMail(mailOptions);
        
        console.log('Welcome email sent successfully:', {
            messageId: info.messageId,
            to: email
        });

        return {
            success: true,
            messageId: info.messageId,
            message: 'Welcome email sent successfully'
        };
    } catch (error) {
        console.error('Error sending welcome email:', error);
        return {
            success: false,
            error: error.message,
            message: 'Failed to send welcome email'
        };
    }
}

/**
 * Send password reset email
 * @param {object} userData - User data object
 * @param {string} resetToken - Password reset token
 * @param {number} expiryMinutes - Token expiry time in minutes
 * @returns {Promise<object>} - Email send result
 */
async function sendPasswordResetEmail(userData, resetToken, expiryMinutes = 30) {
    try {
        const {
            email,
            firstName,
            lastName,
            memberId,
            requestIp,
            deviceInfo
        } = userData;

        const resetUrl = `${process.env.FRONTEND_URL || 'https://mayden.in'}/reset-password?token=${resetToken}`;
        const expiryDateTime = new Date(Date.now() + expiryMinutes * 60000);

        const variables = {
            firstName: firstName || 'Member',
            lastName: lastName || '',
            email,
            memberId,
            resetUrl,
            resetToken,
            expiryMinutes: expiryMinutes.toString(),
            expiryDateTime: expiryDateTime.toLocaleString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            requestDateTime: new Date().toLocaleString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            requestIp: requestIp || 'Unknown',
            deviceInfo: deviceInfo || 'Unknown Device',
            companyAddress: 'Bengaluru, Karnataka, India',
            privacyUrl: `${process.env.FRONTEND_URL}/privacy`,
            securityUrl: `${process.env.FRONTEND_URL}/security`,
            helpUrl: `${process.env.FRONTEND_URL}/help`
        };

        const htmlContent = await loadTemplate('forgot-password-email.html', variables);
        const mailTransporter = await getTransporter();

        const mailOptions = {
            from: `"Mediczy Security Team" <${emailConfig.auth.user}>`,
            to: email,
            subject: 'Reset Your Mediczy Password 🔐',
            html: htmlContent,
            text: `Hi ${firstName},\n\nWe received a request to reset your Mediczy password.\n\nReset your password here: ${resetUrl}\n\nThis link will expire in ${expiryMinutes} minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe Mediczy Security Team`,
            priority: 'high'
        };

        const info = await mailTransporter.sendMail(mailOptions);
        
        console.log('Password reset email sent successfully:', {
            messageId: info.messageId,
            to: email
        });

        return {
            success: true,
            messageId: info.messageId,
            message: 'Password reset email sent successfully'
        };
    } catch (error) {
        console.error('Error sending password reset email:', error);
        return {
            success: false,
            error: error.message,
            message: 'Failed to send password reset email'
        };
    }
}

/**
 * Send password changed confirmation email
 * @param {object} userData - User data object
 * @returns {Promise<object>} - Email send result
 */
async function sendPasswordChangedEmail(userData) {
    try {
        const {
            email,
            firstName,
            changeDateTime,
            changeIp
        } = userData;

        const mailTransporter = await getTransporter();
        
        const mailOptions = {
            from: `"Mediczy Security Team" <${emailConfig.auth.user}>`,
            to: email,
            subject: 'Your Mediczy Password Was Changed',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #3b82f6;">Password Changed Successfully</h2>
                    <p>Hi ${firstName},</p>
                    <p>This is a confirmation that your Mediczy account password was changed successfully.</p>
                    <p><strong>Change Details:</strong></p>
                    <ul>
                        <li>Time: ${changeDateTime || new Date().toLocaleString('en-IN')}</li>
                        <li>IP Address: ${changeIp || 'Unknown'}</li>
                    </ul>
                    <p style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0;">
                        <strong>⚠️ Didn't make this change?</strong><br>
                        If you didn't change your password, please contact our security team immediately at 
                        <a href="mailto:security@mediczy.com">security@mediczy.com</a>
                    </p>
                    <p>Best regards,<br>The Mediczy Security Team</p>
                </div>
            `,
            text: `Hi ${firstName},\n\nYour Mediczy password was changed successfully.\n\nTime: ${changeDateTime || new Date().toLocaleString('en-IN')}\nIP: ${changeIp || 'Unknown'}\n\nIf you didn't make this change, contact security@mediczy.com immediately.\n\nBest regards,\nThe Mediczy Security Team`
        };

        const info = await mailTransporter.sendMail(mailOptions);
        
        return {
            success: true,
            messageId: info.messageId,
            message: 'Password changed confirmation sent'
        };
    } catch (error) {
        console.error('Error sending password changed email:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Verify email transporter connection
 * @returns {Promise<boolean>} - Connection status
 */
async function verifyEmailConnection() {
    try {
        const mailTransporter = await getTransporter();
        await mailTransporter.verify();
        console.log('✅ Email server connection verified');
        return true;
    } catch (error) {
        console.error('❌ Email server connection failed:', error);
        return false;
    }
}

module.exports = {
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendPasswordChangedEmail,
    verifyEmailConnection,
    getTransporter
};
