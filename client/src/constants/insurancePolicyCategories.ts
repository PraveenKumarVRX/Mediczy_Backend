export const INSURANCE_POLICY_CATEGORIES = [
  {
    value: 'Group Health Insurance',
    label: 'Group Health Insurance'
  },
  {
    value: 'Group Health Insurance with OP & Wellness',
    label: 'Group Health Insurance with OP & Wellness'
  },
  {
    value: 'Parents Health Insurance',
    label: 'Parents Health Insurance'
  },
  {
    value: 'Parents Health Insurance with OP & Wellness',
    label: 'Parents Health Insurance with OP & Wellness'
  },
  {
    value: 'Personal Health Insurance',
    label: 'Personal Health Insurance'
  },
  {
    value: 'Personal Health Insurance with OP & Wellness',
    label: 'Personal Health Insurance with OP & Wellness'
  },
  {
    value: 'OP & Wellness only',
    label: 'OP & Wellness only'
  },
  {
    value: 'Group Personal Accident (GPA)',
    label: 'Group Personal Accident (GPA)'
  },
  {
    value: 'Group Term Life Insurance',
    label: 'Group Term Life Insurance'
  }
] as const;

export type InsurancePolicyCategory = (typeof INSURANCE_POLICY_CATEGORIES)[number]['value'];

export const DEFAULT_INSURANCE_POLICY_CATEGORY: InsurancePolicyCategory = 'Personal Health Insurance';
