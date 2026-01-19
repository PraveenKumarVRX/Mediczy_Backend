# Activity Log System Documentation

## Overview

The Activity Log system provides comprehensive tracking and monitoring of all user activities within the Mediczy platform. It captures detailed information about user interactions, API calls, authentication events, and system operations with timestamps and results.

## Features

### 🔍 **Comprehensive Activity Tracking**
- **User Activities**: Login/logout, profile updates, appointment booking
- **Admin Activities**: User management, system configuration, billing operations
- **Doctor Activities**: Patient consultations, appointment management, profile updates
- **System Activities**: Automated tasks, scheduled operations, system maintenance

### 📊 **Real-time Analytics Dashboard**
- **Activity Statistics**: Total activities, recent activity trends, success rates
- **User Type Breakdown**: Activities by admin, doctor, user, and system
- **Action Analysis**: Most common actions and resource interactions
- **Result Tracking**: Success, failure, warning, and info categorization

### 🔧 **Advanced Filtering & Search**
- **Multi-criteria Filtering**: User type, action, result, date range
- **Search Functionality**: Search across activity descriptions, user IDs, IP addresses
- **Real-time Updates**: Live activity monitoring with auto-refresh
- **Export Capabilities**: CSV export for compliance and analysis

### 🛡️ **Security & Compliance**
- **HIPAA Compliance**: Audit trail for healthcare data access
- **GDPR/DPDP Compliance**: Data access logging and retention policies
- **IP Address Tracking**: Monitor access from different locations
- **Session Monitoring**: Track user sessions and timeout events

## Architecture

### Frontend Components

#### ActivityLog.tsx (`/admin/activity-log`)
- Main activity log page with comprehensive filtering and search
- Real-time activity table with detailed view capabilities
- Export functionality and pagination support
- Integrated activity statistics dashboard

#### ActivityStats.tsx
- Real-time statistics dashboard component
- Visual representation of activity metrics
- Success rate tracking and trend analysis
- User type and action breakdown charts

### Backend Implementation

#### Activity Logger Middleware (`middleware/activityLogger.js`)
- **Automatic Activity Capture**: Intercepts all API requests and responses
- **User Context Extraction**: Identifies user type from JWT tokens
- **Activity Classification**: Categorizes activities by type, action, and resource
- **Result Determination**: Analyzes HTTP status codes for success/failure
- **Data Sanitization**: Removes sensitive information from logs

#### API Endpoints

##### GET `/api/admin/activity-logs`
**Purpose**: Retrieve filtered activity logs
**Authentication**: Admin JWT token required
**Parameters**:
```typescript
{
  page?: number,           // Pagination page (default: 1)
  limit?: number,          // Items per page (default: 20)
  userType?: string,       // Filter by user type (admin, doctor, user, system)
  action?: string,         // Filter by action (login, create, update, delete, etc.)
  result?: string,         // Filter by result (success, failure, warning, info)
  startDate?: string,      // Start date for filtering (ISO format)
  endDate?: string,        // End date for filtering (ISO format)
  search?: string          // Search term for activity content
}
```

**Response**:
```typescript
{
  logs: ActivityLog[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    pages: number
  },
  filters: FilterObject
}
```

##### GET `/api/admin/activity-stats`
**Purpose**: Get activity statistics and analytics
**Authentication**: Admin JWT token required
**Response**:
```typescript
{
  stats: {
    total: number,
    last24Hours: number,
    last7Days: number,
    byResult: {
      success: number,
      failure: number,
      warning: number,
      info: number
    },
    byUserType: {
      admin: number,
      doctor: number,
      user: number,
      system: number
    },
    topActions: Array<{ action: string, count: number }>,
    topResources: Array<{ resource: string, count: number }>
  }
}
```

### Data Model

#### ActivityLog Interface
```typescript
interface ActivityLog {
  id: string;                    // Unique log entry identifier
  timestamp: string;             // ISO timestamp of activity
  userId?: string;               // User ID (if authenticated)
  userType: 'user' | 'doctor' | 'admin' | 'system';
  userEmail?: string;            // User email address
  activity: string;              // Human-readable activity description
  action: string;                // Action type (login, create, update, etc.)
  resource: string;              // Resource being acted upon
  resourceId?: string;           // Specific resource identifier
  result: 'success' | 'failure' | 'warning' | 'info';
  details: string;               // Detailed activity description
  ipAddress?: string;            // Client IP address
  userAgent?: string;            // Client user agent string
  method: string;                // HTTP method (GET, POST, PUT, DELETE)
  path: string;                  // API endpoint path
  statusCode: number;            // HTTP response status code
  duration: number;              // Request duration in milliseconds
  metadata: {
    sessionId: string;           // Session identifier
    referrer?: string;           // HTTP referrer
    contentType?: string;        // Request content type
    responseSize: number;        // Response size in bytes
  };
}
```

## Activity Categories

### Authentication Activities
- **User Login**: Successful/failed login attempts
- **User Logout**: Session termination events
- **Password Reset**: Password change operations
- **Session Timeout**: Automatic session expiration

### User Management
- **Profile Updates**: User profile modifications
- **Account Creation**: New user registrations
- **Account Deletion**: User account removal
- **Permission Changes**: Role/permission modifications

### Medical Operations
- **Appointment Booking**: New appointment creation
- **Appointment Updates**: Modification of existing appointments
- **Consultation Records**: Medical consultation documentation
- **Prescription Management**: Prescription creation/updates

### Administrative Operations
- **System Configuration**: Settings and configuration changes
- **User Management**: Admin user operations
- **Billing Operations**: Financial transaction processing
- **Report Generation**: Report creation and export activities

### System Operations
- **Database Operations**: Automated database maintenance
- **Backup Operations**: System backup activities
- **Email Delivery**: System email notifications
- **Scheduled Tasks**: Cron job and scheduled operation execution

## Security Features

### Data Protection
- **Sensitive Data Redaction**: Automatic removal of passwords, tokens, and sensitive information
- **IP Address Logging**: Track access patterns for security analysis
- **User Agent Analysis**: Monitor client applications and detect anomalies

### Compliance Features
- **Audit Trail**: Complete activity history for compliance reporting
- **Data Retention**: Configurable log retention policies
- **Access Logging**: Track who accessed what data and when
- **Export Capabilities**: Generate compliance reports in standard formats

### Security Monitoring
- **Failed Login Tracking**: Monitor and alert on failed authentication attempts
- **Suspicious Activity Detection**: Identify unusual access patterns
- **Session Monitoring**: Track session duration and concurrent sessions
- **API Abuse Detection**: Monitor for excessive or unusual API usage

## Usage Examples

### Viewing Recent Activities
1. Navigate to `/admin/activity-log`
2. Use filters to narrow down activities:
   - Select user type (Admin, Doctor, User, System)
   - Choose action type (Login, Create, Update, Delete, View)
   - Filter by result (Success, Failure, Warning, Info)
   - Set date range for specific time periods

### Monitoring System Health
- Check success rate in statistics dashboard
- Monitor failed activities for system issues
- Track user engagement through activity patterns
- Analyze peak usage times and resource utilization

### Compliance Reporting
1. Set appropriate date range for reporting period
2. Filter by relevant user types and actions
3. Export filtered data to CSV format
4. Generate compliance reports from exported data

### Security Analysis
- Monitor failed login attempts by filtering for "login" actions with "failure" result
- Track administrative activities for security auditing
- Analyze IP address patterns for unusual access
- Review session activities for security compliance

## Implementation Notes

### Performance Considerations
- Activity logs are stored in memory for development (replace with database in production)
- Pagination is implemented to handle large datasets
- Background logging to avoid impacting API response times
- Configurable log retention to manage storage requirements

### Configuration Options
```javascript
// Activity logger configuration
activityLogger({
  includeBody: false,           // Include request/response bodies (be careful with sensitive data)
  excludePaths: [               // Paths to exclude from logging
    '/health',
    '/api/admin/activity-logs',
    '/api/admin/activity-stats'
  ],
  sensitiveFields: [            // Fields to redact from logs
    'password',
    'token',
    'secret',
    'ssn',
    'creditCard'
  ]
})
```

### Database Schema (Production)
For production deployment, implement database storage:

```sql
CREATE TABLE activity_logs (
  id VARCHAR(255) PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  user_id VARCHAR(255),
  user_type ENUM('user', 'doctor', 'admin', 'system') NOT NULL,
  user_email VARCHAR(255),
  activity VARCHAR(500) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255),
  result ENUM('success', 'failure', 'warning', 'info') NOT NULL,
  details TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  status_code INT NOT NULL,
  duration INT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp),
  INDEX idx_user_type (user_type),
  INDEX idx_result (result),
  INDEX idx_action (action),
  INDEX idx_resource (resource)
);
```

## Future Enhancements

### Planned Features
- **Real-time Alerts**: Configurable alerts for specific activity patterns
- **Advanced Analytics**: Machine learning-based anomaly detection
- **Dashboard Widgets**: Embeddable activity widgets for other admin pages
- **API Rate Limiting**: Activity-based rate limiting and throttling
- **Geographical Analysis**: Location-based activity analysis
- **Mobile App Integration**: Activity logging for mobile application usage

### Integration Opportunities
- **SIEM Integration**: Export logs to Security Information and Event Management systems
- **Monitoring Tools**: Integration with monitoring platforms (Grafana, DataDog)
- **Compliance Tools**: Direct integration with compliance management systems
- **Business Intelligence**: Export data to BI tools for advanced analysis

## Troubleshooting

### Common Issues
1. **Activities not appearing**: Check if middleware is properly configured
2. **Performance issues**: Consider implementing database storage for large datasets
3. **Missing user context**: Verify JWT token configuration and extraction
4. **Export failures**: Check file permissions and available disk space

### Debug Mode
Enable detailed logging by setting `includeBody: true` in the activity logger configuration (use with caution in production due to sensitive data exposure).

## Support

For technical support or feature requests related to the Activity Log system:
- Check the browser console for client-side errors
- Review server logs for backend issues
- Verify JWT token validity for authentication problems
- Ensure proper admin permissions for accessing activity logs