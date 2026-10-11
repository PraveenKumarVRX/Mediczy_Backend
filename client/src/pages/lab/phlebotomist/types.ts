/** Shapes returned by /api/phlebotomy/* for the signed-in collector — see
 * docs/api/PHLEBOTOMY_MOBILE_API_INTEGRATION.md §4. This is the collector's own minimum-necessary
 * view, not the lab admin's fuller CollectionTask (../collection/types.ts) — DOB/UHID/address-before-
 * acceptance are deliberately withheld by the server, so this type doesn't claim they exist. The
 * status/priority/mode enums are identical on both sides, so they're re-exported from there instead
 * of duplicated, to stay compatible with StatusBadge/PriorityBadge. */
import type { CollectionMode, Priority, TaskStatus } from "../collection/types";

export type { CollectionMode, Priority, TaskStatus };

export interface Worker {
  uid: string; displayName: string; email: string; phone: string | null; status: string;
  qualification: string | null; qualificationExpires: string | null; verifiedAt: string | null;
  mustChangePassword: boolean; lastLoginAt: string | null;
}
export interface Membership { ownerUid: string; scopes: string[]; canHome: boolean; canWard: boolean }
export interface Me { worker: Worker; memberships: Membership[]; capabilities: { home: boolean; ward: boolean }; serverTime: string }

export interface Task {
  id: string;
  mode: CollectionMode;
  status: TaskStatus;
  priority: Priority;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  version: number;
  assignmentVersion: number;
  patient: { name: string | null; age: number | null; gender: string | null };
  collectedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  permittedCommands: string[];
  home?: {
    departedAt: string | null; arrivedAt: string | null;
    address?: { line1: string; line2: string | null; city: string; state: string | null; pincode: string | null; landmark: string | null };
    contactPhone?: string | null;
  };
  ward?: {
    facilityUid: string; wardName: string | null; bedLabel: string | null; roundLabel: string | null;
    isolationRequired: boolean; isolationAckAt: string | null; atBedsideAt: string | null;
  };
}

export interface Test {
  id: string; code: string | null; name: string;
  containerType: "unspecified" | "edta" | "serum" | "plasma_heparin" | "fluoride" | "citrate" | "urine" | "culture" | "other";
  requiredVolumeMl: number | null; handling: string | null; priority: Priority;
  status: "required" | "scanned" | "collected" | "received" | "rejected"; specimenId: string | null;
}

export interface Specimen {
  id: string; barcode: string; containerType: string; status: string;
}

export interface TaskDetail { task: Task; tests: Test[]; specimens: Specimen[] }
export interface Worklist { tasks: Task[]; nextCursor: string | null; serverTime: string }

export interface ApiProblem { status: number; code: string; message: string; details?: Record<string, unknown> }
