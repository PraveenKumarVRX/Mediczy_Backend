/** Shapes returned by /api/lab/collection (see docs/api/phlebotomy-collection.openapi.yaml). Server-owned: never edited in the client. */

export type CollectionMode = "home" | "ward";

export type TaskStatus =
  | "unassigned" | "assigned" | "accepted" | "en_route" | "arrived" | "at_bedside" | "verified" | "consented"
  | "collected" | "in_transit" | "handed_over" | "ward_handoff" | "lab_received" | "rejected_by_lab" | "refused" | "cancelled";

export type Priority = "routine" | "urgent" | "stat";

export interface CollectionTask {
  id: string;
  mode: CollectionMode;
  status: TaskStatus;
  priority: Priority;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  version: number;
  assignmentVersion: number;
  patient: { name: string | null; age: number | null; gender: string | null; uhid?: string | null; scheduleSlot?: string | null };
  collectedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  permittedCommands: string[];
  ownerUid: string;
  sourceKind: "manual" | "booking" | "admission";
  sourceRef: string | null;
  partnerUid: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  redrawOf: string | null;
  cancelReason: string | null;
  home?: { departedAt: string | null; arrivedAt: string | null; address?: Record<string, string | null>; contactPhone?: string | null };
  ward?: {
    facilityUid: string; wardName: string | null; bedLabel: string | null; roundLabel: string | null; isolationRequired: boolean;
    isolationAckAt: string | null; atBedsideAt: string | null; admissionRef?: string; orderVersion?: number;
  };
}

export interface TaskTest {
  id: string; code: string | null; name: string; containerType: string; requiredVolumeMl: number | null;
  handling: string | null; priority: Priority; status: "required" | "scanned" | "collected" | "received" | "rejected"; specimenId: string | null;
}

export interface Specimen {
  id: string; barcode: string; containerType: string; status: "scanned" | "collected" | "in_transit" | "handed_over" | "received" | "rejected";
  collectedAt: string | null; receivedAt: string | null; condition: string | null; rejectionReason: string | null;
}

export interface TaskDetail { task: CollectionTask; tests: TaskTest[]; specimens: Specimen[] }

export interface BoardSummary {
  byMode: Record<CollectionMode, Partial<Record<TaskStatus, number>>>;
  overdue: number;
  unassigned: number;
}

export interface BoardPage { tasks: CollectionTask[]; nextCursor: string | null; summary: BoardSummary }

export interface TimelineItem {
  at: string; kind: "task" | "custody" | "consent" | "verification"; type: string; from?: string | null; to?: string | null;
  version?: number; actor: string; barcode?: string; data?: Record<string, unknown>;
}

export interface CollectionException {
  id: string; taskId: string; specimenId: string | null; code: string; reason: string | null; status: "open" | "resolved";
  ownerRole: "dispatch" | "lab_receiver"; dueAt: string | null; overdue: boolean; nextAction: string | null; createdAt: string;
  resolvedAt: string | null; resolution: string | null; redrawTaskId: string | null; mode: CollectionMode;
}

export interface Kpis {
  windowDays: number; openBeforeCollection: number; overdue: number; inField: number; collected: number;
  handedOverPendingReceipt: number; labReceived: number; rejected: number; refused: number; redraws: number;
  medianCollectToHandoffSeconds: number | null;
}

export interface Collector {
  id: string; displayName: string; email: string; phone: string | null; status: "active" | "suspended" | "left";
  qualification: string | null; qualificationExpires: string | null; verifiedAt: string | null; mustChangePassword: boolean; lastLoginAt: string | null;
  membership: { status: "active" | "suspended" | "ended"; canHome: boolean; canWard: boolean; activeTo: string | null };
  workload: { openTasks: number; carryingSpecimens: number };
  eligible: boolean;
}

export interface Partners {
  partners: { uid: string; name: string | null; allowHome: boolean; allowWard: boolean }[];
  bridgeableBookings: { bookingId: string; partnerUid: string; patientName: string | null; collectionDate: string | null; slot: string | null; status: string }[];
  bridgeableAdmissions: { admissionRef: string; facilityUid: string; admissionNumber: string | null; uhid: string | null; status: string; wardName: string | null; bedLabel: string | null }[];
}

/** A failed API call, reduced to what the UI needs. */
export interface ApiProblem { status: number; code: string; message: string; details?: Record<string, unknown> }
