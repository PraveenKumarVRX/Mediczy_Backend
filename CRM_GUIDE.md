# Mediczy CRM Guide

## Overview

The Mediczy CRM (Customer Relationship Management) module provides a complete pipeline management system for tracking leads, managing customer interactions, and monitoring sales progress.

## Features

### 1. Lead Management
- Create and manage leads with comprehensive details
- Track leads through customizable pipeline stages
- Search and filter leads by stage, assignment, or keywords
- Archive and delete leads

### 2. Pipeline Stages
Leads progress through the following stages:
1. **New** - Initial contact or inquiry
2. **Qualified** - Budget and decision maker confirmed
3. **Proposal** - Proposal sent to prospect
4. **Negotiation** - Terms and pricing discussion
5. **Closed Won** - Deal successfully closed
6. **Closed Lost** - Opportunity lost

### 3. Activities & Timeline
Track all interactions with leads:
- **Calls** - Log phone conversations
- **Emails** - Record email communications
- **Meetings** - Track in-person or virtual meetings
- **Notes** - General observations and updates
- **Status Changes** - Automatically logged when stage changes

### 4. Tasks & Reminders
- Create tasks with titles, descriptions, and due dates
- Set priority levels (Low, Medium, High)
- Assign tasks to team members
- Mark tasks as completed

### 5. Analytics & Reporting
- **Pipeline Value**: Total value of all open opportunities
- **Conversion Rate**: Percentage of won deals vs total closed deals
- **Stage Distribution**: Visual bar charts showing lead counts by stage
- **Source Tracking**: Breakdown of leads by acquisition source
- **Stage Aging**: Average time leads spend in each stage

## API Reference

### Authentication
All CRM endpoints require admin authentication. Include the admin token in request headers:
```
Authorization: Bearer <adminToken>
```

### Endpoints

#### Leads

**Create Lead**
```http
POST /api/crm/leads
Content-Type: application/json

{
  "name": "John Doe",
  "company": "Acme Corp",
  "email": "john@acme.com",
  "phone": "+91-9876543210",
  "source": "Website",
  "stage": "New",
  "value": 100000,
  "tags": ["enterprise", "healthcare"],
  "customFields": {
    "industry": "Healthcare",
    "employeeCount": 500
  }
}
```

**List Leads**
```http
GET /api/crm/leads?stage=New&q=Acme&limit=50&offset=0
```

Query parameters:
- `stage` - Filter by stage (optional)
- `q` - Search across name, company, email, phone (optional)
- `assignedTo` - Filter by assigned user ID (optional)
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Get Lead Details**
```http
GET /api/crm/leads/:id
```

Returns lead with all activities, notes, and tasks.

**Update Lead**
```http
PUT /api/crm/leads/:id
Content-Type: application/json

{
  "stage": "Qualified",
  "value": 150000,
  "statusReason": "Budget approved by CFO"
}
```

Stage changes automatically create an activity log entry.

**Delete Lead**
```http
DELETE /api/crm/leads/:id
```

#### Activities

**Add Activity**
```http
POST /api/crm/leads/:leadId/activities
Content-Type: application/json

{
  "type": "Call",
  "subject": "Initial discovery call",
  "content": "Discussed requirements and timeline. Next steps: send proposal.",
  "metadata": {
    "duration": "45 minutes",
    "outcome": "positive"
  }
}
```

Activity types: `Call`, `Email`, `Meeting`, `Note`, `Task`, `Reminder`, `Status Change`

#### Notes

**Add Note**
```http
POST /api/crm/leads/:leadId/notes
Content-Type: application/json

{
  "content": "Customer expressed strong interest in Q1 implementation.",
  "pinned": true
}
```

Notes automatically create an activity entry and update the lead's notes snapshot.

#### Tasks

**Create Task**
```http
POST /api/crm/leads/:leadId/tasks
Content-Type: application/json

{
  "title": "Send contract for signature",
  "description": "Include updated pricing from negotiation",
  "dueDate": "2025-11-20",
  "priority": "High",
  "assignedTo": 5
}
```

Priority levels: `Low`, `Medium`, `High`

**Complete Task**
```http
POST /api/crm/tasks/:id/complete
```

Marks task as completed and logs an activity.

#### Stats & Reports

**Pipeline Stats**
```http
GET /api/crm/stats
```

Returns:
```json
{
  "success": true,
  "counts": {
    "New": 15,
    "Qualified": 8,
    "Proposal": 5,
    "Negotiation": 3,
    "Closed Won": 12,
    "Closed Lost": 4
  },
  "openValue": 2500000,
  "conversionRate": 75.0,
  "sourceCounts": {
    "Website": 18,
    "Referral": 12,
    "Event": 8,
    "Outbound": 9
  }
}
```

**Reports Overview**
```http
GET /api/crm/reports/overview
```

Returns:
```json
{
  "success": true,
  "avgStageAgeDays": {
    "New": 5.2,
    "Qualified": 8.7,
    "Proposal": 12.3,
    "Negotiation": 15.8
  },
  "totalPipelineValue": 3200000,
  "totalLeads": 47
}
```

## UI Components

### Pipeline View (`/admin/crm`)
- Kanban-style board with columns for each stage
- Drag-and-drop support (planned)
- Visual stats cards showing key metrics
- Stage distribution bar chart
- Source breakdown
- Quick lead creation dialog

### Lead Detail View (`/admin/crm/lead/:id`)
- Lead information card
- Stage update dropdown
- Note input form
- Task creation form
- Notes timeline
- Tasks list with completion status
- Activity timeline showing all interactions

### Dashboard Integration (`/admin`)
- CRM snapshot card with pipeline value, conversion rate, and open leads count
- Quick link to full CRM view

## Validation Rules

### Lead Creation/Update
- `name` - Required, non-empty string
- `email` - Optional, must be valid email format
- `stage` - Optional, must be one of: `New`, `Qualified`, `Proposal`, `Negotiation`, `Closed Won`, `Closed Lost`
- `value` - Optional, must be positive number

### Note Creation
- `content` - Required, non-empty string

### Task Creation
- `title` - Required, non-empty string
- `priority` - Optional, must be one of: `Low`, `Medium`, `High`

Validation errors return HTTP 422 with detailed error array.

## Best Practices

### Lead Management
1. Always set a meaningful `source` to track lead acquisition channels
2. Update `value` as deal progresses through negotiation
3. Add `statusReason` when changing stages for audit trail
4. Use `tags` and `customFields` for flexible categorization

### Activity Logging
1. Log activities immediately after interactions
2. Use descriptive subjects for quick scanning
3. Include key details in content field
4. Leverage metadata for structured data

### Task Management
1. Set realistic due dates
2. Use High priority sparingly to maintain urgency
3. Assign tasks to specific team members
4. Review and complete overdue tasks regularly

### Pipeline Hygiene
1. Archive stale leads after 90 days of inactivity
2. Move lost deals to "Closed Lost" with reason
3. Review "Negotiation" stage leads weekly
4. Celebrate and analyze "Closed Won" deals

## Future Enhancements

- **Bulk Import**: Excel/CSV upload for lead creation
- **Email Integration**: Auto-log emails as activities
- **Notifications**: Alert assignees about new tasks and stage changes
- **Custom Stages**: Configurable pipeline stages per organization
- **Lead Scoring**: Automatic prioritization based on engagement
- **Forecasting**: Revenue predictions based on pipeline
- **Collaboration**: Comments and mentions on leads
- **Mobile App**: iOS/Android CRM access
- **Audit Logs**: Track all changes with user attribution
- **Export**: Generate PDF reports and Excel exports

## Troubleshooting

### Common Issues

**401 Unauthorized**
- Ensure admin token is included in Authorization header
- Verify token hasn't expired (7 day validity)
- Re-login at `/admin/login` if needed

**422 Validation Error**
- Check that all required fields are present
- Verify enum values match exactly (case-sensitive)
- Ensure email format is valid

**404 Lead Not Found**
- Confirm lead ID exists and hasn't been deleted
- Check that user has access to the lead

**Performance Issues**
- Use pagination (`limit` and `offset`) for large datasets
- Add specific filters to reduce result set size
- Consider indexing strategy if lead count exceeds 10,000

## Support

For issues, feature requests, or questions:
- Check server logs for detailed error messages
- Review API response for validation errors
- Ensure all required CRM models are synced in database
- Verify middleware and routes are properly mounted

---

**Version**: 1.0  
**Last Updated**: November 9, 2025
