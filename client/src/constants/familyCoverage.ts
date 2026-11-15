/**
 * Family coverage tiers for benefit plans (server: server/utils/familyCoverage.js).
 * Stored on the plan as metadata.familyCoverage; corporate members are covered by
 * their plan's tier, and a corporate plan without one covers the employee only.
 */
export type FamilyCoverage = "employee" | "employee_spouse_children" | "employee_spouse_children_parents";

/** Select value for "no tier set" (Radix Select cannot use an empty string). */
export const FAMILY_COVERAGE_NONE = "none";

export const FAMILY_COVERAGE_OPTIONS: Array<{ value: FamilyCoverage; label: string; hint: string }> = [
  { value: "employee", label: "Employee only", hint: "No dependants" },
  { value: "employee_spouse_children", label: "Employee + spouse + 2 children", hint: "1 spouse, up to 2 children" },
  {
    value: "employee_spouse_children_parents",
    label: "Employee + spouse + 2 children + 2 parents or parents-in-law",
    hint: "Adds 2 parents, either own parents or parents-in-law, not both",
  },
];

export const familyCoverageSelectValue = (value?: string | null) =>
  FAMILY_COVERAGE_OPTIONS.some((o) => o.value === value) ? (value as string) : FAMILY_COVERAGE_NONE;

/** The value to send: null clears the tier. */
export const familyCoverageFromSelect = (value: string): FamilyCoverage | null =>
  value === FAMILY_COVERAGE_NONE ? null : (value as FamilyCoverage);

export const familyCoverageLabel = (value?: string | null) =>
  FAMILY_COVERAGE_OPTIONS.find((o) => o.value === value)?.label ?? null;
