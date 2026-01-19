# Bulk Employee Upload - Visual Guide

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Corporate Dashboard → Employee Management                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  👥 Employee Management                                         │
│  Manage employee health profiles and insurance                  │
│                                                                  │
│                           ┌──────────────┐  ┌──────────────┐   │
│                           │ ➕ Add       │  │ ⬆️ Bulk      │   │
│                           │   Employee   │  │   Upload     │   │
│                           └──────────────┘  └──────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Bulk Upload Dialog

```
┌─────────────────────────────────────────────────────────────────┐
│  Bulk Upload Employees                                    ✖️    │
├─────────────────────────────────────────────────────────────────┤
│  Upload multiple employees at once using a CSV file.            │
│  Download the template to get started.                          │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 📊 Step 1: Download Template                             │ │
│  │                                                            │ │
│  │ Download the CSV template with the required format        │ │
│  │ and fill in employee details.                             │ │
│  │                                                            │ │
│  │ ┌──────────────────────┐                                  │ │
│  │ │ ⬇️ Download Template │                                  │ │
│  │ └──────────────────────┘                                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ⬆️ Step 2: Upload File                                   │ │
│  │                                                            │ │
│  │ Select the completed CSV file to upload employee data.    │ │
│  │                                                            │ │
│  │ ┌────────────────────────────────────────────────────┐   │ │
│  │ │ [Choose File] No file chosen                        │   │ │
│  │ └────────────────────────────────────────────────────┘   │ │
│  │                                                            │ │
│  │ ✅ Selected: employees.csv                                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Required Fields: name, email, department                       │
│  Optional Fields: employeeId, phone, designation, ...           │
│                                                                  │
│                     ┌────────┐  ┌─────────────────┐            │
│                     │ Cancel │  │ Upload Employees│            │
│                     └────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## After Upload - Results Display

```
┌─────────────────────────────────────────────────────────────────┐
│  Bulk Upload Employees                                    ✖️    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ... (previous sections) ...                                    │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Upload Results                                            │ │
│  │                                                            │ │
│  │ ┌──────────────────────────────────────────────────────┐ │ │
│  │ │ ✅ Successful                              95        │ │ │
│  │ └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │ ┌──────────────────────────────────────────────────────┐ │ │
│  │ │ ❌ Failed                                    5        │ │ │
│  │ └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │ Error Details:                                            │ │
│  │ ┌────────────────────────────────────────────────────┐   │ │
│  │ │ Row 3: Missing required fields: name, email...     │   │ │
│  │ │ Row 7: Email already exists: duplicate@company.com │   │ │
│  │ │ Row 12: Missing required fields: department        │   │ │
│  │ └────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│                     ┌────────┐  ┌─────────────────┐            │
│                     │ Cancel │  │ Upload Employees│            │
│                     └────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌──────────────┐
│   User       │
└──────┬───────┘
       │ 1. Click "Bulk Upload"
       ↓
┌──────────────────────┐
│  Bulk Upload Dialog  │
└──────┬───────────────┘
       │ 2. Download template (optional)
       ↓
┌──────────────────────┐
│  CSV Template File   │
│  ─────────────────   │
│  employeeId,name,... │
│  EMP001,John Doe,... │
└──────┬───────────────┘
       │ 3. Fill data & save
       ↓
┌──────────────────────┐
│  Completed CSV File  │
└──────┬───────────────┘
       │ 4. Select file
       ↓
┌──────────────────────┐
│  File Input          │
└──────┬───────────────┘
       │ 5. Click "Upload Employees"
       ↓
┌──────────────────────┐
│  Frontend (Browser)  │
│  ─────────────────   │
│  1. Read file        │
│  2. Parse CSV        │
│  3. Convert to JSON  │
└──────┬───────────────┘
       │ POST /api/corporate/employees/bulk-upload
       │ { employees: [...] }
       ↓
┌──────────────────────────────┐
│  Backend (Server)            │
│  ─────────────────           │
│  1. Receive employee array   │
│  2. Validate each employee   │
│     ├─ Check required fields │
│     ├─ Check email unique    │
│     └─ Apply defaults        │
│  3. Create valid employees   │
│  4. Collect errors           │
│  5. Return results           │
└──────┬───────────────────────┘
       │ { summary: {...}, employees: [...], errors: [...] }
       ↓
┌──────────────────────┐
│  Frontend (Browser)  │
│  ─────────────────   │
│  1. Display results  │
│  2. Show errors      │
│  3. Reload emp list  │
└──────┬───────────────┘
       │ 6. View results
       ↓
┌──────────────────────┐
│  User sees:          │
│  ✅ 95 successful    │
│  ❌ 5 failed         │
│  📋 Error details    │
└──────────────────────┘
```

## CSV Template Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  employee_template.csv                                           │
├──────────────────────────────────────────────────────────────────┤
│  employeeId | name     | email              | phone      | ... │
│  ──────────┼──────────┼────────────────────┼────────────┼───── │
│  EMP001    │ John Doe │ john@company.com   │ +1234567890│ ... │
│  EMP002    │ Jane S.  │ jane@company.com   │ +1234567891│ ... │
│  EMP003    │ Bob W.   │ bob@company.com    │ +1234567892│ ... │
└──────────────────────────────────────────────────────────────────┘
         ↑          ↑            ↑                 ↑
      Optional  Required     Required          Optional
```

## Validation Flow

```
For each employee in CSV:
┌─────────────────────┐
│  Employee Row       │
└──────┬──────────────┘
       │
       ├─→ Has name? ──NO──→ ❌ Error: "Missing required field: name"
       │      │
       │     YES
       │      ↓
       ├─→ Has email? ──NO──→ ❌ Error: "Missing required field: email"
       │      │
       │     YES
       │      ↓
       ├─→ Has department? ──NO──→ ❌ Error: "Missing required field: department"
       │      │
       │     YES
       │      ↓
       ├─→ Email unique? ──NO──→ ❌ Error: "Email already exists: xxx@xxx.com"
       │      │
       │     YES
       │      ↓
       ├─→ Apply defaults:
       │      ├─ employeeId = EMP{timestamp}{index}
       │      ├─ joiningDate = today
       │      ├─ healthStatus = "good"
       │      ├─ lastCheckup = today
       │      └─ insurancePlan = "Standard Plan"
       │      ↓
       └─→ ✅ Create employee → Add to success list
```

## Component Structure

```
CorporateEmployees.tsx
│
├─ State
│  ├─ employees: Employee[]
│  ├─ isBulkUploadOpen: boolean
│  ├─ uploadFile: File | null
│  ├─ isUploading: boolean
│  └─ uploadResults: { successful, failed, errors }
│
├─ Functions
│  ├─ loadEmployees() - Fetch employee list
│  ├─ downloadTemplate() - Download CSV template
│  ├─ parseCSV() - Parse CSV text to objects
│  ├─ handleBulkUpload() - Upload employees
│  └─ closeBulkUpload() - Reset dialog state
│
└─ UI Components
   ├─ Header with "Bulk Upload" button
   ├─ Employee table
   ├─ Add Employee dialog
   ├─ View Employee dialog
   └─ Bulk Upload Dialog
      ├─ Step 1: Download Template section
      ├─ Step 2: Upload File section
      ├─ Upload Results display
      └─ Action buttons (Cancel, Upload)
```

## State Transitions

```
Initial State
└─→ isBulkUploadOpen = false
    uploadFile = null
    isUploading = false
    uploadResults = null

User clicks "Bulk Upload"
└─→ isBulkUploadOpen = true ────┐
                                │
    User clicks "Download Template"
    └─→ Download CSV file       │
                                │
    User selects file           │
    └─→ uploadFile = File ──────┤
                                │
    User clicks "Upload Employees"
    └─→ isUploading = true ─────┤
        Call API                │
        Wait for response       │
        ↓                       │
        Response received       │
        └─→ isUploading = false │
            uploadResults = {...}
            Reload employee list │
                                │
    User clicks "Cancel" ───────┘
    └─→ isBulkUploadOpen = false
        uploadFile = null
        uploadResults = null
```

## API Request/Response Flow

```
Frontend                          Backend
────────                          ───────

1. Template Download
   ↓
   GET /api/corporate/employees/download-template
   Headers: { Authorization: Bearer {token} }
                                   ↓
                            Generate CSV content
                            Set headers (Content-Type, Disposition)
                                   ↓
   ←───────────────────── Return CSV file
   ↓
   Save as employee_template.csv


2. Bulk Upload
   ↓
   Read CSV file
   Parse to JSON array
   ↓
   POST /api/corporate/employees/bulk-upload
   Headers: { Authorization: Bearer {token} }
   Body: {
     employees: [
       { name: "John", email: "john@...", ... },
       { name: "Jane", email: "jane@...", ... }
     ]
   }
                                   ↓
                            Validate each employee
                            Create valid ones
                            Collect errors
                                   ↓
   ←───────────────────── Return {
                            success: true,
                            data: {
                              employees: [...],
                              summary: { total, successful, failed },
                              errors: [...]
                            }
                          }
   ↓
   Display results
   Show errors
   Reload employee list
```

## Error Handling Diagram

```
Upload Process
      ↓
   Try Parse CSV
      ├─ Success → Continue
      └─ Error → ❌ Show "Invalid CSV format"
      ↓
   Validate File Not Empty
      ├─ Has data → Continue
      └─ Empty → ❌ Show "Empty file"
      ↓
   Send to Backend
      ├─ 200 OK → Process results
      │            ├─ All success → ✅ Show success toast
      │            ├─ Partial → ⚠️ Show partial success
      │            └─ All fail → ❌ Show all errors
      │
      ├─ 400 Bad Request → ❌ Show "Invalid request"
      ├─ 401 Unauthorized → ❌ Show "Not authenticated"
      ├─ 500 Server Error → ❌ Show "Server error"
      └─ Network Error → ❌ Show "Connection failed"
```

## Success Path (Happy Flow)

```
┌────────────────────┐
│ 1. User clicks     │
│    "Bulk Upload"   │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 2. Dialog opens    │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 3. Download        │
│    template        │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 4. Fill in 10      │
│    employees       │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 5. Select file     │
│    employees.csv   │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 6. Click Upload    │
│    Employees       │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 7. Processing...   │
│    (2-3 seconds)   │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 8. Results show:   │
│    ✅ 10 successful│
│    ❌ 0 failed     │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 9. Toast: "10      │
│    employees       │
│    uploaded"       │
└─────────┬──────────┘
          ↓
┌────────────────────┐
│ 10. Table shows    │
│     all 10 new     │
│     employees      │
└────────────────────┘
```

## Mobile Responsive Layout

```
Desktop (> 768px):
┌─────────────────────────────────┐
│  Header              [Add] [Bulk]│
│  ─────────────────────────────── │
│  Employee Table (full width)     │
└─────────────────────────────────┘

Mobile (< 768px):
┌──────────────────┐
│  Header          │
│  [Add Employee]  │
│  [Bulk Upload]   │
│  ──────────────  │
│  Employee Cards  │
│  (stacked)       │
└──────────────────┘
```

---

**Visual Summary**: The bulk upload feature provides an intuitive, step-by-step interface for uploading multiple employees efficiently, with clear visual feedback and comprehensive error reporting.
