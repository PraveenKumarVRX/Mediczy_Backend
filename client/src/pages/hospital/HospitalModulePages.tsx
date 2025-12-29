import { useState } from "react";
import HospitalLayout from "@/components/hospital/HospitalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

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
          {actionLabel && (
            <Button variant="outline" size="sm" onClick={actionHandler || (() => alert(`${actionLabel} triggered`))}>{actionLabel}</Button>
          )}
        </CardHeader>
        <CardContent>
          <PlaceholderList items={items} />
        </CardContent>
      </Card>
    </div>
  </HospitalLayout>
);

export const HospitalAppointmentsPage = () =>
  buildSection(
    "Appointments",
    "Track all scheduled visits and on-call requests",
    [
      { title: "Today's Visits", value: "128", helper: "+12% vs yesterday" },
      { title: "Pending Approvals", value: "18" },
      { title: "Emergency Slots", value: "6" },
      { title: "Avg. Wait", value: "14 min" },
    ],
    [
      { label: "Cardiology camp", meta: "32 patients • OPD Block A", status: "Running" },
      { label: "ICU consultations", meta: "12 critical cases", status: "Priority" },
      { label: "Telehealth queue", meta: "45 online", status: "Live" },
    ],
    "Create schedule"
  );

export const HospitalBedsPage = () =>
  buildSection(
    "Bed Management",
    "Real-time capacity across wards and ICUs",
    [
      { title: "Total Beds", value: "980" },
      { title: "Occupied", value: "812" },
      { title: "ICU Available", value: "14" },
      { title: "Ventilators", value: "26" },
    ],
    [
      { label: "Surgical ward", meta: "96% occupancy", status: "Full" },
      { label: "ICU east wing", meta: "2 beds free", status: "Critical" },
      { label: "Maternity block", meta: "78% occupancy", status: "Stable" },
    ],
    "Allocate bed"
  );

export const HospitalPatientsPage = () =>
  buildSection(
    "Patients",
    "Central registry for OPD, IPD, and emergency",
    [
      { title: "Inpatients", value: "412" },
      { title: "Outpatients", value: "650" },
      { title: "Critical", value: "24" },
      { title: "Discharges", value: "58 today" },
    ],
    [
      { label: "High risk follow-up", meta: "18 patients", status: "Due" },
      { label: "Insurance verification", meta: "45 pending", status: "Review" },
      { label: "Remote monitoring", meta: "120 devices online", status: "Live" },
    ],
    "Add patient"
  );

export const HospitalDoctorsPage = () =>
  buildSection(
    "Doctors",
    "Availability, schedules, and credentialing",
    [
      { title: "Total Doctors", value: "220" },
      { title: "On Duty", value: "132" },
      { title: "On Call", value: "18" },
      { title: "Leave", value: "12" },
    ],
    [
      { label: "Cardiology roster", meta: "All shifts filled", status: "Ready" },
      { label: "Orthopedics", meta: "2 pending approvals", status: "Action" },
      { label: "Teleconsult pool", meta: "36 available", status: "Online" },
    ],
    "Invite doctor"
  );

export const HospitalOpdIpdPage = () =>
  buildSection(
    "OPD / IPD",
    "Combined flows for ambulatory and admitted care",
    [
      { title: "OPD Tokens", value: "340" },
      { title: "IPD Transfers", value: "14" },
      { title: "Day Care", value: "28" },
      { title: "Readmissions", value: "4" },
    ],
    [
      { label: "Surgery board", meta: "5 cases awaiting beds", status: "Pending" },
      { label: "IPD audits", meta: "12 charts open", status: "Review" },
      { label: "OPD pharmacy", meta: "Avg wait 6 min", status: "Optimized" },
    ],
    "Manage flow"
  );

export const HospitalPharmacyPage = () =>
  buildSection(
    "Pharmacy",
    "Connected formulary and ward dispensing",
    [
      { title: "Orders Today", value: "540" },
      { title: "Critical Stock", value: "8 alerts" },
      { title: "Avg. Fulfillment", value: "7 min" },
      { title: "Expiry Checks", value: "26 lots" },
    ],
    [
      { label: "OT schedule", meta: "Anesthesia kits restocked", status: "Done" },
      { label: "NICU inventory", meta: "Surfactant low", status: "Alert" },
      { label: "Retail counter", meta: "₹4.3L revenue today", status: "Healthy" },
    ],
    "Create PO"
  );

export const HospitalLabReportsPage = () =>
  (() => {
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
  })();

export const HospitalBillingPage = () =>
  buildSection(
    "Billing",
    "Consolidated billing and receivables",
    [
      { title: "Invoices Today", value: "214" },
      { title: "Pending", value: "36" },
      { title: "Average Claim", value: "₹18.4K" },
      { title: "Collections", value: "₹48L" },
    ],
    [
      { label: "Cashless claims", meta: "12 awaiting insurer", status: "Review" },
      { label: "Corporate tie-ups", meta: "₹12L billed", status: "Sent" },
      { label: "Outstanding", meta: "₹4.6L beyond 30d", status: "Alert" },
    ],
    "Create invoice"
  );

export const HospitalClaimsPage = () =>
  buildSection(
    "Claims",
    "Insurance and TPA workflows",
    [
      { title: "Claims Filed", value: "142" },
      { title: "Approved", value: "118" },
      { title: "Rejected", value: "6" },
      { title: "Avg. TAT", value: "3.6 days" },
    ],
    [
      { label: "TPA approvals", meta: "8 pending docs", status: "Pending" },
      { label: "Cashless preauth", meta: "18 live", status: "Processing" },
      { label: "Denials", meta: "₹2.1L at risk", status: "Action" },
    ],
    "Submit claim"
  );

export const HospitalStaffPage = () =>
  buildSection(
    "Staff Management",
    "HR, rostering, and compliance",
    [
      { title: "Active Staff", value: "1,240" },
      { title: "Pending Shifts", value: "38" },
      { title: "Compliance", value: "96%" },
      { title: "New Joinees", value: "12" },
    ],
    [
      { label: "Nursing roster", meta: "Weekend gaps", status: "Plan" },
      { label: "Annual trainings", meta: "84% complete", status: "Progress" },
      { label: "Credential renewals", meta: "6 expiring", status: "Reminder" },
    ],
    "Add staff"
  );

export const HospitalNotificationsPage = () =>
  buildSection(
    "Notifications",
    "Mission-critical alerts for all departments",
    [
      { title: "Unread", value: "42" },
      { title: "High Priority", value: "6" },
      { title: "System Alerts", value: "12" },
      { title: "Resolved", value: "138" },
    ],
    [
      { label: "Oxygen audit", meta: "Threshold reached", status: "Critical" },
      { label: "Fire drill", meta: "Tomorrow 11 AM", status: "Upcoming" },
      { label: "Code blue", meta: "Ward 5A", status: "Responded" },
    ],
    "Configure alerts"
  );

export const HospitalSettingsPage = () =>
  buildSection(
    "Settings",
    "Portal level preferences and automations",
    [
      { title: "Workflows", value: "12 active" },
      { title: "Integrations", value: "8 linked" },
      { title: "API Keys", value: "4" },
      { title: "Audit Logs", value: "24h clean" },
    ],
    [
      { label: "On-call policy", meta: "Last updated 2d ago", status: "Synced" },
      { label: "Billing templates", meta: "GST 18% default", status: "Active" },
      { label: "Security", meta: "2FA enforced", status: "Secured" },
    ],
    "Edit settings"
  );

export const HospitalSupportPage = () =>
  buildSection(
    "Help & Support",
    "Compliance desk and operational assistance",
    [
      { title: "Open Tickets", value: "14" },
      { title: "SLA", value: "92%" },
      { title: "Scheduled Audits", value: "4" },
      { title: "Incidents", value: "0" },
    ],
    [
      { label: "NABL renewal", meta: "Documents submitted", status: "Review" },
      { label: "Bio-med audit", meta: "Due next week", status: "Planned" },
      { label: "Vendor onboarding", meta: "Pharma supply", status: "In progress" },
    ],
    "Create ticket"
  );
