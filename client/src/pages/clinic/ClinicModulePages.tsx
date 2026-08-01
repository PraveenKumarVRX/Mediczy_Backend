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
import api from "@/utils/api";
import { Loader2 } from "lucide-react";
import { ReactNode, useMemo, useState, useEffect } from "react";

interface StatCardProps {
  title: string;
  value: string;
  helper?: string;
}

const toNumber = (value: string | number | undefined) => {
  if (typeof value === "number") return value;
  const numeric = value ? Number(String(value).replace(/[^0-9.-]/g, "")) : 0;
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatStatValue = (value: number | string) =>
  typeof value === "number" ? value.toLocaleString("en-IN") : value;

const setStatValueAt = (stats: StatCardProps[], index: number, value: number) =>
  stats.map((stat, i) => (i === index ? { ...stat, value: formatStatValue(value) } : stat));

const formatRelativeTime = (value?: string) => {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

const parseDateValue = (value?: string | number | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const isSameDay = (value: Date, compare: Date) =>
  value.getFullYear() === compare.getFullYear() &&
  value.getMonth() === compare.getMonth() &&
  value.getDate() === compare.getDate();

const isWithinDays = (value: Date, days: number, from: Date = new Date()) => {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return value >= start && value <= end;
};

const buildMeta = (parts: Array<string | undefined | null>) => {
  const meta = parts.filter(Boolean).join(" • ");
  return meta ? meta : undefined;
};

const StatGrid = ({
  items,
  onStatClick,
  activeIndex,
}: {
  items: StatCardProps[];
  onStatClick?: (item: StatCardProps, index: number) => void;
  activeIndex?: number;
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {items.map((item, index) => {
      const isActive = activeIndex === index;
      const clickable = Boolean(onStatClick);
      return (
        <Card
          key={item.title}
          className={`bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 transition-shadow ${
            clickable ? "cursor-pointer hover:shadow-md" : ""
          } ${isActive ? "ring-1 ring-teal-400" : ""}`}
          onClick={() => onStatClick?.(item, index)}
        >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{item.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
          {item.helper && <p className="text-xs text-muted-foreground mt-1">{item.helper}</p>}
        </CardContent>
      </Card>
      );
    })}
  </div>
);

const PlaceholderList = ({
  items,
  emptyMessage = "No activity recorded.",
}: {
  items: { label: string; meta?: string; status?: string }[];
  emptyMessage?: string;
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
      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
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
  onStatClick,
  activeStatIndex,
  filters,
  isLoading,
  errorMessage,
  emptyMessage,
  footer,
}: {
  title: string;
  subtitle: string;
  stats: StatCardProps[];
  initialItems: { label: string; meta?: string; status?: string }[];
  action?: ActionMode;
  onStatClick?: (item: StatCardProps, index: number) => void;
  activeStatIndex?: number;
  filters?: ReactNode;
  isLoading?: boolean;
  errorMessage?: string | null;
  emptyMessage?: string;
  footer?: ReactNode;
}) => {
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

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
        <StatGrid items={stats} onStatClick={onStatClick} activeIndex={activeStatIndex} />
        {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
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
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading {title.toLowerCase()}...
              </div>
            ) : errorMessage ? (
              <div className="py-6 text-sm text-red-500">{errorMessage}</div>
            ) : (
              <PlaceholderList items={items} emptyMessage={emptyMessage} />
            )}
          </CardContent>
          {footer && <div className="px-6 pb-6">{footer}</div>}
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

// Helper wrappers: keep per-page logic readable.
const withSimpleItemAppend = (
  page: {
    title: string;
    subtitle: string;
    stats: StatCardProps[];
    items: { label: string; meta?: string; status?: string }[];
    action: ActionMode;
    countStatIndex?: number;
    persistKey?: string;
  },
  buildItem: (values: Record<string, string>) => { label: string; meta?: string; status?: string }
) => {
  const Component = () => {
    const { toast } = useToast();
    const [items, setItems] = useState(page.items);
    const [stats, setStats] = useState(page.stats);
    const baseCount = page.countStatIndex !== undefined ? toNumber(page.stats[page.countStatIndex]?.value) : 0;
    const baseItems = page.items.length;

    useEffect(() => {
      if (!page.persistKey) return;
      try {
        const cached = localStorage.getItem(page.persistKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setItems(parsed);
          }
        }
      } catch (err) {
        console.warn("Unable to read cached items", err);
      }
    }, [page.persistKey]);

    useEffect(() => {
      if (page.persistKey) {
        try {
          localStorage.setItem(page.persistKey, JSON.stringify(items));
        } catch (err) {
          console.warn("Unable to persist items", err);
        }
      }

      if (page.countStatIndex !== undefined) {
        const nextValue = Math.max(0, baseCount + (items.length - baseItems));
        setStats((prev) => setStatValueAt(prev, page.countStatIndex!, nextValue));
      }
    }, [items, page.persistKey, page.countStatIndex, baseCount, baseItems]);

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
    return <ActionPage title={page.title} subtitle={page.subtitle} stats={stats} initialItems={items} action={action} />;
  };
  return <Component />;
};

export const ClinicAppointmentsPage = () => {
  const { toast } = useToast();
  const filterKeys = ["scheduled", "check-ins", "telehealth", "avg-wait"] as const;
  const [activeFilter, setActiveFilter] = useState(0);
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Scheduled Today", value: "0" },
    { title: "Check-ins", value: "0" },
    { title: "Telehealth", value: "0" },
    { title: "Average Wait", value: "—" },
  ]);
  const [itemsByFilter, setItemsByFilter] = useState<Record<string, { label: string; meta?: string; status?: string }[]>>({
    scheduled: [],
    "check-ins": [],
    telehealth: [],
    "avg-wait": [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeKey = filterKeys[activeFilter];

  const refreshAppointments = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get("/clinic/dashboard/appointments");
      const appointments = response.data?.data || [];

      const normalizeStatus = (value?: string) => (value || "").toLowerCase();
      const normalizeType = (value?: string) => (value || "").toLowerCase();

      const getStatus = (apt: any) => normalizeStatus(apt.status || apt.appointmentStatus || apt.state);
      const getType = (apt: any) => normalizeType(apt.type || apt.consultationType || apt.mode);
      const getLabel = (apt: any) =>
        apt.patient || apt.patientName || apt.name || apt.patient_name || (apt.id ? `Appointment #${apt.id}` : "Appointment");
      const getMeta = (apt: any) =>
        buildMeta([
          apt.time || apt.appointmentTime || apt.slotTime,
          apt.type || apt.consultationType,
          apt.phone || apt.patientPhone,
        ]);

      const toItem = (apt: any, metaOverride?: string) => ({
        label: getLabel(apt),
        meta: metaOverride ?? getMeta(apt),
        status: apt.status || apt.appointmentStatus || apt.state || undefined,
      });

      const scheduledAppointments = appointments.filter((apt: any) => {
        const status = getStatus(apt);
        return ["scheduled", "confirmed", "booked", "upcoming"].some((flag) => status.includes(flag));
      });

      const checkInAppointments = appointments.filter((apt: any) => {
        const status = getStatus(apt);
        return ["waiting", "check", "arrived", "in-progress"].some((flag) => status.includes(flag));
      });

      const telehealthAppointments = appointments.filter((apt: any) => {
        const type = getType(apt);
        return ["tele", "video", "online", "virtual"].some((flag) => type.includes(flag));
      });

      const waitValues = appointments
        .map((apt: any) => Number(apt.waitMinutes ?? apt.waitTime ?? apt.waitingMinutes))
        .filter((value: number) => Number.isFinite(value) && value >= 0);
      const averageWait = waitValues.length
        ? `${Math.round(waitValues.reduce((sum, value) => sum + value, 0) / waitValues.length)} min`
        : "—";

      const avgWaitItems = checkInAppointments.map((apt: any) => {
        const wait = Number(apt.waitMinutes ?? apt.waitTime ?? apt.waitingMinutes);
        const meta = buildMeta([
          apt.time || apt.appointmentTime || apt.slotTime,
          Number.isFinite(wait) ? `Wait ${Math.round(wait)} min` : null,
        ]);
        return toItem(apt, meta);
      });

      setStats([
        { title: "Scheduled Today", value: scheduledAppointments.length.toString() },
        { title: "Check-ins", value: checkInAppointments.length.toString() },
        { title: "Telehealth", value: telehealthAppointments.length.toString() },
        { title: "Average Wait", value: averageWait },
      ]);
      setItemsByFilter({
        scheduled: scheduledAppointments.map((apt: any) => toItem(apt)),
        "check-ins": checkInAppointments.map((apt: any) => toItem(apt)),
        telehealth: telehealthAppointments.map((apt: any) => toItem(apt)),
        "avg-wait": avgWaitItems,
      });
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "Unable to load appointments.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAppointments();
  }, []);

  const action: ActionMode = {
    kind: "dialog",
    actionLabel: "Add slot",
    dialogTitle: "Add Slot",
    dialogDescription: "Create a new appointment slot.",
    fields: [
      { key: "patient", label: "Patient Name", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "time", label: "Time", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    onSubmit: async (values) => {
      try {
        await api.post("/clinic/dashboard/appointments", {
          patientName: values.patient,
          date: values.date,
          time: values.time,
          type: values.type,
          phone: values.phone,
        });
        toast({ title: "Saved", description: "Appointment slot added." });
        await refreshAppointments();
      } catch (error: any) {
        toast({ title: "Save failed", description: error?.response?.data?.message || "Unable to add appointment." });
      }
    },
  };

  return (
    <ActionPage
      title="Appointments"
      subtitle="Manage consultations and queue slots"
      stats={stats}
      initialItems={itemsByFilter[activeKey] || []}
      action={action}
      onStatClick={(_, index) => setActiveFilter(index)}
      activeStatIndex={activeFilter}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={activeKey === "avg-wait" ? "No waiting appointments right now." : "No appointments found."}
    />
  );
};

export const ClinicPatientsPage = () => {
  const { toast } = useToast();
  const filterKeys = ["total", "new", "follow-ups", "pending-docs"] as const;
  const [activeFilter, setActiveFilter] = useState(0);
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Total", value: "0" },
    { title: "New Today", value: "0" },
    { title: "Follow-ups", value: "0" },
    { title: "Pending Docs", value: "0" },
  ]);
  const [itemsByFilter, setItemsByFilter] = useState<Record<string, { label: string; meta?: string; status?: string }[]>>({
    total: [],
    new: [],
    "follow-ups": [],
    "pending-docs": [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeKey = filterKeys[activeFilter];

  const refreshPatients = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get("/clinic/dashboard/patients");
      const patients = response.data?.data || [];
      const today = new Date();

      const getLabel = (patient: any) =>
        patient.name || patient.fullName || patient.patientName || patient.patient_name || (patient.id ? `Patient #${patient.id}` : "Patient");

      const getMeta = (patient: any) =>
        buildMeta([
          patient.lastVisit || patient.last_visit ? `Last visit ${patient.lastVisit || patient.last_visit}` : null,
          patient.nextVisit || patient.followUpDate ? `Next ${patient.nextVisit || patient.followUpDate}` : null,
          patient.phone || patient.patientPhone,
        ]);

      const getPendingDocsCount = (patient: any) => {
        if (Array.isArray(patient.pendingDocs)) return patient.pendingDocs.length;
        if (Array.isArray(patient.documentsPending)) return patient.documentsPending.length;
        const count = Number(patient.pendingDocsCount ?? patient.pendingDocuments ?? patient.pendingDocs);
        return Number.isFinite(count) ? count : 0;
      };

      const isNewPatient = (patient: any) => {
        const created = parseDateValue(patient.createdAt || patient.registeredAt || patient.created_at);
        return created ? isSameDay(created, today) : false;
      };

      const isFollowUp = (patient: any) => {
        const diagnosis = String(patient.diagnosis || "").toLowerCase();
        if (diagnosis.includes("follow")) return true;
        const nextVisit = parseDateValue(patient.nextVisit || patient.followUpDate);
        return nextVisit ? isWithinDays(nextVisit, 7, today) : false;
      };

      const totalItems = patients.map((patient: any) => ({
        label: getLabel(patient),
        meta: getMeta(patient),
        status: patient.status || (isFollowUp(patient) ? "Follow-up" : "Active"),
      }));

      const newItems = patients.filter(isNewPatient).map((patient: any) => ({
        label: getLabel(patient),
        meta: buildMeta([getMeta(patient), "Registered today"]),
        status: "New",
      }));

      const followUpItems = patients.filter(isFollowUp).map((patient: any) => ({
        label: getLabel(patient),
        meta: buildMeta([patient.diagnosis, patient.nextVisit || patient.followUpDate]),
        status: "Follow-up",
      }));

      const pendingDocItems = patients
        .filter((patient: any) => getPendingDocsCount(patient) > 0)
        .map((patient: any) => ({
          label: getLabel(patient),
          meta: `Pending docs: ${getPendingDocsCount(patient)}`,
          status: "Pending",
        }));

      setStats([
        { title: "Total", value: totalItems.length.toString() },
        { title: "New Today", value: newItems.length.toString() },
        { title: "Follow-ups", value: followUpItems.length.toString() },
        { title: "Pending Docs", value: pendingDocItems.length.toString() },
      ]);
      setItemsByFilter({
        total: totalItems,
        new: newItems,
        "follow-ups": followUpItems,
        "pending-docs": pendingDocItems,
      });
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "Unable to load patients.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshPatients();
  }, []);

  const action: ActionMode = {
    kind: "dialog",
    actionLabel: "Register patient",
    dialogTitle: "Register Patient",
    dialogDescription: "Add a patient to the clinic registry.",
    fields: [
      { key: "name", label: "Patient Name", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    onSubmit: async (values) => {
      try {
        await api.post("/clinic/dashboard/patients", {
          name: values.name,
          phone: values.phone,
          address: values.notes,
        });
        toast({ title: "Saved", description: "Patient registered." });
        await refreshPatients();
      } catch (error: any) {
        toast({ title: "Save failed", description: error?.response?.data?.message || "Unable to register patient." });
      }
    },
  };

  return (
    <ActionPage
      title="Patients"
      subtitle="Unified patient roster"
      stats={stats}
      initialItems={itemsByFilter[activeKey] || []}
      action={action}
      onStatClick={(_, index) => setActiveFilter(index)}
      activeStatIndex={activeFilter}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={activeKey === "pending-docs" ? "No pending documents." : "No patients found."}
    />
  );
};

/** Real QMS — tokens + Aadhaar QR via shared /api/qms engine. */
export { default as ClinicQueuePage } from "@/pages/clinic/ClinicQmsPage";

export const ClinicDoctorsPage = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Doctors", value: "0" },
    { title: "Nurses", value: "0" },
    { title: "Assistants", value: "0" },
    { title: "Active", value: "0" },
  ]);
  const [items, setItems] = useState<{ label: string; meta?: string; status?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get("/clinic/dashboard/staff");
      const staff = response.data?.data || [];
      const doctors = staff.filter((s: any) => s.role === "doctor");
      const nurses = staff.filter((s: any) => s.role === "nurse");
      const assistants = staff.filter((s: any) => s.role === "doctor_assistant");
      const active = staff.filter((s: any) => s.status === "active");
      setStats([
        { title: "Doctors", value: String(doctors.length) },
        { title: "Nurses", value: String(nurses.length) },
        { title: "Assistants", value: String(assistants.length) },
        { title: "Active", value: String(active.length) },
      ]);
      setItems(
        doctors.map((d: any) => ({
          label: d.name,
          meta: buildMeta([d.specialization, d.email, d.phone]),
          status: d.status || "active",
        })),
      );
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "Unable to load doctors.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const action: ActionMode = {
    kind: "dialog",
    actionLabel: "Add doctor",
    dialogTitle: "Add Doctor",
    dialogDescription: "Create a doctor login for this clinic.",
    fields: [
      { key: "first_name", label: "First Name", type: "text" },
      { key: "last_name", label: "Last Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "specialization", label: "Specialty", type: "text" },
      { key: "password", label: "Temp Password", type: "text" },
    ],
    onSubmit: async (values) => {
      await api.post("/clinic/dashboard/staff", {
        role: "doctor",
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        phone: values.phone,
        specialization: values.specialization,
        password: values.password || undefined,
      });
      toast({ title: "Saved", description: "Doctor added." });
      await refresh();
    },
  };

  return (
    <ActionPage
      title="Doctors"
      subtitle="Clinic doctors and availability"
      stats={stats}
      initialItems={items}
      action={action}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No doctors yet. Add the first doctor for AJ Dental."
    />
  );
};

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

export const ClinicPrescriptionsPage = () => {
  const { toast } = useToast();
  const filterKeys = ["generated", "shared", "pending-sign", "refills"] as const;
  const [activeFilter, setActiveFilter] = useState(0);
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Generated Today", value: "0" },
    { title: "eRx Shared", value: "0" },
    { title: "Pending Sign", value: "0" },
    { title: "Refills", value: "0" },
  ]);
  const [itemsByFilter, setItemsByFilter] = useState<Record<string, { label: string; meta?: string; status?: string }[]>>({
    generated: [],
    shared: [],
    "pending-sign": [],
    refills: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeKey = filterKeys[activeFilter];

  const refreshPrescriptions = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get("/clinic/dashboard/prescriptions");
      const prescriptions = response.data?.data || [];
      const statsData = response.data?.stats || {};
      const today = new Date();

      const getLabel = (rx: any) =>
        rx.patientName || rx.patient_name || (rx.id ? `Prescription #${rx.id}` : "Prescription");
      const getMeta = (rx: any) =>
        buildMeta([
          rx.doctorName ? `Dr. ${rx.doctorName}` : null,
          rx.diagnosis,
          rx.createdAt ? formatRelativeTime(rx.createdAt) : null,
        ]);

      const isGeneratedToday = (rx: any) => {
        const createdAt = parseDateValue(rx.createdAt || rx.created_at);
        return createdAt ? isSameDay(createdAt, today) : false;
      };

      const isPendingSign = (rx: any) => String(rx.status || "").toLowerCase() === "draft";

      const isShared = (rx: any) => {
        const status = String(rx.status || "").toLowerCase();
        return ["issued", "dispensed"].includes(status);
      };

      const isRefillDue = (rx: any) => {
        const validUntil = parseDateValue(rx.validUntil || rx.valid_until || rx.followUpDate);
        return validUntil ? isWithinDays(validUntil, 7, today) : false;
      };

      const generatedItems = prescriptions.filter(isGeneratedToday).map((rx: any) => ({
        label: getLabel(rx),
        meta: getMeta(rx),
        status: rx.status || "Generated",
      }));

      const sharedItems = prescriptions.filter(isShared).map((rx: any) => ({
        label: getLabel(rx),
        meta: getMeta(rx),
        status: "Shared",
      }));

      const pendingItems = prescriptions.filter(isPendingSign).map((rx: any) => ({
        label: getLabel(rx),
        meta: getMeta(rx),
        status: "Pending",
      }));

      const refillItems = prescriptions.filter(isRefillDue).map((rx: any) => ({
        label: getLabel(rx),
        meta: buildMeta([rx.validUntil ? `Valid until ${rx.validUntil}` : null, rx.diagnosis]),
        status: "Refill",
      }));

      setStats([
        { title: "Generated Today", value: String(statsData.generatedToday ?? generatedItems.length) },
        { title: "eRx Shared", value: String(statsData.shared ?? sharedItems.length) },
        { title: "Pending Sign", value: String(statsData.pendingSign ?? pendingItems.length) },
        { title: "Refills", value: String(statsData.refills ?? refillItems.length) },
      ]);
      setItemsByFilter({
        generated: generatedItems,
        shared: sharedItems,
        "pending-sign": pendingItems,
        refills: refillItems,
      });
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "Unable to load prescriptions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshPrescriptions();
  }, []);

  const action: ActionMode = {
    kind: "dialog",
    actionLabel: "New prescription",
    dialogTitle: "New Prescription",
    dialogDescription: "Create a prescription record.",
    fields: [
      { key: "patient", label: "Patient Name", type: "text" },
      { key: "medication", label: "Medication", type: "text" },
      { key: "instructions", label: "Instructions", type: "textarea" },
    ],
    onSubmit: async () => {
      toast({
        title: "Saved",
        description: "Prescription request captured. Sync with the clinical system to finalize.",
      });
    },
  };

  return (
    <ActionPage
      title="Prescriptions"
      subtitle="Digital Rx and pharmacy sync"
      stats={stats}
      initialItems={itemsByFilter[activeKey] || []}
      action={action}
      onStatClick={(_, index) => setActiveFilter(index)}
      activeStatIndex={activeFilter}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={activeKey === "pending-sign" ? "No pending prescriptions." : "No prescriptions found."}
    />
  );
};

export const ClinicPharmacyPage = () => {
  const { toast } = useToast();
  const filterKeys = ["bills", "revenue", "low-stock", "pending-orders"] as const;
  const [activeFilter, setActiveFilter] = useState(0);
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Bills Today", value: "0" },
    { title: "Revenue", value: "₹0" },
    { title: "Low Stock", value: "0" },
    { title: "Pending Orders", value: "0" },
  ]);
  const [itemsByFilter, setItemsByFilter] = useState<Record<string, { label: string; meta?: string; status?: string }[]>>({
    bills: [],
    revenue: [],
    "low-stock": [],
    "pending-orders": [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeKey = filterKeys[activeFilter];

  const refreshPharmacy = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [inventoryResponse, purchaseOrdersResponse] = await Promise.all([
        api.get("/clinic/dashboard/inventory"),
        api.get("/clinic/dashboard/purchase-orders"),
      ]);

      const inventory = inventoryResponse.data?.data || [];
      const inventorySummary = inventoryResponse.data?.summary || {};
      const purchaseOrders = purchaseOrdersResponse.data?.data || [];

      const lowStockItems = inventory.filter((item: any) => {
        const quantity = Number(item.quantity ?? item.stock);
        const minStock = Number(item.minStock ?? item.reorderLevel ?? item.min_stock);
        return Number.isFinite(quantity) && Number.isFinite(minStock) && quantity > 0 && quantity <= minStock;
      });

      const outOfStockItems = inventory.filter((item: any) => Number(item.quantity ?? item.stock) === 0);

      const pendingOrders = purchaseOrders.filter((order: any) => String(order.status || "").toLowerCase() === "pending");

      setStats([
        { title: "Bills Today", value: String(inventorySummary.billsToday ?? 0) },
        { title: "Revenue", value: inventorySummary.revenue ? `₹${inventorySummary.revenue}` : "₹0" },
        { title: "Low Stock", value: String(inventorySummary.lowStock ?? lowStockItems.length) },
        { title: "Pending Orders", value: String(pendingOrders.length) },
      ]);

      setItemsByFilter({
        bills: [],
        revenue: [],
        "low-stock": lowStockItems.map((item: any) => ({
          label: item.name || item.medicineName || `Item #${item.id}`,
          meta: buildMeta([
            item.quantity !== undefined ? `${item.quantity} left` : null,
            item.category,
          ]),
          status: "Low",
        })),
        "pending-orders": pendingOrders.map((order: any) => ({
          label: order.orderNumber || order.order_id || `Order #${order.id}`,
          meta: buildMeta([
            order.supplier,
            order.expected_delivery_date ? `ETA ${order.expected_delivery_date}` : null,
          ]),
          status: "Pending",
        })),
      });

      if (!pendingOrders.length && outOfStockItems.length) {
        setItemsByFilter((prev) => ({
          ...prev,
          "pending-orders": outOfStockItems.map((item: any) => ({
            label: item.name || item.medicineName || `Item #${item.id}`,
            meta: "Out of stock - reorder needed",
            status: "Action",
          })),
        }));
      }
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "Unable to load pharmacy data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshPharmacy();
  }, []);

  const action: ActionMode = {
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
    onSubmit: async () => {
      toast({
        title: "Saved",
        description: "Purchase order captured. Sync with inventory for processing.",
      });
    },
  };

  return (
    <ActionPage
      title="Clinic Pharmacy"
      subtitle="Counter sales and stock in-sync"
      stats={stats}
      initialItems={itemsByFilter[activeKey] || []}
      action={action}
      onStatClick={(_, index) => setActiveFilter(index)}
      activeStatIndex={activeFilter}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={activeKey === "pending-orders" ? "No pending orders yet." : "No pharmacy updates available."}
    />
  );
};

export const ClinicLabTestsPage = () => {
  const { toast } = useToast();
  const filterKeys = ["booked", "collected", "processing", "delivered"] as const;
  const [activeFilter, setActiveFilter] = useState(0);
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Booked", value: "64" },
    { title: "Collected", value: "42" },
    { title: "Processing", value: "18" },
    { title: "Delivered", value: "36" },
  ]);
  const [itemsByFilter, setItemsByFilter] = useState<Record<string, { label: string; meta?: string; status?: string }[]>>({
    booked: [
      { label: "Blood profiles", meta: "12 fasted", status: "Booked" },
      { label: "Radiology", meta: "6 pending QA", status: "Booked" },
    ],
    collected: [
      { label: "Home collection", meta: "8 routes live", status: "Collected" },
      { label: "CBC samples", meta: "5 completed", status: "Collected" },
    ],
    processing: [
      { label: "Thyroid panel", meta: "ETA 4 hrs", status: "Processing" },
      { label: "Liver panel", meta: "QA pending", status: "Processing" },
    ],
    delivered: [
      { label: "Lipid profile", meta: "Results sent", status: "Delivered" },
      { label: "ECG", meta: "Shared with doctor", status: "Delivered" },
    ],
  });

  const activeKey = filterKeys[activeFilter];
  const action: ActionMode = {
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
    onSubmit: async (values) => {
      const nextItem = {
        label: values.patient?.trim() ? `Slot booked: ${values.patient.trim()}` : "Slot booked",
        meta: values.test || values.date || undefined,
        status: "Booked",
      };
      setItemsByFilter((prev) => ({
        ...prev,
        booked: [nextItem, ...(prev.booked || [])],
      }));
      setStats((prev) => setStatValueAt(prev, 0, toNumber(prev[0]?.value) + 1));
      toast({ title: "Saved", description: "Lab slot booked." });
    },
  };

  return (
    <ActionPage
      title="Lab Tests"
      subtitle="Sample collection and results"
      stats={stats}
      initialItems={itemsByFilter[activeKey] || []}
      action={action}
      onStatClick={(_, index) => setActiveFilter(index)}
      activeStatIndex={activeFilter}
    />
  );
};

export const ClinicBillingPage = () => {
  const { toast } = useToast();
  const filterKeys = ["invoices", "pending", "avg-ticket", "discounts"] as const;
  const [activeFilter, setActiveFilter] = useState(0);
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Invoices", value: "142" },
    { title: "Pending", value: "18" },
    { title: "Avg. Ticket", value: "₹1,540" },
    { title: "Discounts", value: "₹24K" },
  ]);
  const [itemsByFilter, setItemsByFilter] = useState<Record<string, { label: string; meta?: string; status?: string }[]>>({
    invoices: [
      { label: "INV-0241 • A. Singh", meta: "₹2,400", status: "Paid" },
      { label: "INV-0242 • R. Patel", meta: "₹1,200", status: "Paid" },
    ],
    pending: [
      { label: "INV-0245 • S. Khan", meta: "₹3,100", status: "Pending" },
      { label: "INV-0246 • M. Das", meta: "₹980", status: "Pending" },
    ],
    "avg-ticket": [
      { label: "Average ticket", meta: "₹1,540 across 24 invoices", status: "Info" },
    ],
    discounts: [
      { label: "Discounted invoices", meta: "₹24K total waived", status: "Info" },
    ],
  });

  const activeKey = filterKeys[activeFilter];
  const action: ActionMode = {
    kind: "dialog",
    actionLabel: "Create invoice",
    dialogTitle: "Create Invoice",
    dialogDescription: "Create a billing invoice.",
    fields: [
      { key: "patient", label: "Patient Name", type: "text" },
      { key: "amount", label: "Amount (₹)", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    onSubmit: async (values) => {
      const nextItem = {
        label: values.patient?.trim() ? `Invoice created: ${values.patient.trim()}` : "Invoice created",
        meta: values.amount ? `₹${values.amount}` : undefined,
        status: "Created",
      };
      setItemsByFilter((prev) => ({
        ...prev,
        invoices: [nextItem, ...(prev.invoices || [])],
      }));
      setStats((prev) => setStatValueAt(prev, 0, toNumber(prev[0]?.value) + 1));
      toast({ title: "Saved", description: "Invoice created." });
    },
  };

  return (
    <ActionPage
      title="Billing"
      subtitle="Counters, pricing, and receivables"
      stats={stats}
      initialItems={itemsByFilter[activeKey] || []}
      action={action}
      onStatClick={(_, index) => setActiveFilter(index)}
      activeStatIndex={activeFilter}
    />
  );
};

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
  const filterKeys = ["dashboards", "exports", "alerts", "shared"] as const;
  const [activeFilter, setActiveFilter] = useState(0);
  const activeKey = filterKeys[activeFilter];
  const [items, setItems] = useState<{ label: string; meta?: string; status?: string }[]>([]);
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Dashboards", value: "0" },
    { title: "Exports", value: "0" },
    { title: "Alerts", value: "0" },
    { title: "Shared", value: "0" },
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadReports = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await api.get("/clinic/dashboard/reports", {
          params: { filter: activeKey },
        });
        if (!response.data?.success) {
          throw new Error(response.data?.message || "Reports fetch failed");
        }
        const payload = response.data?.data;
        if (!payload) {
          throw new Error("No reports data");
        }
        if (!active) return;
        const nextItems = (payload.items || []).map((item: any) => {
          const metaParts = [
            item.reportType ? String(item.reportType).replace(/_/g, " ") : undefined,
            item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString("en-IN") : undefined,
          ].filter(Boolean);
          return {
            label: item.label || item.fileName || item.title || "Report",
            meta: metaParts.join(" • ") || item.meta || undefined,
            status: item.status || item.analysisStatus || undefined,
          };
        });
        setItems(nextItems);
        const nextStats = payload.stats || {};
        setStats([
          { title: "Dashboards", value: String(nextStats.dashboards ?? 0) },
          { title: "Exports", value: String(nextStats.exports ?? 0) },
          { title: "Alerts", value: String(nextStats.alerts ?? 0) },
          { title: "Shared", value: String(nextStats.shared ?? 0) },
        ]);
      } catch (error: any) {
        if (!active) return;
        setErrorMessage("Failed to load reports.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadReports();
    return () => {
      active = false;
    };
  }, [activeKey]);

  return (
    <ActionPage
      key={activeKey}
      title="Reports"
      subtitle="Clinical and business insights"
      stats={stats}
      initialItems={items}
      action={{
        kind: "export",
        actionLabel: "Export data",
        onExport: () => {
          downloadCsv(
            `clinic-reports-export-${stamp}.csv`,
            ["Metric", "Value"],
            items.map((item) => [item.label, item.meta || item.status || ""])
          );
        },
      }}
      filters={filterKeys.map((key, index) => (
        <Button
          key={key}
          size="sm"
          variant={activeFilter === index ? "default" : "outline"}
          onClick={() => setActiveFilter(index)}
        >
          {key.charAt(0).toUpperCase() + key.slice(1)}
        </Button>
      ))}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No reports found for this view."
      onStatClick={(_, index) => setActiveFilter(index)}
      activeStatIndex={activeFilter}
    />
  );
};

export const ClinicStaffPage = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Active", value: "0" },
    { title: "Doctors", value: "0" },
    { title: "Nurses", value: "0" },
    { title: "Assistants", value: "0" },
  ]);
  const [items, setItems] = useState<{ label: string; meta?: string; status?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get("/clinic/dashboard/staff");
      const staff = response.data?.data || [];
      setStats([
        { title: "Active", value: String(staff.filter((s: any) => s.status === "active").length) },
        { title: "Doctors", value: String(staff.filter((s: any) => s.role === "doctor").length) },
        { title: "Nurses", value: String(staff.filter((s: any) => s.role === "nurse").length) },
        { title: "Assistants", value: String(staff.filter((s: any) => s.role === "doctor_assistant").length) },
      ]);
      setItems(
        staff.map((s: any) => ({
          label: s.name,
          meta: buildMeta([s.role, s.email, s.specialization]),
          status: s.status || "active",
        })),
      );
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "Unable to load staff.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const action: ActionMode = {
    kind: "dialog",
    actionLabel: "Add staff",
    dialogTitle: "Add Staff",
    dialogDescription: "Add a doctor, nurse, or assistant.",
    fields: [
      { key: "first_name", label: "First Name", type: "text" },
      { key: "last_name", label: "Last Name", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "role", label: "Role (doctor/nurse/doctor_assistant)", type: "text" },
      { key: "password", label: "Temp Password", type: "text" },
    ],
    onSubmit: async (values) => {
      await api.post("/clinic/dashboard/staff", {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        phone: values.phone,
        role: values.role || "nurse",
        password: values.password || undefined,
      });
      toast({ title: "Saved", description: "Staff member added." });
      await refresh();
    },
  };

  return (
    <ActionPage
      title="Staff"
      subtitle="Doctors, nurses, and assistants"
      stats={stats}
      initialItems={items}
      action={action}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No staff yet. Add clinic team members to get started."
    />
  );
};

export const ClinicNotificationsPage = () => {
  const filterKeys = ["unread", "high", "reminders", "escalated"] as const;
  const [activeFilter, setActiveFilter] = useState(0);
  const activeKey = filterKeys[activeFilter];
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Unread", value: "0" },
    { title: "High", value: "0" },
    { title: "Reminders", value: "0" },
    { title: "Escalated", value: "0" },
  ]);
  const [items, setItems] = useState<{ label: string; meta?: string; status?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadNotifications = async () => {
      setIsLoading(true);
      setPage(1);
      setErrorMessage(null);
      try {
        const response = await api.get("/clinic/dashboard/notifications", {
          params: { filter: activeKey, page: 1, limit: 10 },
        });
        if (!response.data?.success) {
          throw new Error(response.data?.message || "Notifications fetch failed");
        }
        const payload = response.data?.data;
        if (!payload) {
          throw new Error("No notifications data");
        }
        if (!active) return;
        const nextItems = (payload.items || []).map((item: any) => ({
          label: item.title || item.label || "Notification",
          meta: [item.message, formatRelativeTime(item.createdAt)].filter(Boolean).join(" • ") || undefined,
          status: item.status || (item.read ? "Read" : "Unread"),
        }));
        setItems(nextItems);
        setHasMore(Boolean(payload.pagination?.hasMore));
        const nextStats = payload.stats || {};
        setStats([
          { title: "Unread", value: String(nextStats.unread ?? 0) },
          { title: "High", value: String(nextStats.high ?? 0) },
          { title: "Reminders", value: String(nextStats.reminders ?? 0) },
          { title: "Escalated", value: String(nextStats.escalated ?? 0) },
        ]);
      } catch (error: any) {
        if (!active) return;
        setErrorMessage("Failed to load notifications.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadNotifications();
    return () => {
      active = false;
    };
  }, [activeKey]);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    const nextPage = page + 1;
    setIsLoadingMore(true);
    try {
      const response = await api.get("/clinic/dashboard/notifications", {
        params: { filter: activeKey, page: nextPage, limit: 10 },
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || "Notifications fetch failed");
      }
      const payload = response.data?.data;
      if (!payload) {
        throw new Error("No notifications data");
      }
      const nextItems = (payload.items || []).map((item: any) => ({
        label: item.title || item.label || "Notification",
        meta: [item.message, formatRelativeTime(item.createdAt)].filter(Boolean).join(" • ") || undefined,
        status: item.status || (item.read ? "Read" : "Unread"),
      }));
      setItems((prev) => [...prev, ...nextItems]);
      setHasMore(Boolean(payload.pagination?.hasMore));
      setPage(nextPage);
    } catch (error) {
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  };
  const action: ActionMode = {
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
  };

  return (
    <ActionPage
      key={activeKey}
      title="Notifications"
      subtitle="Operational alerts"
      stats={stats}
      initialItems={items}
      action={action}
      filters={filterKeys.map((key, index) => (
        <Button
          key={key}
          size="sm"
          variant={activeFilter === index ? "default" : "outline"}
          onClick={() => setActiveFilter(index)}
        >
          {key.charAt(0).toUpperCase() + key.slice(1)}
        </Button>
      ))}
      footer={
        hasMore ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null
      }
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No notifications found for this view."
  onStatClick={(_, index) => setActiveFilter(index)}
  activeStatIndex={activeFilter}
    />
  );
};

export const ClinicSettingsPage = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<StatCardProps[]>([
    { title: "Clinic", value: "—" },
    { title: "Subdomain", value: "—" },
    { title: "Status", value: "—" },
    { title: "Verified", value: "—" },
  ]);
  const [items, setItems] = useState<{ label: string; meta?: string; status?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get("/clinic/dashboard/profile");
      const profile = response.data?.data || {};
      setStats([
        { title: "Clinic", value: profile.name || "—" },
        { title: "Subdomain", value: profile.subdomain || "—" },
        { title: "Status", value: "Active" },
        { title: "Verified", value: profile.isVerified ? "Yes" : "No" },
      ]);
      setItems([
        { label: "Email", meta: profile.email, status: "Live" },
        { label: "Phone", meta: profile.phone, status: "Live" },
        { label: "City", meta: profile.city || profile.address?.city, status: "Live" },
        { label: "Portal URL", meta: profile.accessUrl, status: "Live" },
      ]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "Unable to load settings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const action: ActionMode = {
    kind: "dialog",
    actionLabel: "Edit",
    dialogTitle: "Edit Clinic Profile",
    dialogDescription: "Update clinic contact details.",
    fields: [
      { key: "name", label: "Clinic Name", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "address", label: "Address", type: "textarea" },
    ],
    onSubmit: async (values) => {
      await api.put("/clinic/dashboard/profile", values);
      toast({ title: "Saved", description: "Clinic profile updated." });
      await refresh();
    },
  };

  return (
    <ActionPage
      title="Settings"
      subtitle="Clinic profile and portal configuration"
      stats={stats}
      initialItems={items}
      action={action}
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No clinic profile loaded."
    />
  );
};

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
