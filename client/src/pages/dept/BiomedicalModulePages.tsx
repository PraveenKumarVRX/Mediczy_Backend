/**
 * BiomedicalModulePages — full-featured sub-pages for the Biomedical Engineering portal.
 * Equipment Inventory, Work Orders, Calibration Tracking, Reports — all world-class.
 */
import { useState, useEffect, useMemo } from "react";
import api from "@/utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import { biomedNav } from "./DepartmentDashboards";
import { BiomedicalAIAssistant } from "@/components/biomedical/BiomedicalAIAssistant";
import {
  Wrench, Stethoscope, AlertTriangle, CheckCircle2, Clock, Search,
  Plus, Download, X, Zap, BarChart3, TrendingUp, TrendingDown,
  Eye, Edit2, Trash2, ChevronRight, ListChecks, CalendarClock,
  ShieldCheck, Filter, FileText, Activity, Cpu, Monitor, Radio,
  Battery, Wifi, WifiOff, AlertCircle, RefreshCw, Layers, Hash,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── Shared layout wrapper ─────────────────────────────────────────────────────

const biomedLayout = (title: string, subtitle: string, children: React.ReactNode) => (
  <DeptStaffLayout
    deptKey="biomedical"
    deptName="Biomedical Engineering"
    badgeLabel="BIOMED"
    loginPath="/biomedical/login"
    DeptIcon={Wrench}
    navSections={biomedNav}
    title={title}
    subtitle={subtitle}
    copilotModule="biomedical"
  >
    {children}
  </DeptStaffLayout>
);

// ─── EQUIPMENT DATA ────────────────────────────────────────────────────────────

type DeviceStatus = "online" | "warning" | "offline" | "maintenance" | "cal-due" | "retired" | "untracked";

interface Device {
  id: string; assetId: string; name: string; type: string; manufacturer: string; model: string;
  department: string; location: string; status: DeviceStatus;
  lastService: string; nextCalibration: string; nextPPM: string;
  yearOfPurchase: number; warrantyExpiry: string; age: number;
  engineer: string; serialNo: string; notes: string;
}


// Maps a live hg_equipment_inventory row to the UI Device shape. Operational
// status and service/warranty dates have no recorded source yet, so they render
// as "untracked"/"—" instead of fabricated values (WP-0.3d).
const mapEquipmentRow = (r: any): Device => ({
  id: String(r.id),
  assetId: `#${r.id}`,
  name: r.device_name || "Unnamed device",
  type: r.equipment_class || "—",
  manufacturer: r.manufacturer || "—",
  model: r.model || "—",
  department: r.department || r.owner_department || "—",
  location: r.location || "—",
  status: "untracked",
  lastService: "—",
  nextCalibration: "—",
  nextPPM: "—",
  yearOfPurchase: 0,
  warrantyExpiry: "—",
  age: 0,
  engineer: "—",
  serialNo: r.serial_number || "—",
  notes: r.notes || "",
});

const statusCfg: Record<DeviceStatus, { label: string; cls: string; dot: string }> = {
  online:      { label: "Online",      cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",   dot: "bg-green-500" },
  warning:     { label: "Warning",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",   dot: "bg-amber-500" },
  offline:     { label: "Offline",     cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",           dot: "bg-red-500" },
  maintenance: { label: "Maintenance", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",       dot: "bg-blue-500" },
  "cal-due":   { label: "Cal Due",     cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400", dot: "bg-purple-500" },
  untracked:   { label: "Not Tracked", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",   dot: "bg-slate-400" },
  retired:     { label: "Retired",     cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",   dot: "bg-slate-400" },
};

// ─── EQUIPMENT PAGE ────────────────────────────────────────────────────────────

const BiomedicalEquipmentContent = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<Device | null>(null);
  const [aiKey, setAiKey] = useState(0);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);

  useEffect(() => {
    api.get('/biomedical/equipment', {
      headers: { Authorization: `Bearer ${localStorage.getItem('biomedicalToken') || ''}` },
    })
      .then(({ data }) => {
        setDevices(((data.data || []) as any[]).map(mapEquipmentRow));
        setDevicesLoaded(true);
      })
      .catch((err) => {
        console.error('[Biomedical] failed to load equipment:', err?.message);
        setDevicesLoaded(true);
      });
  }, []);

  const types = ["all", ...Array.from(new Set(devices.map(d => d.type)))];

  const syncToHyperGrid = async (device: Device) => {
    setSyncingId(device.id);
    try {
      const token = localStorage.getItem('biomedicalToken');
      await api.post('/biomedical/equipment/sync-hypergrid', {
        deviceName: device.name,
        equipmentClass: device.type.toLowerCase().replace(/\s+/g, '-'),
        manufacturer: device.manufacturer,
        model: device.model,
        serialNumber: device.serialNo,
        department: device.department,
        location: device.location,
        ownerDepartment: 'Biomedical',
        notes: device.notes,
      }, { headers: { Authorization: `Bearer ${token}` } });
    } finally {
      setSyncingId(null);
    }
  };

  const filtered = useMemo(() => devices.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.assetId.toLowerCase().includes(search.toLowerCase()) ||
      d.department.toLowerCase().includes(search.toLowerCase()) ||
      d.manufacturer.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchType   = typeFilter   === "all" || d.type    === typeFilter;
    return matchSearch && matchStatus && matchType;
  }), [search, statusFilter, typeFilter, devices]);

  return (
    <>
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Equipment Inventory</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} of {devices.length} devices</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
            onClick={() => setAiKey(k => k + 1)}>
            <Zap className="h-4 w-4" /> AI Diagnostic
          </Button>
          <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-4 w-4" /> Add Device</Button>
          <Button size="sm" variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search device, ID, dept, manufacturer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all","untracked","online","warning","offline","maintenance","cal-due"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"}`}>
              {s === "all" ? "All" : statusCfg[s as DeviceStatus]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Object.entries(statusCfg).filter(([k]) => k !== "retired").map(([key, cfg]) => {
          const count = devices.filter(d => d.status === key).length;
          return (
            <Card key={key} className="py-3 px-4">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <p className="text-[10px] text-slate-500 font-medium">{cfg.label}</p>
              </div>
              <p className={`text-2xl font-bold ${count > 0 && key !== "online" ? "text-red-600" : "text-slate-800 dark:text-white"}`}>{count}</p>
            </Card>
          );
        })}
      </div>

      {/* Operational statuses populate once devices report via HyperGrid live sync — not connected yet (WP-0.3d) */}
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
        Devices are listed from the live equipment registry. Operational status (online / warning / offline) shows “Not Tracked” until live telemetry is connected.
      </p>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {["Asset ID / Device", "Type", "Department", "Manufacturer / Model", "Status", "Next Calibration", "Next PPM", "Actions"].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {!devicesLoaded && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">Loading equipment…</td></tr>
                )}
                {devicesLoaded && filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">No equipment registered yet.</td></tr>
                )}
                {filtered.map((d, i) => {
                  const cfg = statusCfg[d.status];
                  return (
                    <motion.tr key={d.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-white text-xs">{d.name}</p>
                        <p className="text-[10px] text-slate-400">{d.assetId}</p>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs text-slate-600 dark:text-slate-400">{d.type}</span></td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{d.department}</p>
                        <p className="text-[10px] text-slate-400">{d.location}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{d.manufacturer}</p>
                        <p className="text-[10px] text-slate-400">{d.model}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                          <Badge className={`text-[10px] border-0 font-medium ${cfg.cls}`}>{cfg.label}</Badge>
                        </div>
                        {d.notes && <p className="text-[9px] text-slate-400 mt-1 max-w-[120px] truncate">{d.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{d.nextCalibration}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{d.nextPPM}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelected(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"><Eye className="h-3.5 w-3.5" /></button>
                          <button className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => syncToHyperGrid(d)} disabled={syncingId === d.id} className="rounded-lg px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-50">{syncingId === d.id ? 'Syncing' : 'Sync HyperGrid'}</button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
              <Search className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No devices match your filters</p>
            </div>
          )}
        </div>
      </Card>

      {/* Device Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelected(null)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{selected.name}</h3>
                  <p className="text-xs text-slate-500">{selected.assetId} · {selected.manufacturer} {selected.model}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5 text-slate-500" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${statusCfg[selected.status].dot}`} />
                  <Badge className={`border-0 font-semibold ${statusCfg[selected.status].cls}`}>{statusCfg[selected.status].label}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Asset ID",           value: selected.assetId },
                    { label: "Serial No.",         value: selected.serialNo },
                    { label: "Department",         value: selected.department },
                    { label: "Location",           value: selected.location },
                    { label: "Manufacturer",       value: selected.manufacturer },
                    { label: "Model",              value: selected.model },
                    { label: "Year of Purchase",   value: selected.yearOfPurchase ? String(selected.yearOfPurchase) : "—" },
                    { label: "Warranty Expiry",    value: selected.warrantyExpiry },
                    { label: "Last Service",       value: selected.lastService },
                    { label: "Next Calibration",   value: selected.nextCalibration },
                    { label: "Next PPM",           value: selected.nextPPM },
                    { label: "Assigned Engineer",  value: selected.engineer },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                {selected.notes && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-800">
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{selected.notes}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm">Create Work Order</Button>
                  <Button variant="outline" className="flex-1 text-sm">Edit Device</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    <BiomedicalAIAssistant key={aiKey} defaultOpen={aiKey > 0} initialTool="diagnostic" />
    </>
  );
};

// ─── WORK ORDERS PAGE ──────────────────────────────────────────────────────────

interface WorkOrder {
  id: string; device: string; assetId: string; dept: string;
  type: "Breakdown" | "PPM" | "Calibration" | "Installation" | "Inspection" | "Issue";
  priority: "critical" | "high" | "normal"; status: "open" | "in-progress" | "completed" | "cancelled" | "overdue";
  engineer: string; raisedBy: string; raisedDate: string; dueDate: string;
  description: string; resolution: string;
}

// Work orders load from GET /biomedical/maintenance-tickets (WP-0.3d).

// Maps a live biomedical_maintenance_ticket row (+ its equipment) to the UI
// WorkOrder shape. Due dates are not tracked in the schema, so dueDate renders
// "—" and no overdue state is invented (WP-0.3d).
const mapTicketRow = (t: any, equipById: Map<string, any>): WorkOrder => ({
  id: `WO-${t.id}`,
  device: t.equipment_id
    ? (equipById.get(String(t.equipment_id))?.device_name || `Equipment #${t.equipment_id}`)
    : "Unlinked equipment",
  assetId: t.equipment_id ? `#${t.equipment_id}` : "—",
  dept: (t.equipment_id && equipById.get(String(t.equipment_id))?.department) || "—",
  type: "Issue",
  priority: t.priority === "critical" ? "critical" : t.priority === "urgent" ? "high" : "normal",
  status: t.status === "resolved" ? "completed"
    : (["open", "in-progress", "completed", "cancelled", "overdue"].includes(t.status) ? t.status : "open"),
  engineer: t.assigned_to || "—",
  raisedBy: t.reported_by || "—",
  raisedDate: String(t.opened_at || "").slice(0, 16),
  dueDate: "—",
  description: t.issue_description || "",
  resolution: t.resolution_notes || "",
});

const woCfg: Record<string, { label: string; cls: string }> = {
  open:        { label: "Open",        cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  "in-progress":{ label: "In Progress",cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  completed:   { label: "Completed",   cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  cancelled:   { label: "Cancelled",   cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  overdue:     { label: "Overdue",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
};
const priorCfg: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  high:     "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  normal:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const BiomedicalWorkOrdersContent = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [workOrdersLoaded, setWorkOrdersLoaded] = useState(false);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('biomedicalToken') || ''}` };
    Promise.all([
      api.get('/biomedical/equipment', { headers }),
      api.get('/biomedical/maintenance-tickets', { headers }),
    ])
      .then(([eqRes, tkRes]) => {
        const equipment = (eqRes.data?.data || []) as any[];
        const equipById = new Map(equipment.map((e: any) => [String(e.id), e]));
        setWorkOrders(((tkRes.data?.data || []) as any[]).map((t) => mapTicketRow(t, equipById)));
        setWorkOrdersLoaded(true);
      })
      .catch((err) => {
        console.error('[Biomedical] failed to load work orders:', err?.message);
        setWorkOrdersLoaded(true);
      });
  }, []);

  const filtered = useMemo(() => workOrders.filter(w => {
    const matchSearch = w.id.toLowerCase().includes(search.toLowerCase()) ||
      w.device.toLowerCase().includes(search.toLowerCase()) ||
      w.dept.toLowerCase().includes(search.toLowerCase()) ||
      w.engineer.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    return matchSearch && matchStatus;
  }), [search, statusFilter, workOrders]);

  return (
    <>
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Work Orders</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} orders shown · due dates aren’t tracked yet (WP-0.3d)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-4 w-4" /> New Work Order</Button>
          <Button size="sm" variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search WO #, device, engineer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <div className="flex gap-1.5">
          {(["all","open","in-progress","completed","overdue"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"}`}>
              {s === "all" ? "All" : woCfg[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Open",       value: workOrders.filter(w=>w.status==="open").length,       color: "text-red-600" },
          { label: "Completed",  value: workOrders.filter(w=>w.status==="completed").length,  color: "text-green-600" },
          { label: "Cancelled",  value: workOrders.filter(w=>w.status==="cancelled").length,  color: "text-slate-500" },
          { label: "Total",      value: workOrders.length,                                   color: "text-blue-600" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="py-3 px-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {["WO # / Type", "Device", "Department", "Priority", "Status", "Engineer", "Due Date", "Actions"].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {!workOrdersLoaded && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">Loading work orders…</td></tr>
                )}
                {workOrdersLoaded && filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">No maintenance tickets yet.</td></tr>
                )}
                {filtered.map((wo, i) => (
                  <motion.tr key={wo.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.02 }}
                    className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-xs text-slate-800 dark:text-white">{wo.id}</p>
                      <p className="text-[10px] text-slate-400">{wo.type}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700 dark:text-slate-300 max-w-[160px] truncate">{wo.device.split(" — ")[0]}</p>
                      <p className="text-[10px] text-slate-400">{wo.assetId}</p>
                    </td>
                    <td className="px-4 py-3"><span className="text-xs text-slate-600 dark:text-slate-400">{wo.dept}</span></td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] border-0 font-medium ${priorCfg[wo.priority]}`}>{wo.priority}</Badge></td>
                    <td className="px-4 py-3"><Badge className={`text-[10px] border-0 font-medium ${woCfg[wo.status].cls}`}>{woCfg[wo.status].label}</Badge></td>
                    <td className="px-4 py-3"><span className="text-xs text-slate-600 dark:text-slate-400">{wo.engineer}</span></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${wo.status === "overdue" ? "text-red-600" : "text-slate-600 dark:text-slate-400"}`}>{wo.dueDate}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSelected(wo)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"><Eye className="h-3.5 w-3.5" /></button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Card>

      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelected(null)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 z-50 shadow-2xl flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{selected.id}</h3>
                  <p className="text-xs text-slate-500">{selected.type} · {selected.dept}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5 text-slate-500" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex gap-2">
                  <Badge className={`border-0 font-semibold ${priorCfg[selected.priority]}`}>{selected.priority} priority</Badge>
                  <Badge className={`border-0 font-semibold ${woCfg[selected.status].cls}`}>{woCfg[selected.status].label}</Badge>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">Device</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{selected.device}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{selected.assetId}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Engineer",     value: selected.engineer },
                    { label: "Raised By",    value: selected.raisedBy },
                    { label: "Raised Date",  value: selected.raisedDate },
                    { label: "Due Date",     value: selected.dueDate },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                      <p className="text-xs font-semibold text-slate-800 dark:text-white mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Problem Description</p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{selected.description}</p>
                </div>
                {selected.resolution && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-100 dark:border-green-800">
                    <p className="text-[10px] font-bold text-green-700 dark:text-green-300 uppercase tracking-wide mb-1">Resolution</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{selected.resolution}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm">Update Status</Button>
                  <Button variant="outline" className="flex-1 text-sm">Print WO</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    <BiomedicalAIAssistant />
    </>
  );
};

// ─── CALIBRATION PAGE ──────────────────────────────────────────────────────────

// Calibration rows load from GET /biomedical/calibration-due (WP-0.3d).

// Maps a live biomedical_calibration_schedule row to the UI calibration shape.
// Status is derived from the real next_due_at date (no fabricated compliance) — WP-0.3d.
const mapCalibration = (c: any) => {
  const due = c.next_due_at ? new Date(c.next_due_at) : null;
  const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : 9999;
  const status = daysLeft < 0 ? "overdue" : daysLeft <= 14 ? "due-soon" : "scheduled";
  return {
    id: `CAL-${c.id}`,
    device: c.device_name || `Equipment #${c.equipment_id}`,
    assetId: c.equipment_id ? `#${c.equipment_id}` : "—",
    dept: c.department || "—",
    dueDate: due ? String(due.toISOString()).slice(0, 10) : "—",
    daysLeft,
    lastDone: c.last_calibrated_at ? String(c.last_calibrated_at).slice(0, 10) : "—",
    standard: c.calibration_type || "—",
    status,
    frequency: c.frequency_days ? `${c.frequency_days}-day` : "—",
  };
};

const calStatusCfg: Record<string, { label: string; cls: string }> = {
  overdue:   { label: "Overdue",   cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  "due-soon":{ label: "Due Soon",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  upcoming:  { label: "Upcoming",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  scheduled: { label: "Scheduled", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" },
  compliant: { label: "Compliant", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
};

// Historical compliance trend has no source — chart shows an unavailable state (WP-0.3d).

const BiomedicalCalibrationContent = () => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [calRows, setCalRows] = useState<any[]>([]);
  const [calLoaded, setCalLoaded] = useState(false);

  useEffect(() => {
    api.get('/biomedical/calibration-due?withinDays=3650', {
      headers: { Authorization: `Bearer ${localStorage.getItem('biomedicalToken') || ''}` },
    })
      .then(({ data }) => {
        setCalRows(((data.data || []) as any[]).map(mapCalibration));
        setCalLoaded(true);
      })
      .catch((err) => {
        console.error('[Biomedical] failed to load calibration schedule:', err?.message);
        setCalLoaded(true);
      });
  }, []);

  const filtered = useMemo(() => calRows.filter(c => {
    const matchSearch = c.device.toLowerCase().includes(search.toLowerCase()) || c.dept.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || c.status === filter;
    return matchSearch && matchFilter;
  }), [search, filter, calRows]);

  const compliancePct = calRows.length
    ? Math.round((calRows.filter(c => c.status !== "overdue").length / calRows.length) * 100)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Calibration Tracking</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">NABH / NABL / IEC compliance tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-4 w-4" /> Schedule Calibration</Button>
          <Button size="sm" variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="py-4 px-5 col-span-2 sm:col-span-1">
          <p className="text-xs text-slate-500">On-time Rate</p>
          <p className={`text-3xl font-bold mt-1 ${compliancePct === null ? "text-slate-400" : compliancePct >= 85 ? "text-green-600" : "text-red-600"}`}>{compliancePct !== null ? `${compliancePct}%` : "—"}</p>
          <p className="text-[10px] text-slate-400">Scheduled calibrations not overdue</p>
        </Card>
        {[
          { label: "Overdue",   value: calRows.filter(c=>c.status==="overdue").length,   color: "text-red-600" },
          { label: "Due Soon",  value: calRows.filter(c=>c.status==="due-soon").length,  color: "text-amber-600" },
          { label: "Scheduled", value: calRows.filter(c=>c.status==="scheduled").length, color: "text-green-600" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="py-4 px-5">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600" />Calibration Compliance Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Not available yet — calibration compliance isn’t recorded over time (dataAvailable: false).
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search device, department..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all","overdue","due-soon","scheduled"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"}`}>
              {s === "all" ? "All" : calStatusCfg[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {["Cal ID / Device", "Department", "Type", "Last Done", "Due Date", "Days Left", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!calLoaded && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">Loading calibration schedule…</td></tr>
              )}
              {calLoaded && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">No calibration schedules recorded yet.</td></tr>
              )}
              {filtered.map((c, i) => (
                <tr key={c.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-xs text-slate-800 dark:text-white">{c.device.split(" — ")[0]}</p>
                    <p className="text-[10px] text-slate-400">{c.id} · {c.assetId}</p>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs text-slate-600 dark:text-slate-400">{c.dept}</span></td>
                  <td className="px-4 py-3"><Badge className="text-[10px] border border-slate-200 bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-300">{c.standard}</Badge></td>
                  <td className="px-4 py-3"><span className="text-xs text-slate-600 dark:text-slate-400">{c.lastDone}</span></td>
                  <td className="px-4 py-3"><span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{c.dueDate}</span></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold ${c.daysLeft <= 5 ? "text-red-600" : c.daysLeft <= 15 ? "text-amber-600" : "text-green-600"}`}>
                      {c.daysLeft <= 0 ? "OVERDUE" : `${c.daysLeft}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] border-0 font-medium ${calStatusCfg[c.status].cls}`}>{calStatusCfg[c.status].label}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"><Eye className="h-3.5 w-3.5" /></button>
                      <button className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// ─── REPORTS PAGE ──────────────────────────────────────────────────────────────

// Uptime/MTTR trend has no source — reports show an unavailable state (WP-0.3d).

// WO-by-type monthly history has no source — reports show an unavailable state (WP-0.3d).

const BiomedicalReportsContent = () => {
  const [equipment, setEquipment] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [calDue, setCalDue] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('biomedicalToken') || ''}` };
    Promise.all([
      api.get('/biomedical/equipment', { headers }),
      api.get('/biomedical/maintenance-tickets', { headers }),
      api.get('/biomedical/calibration-due?withinDays=30', { headers }),
    ])
      .then(([eq, tk, cal]) => {
        setEquipment(eq.data?.data || []);
        setTickets(tk.data?.data || []);
        setCalDue(cal.data?.data || []);
        setLoaded(true);
      })
      .catch((err) => {
        console.error('[Biomedical] failed to load report stats:', err?.message);
        setLoaded(true);
      });
  }, []);

  const kpis = [
    { label: "Registered Devices",   value: loaded ? String(equipment.length) : "—", icon: Activity,      color: "text-green-600",  bg: "bg-green-100 dark:bg-green-950" },
    { label: "Open Work Orders",     value: loaded ? String(tickets.filter((t: any) => t.status === "open").length) : "—", icon: Clock, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950" },
    { label: "Resolved Work Orders", value: loaded ? String(tickets.filter((t: any) => t.status === "resolved").length) : "—", icon: ShieldCheck, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-950" },
    { label: "Calibration Due (30d)", value: loaded ? String(calDue.length) : "—", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Biomedical Reports</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Equipment performance, maintenance analytics, and compliance metrics</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
                  <p className="text-3xl font-bold mt-1 text-slate-900 dark:text-white">{value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-blue-600" />Fleet Uptime & MTTR Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Not available yet — uptime and MTTR aren’t recorded by any connected system (dataAvailable: false).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-600" />Work Orders by Type — Monthly</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Not available yet — work orders aren’t categorized or tracked by month (dataAvailable: false).
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" />Monthly Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {["Month","Total WOs","PPM Done","Breakdowns","Cal Compliance","Avg Uptime","MTTR (h)"].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-xs text-slate-400">
                    Monthly history isn’t recorded yet — no maintenance analytics source is connected (dataAvailable: false).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Exported pages ────────────────────────────────────────────────────────────

export const BiomedicalEquipment   = () => biomedLayout("Equipment Inventory", "Register and manage all biomedical devices", <BiomedicalEquipmentContent />);
export const BiomedicalWorkOrders  = () => <>{biomedLayout("Work Orders",        "Create and track biomedical work orders",    <BiomedicalWorkOrdersContent />)}<BiomedicalAIAssistant /></>;
export const BiomedicalCalibration = () => <>{biomedLayout("Calibration",        "Schedule and track equipment calibrations",  <BiomedicalCalibrationContent />)}<BiomedicalAIAssistant /></>;
export const BiomedicalReports     = () => <>{biomedLayout("Reports",            "Performance analytics & compliance metrics", <BiomedicalReportsContent />)}<BiomedicalAIAssistant /></>;
