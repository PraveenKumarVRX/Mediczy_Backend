import ClinicLayout from "@/components/clinic/ClinicLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ticketService } from "@/services/ticketService";
import { useMemo, useState } from "react";

interface StatCardProps {
  title: string;
  value: string;
  helper?: string;
}

const StatGrid = ({ items }: { items: StatCardProps[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {items.map((item) => (
      <Card key={item.title} className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{item.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
          {item.helper && <p className="text-xs text-muted-foreground mt-1">{item.helper}</p>}
        </CardContent>
      </Card>
    ))}
  </div>
);

const PlaceholderList = ({
  items,
}: {
  items: { label: string; meta?: string; status?: string }[];
}) => (
  <div className="space-y-3">
    {items.map((item) => (
      <div key={item.label} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <div>
          <p className="font-medium text-sm text-slate-900 dark:text-white">{item.label}</p>
          {item.meta && <p className="text-xs text-muted-foreground">{item.meta}</p>}
        </div>
        {item.status && <Badge variant="outline">{item.status}</Badge>}
      </div>
    ))}
    {items.length === 0 && (
      <p className="text-sm text-muted-foreground">No activity recorded.</p>
    )}
  </div>
);

type ActionMode =
  | { kind: "dialog"; actionLabel: string; dialogTitle: string; dialogDescription: string; fields: Array<{ key: string; label: string; type: "text" | "number" | "date" | "textarea" }>; onSubmit: (values: Record<string, string>) => Promise<void> | void }
  | { kind: "export"; actionLabel: string; onExport: () => void };

const escapeCsvCell = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
  const csv = [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const ActionPage = ({
  title,
  subtitle,
  stats,
  initialItems,
  action,
}: {
  title: string;
  subtitle: string;
  stats: StatCardProps[];
  initialItems: { label: string; meta?: string; status?: string }[];
  action?: ActionMode;
}) => {
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const fields = useMemo(() => (action?.kind === "dialog" ? action.fields : []), [action]);

  const resetForm = () => {
    const next: Record<string, string> = {};
    for (const f of fields) next[f.key] = "";
    setValues(next);
  };

  const triggerAction = () => {
    if (!action) return;
    if (action.kind === "export") {
      action.onExport();
      return;
    }
    resetForm();
    setOpen(true);
  };

  const submit = async () => {
    if (!action || action.kind !== "dialog") return;
    setSubmitting(true);
    try {
      await action.onSubmit(values);
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || "Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClinicLayout title={title} subtitle={subtitle}>
      <div className="space-y-6">
        <StatGrid items={stats} />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg text-slate-900 dark:text-white">{title} Overview</CardTitle>
              <p className="text-sm text-muted-foreground">Latest pulse from this module</p>
            </div>
            {action && (
              <Button variant="outline" size="sm" onClick={triggerAction}>
                {action.actionLabel}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <PlaceholderList items={items} />
          </CardContent>
        </Card>

        {action?.kind === "dialog" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{action.dialogTitle}</DialogTitle>
                <DialogDescription>{action.dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {fields.map((f) => (
                  <div key={f.key} className="space-y-2">
                    <Label>{f.label}</Label>
                    {f.type === "textarea" ? (
                      <Textarea
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      />
                    ) : (
                      <Input
                        type={f.type}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </ClinicLayout>
  );
};

export const ClinicAppointmentsPage = () =>
  withSimpleItemAppend(
    {
      title: "Appointments",
      subtitle: "Manage consultations and queue slots",
      stats: [
        { title: "Scheduled Today", value: "86" },
        { title: "Check-ins", value: "64" },
        { title: "Telehealth", value: "12" },
        { title: "Average Wait", value: "9 min" },
      ],
      items: [
        { label: "Dermatology camp", meta: "18 slots filled", status: "Live" },
        { label: "Walk-in queue", meta: "24 patients", status: "Flow" },
        { label: "Video consult", meta: "Dr. Kaur from 4PM", status: "Upcoming" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Add slot",
        dialogTitle: "Add Slot",
        dialogDescription: "Create a new appointment slot.",
        fields: [
          { key: "date", label: "Date", type: "date" },
          { key: "time", label: "Time", type: "text" },
          { key: "doctor", label: "Doctor", type: "text" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({
      label: v.doctor?.trim() ? `Slot added: ${v.doctor.trim()}` : "Slot added",
      meta: [v.date, v.time].filter(Boolean).join(" • ") || undefined,
      status: "Created",
    })
  );

// Helper wrappers: keep per-page logic readable.
const withSimpleItemAppend = (
  page: { title: string; subtitle: string; stats: StatCardProps[]; items: { label: string; meta?: string; status?: string }[]; action: ActionMode },
  buildItem: (values: Record<string, string>) => { label: string; meta?: string; status?: string }
) => {
  const Component = () => {
    const { toast } = useToast();
    const [items, setItems] = useState(page.items);
    const action =
      page.action.kind === "dialog"
        ? {
            ...page.action,
            onSubmit: async (values: Record<string, string>) => {
              setItems((prev) => [buildItem(values), ...prev]);
              toast({ title: "Saved", description: `${page.action.actionLabel} completed.` });
            },
          }
        : page.action;
    return <ActionPage title={page.title} subtitle={page.subtitle} stats={page.stats} initialItems={items} action={action} />;
  };
  return <Component />;
};

export const ClinicPatientsPage = () =>
  withSimpleItemAppend(
    {
      title: "Patients",
      subtitle: "Unified patient roster",
      stats: [
        { title: "Total", value: "4,120" },
        { title: "New Today", value: "26" },
        { title: "Follow-ups", value: "74" },
        { title: "Pending Docs", value: "12" },
      ],
      items: [
        { label: "Insurance verification", meta: "8 waiting", status: "Action" },
        { label: "Chronic care", meta: "24 under plan", status: "Managed" },
        { label: "Pediatric review", meta: "12 due tomorrow", status: "Reminder" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Register patient",
        dialogTitle: "Register Patient",
        dialogDescription: "Add a patient to the clinic registry.",
        fields: [
          { key: "name", label: "Patient Name", type: "text" },
          { key: "phone", label: "Phone", type: "text" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.name?.trim() ? `Registered: ${v.name.trim()}` : "Registered patient", meta: v.phone || undefined, status: "Registered" })
  );

export const ClinicQueuePage = () =>
  withSimpleItemAppend(
    {
      title: "Queue Management",
      subtitle: "Token and triage flow",
      stats: [
        { title: "Tokens Issued", value: "210" },
        { title: "Avg. Wait", value: "11 min" },
        { title: "In Consultation", value: "18" },
        { title: "Missed", value: "5" },
      ],
      items: [
        { label: "General OPD", meta: "36 waiting", status: "Busy" },
        { label: "Diagnostics", meta: "12 waiting", status: "Steady" },
        { label: "Dental", meta: "5 waiting", status: "Smooth" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Manage tokens",
        dialogTitle: "Manage Tokens",
        dialogDescription: "Issue or update queue tokens.",
        fields: [
          { key: "queue", label: "Queue/Department", type: "text" },
          { key: "token", label: "Token Number", type: "text" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.token?.trim() ? `Token updated: ${v.token.trim()}` : "Token updated", meta: v.queue || undefined, status: "Updated" })
  );

export const ClinicDoctorsPage = () =>
  withSimpleItemAppend(
    {
      title: "Doctors",
      subtitle: "Daily rosters and availability",
      stats: [
        { title: "On Duty", value: "32" },
        { title: "On Call", value: "6" },
        { title: "Telehealth", value: "8" },
        { title: "Leave", value: "3" },
      ],
      items: [
        { label: "Cardiology", meta: "Slots filled", status: "Ready" },
        { label: "ENT", meta: "1 locum pending", status: "Action" },
        { label: "Physio", meta: "Remote sessions live", status: "Online" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Invite doctor",
        dialogTitle: "Invite Doctor",
        dialogDescription: "Send an invite to a doctor.",
        fields: [
          { key: "name", label: "Doctor Name", type: "text" },
          { key: "email", label: "Email", type: "text" },
          { key: "specialty", label: "Specialty", type: "text" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.name?.trim() ? `Invited: ${v.name.trim()}` : "Doctor invited", meta: v.specialty || v.email || undefined, status: "Invited" })
  );

export const ClinicConsultationsPage = () =>
  withSimpleItemAppend(
    {
      title: "Consultations",
      subtitle: "OPD, telemedicine, and specialty boards",
      stats: [
        { title: "Today", value: "124" },
        { title: "Avg. Duration", value: "18 min" },
        { title: "No-shows", value: "7" },
        { title: "Follow-ups", value: "46" },
      ],
      items: [
        { label: "ENT review", meta: "12 notes pending", status: "Action" },
        { label: "Mental wellness", meta: "8 tele sessions", status: "Live" },
        { label: "Post-op", meta: "26 reviews", status: "In progress" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Log consult",
        dialogTitle: "Log Consultation",
        dialogDescription: "Record a consultation log entry.",
        fields: [
          { key: "patient", label: "Patient Name", type: "text" },
          { key: "complaint", label: "Chief Complaint", type: "text" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.patient?.trim() ? `Consult logged: ${v.patient.trim()}` : "Consult logged", meta: v.complaint || undefined, status: "Logged" })
  );

export const ClinicPrescriptionsPage = () =>
  withSimpleItemAppend(
    {
      title: "Prescriptions",
      subtitle: "Digital Rx and pharmacy sync",
      stats: [
        { title: "Generated Today", value: "96" },
        { title: "eRx Shared", value: "88" },
        { title: "Pending Sign", value: "6" },
        { title: "Refills", value: "34" },
      ],
      items: [
        { label: "Antibiotic stewardship", meta: "Compliant", status: "Healthy" },
        { label: "Chronic meds", meta: "12 refills due", status: "Reminder" },
        { label: "Allergy alerts", meta: "No mismatches", status: "Safe" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "New prescription",
        dialogTitle: "New Prescription",
        dialogDescription: "Create a prescription record.",
        fields: [
          { key: "patient", label: "Patient Name", type: "text" },
          { key: "medication", label: "Medication", type: "text" },
          { key: "instructions", label: "Instructions", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.patient?.trim() ? `Rx created: ${v.patient.trim()}` : "Prescription created", meta: v.medication || undefined, status: "Created" })
  );

export const ClinicPharmacyPage = () =>
  withSimpleItemAppend(
    {
      title: "Clinic Pharmacy",
      subtitle: "Counter sales and stock in-sync",
      stats: [
        { title: "Bills Today", value: "182" },
        { title: "Revenue", value: "₹2.1L" },
        { title: "Low Stock", value: "4 alerts" },
        { title: "Pending Orders", value: "3" },
      ],
      items: [
        { label: "Cold storage", meta: "Temp maintained", status: "OK" },
        { label: "IV fluids", meta: "Reorder triggered", status: "Action" },
        { label: "OT meds", meta: "Synced with surgery", status: "Ready" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Raise PO",
        dialogTitle: "Raise Purchase Order",
        dialogDescription: "Create a purchase order request.",
        fields: [
          { key: "vendor", label: "Vendor", type: "text" },
          { key: "item", label: "Item", type: "text" },
          { key: "qty", label: "Quantity", type: "number" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.vendor?.trim() ? `PO raised: ${v.vendor.trim()}` : "PO raised", meta: v.item || undefined, status: "Requested" })
  );

export const ClinicLabTestsPage = () =>
  withSimpleItemAppend(
    {
      title: "Lab Tests",
      subtitle: "Sample collection and results",
      stats: [
        { title: "Booked", value: "64" },
        { title: "Collected", value: "42" },
        { title: "Processing", value: "18" },
        { title: "Delivered", value: "36" },
      ],
      items: [
        { label: "Blood profiles", meta: "12 fasted", status: "Queued" },
        { label: "Radiology", meta: "6 pending QA", status: "Review" },
        { label: "Home collection", meta: "8 routes live", status: "Dispatch" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Book slot",
        dialogTitle: "Book Lab Slot",
        dialogDescription: "Reserve a lab test slot.",
        fields: [
          { key: "patient", label: "Patient Name", type: "text" },
          { key: "test", label: "Test Name", type: "text" },
          { key: "date", label: "Date", type: "date" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.patient?.trim() ? `Slot booked: ${v.patient.trim()}` : "Slot booked", meta: v.test || v.date || undefined, status: "Booked" })
  );

export const ClinicBillingPage = () =>
  withSimpleItemAppend(
    {
      title: "Billing",
      subtitle: "Counters, pricing, and receivables",
      stats: [
        { title: "Invoices", value: "142" },
        { title: "Pending", value: "18" },
        { title: "Avg. Ticket", value: "₹1,540" },
        { title: "Discounts", value: "₹24K" },
      ],
      items: [
        { label: "TPA desk", meta: "6 approvals due", status: "Follow" },
        { label: "Corporate plans", meta: "₹4.2L billed", status: "Sent" },
        { label: "Cash counter", meta: "Balanced", status: "Closed" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Create invoice",
        dialogTitle: "Create Invoice",
        dialogDescription: "Create a billing invoice.",
        fields: [
          { key: "patient", label: "Patient Name", type: "text" },
          { key: "amount", label: "Amount (₹)", type: "number" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.patient?.trim() ? `Invoice created: ${v.patient.trim()}` : "Invoice created", meta: v.amount ? `₹${v.amount}` : undefined, status: "Created" })
  );

export const ClinicPaymentsPage = () =>
  withSimpleItemAppend(
    {
      title: "Payments",
      subtitle: "Collections across modes",
      stats: [
        { title: "Collected", value: "₹3.8L" },
        { title: "Digital", value: "₹2.1L" },
        { title: "Cash", value: "₹1.2L" },
        { title: "Pending", value: "₹0.5L" },
      ],
      items: [
        { label: "UPI settlements", meta: "Cleared", status: "Synced" },
        { label: "Card disputes", meta: "1 open", status: "Action" },
        { label: "Refund queue", meta: "2 cases", status: "Processing" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Reconcile",
        dialogTitle: "Reconcile Payments",
        dialogDescription: "Record a reconciliation run.",
        fields: [
          { key: "mode", label: "Mode (UPI/Card/Cash)", type: "text" },
          { key: "amount", label: "Amount (₹)", type: "number" },
          { key: "reference", label: "Reference", type: "text" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: "Reconciled", meta: [v.mode, v.reference].filter(Boolean).join(" • ") || undefined, status: v.amount ? `₹${v.amount}` : "Done" })
  );

export const ClinicReportsPage = () => {
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <ActionPage
      title="Reports"
      subtitle="Clinical and business insights"
      stats={[
        { title: "Dashboards", value: "6" },
        { title: "Exports", value: "12" },
        { title: "Alerts", value: "3" },
        { title: "Shared", value: "8" },
      ]}
      initialItems={[
        { label: "OPD growth", meta: "+18% MoM", status: "Positive" },
        { label: "Specialty mix", meta: "60% general", status: "Stable" },
        { label: "Revenue trend", meta: "₹1.1Cr QTD", status: "Tracking" },
      ]}
      action={{
        kind: "export",
        actionLabel: "Export data",
        onExport: () => {
          downloadCsv(
            `clinic-reports-export-${stamp}.csv`,
            ["Metric", "Value"],
            [
              ["OPD growth", "+18% MoM"],
              ["Specialty mix", "60% general"],
              ["Revenue trend", "₹1.1Cr QTD"],
            ]
          );
        },
      }}
    />
  );
};

export const ClinicStaffPage = () =>
  withSimpleItemAppend(
    {
      title: "Staff",
      subtitle: "Doctors, nurses, ops, and support",
      stats: [
        { title: "Active", value: "118" },
        { title: "On Duty", value: "62" },
        { title: "Shifts Pending", value: "9" },
        { title: "Training", value: "86%" },
      ],
      items: [
        { label: "Front desk", meta: "Full strength", status: "Ready" },
        { label: "Nursing", meta: "2 gaps weekend", status: "Plan" },
        { label: "Diagnostics", meta: "Audit scheduled", status: "Review" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Add staff",
        dialogTitle: "Add Staff",
        dialogDescription: "Add a staff member.",
        fields: [
          { key: "name", label: "Name", type: "text" },
          { key: "role", label: "Role", type: "text" },
          { key: "email", label: "Email", type: "text" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: v.name?.trim() ? `Added: ${v.name.trim()}` : "Added staff", meta: v.role || v.email || undefined, status: "Active" })
  );

export const ClinicNotificationsPage = () =>
  withSimpleItemAppend(
    {
      title: "Notifications",
      subtitle: "Operational alerts",
      stats: [
        { title: "Unread", value: "18" },
        { title: "High", value: "3" },
        { title: "Reminders", value: "12" },
        { title: "Escalated", value: "1" },
      ],
      items: [
        { label: "Inventory low", meta: "Vaccines", status: "Critical" },
        { label: "Maintenance", meta: "X-Ray calibration", status: "Upcoming" },
        { label: "Feedback", meta: "4.7 rating", status: "Great" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Configure",
        dialogTitle: "Configure Notifications",
        dialogDescription: "Update notification preferences.",
        fields: [
          { key: "quietHours", label: "Quiet hours (e.g. 22:00-07:00)", type: "text" },
          { key: "channels", label: "Channels (Email/SMS/WhatsApp)", type: "text" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    () => ({ label: "Notification settings updated", meta: "Saved", status: "Configured" })
  );

export const ClinicSettingsPage = () =>
  withSimpleItemAppend(
    {
      title: "Settings",
      subtitle: "Clinic preferences, workflows, and integrations",
      stats: [
        { title: "Automation", value: "9 flows" },
        { title: "Integrations", value: "5" },
        { title: "Templates", value: "24" },
        { title: "Audit Logs", value: "Clean" },
      ],
      items: [
        { label: "OPD timings", meta: "Synced", status: "Live" },
        { label: "Billing defaults", meta: "GST@18%", status: "Active" },
        { label: "Notifications", meta: "Quiet hours set", status: "Ready" },
      ],
      action: {
        kind: "dialog",
        actionLabel: "Edit",
        dialogTitle: "Edit Settings",
        dialogDescription: "Update clinic configuration.",
        fields: [
          { key: "clinicName", label: "Clinic Name", type: "text" },
          { key: "opdTimings", label: "OPD Timings", type: "text" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        onSubmit: () => {},
      },
    },
    (v) => ({ label: "Settings updated", meta: v.opdTimings || v.clinicName || undefined, status: "Saved" })
  );

export const ClinicSupportPage = () => {
  const { toast } = useToast();
  const [items, setItems] = useState([
    { label: "Bio-med visit", meta: "Scheduled Fri", status: "Upcoming" },
    { label: "IT helpdesk", meta: "VPN patch", status: "In progress" },
    { label: "Policy docs", meta: "Uploaded", status: "Done" },
  ]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", category: "other", description: "" });

  const submit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast({ title: "Missing details", description: "Title and description are required." });
      return;
    }

    const normalizeCategory = (raw: string) => {
      const v = raw.trim().toLowerCase();
      const allowed = new Set(["technical", "performance", "integration", "feature-request", "billing", "other"]);
      if (allowed.has(v)) return v as any;
      if (v.includes("bill")) return "billing" as any;
      if (v.includes("tech")) return "technical" as any;
      if (v.includes("integr")) return "integration" as any;
      if (v.includes("perf")) return "performance" as any;
      if (v.includes("feature")) return "feature-request" as any;
      return "other" as any;
    };

    setSubmitting(true);
    try {
      const clinicDataRaw = localStorage.getItem("clinicData");
      const clinicData = clinicDataRaw ? JSON.parse(clinicDataRaw) : null;
      const created = await ticketService.createTicket({
        title: form.title.trim(),
        description: form.description.trim(),
        priority: "medium",
        category: normalizeCategory(form.category),
        requester: {
          name: clinicData?.name || "Clinic",
          email: clinicData?.email || "clinic@mediczy.com",
          role: "clinic",
          userId: clinicData?.id,
        },
        source: "clinic",
      });
      setItems((prev) => [
        { label: `Ticket created: ${created.ticketId || created._id}`, meta: form.title.trim(), status: "Open" },
        ...prev,
      ]);
      setOpen(false);
      setForm({ title: "", category: "other", description: "" });
      toast({ title: "Ticket created", description: "Support ticket submitted." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClinicLayout title="Support" subtitle="Ticketing and compliance help">
      <div className="space-y-6">
        <StatGrid
          items={[
            { title: "Open", value: "6" },
            { title: "SLA", value: "95%" },
            { title: "Audits", value: "2" },
            { title: "Resolved", value: "18" },
          ]}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg text-slate-900">Support Overview</CardTitle>
              <p className="text-sm text-muted-foreground">Latest pulse from this module</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              New ticket
            </Button>
          </CardHeader>
          <CardContent>
            <PlaceholderList items={items} />
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Support Ticket</DialogTitle>
              <DialogDescription>Create a ticket for help and reporting.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Submitting..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClinicLayout>
  );
};

