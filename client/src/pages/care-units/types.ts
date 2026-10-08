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
}

export interface AccessEntry { actorKind: string; actor: string; action: string; subject: string | null; at: string }

export interface OhcUnit { uid: string; name: string; corporateUid: string; corporateName: string | null; operatorUid: string; operatorName: string | null; services: string[] }
export interface OhcMe {
  worker: { uid: string; displayName: string; role: "ohc_doctor" | "ohc_staff"; mustChangePassword: boolean; registrationNumberOnFile: boolean; canSign: boolean };
  units: OhcUnit[]; serverTime: string;
}
export interface Employee { id: number; uid: string; name: string; employeeId: string | null; department: string | null; designation: string | null }

export interface ApiProblem { status: number; code: string; message: string; details?: Record<string, unknown> }
