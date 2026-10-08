import type { ContractStatus, UnitType, VisitPattern } from "./types";

export const TYPE_LABEL: Record<UnitType, string> = {
  main: "Main facility", branch: "Branch", outreach_clinic: "Outreach clinic", medical_centre: "Medical centre", ohc: "Occupational Health Clinic",
};
export const TYPE_HINT: Record<UnitType, string> = {
  main: "The operator's main facility.",
  branch: "100% owned by the hospital or clinic.",
  outreach_clinic: "100% owned, runs on a visiting schedule in the community.",
  medical_centre: "Co-branded and co-owned with a partner.",
  ohc: "Sits inside a company, under an outreach clinic or medical centre. Serves exactly one company.",
};
export const PATTERN_LABEL: Record<VisitPattern, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", mobile: "Mobile unit" };
export const CONTRACT_LABEL: Record<ContractStatus, string> = { proposed: "Awaiting acceptance", active: "Active", ended: "Ended" };
export const CONTRACT_TONE: Record<ContractStatus, string> = {
  proposed: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  active: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  ended: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
export const FITNESS_LABEL: Record<string, string> = {
  fit: "Fit", fit_with_restrictions: "Fit with restrictions", temporarily_unfit: "Temporarily unfit", unfit: "Unfit",
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
