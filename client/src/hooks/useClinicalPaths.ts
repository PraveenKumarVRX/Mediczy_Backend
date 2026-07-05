import { useMemo } from "react";
import { buildClinicalPaths } from "@/config/clinicalPortalPaths";

/** Portal-aware HealthOS / clinical path builders for navigation components */
export function useClinicalPaths() {
  return useMemo(() => buildClinicalPaths(), []);
}
