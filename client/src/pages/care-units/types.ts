/** Shapes returned by /api/care-units, /api/corporate/ohc-units and /api/ohc-workspace (docs/architecture/OHC_UNDER_HOSPITAL_UNITS_DESIGN.md). Server-owned. */

export type UnitType = "main" | "branch" | "outreach_clinic" | "medical_centre" | "ohc";
export type ContractStatus = "proposed" | "active" | "ended";
export type VisitPattern = "daily" | "weekly" | "monthly" | "mobile";

export interface Contract {
  status: ContractStatus; ref: string | null; start: string | null; end: string | null; initiatedBy: "corporate" | "operator" | null;
  acceptedByCorporateAt: string | null; acceptedByOperatorAt: string | null;
}

export interface CareUnit {
  uid: string; type: UnitType; name: string; active: boolean; ownerUid: string;
  parent: { uid: string; name: string; type: UnitType } | null;
  ownership: "owned" | "co_owned" | null; brandName: string | null; coOwnerUid: string | null; visitPattern: VisitPattern | null; services: string[];
  address: { line: string | null; city: string | null; state: string | null; pincode: string | null };
  phone: string | null; email: string | null; manager: { name?: string; phone?: string } | null;
  corporateUid?: string; contract?: Contract; createdAt: string;
  staffCount?: number; childCount?: number; operatorName?: string; corporateName?: string; certificates?: number; certificates30d?: number;
}

export interface UnitStaff { uid: string; name: string; email?: string; role: string; active: boolean }

export interface Certificate {
  id: number; patientName: string | null; employeeId: string | null; type: string | null; fitnessStatus: string; restrictions: string | null;
  validFrom: string | null; validUntil: string | null; examinationDate: string | null; issuedBy: string | null; doctorRegNo: string | null; remarks: string | null; issuedAt: string;
}

export interface CorporateDashboard {
  unit: CareUnit; staff: UnitStaff[]; services: string[]; certificates: Certificate[];
  stats: { total: number; last_30d: number; fit: number; restricted: number; unfit: number };
  /** Present only for the signed-in corporate_cmo: their clinical capability on this OHC. */
  cmo?: { canSign: boolean; registrationNumberOnFile: boolean };
}

export interface AccessEntry { actorKind: string; actor: string; action: string; subject: string | null; at: string }

export interface OhcUnit { uid: string; name: string; corporateUid: string; corporateName: string | null; operatorUid: string; operatorName: string | null; services: string[] }
export interface OhcMe {
  worker: { uid: string; displayName: string; role: "ohc_doctor" | "ohc_staff" | "corporate_cmo"; mustChangePassword: boolean; registrationNumberOnFile: boolean; canSign: boolean; isSuperAdmin?: boolean; canManage?: boolean };
  units: OhcUnit[]; serverTime: string;
}
export interface Employee { id: number; uid: string; name: string; employeeId: string | null; department: string | null; designation: string | null }
export interface OhcStaffMember { uid: string; name: string; email: string | null; role: string; active: boolean }
/** Raw row from /api/ohc-workspace/certificates and /api/corporate/ohc-units/:uid/certificates (ohcService.certificates — not the camelCase CorporateDashboard.certificates). */
export interface WorkspaceCertificate { id: number; patient_name: string | null; employee_id: string | null; fitness_status: string; restrictions: string | null; valid_until: string | null; created_at: string }
export interface WorkplaceEmergency {
  id: number; unit_uid: string; corporate_uid: string; employee_user_id: number | null; employee_name?: string; employee_uid?: string;
  incident_type: string; severity: "low" | "medium" | "high" | "critical"; description: string; location: string | null;
  occurred_at: string; status: "open" | "triaged" | "resolved" | "transferred" | "closed"; triage_notes: string | null; resolution: string | null;
}

export interface ApiProblem { status: number; code: string; message: string; details?: Record<string, unknown> }

/** The real hospital prescription/referral systems, now reachable by ohc_doctor/corporate_cmo via an
 * auto-provisioned linked Doctor identity (ohcClinicianAuth.middleware.js, server-side) — not an
 * OHC-only copy. Shapes match /api/prescriptions and /api/careos/network/referrals exactly. */
export interface Medication { name: string; composition?: string; dosage: string; frequency: string; duration: string; quantity?: string; instructions?: string }
export interface ClinicalPrescription {
  id: number; patientName: string | null; diagnosis: string | null; medications: Medication[] | null;
  doctorName: string | null; status: string; createdAt: string;
}
/** Raw row from healthos_referrals (RETURNING *) — snake_case, not the camelCase request body. */
export interface ClinicalReferral {
  id: number; from_org_id: number; to_org_id: number; patient_id: number; reason: string; urgency: string;
  clinical_summary: string | null; status: string; referred_by: number | null; created_at: string;
}
