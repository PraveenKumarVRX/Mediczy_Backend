/**
 * BiomedicalModulePages — full-featured sub-pages for the Biomedical Engineering portal.
 * Equipment Inventory, Work Orders, Calibration Tracking, Reports — all world-class.
 */
import { useState, useMemo } from "react";
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
  >
    {children}
  </DeptStaffLayout>
);

// ─── EQUIPMENT DATA ────────────────────────────────────────────────────────────

type DeviceStatus = "online" | "warning" | "offline" | "maintenance" | "cal-due" | "retired";

interface Device {
  id: string; assetId: string; name: string; type: string; manufacturer: string; model: string;
  department: string; location: string; status: DeviceStatus;
  lastService: string; nextCalibration: string; nextPPM: string;
  yearOfPurchase: number; warrantyExpiry: string; age: number;
  engineer: string; serialNo: string; notes: string;
}

const devicesData: Device[] = [
  { id: "D001", assetId: "BME-1001", name: "Patient Monitor", type: "Monitoring", manufacturer: "Philips", model: "IntelliVue MX450", department: "ICU-1", location: "Bed 4", status: "online",      lastService: "2026-04-10", nextCalibration: "2026-07-10", nextPPM: "2026-05-20", yearOfPurchase: 2021, warrantyExpiry: "2026-12-31", age: 5, engineer: "Rajan K.",  serialNo: "MX45023411", notes: "Annual calibration due Q3" },
  { id: "D002", assetId: "BME-1002", name: "Ventilator",      type: "Respiratory", manufacturer: "Drager", model: "V500",          department: "ICU-2", location: "Bay 2",  status: "offline",     lastService: "2026-05-01", nextCalibration: "2026-08-01", nextPPM: "2026-06-01", yearOfPurchase: 2020, warrantyExpiry: "2025-06-30", age: 6, engineer: "Priya M.", serialNo: "V500DE1942", notes: "Low-pressure alarm — WO-3841 open" },
  { id: "D003", assetId: "BME-1003", name: "ECG Machine",     type: "Cardiac",     manufacturer: "GE",     model: "MAC 5500",      department: "Cardio", location: "Room 2", status: "maintenance", lastService: "2026-05-10", nextCalibration: "2026-06-15", nextPPM: "2026-05-25", yearOfPurchase: 2022, warrantyExpiry: "2027-03-31", age: 4, engineer: "Rajan K.",  serialNo: "GE55004322", notes: "Calibration in progress" },
  { id: "D004", assetId: "BME-1004", name: "Infusion Pump",   type: "Infusion",    manufacturer: "BD",     model: "Alaris GP",     department: "General-3", location: "Nurses Station", status: "online",   lastService: "2026-03-15", nextCalibration: "2026-09-15", nextPPM: "2026-06-15", yearOfPurchase: 2023, warrantyExpiry: "2028-01-31", age: 3, engineer: "Meena S.", serialNo: "BD04412891", notes: "" },
  { id: "D005", assetId: "BME-1005", name: "Defibrillator",   type: "Cardiac",     manufacturer: "ZOLL",   model: "R Series",      department: "Emergency", location: "Bay 1", status: "warning",    lastService: "2026-04-01", nextCalibration: "2026-05-20", nextPPM: "2026-05-20", yearOfPurchase: 2021, warrantyExpiry: "2026-07-31", age: 5, engineer: "Anil R.",  serialNo: "ZR001928341", notes: "Battery low — replace next PPM" },
  { id: "D006", assetId: "BME-1006", name: "Blood Gas Analyser", type: "Laboratory", manufacturer: "Radiometer", model: "ABL90 FLEX", department: "Lab",   location: "Main Lab", status: "cal-due",  lastService: "2025-11-15", nextCalibration: "2026-05-18", nextPPM: "2026-06-15", yearOfPurchase: 2019, warrantyExpiry: "2024-12-31", age: 7, engineer: "Suresh P.", serialNo: "RAD9012834", notes: "Calibration overdue — NABL requirement" },
  { id: "D007", assetId: "BME-1007", name: "Autoclave",        type: "Sterilisation", manufacturer: "Tuttnauer", model: "3870EHP",  department: "CSSD",  location: "Main CSSD", status: "offline",  lastService: "2026-04-20", nextCalibration: "2026-10-20", nextPPM: "2026-06-20", yearOfPurchase: 2020, warrantyExpiry: "2025-12-31", age: 6, engineer: "Anil R.",  serialNo: "TUT38702011", notes: "Heating element failure — critical WO open" },
  { id: "D008", assetId: "BME-1008", name: "SpO2 Monitor",     type: "Monitoring",  manufacturer: "Nellcor", model: "OxiMax N-600", department: "OT-3",  location: "OT Bay", status: "online",     lastService: "2026-02-28", nextCalibration: "2026-08-28", nextPPM: "2026-05-28", yearOfPurchase: 2022, warrantyExpiry: "2027-02-28", age: 4, engineer: "Meena S.", serialNo: "NC60019021", notes: "" },
  { id: "D009", assetId: "BME-1009", name: "Anesthesia Machine", type: "Anaesthesia", manufacturer: "Drager", model: "Fabius Tiro",  department: "OT-1",  location: "Main OT", status: "online",    lastService: "2026-04-05", nextCalibration: "2026-07-05", nextPPM: "2026-06-05", yearOfPurchase: 2021, warrantyExpiry: "2026-06-30", age: 5, engineer: "Rajan K.", serialNo: "FT210390244", notes: "" },
  { id: "D010", assetId: "BME-1010", name: "C-Arm X-Ray",      type: "Imaging",     manufacturer: "Siemens", model: "Cios Spin",   department: "OT-2",  location: "OT 2",   status: "online",     lastService: "2026-03-01", nextCalibration: "2026-09-01", nextPPM: "2026-06-01", yearOfPurchase: 2020, warrantyExpiry: "2025-09-30", age: 6, engineer: "Suresh P.", serialNo: "SCS20019012", notes: "Warranty expired — parts procurement pending" },
  { id: "D011", assetId: "BME-1011", name: "Ultrasound Machine","type": "Imaging",  manufacturer: "GE",     model: "LOGIQ E10",   department: "Radiology", location: "Room 3", status: "online",   lastService: "2026-01-20", nextCalibration: "2026-07-20", nextPPM: "2026-06-20", yearOfPurchase: 2023, warrantyExpiry: "2028-03-31", age: 3, engineer: "Priya M.", serialNo: "GEL10019023", notes: "" },
  { id: "D012", assetId: "BME-1012", name: "Centrifuge",        type: "Laboratory", manufacturer: "Eppendorf", model: "5810R",    department: "Lab",   location: "Lab 2",  status: "online",     lastService: "2026-02-15", nextCalibration: "2026-08-15", nextPPM: "2026-05-15", yearOfPurchase: 2022, warrantyExpiry: "2027-05-31", age: 4, engineer: "Suresh P.", serialNo: "EP58102091", notes: "" },
];

const statusCfg: Record<DeviceStatus, { label: string; cls: string; dot: string }> = {
  online:      { label: "Online",      cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",   dot: "bg-green-500" },
  warning:     { label: "Warning",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",   dot: "bg-amber-500" },
  offline:     { label: "Offline",     cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",           dot: "bg-red-500" },
  maintenance: { label: "Maintenance", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",       dot: "bg-blue-500" },
  "cal-due":   { label: "Cal Due",     cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400", dot: "bg-purple-500" },
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

  const types = ["all", ...Array.from(new Set(devicesData.map(d => d.type)))];

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

  const filtered = useMemo(() => devicesData.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.assetId.toLowerCase().includes(search.toLowerCase()) ||
      d.department.toLowerCase().includes(search.toLowerCase()) ||
      d.manufacturer.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchType   = typeFilter   === "all" || d.type    === typeFilter;
    return matchSearch && matchStatus && matchType;
  }), [search, statusFilter, typeFilter]);

  return (
    <>
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Equipment Inventory</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} of {devicesData.length} devices</p>
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
          {(["all","online","warning","offline","maintenance","cal-due"] as const).map(s => (
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
          const count = devicesData.filter(d => d.status === key).length;
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
                    { label: "Year of Purchase",   value: selected.yearOfPurchase.toString() },
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
  type: "Breakdown" | "PPM" | "Calibration" | "Installation" | "Inspection";
  priority: "critical" | "high" | "normal"; status: "open" | "in-progress" | "completed" | "cancelled" | "overdue";
  engineer: string; raisedBy: string; raisedDate: string; dueDate: string;
  description: string; resolution: string;
}

const workOrdersData: WorkOrder[] = [
  { id: "WO-3841", device: "Ventilator — Drager V500",     assetId: "BME-1002", dept: "ICU-2",      type: "Breakdown",   priority: "critical", status: "open",        engineer: "Rajan K.",  raisedBy: "Sr. Nurse Seema",  raisedDate: "2026-05-15 08:32", dueDate: "2026-05-15", description: "Low-pressure alarm continuously triggered. Patient circuit suspected.", resolution: "" },
  { id: "WO-3840", device: "ECG Machine — GE MAC 5500",    assetId: "BME-1003", dept: "Cardio",     type: "Calibration", priority: "high",     status: "in-progress", engineer: "Priya M.",  raisedBy: "Dr. Mehta",        raisedDate: "2026-05-14 07:55", dueDate: "2026-05-16", description: "Annual calibration due. NABH compliance requirement.", resolution: "" },
  { id: "WO-3839", device: "Infusion Pump — BD Alaris",    assetId: "BME-1004", dept: "General-3",  type: "PPM",         priority: "normal",   status: "completed",   engineer: "Suresh P.", raisedBy: "Scheduled",        raisedDate: "2026-05-14 07:30", dueDate: "2026-05-15", description: "Quarterly PPM as per schedule.", resolution: "Completed all PPM checks. Flow rate calibrated, filters cleaned." },
  { id: "WO-3838", device: "Patient Monitor — Philips MX", assetId: "BME-1001", dept: "ICU-1",      type: "Breakdown",   priority: "high",     status: "open",        engineer: "Rajan K.",  raisedBy: "ICU Head Nurse",   raisedDate: "2026-05-14 06:48", dueDate: "2026-05-15", description: "SpO2 waveform intermittent on Channel 2.", resolution: "" },
  { id: "WO-3837", device: "Defibrillator — ZOLL R Series",assetId: "BME-1005", dept: "Emergency",  type: "PPM",         priority: "normal",   status: "completed",   engineer: "Meena S.",  raisedBy: "Scheduled",        raisedDate: "2026-05-13 06:20", dueDate: "2026-05-14", description: "Monthly PPM. Battery check included.", resolution: "Battery at 78%. Pads replaced. Shock delivery test passed at 360J." },
  { id: "WO-3836", device: "SpO2 Monitor — Nellcor",       assetId: "BME-1008", dept: "OT-3",       type: "Installation",priority: "normal",   status: "in-progress", engineer: "Priya M.",  raisedBy: "OT In-Charge",     raisedDate: "2026-05-13 06:00", dueDate: "2026-05-16", description: "New unit installation and commissioning.", resolution: "" },
  { id: "WO-3835", device: "Autoclave — Tuttnauer 3870E",  assetId: "BME-1007", dept: "CSSD",       type: "Breakdown",   priority: "high",     status: "open",        engineer: "Anil R.",   raisedBy: "CSSD Manager",     raisedDate: "2026-05-13 05:30", dueDate: "2026-05-14", description: "Heating element failure. Cycle aborting at 121°C. OEM parts ordered.", resolution: "" },
  { id: "WO-3834", device: "C-Arm X-Ray — Siemens",        assetId: "BME-1010", dept: "OT-2",       type: "Inspection",  priority: "normal",   status: "overdue",     engineer: "Suresh P.", raisedBy: "Radiology HOD",    raisedDate: "2026-05-10 09:00", dueDate: "2026-05-12", description: "Radiation output verification. AERB requirement.", resolution: "" },
];

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

  const filtered = useMemo(() => workOrdersData.filter(w => {
    const matchSearch = w.id.toLowerCase().includes(search.toLowerCase()) ||
      w.device.toLowerCase().includes(search.toLowerCase()) ||
      w.dept.toLowerCase().includes(search.toLowerCase()) ||
      w.engineer.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    return matchSearch && matchStatus;
  }), [search, statusFilter]);

  return (
    <>
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Work Orders</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} orders shown</p>
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
          { label: "Open",        value: workOrdersData.filter(w=>w.status==="open").length,        color: "text-red-600" },
          { label: "In Progress", value: workOrdersData.filter(w=>w.status==="in-progress").length, color: "text-blue-600" },
          { label: "Overdue",     value: workOrdersData.filter(w=>w.status==="overdue").length,     color: "text-amber-600" },
          { label: "Completed",   value: workOrdersData.filter(w=>w.status==="completed").length,   color: "text-green-600" },
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

const calibrationData = [
  { id: "CAL-821", device: "Blood Gas Analyser — Radiometer ABL90", assetId: "BME-1006", dept: "Lab",       dueDate: "2026-05-18", daysLeft: 3,  lastDone: "2025-11-18", standard: "NABL", status: "overdue",  frequency: "6-monthly" },
  { id: "CAL-822", device: "Patient Monitor — Nihon Kohden",        assetId: "BME-7012", dept: "ICU-3",     dueDate: "2026-05-20", daysLeft: 5,  lastDone: "2025-11-20", standard: "NABH", status: "due-soon", frequency: "6-monthly" },
  { id: "CAL-823", device: "Infusion Pump — Baxter Sigma",          assetId: "BME-2034", dept: "Oncology",  dueDate: "2026-05-22", daysLeft: 7,  lastDone: "2025-11-22", standard: "IEC",  status: "due-soon", frequency: "6-monthly" },
  { id: "CAL-824", device: "Defibrillator — Philips HeartStart",   assetId: "BME-3011", dept: "Emergency", dueDate: "2026-05-25", daysLeft: 10, lastDone: "2025-11-25", standard: "NABH", status: "upcoming", frequency: "6-monthly" },
  { id: "CAL-825", device: "ECG Machine — BPL Cardiart 9108",      assetId: "BME-4022", dept: "Cardio-2",  dueDate: "2026-05-30", daysLeft: 15, lastDone: "2025-11-30", standard: "NABH", status: "upcoming", frequency: "6-monthly" },
  { id: "CAL-826", device: "Ventilator — Hamilton G5",             assetId: "BME-1019", dept: "ICU-1",     dueDate: "2026-06-10", daysLeft: 26, lastDone: "2025-12-10", standard: "IEC",  status: "scheduled", frequency: "6-monthly" },
  { id: "CAL-827", device: "Autoclave — Tuttnauer 3870",           assetId: "BME-1007", dept: "CSSD",      dueDate: "2026-10-20", daysLeft: 158,lastDone: "2026-04-20", standard: "BIS",  status: "compliant", frequency: "6-monthly" },
  { id: "CAL-828", device: "Patient Monitor — Philips MX450",      assetId: "BME-1001", dept: "ICU-1",     dueDate: "2026-07-10", daysLeft: 56, lastDone: "2026-01-10", standard: "NABH", status: "compliant", frequency: "6-monthly" },
];

const calStatusCfg: Record<string, { label: string; cls: string }> = {
  overdue:   { label: "Overdue",   cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  "due-soon":{ label: "Due Soon",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  upcoming:  { label: "Upcoming",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  scheduled: { label: "Scheduled", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" },
  compliant: { label: "Compliant", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
};

const calComplianceTrend = [
  { month: "Nov", compliance: 82 }, { month: "Dec", compliance: 85 },
  { month: "Jan", compliance: 87 }, { month: "Feb", compliance: 86 },
  { month: "Mar", compliance: 90 }, { month: "Apr", compliance: 92 },
  { month: "May", compliance: 94 },
];

const BiomedicalCalibrationContent = () => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => calibrationData.filter(c => {
    const matchSearch = c.device.toLowerCase().includes(search.toLowerCase()) || c.dept.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || c.status === filter;
    return matchSearch && matchFilter;
  }), [search, filter]);

  const compliancePct = Math.round((calibrationData.filter(c => c.status === "compliant").length / calibrationData.length) * 100);

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
          <p className="text-xs text-slate-500">Compliance Rate</p>
          <p className={`text-3xl font-bold mt-1 ${compliancePct >= 85 ? "text-green-600" : "text-red-600"}`}>{compliancePct}%</p>
          <p className="text-[10px] text-slate-400">NABH target: 95%</p>
        </Card>
        {[
          { label: "Overdue",  value: calibrationData.filter(c=>c.status==="overdue").length,   color: "text-red-600" },
          { label: "Due Soon", value: calibrationData.filter(c=>c.status==="due-soon").length,  color: "text-amber-600" },
          { label: "Compliant",value: calibrationData.filter(c=>c.status==="compliant").length, color: "text-green-600" },
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
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={calComplianceTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis domain={[70, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} formatter={v => [`${v}%`, "Compliance"]} />
              <Area type="monotone" dataKey="compliance" stroke="#3b82f6" strokeWidth={2.5} fill="url(#calGrad)" dot={{ r: 3, fill: "#3b82f6" }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search device, department..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all","overdue","due-soon","upcoming","scheduled","compliant"] as const).map(s => (
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
                {["Cal ID / Device", "Department", "Standard", "Last Done", "Due Date", "Days Left", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
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

const uptimeTrend = [
  { month: "Nov", uptime: 91.2, mttr: 4.8 }, { month: "Dec", uptime: 92.1, mttr: 4.2 },
  { month: "Jan", uptime: 91.8, mttr: 4.5 }, { month: "Feb", uptime: 93.2, mttr: 3.9 },
  { month: "Mar", uptime: 94.1, mttr: 3.4 }, { month: "Apr", uptime: 94.8, mttr: 3.1 },
  { month: "May", uptime: 93.0, mttr: 3.3 },
];

const woByType = [
  { type: "Breakdown", jan: 18, feb: 14, mar: 16, apr: 12, may: 9 },
  { type: "PPM",       jan: 38, feb: 41, mar: 44, apr: 47, may: 52 },
  { type: "Calibration",jan:12,feb: 14, mar: 15, apr: 16, may: 14 },
  { type: "Installation",jan:4, feb: 3,  mar: 5,  apr: 4,  may: 6  },
];

const BiomedicalReportsContent = () => {
  const kpis = [
    { label: "Fleet Uptime",     value: "93.0%", trend: "+3%",  icon: Activity,      color: "text-green-600",  bg: "bg-green-100 dark:bg-green-950" },
    { label: "MTTR",             value: "3.3h",  trend: "-31%", icon: Clock,         color: "text-blue-600",   bg: "bg-blue-100 dark:bg-blue-950" },
    { label: "PPM Compliance",   value: "94%",   trend: "+7%",  icon: ShieldCheck,   color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-950" },
    { label: "WOs Closed/Month", value: "61",    trend: "+45%", icon: CheckCircle2,  color: "text-emerald-600",bg: "bg-emerald-100 dark:bg-emerald-950" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Biomedical Reports</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Equipment performance, maintenance analytics, and compliance metrics</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(({ label, value, trend, icon: Icon, color, bg }) => (
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
              <div className="mt-3 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs font-medium text-green-600">{trend} vs 6 months ago</span>
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
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={uptimeTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" domain={[88, 97]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 7]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left"  type="monotone" dataKey="uptime" name="Uptime %" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="mttr"   name="MTTR (h)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-600" />Work Orders by Type — Monthly</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[
                { month: "Jan", Breakdown: 18, PPM: 38, Calibration: 12, Installation: 4 },
                { month: "Feb", Breakdown: 14, PPM: 41, Calibration: 14, Installation: 3 },
                { month: "Mar", Breakdown: 16, PPM: 44, Calibration: 15, Installation: 5 },
                { month: "Apr", Breakdown: 12, PPM: 47, Calibration: 16, Installation: 4 },
                { month: "May", Breakdown: 9,  PPM: 52, Calibration: 14, Installation: 6 },
              ]} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Breakdown"   fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="PPM"         fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Calibration" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Installation"fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
                {[
                  { month:"November", wos:72, ppm:38, breakdowns:18, calComp:82, uptime:91.2, mttr:4.8 },
                  { month:"December", wos:78, ppm:41, breakdowns:14, calComp:85, uptime:92.1, mttr:4.2 },
                  { month:"January",  wos:75, ppm:44, breakdowns:16, calComp:87, uptime:91.8, mttr:4.5 },
                  { month:"February", wos:71, ppm:47, breakdowns:12, calComp:86, uptime:93.2, mttr:3.9 },
                  { month:"March",    wos:80, ppm:50, breakdowns: 9, calComp:90, uptime:94.1, mttr:3.4 },
                  { month:"April",    wos:79, ppm:52, breakdowns:12, calComp:92, uptime:94.8, mttr:3.1 },
                  { month:"May",      wos:30, ppm:22, breakdowns: 9, calComp:94, uptime:93.0, mttr:3.3 },
                ].map((r, i) => (
                  <tr key={r.month} className={`border-b border-slate-50 dark:border-slate-800/50 ${i%2===0?"":"bg-slate-50/50 dark:bg-slate-800/20"}`}>
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-white">{r.month}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{r.wos}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{r.ppm}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{r.breakdowns}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${r.calComp>=90?"bg-green-500":"bg-amber-500"}`} style={{width:`${r.calComp}%`}} />
                        </div>
                        <span className={`text-xs font-semibold ${r.calComp>=90?"text-green-600":"text-amber-600"}`}>{r.calComp}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><span className={`text-xs font-semibold ${r.uptime>=93?"text-green-600":"text-amber-600"}`}>{r.uptime}%</span></td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{r.mttr}h</td>
                  </tr>
                ))}
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
