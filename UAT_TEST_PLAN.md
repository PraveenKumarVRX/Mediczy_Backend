# 🧪 USER ACCEPTANCE TESTING (UAT) PLAN

**Date:** January 12, 2026  
**Project:** Mediczy - Patient Login Issues Fix  
**Scope:** All 10 patient login issues  

---

## 📋 UAT OBJECTIVES

✅ Validate all 10 fixes work as expected  
✅ Ensure no regression in existing features  
✅ Confirm user workflows are smooth  
✅ Verify security is maintained  
✅ Test across multiple browsers/devices  

---

## 🎯 TEST CASES

### CRITICAL ISSUES (Must Pass)

#### 1️⃣ PATIENT LOGIN ROUTING
**Test Case:** PLR-001  
**Objective:** Verify patient login redirects to /profile

```
Preconditions:
- Patient account exists (email: test@mediczy.com)
- Patient is logged out

Test Steps:
1. Navigate to /login
2. Enter email: test@mediczy.com
3. Enter password: Test123
4. Click "Login"
5. Verify redirect occurs

Expected Results:
✅ No errors displayed
✅ User redirected to /profile (NOT /)
✅ localStorage contains: userType = "user"
✅ Dashboard shows patient information
✅ Can see "Profile", "Appointments", "Reports" etc.

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

#### 2️⃣ VIDEO MEETING ROOM
**Test Case:** VMR-001  
**Objective:** Verify video room pre-creation on booking

```
Preconditions:
- Patient is logged in
- Doctor profile exists
- Online consultation option available

Test Steps:
1. Navigate to booking page
2. Select doctor
3. Choose online consultation type
4. Select date/time
5. Confirm booking
6. Check response for roomToken

Expected Results:
✅ Booking succeeds
✅ Response includes: roomToken, roomCreated: true
✅ Patient receives meeting link
✅ Meeting link is valid
✅ Can join video room immediately

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

#### 3️⃣ VIDEO VISIBILITY
**Test Case:** VVS-001  
**Objective:** Verify video streams display properly

```
Preconditions:
- Patient and doctor both logged in
- Video consultation booked and time arrived
- Both have cameras enabled

Test Steps:
1. Patient joins video room
2. Wait for video to load
3. Verify patient video displays
4. Verify doctor video displays (when doctor joins)
5. Test audio is working
6. Test video can be toggled on/off

Expected Results:
✅ Patient video shows immediately
✅ Clear video with no black screen
✅ Doctor video visible when connected
✅ Audio is synchronized
✅ Video quality is acceptable
✅ Can end call cleanly

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

#### 4️⃣ REPORT UPLOAD
**Test Case:** RU-001  
**Objective:** Verify file upload works with validation

```
Preconditions:
- Patient is logged in
- Upload page accessible

Test Steps:
1. Navigate to reports/upload
2. Click "Choose file"
3. Select test PDF file (< 10MB)
4. Click "Upload"
5. Verify success message
6. Check file appears in reports list

Test Cases:
a) Valid PDF (5MB)
b) Valid PNG image (2MB)
c) Invalid file type (EXE)
d) Oversized file (15MB)
e) Multiple files

Expected Results:
✅ Valid files upload successfully
✅ Invalid types rejected
✅ Oversized files rejected
✅ Success message displayed
✅ File appears in reports list
✅ Can download/delete file

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

#### 5️⃣ APPOINTMENT HISTORY
**Test Case:** AH-001  
**Objective:** Verify appointment tabs show correct appointments

```
Preconditions:
- Patient has multiple appointments (past and future)
- Appointments have different statuses

Test Steps:
1. Navigate to MyBookings
2. Click "Upcoming" tab
3. Verify only future appointments shown
4. Click "History" tab
5. Verify only past/completed appointments shown
6. Click "All" tab
7. Verify all appointments shown

Expected Results:
✅ Upcoming tab shows only future appointments
✅ History tab shows only past appointments
✅ All tab shows complete list
✅ Statuses are correctly displayed
✅ Can filter/sort in each view
✅ Responsive on mobile

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

---

### HIGH PRIORITY ISSUES (Should Pass)

#### 6️⃣ HEALTH ASSESSMENT SAVE
**Test Case:** HAS-001  
**Objective:** Verify health assessment saves with risk calculation

```
Preconditions:
- Patient is logged in
- Health assessment form accessible

Test Steps:
1. Fill out health assessment form with:
   - Age: 45
   - Gender: Male
   - Height: 170cm
   - Weight: 75kg
   - Smoking: Never
   - Exercise: Moderate
2. Click "Save Assessment"
3. Verify success message
4. Check risk score displayed
5. Verify recommendations provided

Expected Results:
✅ Form validates input
✅ Calculation completes
✅ Risk score displayed (0-100)
✅ Risk level shown (LOW/MILD/MODERATE/HIGH/VERY_HIGH)
✅ Recommendations provided
✅ Can view saved assessment later

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

#### 7️⃣ DIET PLAN GENERATION
**Test Case:** DPG-001  
**Objective:** Verify personalized diet plan based on parameters

```
Preconditions:
- Patient is logged in
- Health data entered

Test Steps:
1. Navigate to Diet Plans
2. Enter parameters:
   - Goal: Weight Loss
   - Activity: Moderate
3. Generate plan
4. Verify meal plan provided
5. Change goal to Muscle Gain
6. Generate plan
7. Verify different plan returned

Expected Results:
✅ Plan generated within 2 seconds
✅ Parameters accepted
✅ Personalized plan displayed
✅ Macros calculated correctly
✅ Different goals = different plans
✅ Meals are realistic and achievable

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

#### 8️⃣ REPORT ANALYSIS
**Test Case:** RA-001  
**Objective:** Verify uploaded reports can be analyzed

```
Preconditions:
- Patient has uploaded a report
- Report visible in list

Test Steps:
1. Go to My Reports
2. Find uploaded report
3. Click "Analyze" button
4. Wait for analysis
5. View results

Expected Results:
✅ Analysis completes within reasonable time
✅ Results displayed clearly
✅ Key findings highlighted
✅ Recommendations provided
✅ Can download analysis
✅ No errors displayed

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

#### 9️⃣ LAB TEST BOOKING
**Test Case:** LTB-001  
**Objective:** Verify lab test booking works

```
Preconditions:
- Patient is logged in
- Labs available in system

Test Steps:
1. Navigate to Book Lab Tests
2. Search for labs in city
3. View available tests
4. Select tests
5. Choose date/time
6. Confirm booking
7. Verify confirmation

Expected Results:
✅ Labs found and displayed
✅ Tests listed with prices
✅ Available slots shown
✅ Booking confirms successfully
✅ Confirmation email sent (or notification)
✅ Appointment appears in calendar

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

#### 🔟 ADD FAMILY MEMBER
**Test Case:** FM-001  
**Objective:** Verify family member can be added

```
Preconditions:
- Patient is logged in
- Profile page accessible

Test Steps:
1. Go to Profile
2. Click "Add Family Member"
3. Fill details:
   - Name: John Doe
   - Relationship: Son
   - Gender: Male
   - DOB: 2005-01-15
4. Click "Add"
5. Verify success
6. Verify member appears in list

Expected Results:
✅ Form validates input
✅ Member added successfully
✅ Appears in family list
✅ Can edit member details
✅ Can remove member
✅ Membership limits enforced

Actual Results:
[ ] Pass [ ] Fail [ ] Partial
Notes: _______________________________________________
```

---

## 🔄 REGRESSION TESTS

### Existing Features (No Regression)

| Feature | Test | Status |
|---------|------|--------|
| User registration | Can create new account | [ ] |
| Doctor dashboard | Doctor can view patients | [ ] |
| Appointments | Can book/cancel appointments | [ ] |
| Payments | Payment processing works | [ ] |
| Notifications | Receive notifications | [ ] |
| Messaging | Can send/receive messages | [ ] |

---

## 🌐 BROWSER COMPATIBILITY

Test on all browsers:

| Browser | Version | Pass | Notes |
|---------|---------|------|-------|
| Chrome | Latest | [ ] | |
| Firefox | Latest | [ ] | |
| Safari | Latest | [ ] | |
| Edge | Latest | [ ] | |
| Mobile Chrome | Latest | [ ] | |
| Mobile Safari | Latest | [ ] | |

---

## 📱 DEVICE TESTING

| Device | OS | Resolution | Pass | Notes |
|--------|----|------------|------|-------|
| Desktop | Windows | 1920x1080 | [ ] | |
| Laptop | macOS | 1440x900 | [ ] | |
| Tablet | iOS | 768x1024 | [ ] | |
| Tablet | Android | 800x1280 | [ ] | |
| Phone | iOS | 375x667 | [ ] | |
| Phone | Android | 360x640 | [ ] | |

---

## 🔐 SECURITY TESTS

| Test | Description | Pass | Notes |
|------|-------------|------|-------|
| Authentication | Invalid token rejected | [ ] | |
| Authorization | Can't access other user's data | [ ] | |
| File Upload | Malicious files rejected | [ ] | |
| HTTPS | All traffic encrypted | [ ] | |
| SQL Injection | Protected | [ ] | |
| XSS | Protected | [ ] | |

---

## ⚡ PERFORMANCE TESTS

| Metric | Target | Actual | Pass |
|--------|--------|--------|------|
| Page Load | < 3s | ___s | [ ] |
| API Response | < 1s | ___s | [ ] |
| File Upload | < 5s | ___s | [ ] |
| Health Assessment | < 500ms | ___ms | [ ] |

---

## 📊 UAT SIGN-OFF

### Tester Information
- **Name:** _____________________
- **Date:** _____________________
- **Environment:** ☐ Staging  ☐ Production

### Summary
- **Total Tests:** ___
- **Passed:** ___ (___%)
- **Failed:** ___ (___%)
- **Blocked:** ___ (___%)

### Issues Found

| #  | Issue | Severity | Resolution |
|----|-------|----------|------------|
| 1  | ___________ | [ ] Critical | |
| 2  | ___________ | [ ] High | |
| 3  | ___________ | [ ] Medium | |

### Recommendations

☐ Ready for Production  
☐ Ready with conditions  
☐ Not ready - needs fixes

**Comments:** ________________________________________

### Approval

- **QA Lead:** ______________________ (Date: __)
- **Product Owner:** ______________________ (Date: __)
- **Technical Lead:** ______________________ (Date: __)

---

## 📝 NOTES

Use this section for any additional observations:

_________________________________________________________________

_________________________________________________________________

_________________________________________________________________

---

**UAT Status: READY FOR TESTING** ✅

