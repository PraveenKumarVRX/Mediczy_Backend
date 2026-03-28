// v2 — password change form (settings page rebuild)
import { useState } from "react";
import HospitalLayout from "@/components/hospital/HospitalLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { loadHospitalStore, saveHospitalStore } from "@/utils/hospitalStorage";
import api from "@/utils/api";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  helper?: string;
}

const StatGrid = ({ items }: { items: StatCardProps[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {items.map((item) => (
      <Card key={item.title}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{item.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
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
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Recent Updates</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm text-slate-900">{item.label}</p>
            {item.meta && <p className="text-xs text-muted-foreground">{item.meta}</p>}
          </div>
          {item.status && <Badge variant="outline">{item.status}</Badge>}
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No records yet.</p>
      )}
    </CardContent>
  </Card>
);

const buildSection = (
  title: string,
  subtitle: string,
  stats: StatCardProps[],
  items: { label: string; meta?: string; status?: string }[],
  actionLabel?: string,
  actionHandler?: () => void
) => (
  <HospitalLayout title={title} subtitle={subtitle}>
    <div className="space-y-6">
      <StatGrid items={stats} />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg text-slate-900">{title} Activity</CardTitle>
            <p className="text-sm text-muted-foreground">Latest updates across the module</p>
          </div>
          {actionLabel && actionHandler && (
            <Button variant="outline" size="sm" onClick={actionHandler}>{actionLabel}</Button>
          )}
        </CardHeader>
        <CardContent>
          <PlaceholderList items={items} />
        </CardContent>
      </Card>
    </div>
  </HospitalLayout>
);

const ManagedSection = ({
  storageKey,
  title,
  subtitle,
  stats,
  initialItems,
  actionLabel,
}: {
  storageKey: string;
  title: string;
  subtitle: string;
  stats: StatCardProps[];
  initialItems: { label: string; meta?: string; status?: string }[];
  actionLabel: string;
}) => {
  const { toast } = useToast();
  const [items, setItems] = useState(() => loadHospitalStore(storageKey, initialItems));
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ label: "", meta: "", status: "" });

  const handleSave = () => {
    if (!form.label.trim()) {
      toast({ title: "Missing Details", description: "Please provide a title for this update.", variant: "destructive" });
      return;
    }
    const entry = {
      label: form.label.trim(),
      meta: form.meta.trim() || undefined,
      status: form.status.trim() || undefined,
    };
    setItems((prev) => {
      const next = [entry, ...prev];
      saveHospitalStore(storageKey, next);
      return next;
    });
    setForm({ label: "", meta: "", status: "" });
    setShowDialog(false);
    toast({ title: "Update Added", description: `${title} update saved.` });
  };

  return (
    <HospitalLayout title={title} subtitle={subtitle}>
      <div className="space-y-6">
        <StatGrid items={stats} />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg text-slate-900">{title} Activity</CardTitle>
              <p className="text-sm text-muted-foreground">Latest updates across the module</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
              {actionLabel}
            </Button>
          </CardHeader>
          <CardContent>
            <PlaceholderList items={items} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionLabel}</DialogTitle>
            <DialogDescription>Add a new update for {title.toLowerCase()}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Short summary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Details</label>
              <Input
                value={form.meta}
                onChange={(e) => setForm((prev) => ({ ...prev, meta: e.target.value }))}
                placeholder="Optional details"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Status</label>
              <Input
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                placeholder="Optional status"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HospitalLayout>
  );
};

export const HospitalAppointmentsPage = () => (
  <ManagedSection
    storageKey="hospital-appointments-updates"
    title="Appointments"
    subtitle="Track all scheduled visits and on-call requests"
    stats={[
      { title: "Today's Visits", value: "128", helper: "+12% vs yesterday" },
      { title: "Pending Approvals", value: "18" },
      { title: "Emergency Slots", value: "6" },
      { title: "Avg. Wait", value: "14 min" },
    ]}
    initialItems={[
      { label: "Cardiology camp", meta: "32 patients • OPD Block A", status: "Running" },
      { label: "ICU consultations", meta: "12 critical cases", status: "Priority" },
      { label: "Telehealth queue", meta: "45 online", status: "Live" },
    ]}
    actionLabel="Create schedule"
  />
);

export const HospitalBedsPage = () => (
  <ManagedSection
    storageKey="hospital-beds-updates"
    title="Bed Management"
    subtitle="Real-time capacity across wards and ICUs"
    stats={[
      { title: "Total Beds", value: "980" },
      { title: "Occupied", value: "812" },
      { title: "ICU Available", value: "14" },
      { title: "Ventilators", value: "26" },
    ]}
    initialItems={[
      { label: "Surgical ward", meta: "96% occupancy", status: "Full" },
      { label: "ICU east wing", meta: "2 beds free", status: "Critical" },
      { label: "Maternity block", meta: "78% occupancy", status: "Stable" },
    ]}
    actionLabel="Allocate bed"
  />
);

export const HospitalPatientsPage = () => (
  <ManagedSection
    storageKey="hospital-patients-updates"
    title="Patients"
    subtitle="Central registry for OPD, IPD, and emergency"
    stats={[
      { title: "Inpatients", value: "412" },
      { title: "Outpatients", value: "650" },
      { title: "Critical", value: "24" },
      { title: "Discharges", value: "58 today" },
    ]}
    initialItems={[
      { label: "High risk follow-up", meta: "18 patients", status: "Due" },
      { label: "Insurance verification", meta: "45 pending", status: "Review" },
      { label: "Remote monitoring", meta: "120 devices online", status: "Live" },
    ]}
    actionLabel="Add patient"
  />
);

export const HospitalDoctorsPage = () => (
  <ManagedSection
    storageKey="hospital-doctors-updates"
    title="Doctors"
    subtitle="Availability, schedules, and credentialing"
    stats={[
      { title: "Total Doctors", value: "220" },
      { title: "On Duty", value: "132" },
      { title: "On Call", value: "18" },
      { title: "Leave", value: "12" },
    ]}
    initialItems={[
      { label: "Cardiology roster", meta: "All shifts filled", status: "Ready" },
      { label: "Orthopedics", meta: "2 pending approvals", status: "Action" },
      { label: "Teleconsult pool", meta: "36 available", status: "Online" },
    ]}
    actionLabel="Invite doctor"
  />
);

export const HospitalOpdIpdPage = () => (
  <ManagedSection
    storageKey="hospital-opd-ipd-updates"
    title="OPD / IPD"
    subtitle="Combined flows for ambulatory and admitted care"
    stats={[
      { title: "OPD Tokens", value: "340" },
      { title: "IPD Transfers", value: "14" },
      { title: "Day Care", value: "28" },
      { title: "Readmissions", value: "4" },
    ]}
    initialItems={[
      { label: "Surgery board", meta: "5 cases awaiting beds", status: "Pending" },
      { label: "IPD audits", meta: "12 charts open", status: "Review" },
      { label: "OPD pharmacy", meta: "Avg wait 6 min", status: "Optimized" },
    ]}
    actionLabel="Manage flow"
  />
);

export const HospitalPharmacyPage = () => (
  <ManagedSection
    storageKey="hospital-pharmacy-updates"
    title="Pharmacy"
    subtitle="Connected formulary and ward dispensing"
    stats={[
      { title: "Orders Today", value: "540" },
      { title: "Critical Stock", value: "8 alerts" },
      { title: "Avg. Fulfillment", value: "7 min" },
      { title: "Expiry Checks", value: "26 lots" },
    ]}
    initialItems={[
      { label: "OT schedule", meta: "Anesthesia kits restocked", status: "Done" },
      { label: "NICU inventory", meta: "Surfactant low", status: "Alert" },
      { label: "Retail counter", meta: "₹4.3L revenue today", status: "Healthy" },
    ]}
    actionLabel="Create PO"
  />
);

export const HospitalLabReportsPage = () => {
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const handleUpload = () => {
    const count = files?.length || 0;
    toast({
      title: 'Batch upload queued',
      description: `${batchName || 'Lab batch'} • ${count} file${count === 1 ? '' : 's'}`,
    });
    setShowUpload(false);
    setBatchName('');
    setFiles(null);
  };

  return (
    <>
      {buildSection(
        "Lab Reports",
        "Samples, diagnostics, and publishing pipeline",
        [
          { title: "Samples In Queue", value: "312" },
          { title: "Processing", value: "142" },
          { title: "Published", value: "218" },
          { title: "QC Flags", value: "3" },
        ],
        [
          { label: "Radiology sync", meta: "PACS uptime 99.8%", status: "Healthy" },
          { label: "COVID PCR", meta: "24 hr TAT achieved", status: "On time" },
          { label: "Blood bank", meta: "O- short by 6 units", status: "Critical" },
        ],
        "Upload batch",
        () => setShowUpload(true)
      )}

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Lab Report Batch</DialogTitle>
            <DialogDescription>Attach a ZIP or multiple PDFs to ingest and publish.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Batch Name</label>
              <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g., 2025-12-OPD-BlockA" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Select Files</label>
              <Input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
              <p className="text-xs text-muted-foreground">{files?.length || 0} file(s) selected</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!batchName && !files?.length}>Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const HospitalBillingPage = () => (
  <ManagedSection
    storageKey="hospital-billing-updates"
    title="Billing"
    subtitle="Consolidated billing and receivables"
    stats={[
      { title: "Invoices Today", value: "214" },
      { title: "Pending", value: "36" },
      { title: "Average Claim", value: "₹18.4K" },
      { title: "Collections", value: "₹48L" },
    ]}
    initialItems={[
      { label: "Cashless claims", meta: "12 awaiting insurer", status: "Review" },
      { label: "Corporate tie-ups", meta: "₹12L billed", status: "Sent" },
      { label: "Outstanding", meta: "₹4.6L beyond 30d", status: "Alert" },
    ]}
    actionLabel="Create invoice"
  />
);

export const HospitalClaimsPage = () => (
  <ManagedSection
    storageKey="hospital-claims-updates"
    title="Claims"
    subtitle="Insurance and TPA workflows"
    stats={[
      { title: "Claims Filed", value: "142" },
      { title: "Approved", value: "118" },
      { title: "Rejected", value: "6" },
      { title: "Avg. TAT", value: "3.6 days" },
    ]}
    initialItems={[
      { label: "TPA approvals", meta: "8 pending docs", status: "Pending" },
      { label: "Cashless preauth", meta: "18 live", status: "Processing" },
      { label: "Denials", meta: "₹2.1L at risk", status: "Action" },
    ]}
    actionLabel="Submit claim"
  />
);

export const HospitalStaffPage = () => (
  <ManagedSection
    storageKey="hospital-staff-updates"
    title="Staff Management"
    subtitle="HR, rostering, and compliance"
    stats={[
      { title: "Active Staff", value: "1,240" },
      { title: "Pending Shifts", value: "38" },
      { title: "Compliance", value: "96%" },
      { title: "New Joinees", value: "12" },
    ]}
    initialItems={[
      { label: "Nursing roster", meta: "Weekend gaps", status: "Plan" },
      { label: "Annual trainings", meta: "84% complete", status: "Progress" },
      { label: "Credential renewals", meta: "6 expiring", status: "Reminder" },
    ]}
    actionLabel="Add staff"
  />
);

export const HospitalNotificationsPage = () => (
  <ManagedSection
    storageKey="hospital-notifications-updates"
    title="Notifications"
    subtitle="Mission-critical alerts for all departments"
    stats={[
      { title: "Unread", value: "42" },
      { title: "High Priority", value: "6" },
      { title: "System Alerts", value: "12" },
      { title: "Resolved", value: "138" },
    ]}
    initialItems={[
      { label: "Oxygen audit", meta: "Threshold reached", status: "Critical" },
      { label: "Fire drill", meta: "Tomorrow 11 AM", status: "Upcoming" },
      { label: "Code blue", meta: "Ward 5A", status: "Responded" },
    ]}
    actionLabel="Configure alerts"
  />
);

export const HospitalSettingsPage = () => {
  const { toast } = useToast();

  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await api.post("/hospital/auth/change-password", {
        currentPassword: current,
        newPassword: newPwd,
        confirmPassword: confirm,
      });
      toast({ title: "Password updated successfully" });
      setCurrent(""); setNewPwd(""); setConfirm("");
    } catch (err: any) {
      const msg =
        err?.response?.data?.errors?.[0]?.msg ||
        err?.response?.data?.message ||
        "Failed to change password";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <HospitalLayout>
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal preferences and security</p>
        </div>

        {/* Password Change Card */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Lock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription className="text-xs">Update your hospital portal login password</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {/* Current Password */}
              <div className="space-y-1">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrent ? "text" : "password"}
                    value={current}
                    onChange={e => setCurrent(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCurrent(v => !v)}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNew ? "text" : "password"}
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    placeholder="Min 8 chars, upper, lower, number, symbol"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNew(v => !v)}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Must contain uppercase, lowercase, number and special character (@$!%*?&)</p>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm(v => !v)}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirm && newPwd && confirm !== newPwd && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || !current || !newPwd || !confirm || newPwd !== confirm}
                className="w-full sm:w-auto"
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                {loading ? "Updating…" : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </HospitalLayout>
  );
};

export const HospitalSupportPage = () => (
  <ManagedSection
    storageKey="hospital-support-updates"
    title="Help & Support"
    subtitle="Compliance desk and operational assistance"
    stats={[
      { title: "Open Tickets", value: "14" },
      { title: "SLA", value: "92%" },
      { title: "Scheduled Audits", value: "4" },
      { title: "Incidents", value: "0" },
    ]}
    initialItems={[
      { label: "NABL renewal", meta: "Documents submitted", status: "Review" },
      { label: "Bio-med audit", meta: "Due next week", status: "Planned" },
      { label: "Vendor onboarding", meta: "Pharma supply", status: "In progress" },
    ]}
    actionLabel="Create ticket"
  />
);
