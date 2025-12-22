# Mediczy CRM - Quick Start

## Access CRM

1. **Login**: Navigate to `/admin/login`
   - Email: `admin@mediczy.local`
   - Password: `Admin@1234`

2. **Dashboard**: Visit `/admin` to see CRM snapshot
3. **Full CRM**: Visit `/admin/crm` for pipeline view

## Quick Actions

### Create a Lead
1. Click "New Lead" button on CRM page
2. Fill in required fields:
   - **Name** (required)
   - Company, Email, Phone (optional)
   - Source (e.g., Website, Referral, Event)
   - Value (deal size in ₹)
   - Initial Stage (default: New)
3. Click "Create"

### Manage Lead
1. Click on any lead card to open details
2. Update stage using dropdown (auto-logs activity)
3. Add notes in real-time
4. Create tasks with due dates
5. View complete timeline

### Track Pipeline
- **Stage Columns**: Drag leads between stages (visual)
- **Stats Cards**: Monitor key metrics at top
- **Charts**: View distribution and trends
- **Filters**: Filter by stage, search across fields

## Pipeline Stages

```
New → Qualified → Proposal → Negotiation → Closed Won
                                        ↘ Closed Lost
```

### Stage Definitions

**New**: Initial contact or inquiry
- Action: Qualify lead, gather requirements

**Qualified**: Budget and decision maker confirmed
- Action: Prepare proposal

**Proposal**: Proposal sent to prospect
- Action: Follow up, answer questions

**Negotiation**: Terms and pricing discussion
- Action: Address concerns, finalize terms

**Closed Won**: Deal successfully closed 🎉
- Action: Onboarding, celebrate!

**Closed Lost**: Opportunity lost
- Action: Document reason, nurture for future

## Common Workflows

### New Lead Entry
```
1. Create lead with basic info
2. Add initial note (how they found us)
3. Set stage to "New"
4. Create task: "Initial follow-up call"
5. Assign to sales rep
```

### Moving to Qualified
```
1. Open lead detail page
2. Add note: "Confirmed budget and timeline"
3. Update stage to "Qualified"
4. Create task: "Prepare proposal"
```

### Closing Won Deal
```
1. Update stage to "Closed Won"
2. Add note with closing details
3. Complete all open tasks
4. Update value if needed
```

### Handling Lost Deal
```
1. Update stage to "Closed Lost"
2. Add note explaining reason
3. Set reminder for 6 months follow-up
4. Archive lead
```

## Best Practices

### Daily
- [ ] Review tasks due today
- [ ] Follow up on "Proposal" stage leads
- [ ] Log all customer interactions
- [ ] Update lead stages after calls/meetings

### Weekly
- [ ] Review all "Negotiation" stage leads
- [ ] Clean up old "New" leads (move or archive)
- [ ] Check conversion rate trend
- [ ] Plan outreach for stalled leads

### Monthly
- [ ] Analyze pipeline value and trends
- [ ] Review source performance
- [ ] Update stage definitions if needed
- [ ] Team performance review

## Tips for Success

### Lead Quality
- Always set source when creating leads
- Add tags for easy categorization
- Update value as deal progresses
- Keep contact info current

### Activity Logging
- Log immediately after interactions
- Be specific in notes
- Use tasks for follow-ups
- Track outcomes in metadata

### Pipeline Management
- Move leads regularly (don't let them stagnate)
- Use status reason when changing stages
- Archive old leads (90+ days inactive)
- Celebrate closed won deals!

## Keyboard Shortcuts (Coming Soon)

- `N` - New lead
- `S` - Search
- `?` - Help
- `Esc` - Close dialog

## Reporting

### Available Metrics
- **Open Pipeline Value**: Total ₹ of open opportunities
- **Conversion Rate**: Win rate (won / total closed)
- **Stage Distribution**: Leads per stage
- **Source Performance**: Leads by acquisition channel
- **Average Stage Age**: How long leads stay in each stage

### Access Reports
1. Dashboard (`/admin`) - Quick snapshot
2. CRM Page (`/admin/crm`) - Detailed charts
3. API (`/api/crm/stats`) - Raw data for exports

## Troubleshooting

### Can't See CRM
- Ensure logged in as admin
- Check browser console for errors
- Verify server is running on port 8000

### Lead Not Updating
- Check form validation errors
- Ensure all required fields filled
- Verify token hasn't expired (re-login)

### Missing Charts
- Wait for data to load
- Create some test leads first
- Check browser console

## Need Help?

1. Check `CRM_GUIDE.md` for detailed docs
2. Review API errors in browser console
3. Check server logs at `/tmp/server.log`
4. Test API endpoints using curl/Postman

## Sample Data (For Testing)

```bash
# Create test lead via API
TOKEN="<your-admin-token>"

curl -X POST http://localhost:8000/api/crm/leads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sunrise Hospital",
    "company": "Sunrise Healthcare Group",
    "email": "info@sunrisehospital.com",
    "phone": "+91-9876543210",
    "source": "Website",
    "stage": "New",
    "value": 500000
  }'
```

---

**Quick Reference**
- Servers: Backend :8000, Frontend :8080
- Admin Login: `/admin/login`
- CRM Dashboard: `/admin/crm`
- Documentation: `CRM_GUIDE.md`
- API Base: `/api/crm/*`

**Status**: ✅ Ready to Use
