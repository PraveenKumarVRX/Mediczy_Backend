# Corporate Bulk Upload - Quick Start Guide

## How to Bulk Upload Employees

### Step 1: Access the Feature
1. Navigate to Corporate Dashboard → Employee Management
2. Click the **"Bulk Upload"** button (next to "Add Employee")

### Step 2: Download Template
1. In the dialog, click **"Download Template"**
2. The file `employee_template.csv` will download
3. Open the file in Excel, Google Sheets, or any spreadsheet editor

### Step 3: Fill Employee Data
The template has these columns:

| Column | Required? | Example |
|--------|-----------|---------|
| employeeId | Optional | EMP001 |
| name | **Required** | John Doe |
| email | **Required** | john@company.com |
| phone | Optional | +1234567890 |
| department | **Required** | Engineering |
| designation | Optional | Software Engineer |
| joiningDate | Optional | 2024-01-15 |
| healthStatus | Optional | good |
| lastCheckup | Optional | 2024-12-01 |
| insurancePlan | Optional | Standard Plan |

**Important Notes**:
- Delete the sample row before adding your data
- Keep the header row (first line)
- Required fields: `name`, `email`, `department`
- Email must be unique (no duplicates)
- Health status options: excellent, good, moderate, poor
- Date format: YYYY-MM-DD (e.g., 2024-01-15)

### Step 4: Upload File
1. Click **"Choose File"** or **Browse**
2. Select your completed CSV file
3. You'll see: "Selected: your-file.csv"
4. Click **"Upload Employees"**

### Step 5: Review Results
After upload completes, you'll see:
- ✅ **Successful**: Number of employees created
- ❌ **Failed**: Number of rows that failed (if any)
- **Error Details**: Specific errors for each failed row

### Step 6: Verify
- New employees appear in the employee table automatically
- Check the employee list to confirm all data is correct

## Common Errors and Solutions

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Missing required fields" | name, email, or department is empty | Fill in all required fields |
| "Email already exists" | Email is already in the system | Use a different email address |
| "Empty file" | CSV has no data rows | Add at least one employee |
| "No file selected" | Upload clicked without selecting file | Select a CSV file first |

## Tips for Success

### ✅ Best Practices
- Start with a small batch (5-10 employees) to test
- Keep the CSV file simple - don't add extra columns
- Use plain text format (no special formatting)
- Verify emails are correct and unique
- Use consistent date formats (YYYY-MM-DD)
- Save your file as CSV, not Excel (.xlsx)

### ❌ Things to Avoid
- Don't delete or rename the header row
- Don't use commas in the data (breaks CSV format)
- Don't leave name, email, or department blank
- Don't use duplicate email addresses
- Don't include thousands of employees at once (recommended max: 500-1000)

## Example CSV File

```csv
employeeId,name,email,phone,department,designation,joiningDate,healthStatus,lastCheckup,insurancePlan
EMP001,Alice Johnson,alice.j@company.com,+1234567890,Engineering,Senior Engineer,2024-01-15,excellent,2024-12-01,Premium Plan
EMP002,Bob Smith,bob.smith@company.com,+1234567891,HR,HR Manager,2024-02-01,good,2024-11-20,Standard Plan
EMP003,Carol White,carol.w@company.com,+1234567892,Sales,Sales Lead,2024-03-10,good,2024-12-05,Standard Plan
```

## Quick Reference

### File Format
- **Type**: CSV (Comma-Separated Values)
- **Extension**: .csv
- **Encoding**: UTF-8
- **Line Endings**: Unix (LF) or Windows (CRLF)

### Required Fields
1. **name** - Employee full name
2. **email** - Unique email address
3. **department** - Department name

### Optional Fields
- employeeId (auto-generated if blank)
- phone
- designation
- joiningDate (defaults to today)
- healthStatus (defaults to "good")
- lastCheckup (defaults to today)
- insurancePlan (defaults to "Standard Plan")

## Troubleshooting

### Problem: Template won't download
**Solution**: Check browser permissions, try different browser, or disable popup blockers

### Problem: Upload button is disabled
**Solution**: Make sure you've selected a CSV file

### Problem: All employees failed to upload
**Solution**: 
1. Check CSV format matches template
2. Verify required fields are filled
3. Check for duplicate emails
4. Ensure no commas in data fields

### Problem: Some employees uploaded, some failed
**Solution**: 
1. Check the error details in the results
2. Fix the failed rows in your CSV
3. Upload again with just the fixed rows

## Getting Help

If you encounter issues:
1. Check the error message in the upload results
2. Verify your CSV matches the template format
3. Test with a single employee first
4. Review this guide for common errors

## Advanced Usage

### Large Batches
For uploading 500+ employees:
1. Split into smaller batches of 100-200
2. Upload in multiple sessions
3. Verify each batch before proceeding

### Updating Existing Employees
Currently, bulk upload only creates new employees. To update:
1. Use the individual "Edit" button for existing employees
2. Or delete and re-upload (not recommended for active employees)

### Exporting Employee Data
To get current employee data as CSV:
1. This feature is planned for future release
2. Currently, use the employee table to view data
3. Or contact system admin for data export

---

**Need more help?** Contact your system administrator or IT support team.
