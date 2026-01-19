# 🚀 Quick Reference: Automated Welcome Email System

## ⚡ Quick Start

### Test the System
```bash
./test-welcome-email-system.sh
```

### Create Doctor with Auto-Email
```bash
curl -X POST http://localhost:8000/api/admin/doctors \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "doctor@example.com",
    "specialization": "Cardiology"
  }'
```

### Change Password (First Login)
```bash
curl -X POST http://localhost:8000/api/users/change-password \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newPassword": "MySecure@Pass123",
    "confirmPassword": "MySecure@Pass123"
  }'
```

---

## 📋 Checklist for Admin

When creating a new user:
- ✅ System auto-generates secure password (12 chars)
- ✅ Welcome email sent automatically with credentials
- ✅ User receives personalized email
- ✅ User must change password on first login
- ✅ All access blocked until password changed

---

## 🔑 Password Requirements

**Auto-Generated (System):**
- Length: 12 characters
- Contains: Uppercase, lowercase, numbers, special chars
- Example: `Abc123!@#Xyz`

**User-Set (First Login):**
- Minimum: 8 characters
- Must have: A-Z, a-z, 0-9, @$!%*?&
- Cannot be same as temporary password

---

## 📧 Email Templates

| User Type | Subject | Template |
|-----------|---------|----------|
| Doctor | Welcome to Mediqzy - Doctor Portal 🏥 | Professional medical theme |
| Hospital | Welcome to Mediqzy - Hospital Portal 🏥 | Facility management theme |
| Corporate | Welcome to Mediqzy - Corporate Portal 🏢 | Business health theme |
| Team | Welcome to Mediqzy - Team Portal 👥 | Staff member theme |

---

## 🛠️ Admin Actions

### 1. Create New Doctor
```
Admin Panel → Users → Doctors → Create New
Fill form → Submit
✅ Doctor created
✅ Password auto-generated
✅ Welcome email sent
```

### 2. Create New Team Member
```
Admin Panel → Users → Team → Create New
Fill form → Submit
✅ Team user created
✅ Password auto-generated
✅ Welcome email sent
```

---

## 🔄 User Flow

```
1. Admin creates user
   ↓
2. System generates password
   ↓
3. Welcome email sent
   ↓
4. User receives email
   ↓
5. User logs in (temp password)
   ↓
6. Access blocked (403)
   ↓
7. User changes password
   ↓
8. Full access granted ✅
```

---

## 🐛 Troubleshooting

**Emails not sending?**
```bash
# Check SendGrid API key
echo $SENDGRID_API_KEY

# Check server logs
pm2 logs mediczy-server | grep "Welcome email"
```

**User can't change password?**
```bash
# Check password requirements
# Must be 8+ chars with uppercase, lowercase, number, special char
```

**Still getting 403 after password change?**
```bash
# Check user metadata in database
SELECT metadata FROM users WHERE email = 'user@example.com';

# Should show: "requirePasswordChange": false
```

---

## 📊 Monitoring Commands

```bash
# View all welcome emails sent
pm2 logs mediczy-server | grep "Welcome email sent"

# View password changes
pm2 logs mediczy-server | grep "Password changed for user"

# View blocked access attempts
pm2 logs mediczy-server | grep "Password change required"

# Check server status
pm2 status mediczy-server
```

---

## 📝 Environment Setup

Required environment variables in `.env`:
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@mediqzy.com
JWT_SECRET=your-secret-key
```

---

## 🎯 Key Features

✅ **Auto-generated passwords** - Secure, random, 12 characters  
✅ **Instant welcome emails** - Beautiful HTML templates  
✅ **Forced password change** - Security first approach  
✅ **Multiple user types** - Doctor, hospital, corporate, team  
✅ **Non-blocking** - Email sent asynchronously  
✅ **Production ready** - Full error handling

---

## 📚 Documentation

- **Full Guide**: `AUTOMATED_WELCOME_EMAIL_SYSTEM.md`
- **Flow Diagrams**: `WELCOME_EMAIL_FLOW_DIAGRAM.md`
- **Summary**: `AUTOMATED_WELCOME_EMAIL_SUMMARY.md`
- **This Reference**: `QUICK_REFERENCE_WELCOME_EMAIL.md`

---

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/doctors` | Create doctor + send welcome email |
| POST | `/api/admin/team` | Create team user + send welcome email |
| POST | `/api/users/change-password` | Change password (first login) |

---

## ✅ System Status

**Service**: ✅ Running  
**Email Integration**: ✅ Active  
**Password Generation**: ✅ Working  
**Middleware**: ✅ Enforcing  
**Documentation**: ✅ Complete  

---

**Need Help?** See full documentation in `AUTOMATED_WELCOME_EMAIL_SYSTEM.md`  
**Last Updated**: January 15, 2026  
**Version**: 1.0.0
