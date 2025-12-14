# Email Templates and Service

## Overview
This directory contains email templates and the email service for sending transactional emails to users.

## Templates

### 1. Welcome Email (`welcome-email.html`)
Sent to new users upon successful registration.

**Variables:**
- `{{firstName}}` - User's first name
- `{{lastName}}` - User's last name
- `{{email}}` - User's email address
- `{{memberId}}` - Unique member ID
- `{{registrationDate}}` - Account registration date
- `{{loginUrl}}` - Link to login page
- `{{facebookUrl}}` - Facebook page URL
- `{{twitterUrl}}` - Twitter profile URL
- `{{linkedinUrl}}` - LinkedIn company page URL
- `{{instagramUrl}}` - Instagram profile URL
- `{{companyAddress}}` - Company address
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy URL
- `{{termsUrl}}` - Terms of service URL

**Features:**
- Personalized greeting
- Account details display
- Platform features overview (6 key features)
- Getting started guide
- Mobile app promotion
- Support contact information

### 2. Forgot Password Email (`forgot-password-email.html`)
Sent when a user requests a password reset.

**Variables:**
- `{{firstName}}` - User's first name
- `{{email}}` - User's email address
- `{{memberId}}` - Unique member ID
- `{{resetUrl}}` - Password reset link
- `{{resetToken}}` - Reset token (displayed as alternative)
- `{{expiryMinutes}}` - Token expiry time in minutes (default: 30)
- `{{expiryDateTime}}` - Formatted expiry date and time
- `{{requestDateTime}}` - When the reset was requested
- `{{requestIp}}` - IP address of the request
- `{{deviceInfo}}` - Device/browser information
- `{{companyAddress}}` - Company address
- `{{privacyUrl}}` - Privacy policy URL
- `{{securityUrl}}` - Security center URL
- `{{helpUrl}}` - Help center URL

**Features:**
- Prominent reset button
- Alternative reset link (for email clients that don't support buttons)
- Expiry notice with countdown
- Security alert for unauthorized requests
- Password security tips (5 best practices)
- Request details (IP, device, time)
- Support contact information

## Email Service (`email.service.js`)

### Configuration
Set the following environment variables in your `.env` file:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@mediczy.com
SMTP_PASSWORD=your-app-password

# Application URLs
FRONTEND_URL=https://mayden.in
```

### Functions

#### `sendWelcomeEmail(userData)`
Sends welcome email to new users.

**Parameters:**
```javascript
{
  email: "user@example.com",
  firstName: "John",
  lastName: "Doe",
  memberId: "MED123456",
  registrationDate: "2025-11-24T10:30:00Z"
}
```

**Returns:**
```javascript
{
  success: true,
  messageId: "<unique-message-id>",
  message: "Welcome email sent successfully"
}
```

#### `sendPasswordResetEmail(userData, resetToken, expiryMinutes)`
Sends password reset email with token.

**Parameters:**
```javascript
{
  email: "user@example.com",
  firstName: "John",
  lastName: "Doe",
  memberId: "MED123456",
  requestIp: "192.168.1.1",
  deviceInfo: "Chrome on Windows"
}
```

**Returns:**
```javascript
{
  success: true,
  messageId: "<unique-message-id>",
  message: "Password reset email sent successfully"
}
```

#### `sendPasswordChangedEmail(userData)`
Sends confirmation email after password change.

**Parameters:**
```javascript
{
  email: "user@example.com",
  firstName: "John",
  changeDateTime: "2025-11-24 15:30:00",
  changeIp: "192.168.1.1"
}
```

#### `verifyEmailConnection()`
Tests email server connection.

**Returns:** `Promise<boolean>`

## Usage Examples

### In User Registration Route
```javascript
const emailService = require('./services/email.service');

// After successful user registration
const userData = {
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  memberId: user.memberId,
  registrationDate: user.createdAt
};

const result = await emailService.sendWelcomeEmail(userData);
if (!result.success) {
  console.error('Failed to send welcome email:', result.error);
}
```

### In Forgot Password Route
```javascript
const crypto = require('crypto');
const emailService = require('./services/email.service');

// Generate reset token
const resetToken = crypto.randomBytes(32).toString('hex');
const tokenExpiry = new Date(Date.now() + 30 * 60000); // 30 minutes

// Save token to database
await User.updateOne(
  { email: req.body.email },
  { 
    resetToken: resetToken,
    resetTokenExpiry: tokenExpiry
  }
);

// Send email
const userData = {
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  memberId: user.memberId,
  requestIp: req.ip,
  deviceInfo: req.get('user-agent')
};

const result = await emailService.sendPasswordResetEmail(
  userData,
  resetToken,
  30 // expiry in minutes
);
```

### In Reset Password Route
```javascript
const emailService = require('./services/email.service');

// After successful password change
const userData = {
  email: user.email,
  firstName: user.firstName,
  changeDateTime: new Date().toLocaleString('en-IN'),
  changeIp: req.ip
};

await emailService.sendPasswordChangedEmail(userData);
```

## Testing Email Service

### Verify Connection
```javascript
const emailService = require('./services/email.service');

emailService.verifyEmailConnection()
  .then(isConnected => {
    if (isConnected) {
      console.log('Email service is ready');
    } else {
      console.log('Email service connection failed');
    }
  });
```

## Gmail Configuration

If using Gmail SMTP:

1. Enable 2-factor authentication on your Google account
2. Generate an App Password:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App passwords
   - Select "Mail" and your device
   - Copy the 16-character password
3. Use the app password in `SMTP_PASSWORD` environment variable

## Security Best Practices

1. **Never commit email credentials** to version control
2. **Use app-specific passwords** instead of account passwords
3. **Implement rate limiting** for password reset requests
4. **Log all email sends** for audit trails
5. **Use HTTPS** for all reset URLs
6. **Validate email addresses** before sending
7. **Implement token expiry** for reset links (30 minutes recommended)
8. **Hash reset tokens** before storing in database

## Troubleshooting

### Common Issues

**Email not sending:**
- Check SMTP credentials
- Verify firewall/port settings
- Ensure SMTP service is enabled in email provider
- Check spam/junk folder

**Template variables not replacing:**
- Ensure variable names match exactly (case-sensitive)
- Check for typos in template: `{{variableName}}`
- Verify all required variables are provided

**Connection timeout:**
- Check SMTP host and port
- Verify network connectivity
- Try using port 465 with `secure: true`

## Customization

### Adding New Email Templates

1. Create HTML template in `templates/emails/`
2. Use `{{variableName}}` for dynamic content
3. Add function in `email.service.js`:

```javascript
async function sendCustomEmail(userData) {
  const variables = {
    // your variables
  };
  
  const htmlContent = await loadTemplate('your-template.html', variables);
  
  const mailOptions = {
    from: `"Mediczy" <${emailConfig.auth.user}>`,
    to: userData.email,
    subject: 'Your Subject',
    html: htmlContent
  };
  
  return await transporter.sendMail(mailOptions);
}
```

### Styling Guidelines

- Use inline CSS (email clients don't support external stylesheets)
- Test across multiple email clients (Gmail, Outlook, Apple Mail)
- Keep width under 600px for mobile compatibility
- Use web-safe fonts
- Provide fallback colors for gradients

## Dependencies

```json
{
  "nodemailer": "^6.9.0"
}
```

Install with:
```bash
npm install nodemailer
```

## Support

For issues or questions:
- Email: support@mediczy.com
- Documentation: [Internal Wiki Link]
