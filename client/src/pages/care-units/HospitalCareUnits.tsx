import HospitalLayout from "@/components/hospital/HospitalLayout";
import { CareUnitsManager } from "./CareUnitsManager";

/** /hospital/branches — replaces the old Branches & Outreach Clinics mock. */
export default function HospitalCareUnits() {
  return (
    <HospitalLayout title="Branches, Outreach Clinics & OHC" subtitle="Your outreach clinics, medical centres and the occupational health clinics inside companies">
      <CareUnitsManager />
    </HospitalLayout>
  );
}
