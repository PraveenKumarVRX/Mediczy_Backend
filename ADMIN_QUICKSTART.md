# 🎉 Admin System - Ready for Use

## Quick Start

### 1. Login to Admin Dashboard

**Frontend URL:** http://localhost:5173/admin/login

**Credentials:**
```
Email: admin@mediczy.local
Password: Admin@1234
```

### 2. Access Dashboard

After login, you'll be redirected to: http://localhost:5173/admin

### 3. Upload Master Data

Use the three panels to paste JSON arrays and upload:
- **Doctors** - Medical professionals
- **Labs** - Diagnostic laboratories
- **Pharmacies** - Pharmacy locations

---

## Example Uploads

### Upload a Doctor
```json
[{
  "firstName": "Alice",
  "lastName": "Cooper",
  "email": "alice.cooper@example.com",
  "specialization": "Cardiologist",
  "experience": 12,
  "phoneNumber": "555-1234",
  "languages": ["English", "Hindi"],
  "about": "Experienced cardiac specialist"
}]
```

### Upload a Lab
```json
[{
  "name": "Advanced Diagnostics",
  "email": "info@advdiag.com",
  "phoneNumber": "555-5000",
  "services": ["Blood Test", "MRI", "CT Scan", "X-Ray"],
  "accreditation": "NABL"
}]
```

### Upload a Pharmacy
```json
[{
  "name": "24/7 Pharmacy",
  "email": "support@247pharmacy.com",
  "phoneNumber": "555-6000",
  "licenseNumber": "PHARM-2024-001",
  "services": ["Prescription", "OTC Medicines", "Home Delivery"]
}]
```

---

## Important Notes

### Doctor Specializations (ENUM - Must Match Exactly)
- Cardiologist
- Neurologist
- Pediatrician
- Dermatologist
- Orthopedist
- Psychiatrist
- Psychologist
- Gynecologist
- ENT Specialist
- Ophthalmologist
- General Practitioner
- Physiotherapist
- Nutritionist
- Dietician
- Other (and 20+ more - see README)

### Required Fields

**Doctors:**
- firstName, lastName, email

**Labs:**
- name, email

**Pharmacies:**
- name, email

---

## API Endpoints (For Programmatic Access)

### Get Admin Token
```bash
curl -X POST http://localhost:8000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@mediczy.local","password":"Admin@1234"}'
```

### Upload Doctors
```bash
curl -X POST http://localhost:8000/api/admin/masters/doctors \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"doctors":[...]}'
```

### Upload Labs
```bash
curl -X POST http://localhost:8000/api/admin/masters/labs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"labs":[...]}'
```

### Upload Pharmacies
```bash
curl -X POST http://localhost:8000/api/admin/masters/pharmacies \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"pharmacies":[...]}'
```

---

## Features

✅ **Role-Based Access Control** - Admin-only endpoints  
✅ **JWT Authentication** - Secure token-based auth  
✅ **Bulk Operations** - Upload multiple records at once  
✅ **Idempotent** - Won't create duplicates (by email)  
✅ **Validation** - ENUM constraints and required fields  
✅ **Auto Password Generation** - For doctors without passwords  
✅ **Success Feedback** - See count of uploaded records  
✅ **Logout** - Clear admin session anytime  

### 📊 Health Risk Assessment Module

- Navigate to **/admin/health-risk** from the sidebar ("Health Risk").
- Pick a member to view last score, chronic tags, and recent assessment timeline.
- Complete the **nine-dimension questionnaire** (demographics → substance use) to compute a weighted score (0–300).
- Use quick actions: **Prefill Low Risk**, **Prefill High Risk**, or **Reset Form** while testing.
- The summary panel highlights **top risk drivers**, band interpretation (Low/Moderate/High/Severe), completion %, and per-section weights.
- Assessment history auto-fetches via `/admin/health-risk/members/:id` when available; until the API ships, the UI falls back to simulated data with a badge notifying you.

---

## Database Verification

Check uploaded records:
```bash
mysql -u mediczy -pmediczy2024 mediczy -e "
  SELECT id, CONCAT(firstName, ' ', lastName) as name, email, specialization 
  FROM doctors ORDER BY id DESC LIMIT 5;
  
  SELECT id, name, email FROM labs ORDER BY id DESC LIMIT 5;
  
  SELECT id, name, email FROM pharmacies ORDER BY id DESC LIMIT 5;
"
```

---

## Quick Command Reference

For a complete list of commands, run:
```bash
./admin-commands.sh
```

---

## Troubleshooting

### Can't login?
- Verify server is running: `lsof -i :8000`
- Check credentials: `admin@mediczy.local` / `Admin@1234`
- Re-seed admin: `cd server && npm run seed:admin`

### Upload fails?
- Check doctor `specialization` matches ENUM values exactly
- Ensure required fields are present
- Verify token hasn't expired (7 day validity)
- Check console for detailed error messages

### Frontend not loading?
- Start client: `cd client && npm run dev`
- Visit: http://localhost:5173/admin/login

---

## Production Checklist

Before deploying to production:

- [ ] Change admin password immediately
- [ ] Set strong `SECRET_TOKEN` in `.env`
- [ ] Add rate limiting on admin endpoints
- [ ] Enable audit logging
- [ ] Add input sanitization
- [ ] Implement schema validation (Zod/Joi)
- [ ] Set up SSL/TLS certificates
- [ ] Configure CORS for production domain
- [ ] Add request size limits
- [ ] Implement monitoring and alerts

---

**Status:** ✅ All systems operational  
**Last Tested:** November 9, 2025  
**Server:** Running on port 8000  
**Database:** Connected and synced  

Happy uploading! 🚀
