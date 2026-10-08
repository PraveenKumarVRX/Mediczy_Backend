import ClinicLayout from "@/components/clinic/ClinicLayout";
import { CareUnitsManager } from "./CareUnitsManager";

/** /clinic/care-units — the same administration for a clinic tenant. */
export default function ClinicCareUnits() {
  return (
    <ClinicLayout title="Outreach Clinics & OHC" subtitle="Your outreach clinics, medical centres and the occupational health clinics inside companies">
      <CareUnitsManager />
    </ClinicLayout>
  );
}
