/**
 * Corporate welcome email template rendering — no DB/SMTP dependencies (testable in isolation).
 */

export function formatCorporateEmployeePlan(employeeData = {}) {
  const planName = employeeData.planName || employeeData.insurancePlan || employeeData.packageType || `${employeeData.companyName || 'Corporate'} Employee Health Plan`;
  const coverageAmount = employeeData.coverageAmount || employeeData.sumInsured || employeeData.sum_insured || employeeData.coverage || 'As per corporate plan eligibility';
  const startDate = employeeData.planStartDate || employeeData.startDate || employeeData.coverageStartDate || '';
  const endDate = employeeData.planEndDate || employeeData.endDate || employeeData.coverageEndDate || '';
  const validity = employeeData.planValidity || employeeData.validity || ([startDate, endDate].filter(Boolean).join(' to ') || 'Active as per corporate HR policy');
  const sponsor = employeeData.sponsor || employeeData.employerContribution || 'Employer sponsored corporate health benefit';
  const copay = employeeData.copay || employeeData.employeeShare || 'As per approved plan terms';
  const benefits = Array.isArray(employeeData.planBenefits)
    ? employeeData.planBenefits
    : String(employeeData.planBenefits || employeeData.benefits || 'Doctor consultations, lab tests, health records, pharmacy benefits, care navigation')
        .split(/[|,;]\s*/)
        .map((item) => item.trim())
        .filter(Boolean);

  return { planName, coverageAmount, validity, sponsor, copay, benefits };
}

/**
 * Render template variables in subject/html using a values map.
 * Supports exact keys ({{email}}, [Employee Name]) and flexible {{ token }} spacing.
 */
export function renderTemplate(template, values) {
  let result = String(template || '');
  const braceVars = {};

  for (const [key, val] of Object.entries(values)) {
    const braceMatch = String(key).match(/^\{\{\s*(\w+)\s*\}\}$/);
    if (braceMatch) {
      braceVars[braceMatch[1]] = val ?? '';
      continue;
    }
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), val ?? '');
  }

  result = result.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(braceVars, name) ? braceVars[name] : `{{${name}}}`
  );

  return result;
}

/** Placeholder map for corporate employee welcome/reminder custom templates. */
export function buildCorporateEmployeeTemplateVars(employeeData, temporaryPassword) {
  const {
    email,
    firstName,
    lastName,
    companyName,
    employeeId,
    department,
    loginUid,
  } = employeeData;
  const plan = formatCorporateEmployeePlan(employeeData);
  const planBenefitsText = plan.benefits.join(', ');
  // loginUid is the platform-issued 6-char corporate_employees.unique_id — the actual
  // login identifier when this account was admin/HR-provisioned rather than
  // self-registered. email/employeeId remain the fallback for older flows.
  const loginIdentifier = loginUid || email || employeeId || '';
  const employeeName = `${firstName || ''} ${lastName || ''}`.trim() || 'Employee';

  return {
    '{{firstName}}': firstName,
    '{{lastName}}': lastName,
    '{{employeeName}}': employeeName,
    '{{email}}': email,
    '{{companyName}}': companyName,
    '{{employeeId}}': employeeId || '',
    '{{department}}': department || '',
    '{{temporaryPassword}}': temporaryPassword,
    '{{password}}': temporaryPassword,
    '{{username}}': loginIdentifier,
    '{{userId}}': loginIdentifier,
    '{{loginIdentifier}}': loginIdentifier,
    '{{loginUrl}}': 'https://app.mediqzy.com/login',
    '{{planName}}': plan.planName,
    '{{coverageAmount}}': plan.coverageAmount,
    '{{planValidity}}': plan.validity,
    '{{planSponsor}}': plan.sponsor,
    '{{planCopay}}': plan.copay,
    '{{planBenefits}}': planBenefitsText,

    '[First Name]': firstName,
    '[Last Name]': lastName,
    '[Employee Name]': employeeName,
    '[Employee Email ID / Mobile Number]': loginIdentifier,
    '[Username]': loginIdentifier,
    '[User ID]': loginIdentifier,
    '[Employee ID]': employeeId || '',
    '[Temporary Password]': temporaryPassword,
    '[Password]': temporaryPassword,
    '[Company Name]': companyName,
    '[Department]': department || '',
    '[Login URL]': 'https://app.mediqzy.com/login',
    '[generated securely at send time]': temporaryPassword,
  };
}
