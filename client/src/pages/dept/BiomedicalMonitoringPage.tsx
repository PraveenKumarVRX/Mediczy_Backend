import { useState, useEffect, useCallback } from "react";
import api from "@/utils/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Cpu, Filter,
  Grid3X3, List, Monitor, RefreshCw, Search, Shield, Wrench,
  XCircle, Zap, ChevronRight, X, Info, Gauge, Calendar,
  BarChart3, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import DeptStaffLayout from "@/components/hosp-dept/DeptStaffLayout";
import BiomedicalAIAssistant from "@/components/biomedical/BiomedicalAIAssistant";

// ─── Types ────────────────────────────────────────────────────────────────────

type DeviceStatus = "online" | "warning" | "offline" | "maintenance" | "cal-due" | "untracked";

interface Device {
  id: string;
  name: string;
  type: string;
  ward: string;
  bedNo?: string;
  status: DeviceStatus;
  uptime: number; // percent
  lastReading: string;
  readingValue: string;
  readingUnit: string;
  battery?: number;
  temperature?: number;
  errorCode?: string;
  nextService: string;
  engineer?: string;
  manufacturer: string;
  model: string;
  serialNo: string;
  installDate: string;
  lastCalibration: string;
  alerts: string[];
  trend: "up" | "down" | "stable";
  history: { time: string; value: number }[];
}


// Maps a live hg_equipment_inventory row to the UI Device shape. Telemetry
// (readings, uptime, battery, alerts, trends, history) has no source yet — those
// fields stay empty/zero so the UI renders explicit unavailable states (WP-0.3d).
const mapDevice = (r: any): Device => ({
  id: String(r.id),
  name: r.device_name || "Unnamed device",
  type: r.equipment_class || "—",
  ward: r.department || r.owner_department || "—",
  status: "untracked",
  uptime: 0,
  lastReading: "",
  readingValue: "",
  readingUnit: "",
  nextService: "—",
  manufacturer: r.manufacturer || "—",
  model: r.model || "—",
  serialNo: r.serial_number || "—",
  installDate: "—",
  lastCalibration: "—",
  alerts: [],
  trend: "stable",
  history: [],
});

const statusCfg: Record<DeviceStatus, { label: string; color: string; dot: string; bg: string }> = {
  online:      { label: "Online",      color: "text-emerald-700", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950" },
  warning:     { label: "Warning",     color: "text-amber-700",   dot: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-950" },
  offline:     { label: "Offline",     color: "text-red-700",     dot: "bg-red-500",     bg: "bg-red-50 dark:bg-red-950" },
  maintenance: { label: "Maintenance", color: "text-blue-700",    dot: "bg-blue-500",    bg: "bg-blue-50 dark:bg-blue-950" },
  "cal-due":   { label: "Cal Due",     color: "text-orange-700",  dot: "bg-orange-500",  bg: "bg-orange-50 dark:bg-orange-950" },
  untracked:   { label: "Not Tracked", color: "text-slate-600",   dot: "bg-slate-400",   bg: "bg-slate-100 dark:bg-slate-800" },
};

const trendIcon = { up: TrendingUp, down: TrendingDown, stable: Minus };
const trendColor = { up: "text-emerald-500", down: "text-red-500", stable: "text-slate-400" };

const biomedNav = [
  { title: "Overview",  items: [{ icon: Monitor,    label: "Dashboard",        href: "/biomedical/dashboard" }] },
  { title: "Monitoring",items: [{ icon: Activity,   label: "Device Monitoring",href: "/biomedical/monitoring" }] },
  { title: "Equipment", items: [
    { icon: Wrench,    label: "Equipment",    href: "/biomedical/equipment" },
    { icon: Clock,     label: "Work Orders",  href: "/biomedical/work-orders" },
    { icon: Calendar,  label: "Calibration",  href: "/biomedical/calibration" },
  ]},
  { title: "Reporting", items: [{ icon: BarChart3,  label: "Reports",          href: "/biomedical/reports" }] },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status, pulse = false }: { status: DeviceStatus; pulse?: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {pulse && status === "online" && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusCfg[status].dot} opacity-60`} />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${statusCfg[status].dot}`} />
    </span>
  );
}

function WardSummaryCard({ ward, devices }: { ward: string; devices: Device[] }) {
  const counts = {
    online:      devices.filter(d => d.status === "online").length,
    warning:     devices.filter(d => d.status === "warning").length,
    offline:     devices.filter(d => d.status === "offline").length,
    maintenance: devices.filter(d => d.status === "maintenance").length,
    "cal-due":   devices.filter(d => d.status === "cal-due").length,
  };
  const hasAlerts = counts.warning + counts.offline + counts["cal-due"] > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 ${hasAlerts ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20" : "border-slate-200 bg-white dark:bg-slate-900"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{ward}</span>
        {hasAlerts && <AlertTriangle className="w-4 h-4 text-amber-500" />}
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{devices.length}</p>
      <div className="flex gap-2 flex-wrap">
        {counts.online > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{counts.online} online</span>}
        {counts.warning > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{counts.warning} warn</span>}
        {counts.offline > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{counts.offline} offline</span>}
        {counts["cal-due"] > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{counts["cal-due"]} cal-due</span>}
        {counts.maintenance > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{counts.maintenance} maint</span>}
      </div>
    </motion.div>
  );
}

function DeviceCard({ device, onClick, view }: { device: Device; onClick: () => void; view: "grid" | "list" }) {
  const cfg = statusCfg[device.status];

  if (view === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
        onClick={onClick}
        className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
      >
        <StatusDot status={device.status} pulse={device.status === "online"} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{device.name}</p>
          <p className="text-xs text-slate-500">{device.type} · {device.ward}{device.bedNo ? ` · ${device.bedNo}` : ""}</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{device.model}</p>
          <p className="text-xs text-slate-400">S/N {device.serialNo}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.bg} ${cfg.color} hidden md:inline`}>{cfg.label}</span>
        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 flex-shrink-0" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className={`relative rounded-xl border p-4 cursor-pointer hover:shadow-lg transition-all group ${
        device.alerts.length > 0 ? "border-amber-300 dark:border-amber-700" : "border-slate-200 dark:border-slate-700"
      } bg-white dark:bg-slate-900`}
    >
      {device.alerts.length > 0 && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      )}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusDot status={device.status} pulse={device.status === "online"} />
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>
      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-0.5 leading-tight">{device.name}</p>
      <p className="text-xs text-slate-400 mb-3">{device.type}</p>
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 mb-3">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          {device.manufacturer} {device.model}
        </p>
        <p className="text-xs text-slate-400">S/N {device.serialNo}</p>
      </div>
      <div className="text-xs text-slate-500 space-y-1">
        <div className="flex items-center gap-1.5"><Cpu className="w-3 h-3" />{device.ward}{device.bedNo ? ` · ${device.bedNo}` : ""}</div>
        {device.uptime > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div className={`h-1.5 rounded-full ${device.uptime >= 95 ? "bg-emerald-500" : device.uptime >= 80 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${device.uptime}%` }} />
            </div>
            <span>{device.uptime}% up</span>
          </div>
        )}
        {device.battery !== undefined && (
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            <span className={device.battery < 20 ? "text-red-500 font-medium" : ""}>{device.battery}% battery</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Device Detail Drawer ─────────────────────────────────────────────────────

function DeviceDrawer({ device, onClose }: { device: Device; onClose: () => void }) {
  const cfg = statusCfg[device.status];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40 flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-full max-w-lg bg-white dark:bg-slate-900 h-full overflow-y-auto shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <StatusDot status={device.status} pulse />
                  <span className="text-xs text-blue-200">{device.id}</span>
                </div>
                <h2 className="text-xl font-bold">{device.name}</h2>
                <p className="text-blue-200 text-sm">{device.manufacturer} · {device.model}</p>
              </div>
              <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <p className="text-lg font-bold">{device.uptime > 0 ? `${device.uptime}%` : "—"}</p>
                <p className="text-xs text-blue-200">Uptime</p>
              </div>
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <p className="text-lg font-bold">—</p>
                <p className="text-xs text-blue-200">Telemetry</p>
              </div>
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <p className="text-lg font-bold">—</p>
                <p className="text-xs text-blue-200">Trend</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Status + Alerts */}
            <div className={`rounded-xl p-4 ${cfg.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                {device.status === "online" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> :
                 device.status === "offline" ? <XCircle className="w-4 h-4 text-red-600" /> :
                 <AlertTriangle className="w-4 h-4 text-amber-600" />}
                <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
                {device.errorCode && <span className="ml-auto text-xs font-mono bg-white/60 px-2 py-0.5 rounded text-red-700">{device.errorCode}</span>}
              </div>
              {device.alerts.length > 0 && device.alerts.map((a, i) => (
                <p key={i} className="text-xs mt-1 text-amber-800 dark:text-amber-200 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-amber-500 inline-block" />{a}
                </p>
              ))}
            </div>

            {/* 24h trend — no telemetry source yet */}
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" /> 24h Parameter Trend
              </p>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Not available yet — device telemetry isn’t streamed (dataAvailable: false).
                </p>
              </div>
            </div>

            {/* Device Info */}
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" /> Device Information
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Serial No.", device.serialNo],
                  ["Location", `${device.ward}${device.bedNo ? ` · ${device.bedNo}` : ""}`],
                  ["Install Date", device.installDate],
                  ["Last Calibration", device.lastCalibration],
                  ["Next Service", device.nextService],
                  ["Engineer", device.engineer || "—"],
                  ...(device.battery !== undefined ? [["Battery", `${device.battery}%`]] : []),
                  ...(device.temperature !== undefined ? [["Temp (°C)", `${device.temperature}°C`]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5">
                    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance */}
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" /> Compliance Status
              </p>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Not available yet — equipment compliance isn’t evaluated by any connected system (dataAvailable: false).
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Main Monitoring Component ────────────────────────────────────────────────

function BiomedicalMonitoringContent() {
  const [selectedWard, setSelectedWard] = useState("All Wards");
  const [selectedStatus, setSelectedStatus] = useState<DeviceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    api.get('/biomedical/equipment', {
      headers: { Authorization: `Bearer ${localStorage.getItem('biomedicalToken') || ''}` },
    })
      .then(({ data }) => {
        setDevices(((data.data || []) as any[]).map(mapDevice));
        setLastRefresh(new Date());
        setDevicesLoaded(true);
      })
      .catch((err) => {
        console.error('[Biomedical] failed to load devices:', err?.message);
        setDevicesLoaded(true);
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  const filtered = devices.filter(d => {
    if (selectedWard !== "All Wards" && d.ward !== selectedWard) return false;
    if (selectedStatus !== "all" && d.status !== selectedStatus) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !d.type.toLowerCase().includes(search.toLowerCase()) &&
        !d.ward.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statusCounts = {
    online:      devices.filter(d => d.status === "online").length,
    warning:     devices.filter(d => d.status === "warning").length,
    offline:     devices.filter(d => d.status === "offline").length,
    maintenance: devices.filter(d => d.status === "maintenance").length,
    "cal-due":   devices.filter(d => d.status === "cal-due").length,
    untracked:   devices.filter(d => d.status === "untracked").length,
  };

  const alertDevices = devices.filter(d => d.alerts.length > 0 || d.status === "offline" || d.status === "warning");

  const wardNames = Array.from(new Set(devices.map(d => d.ward))).sort();
  const wardData = wardNames.map(w => ({
    ward: w,
    count: devices.filter(d => d.ward === w).length,
  }));

  return (
    <div className="space-y-6 pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-6 h-6 text-blue-600" /> Device Monitoring
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Equipment registry: {devices.length} devices · live telemetry not connected · refreshed {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          onClick={refresh}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors ${refreshing ? "opacity-70" : ""}`}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Alert Strip */}
      {alertDevices.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-red-50 to-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">{alertDevices.length} Device{alertDevices.length > 1 ? "s" : ""} Require Attention</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {alertDevices.map(d => (
                <button key={d.id} onClick={() => setSelectedDevice(d)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${statusCfg[d.status].bg} ${statusCfg[d.status].color}`}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {([
          { status: "online"      as DeviceStatus, icon: CheckCircle2, label: "Online"      },
          { status: "warning"     as DeviceStatus, icon: AlertTriangle,label: "Warning"     },
          { status: "offline"     as DeviceStatus, icon: XCircle,      label: "Offline"     },
          { status: "maintenance" as DeviceStatus, icon: Wrench,       label: "Maintenance" },
          { status: "cal-due"     as DeviceStatus, icon: Gauge,        label: "Cal Due"     },
          { status: "untracked"   as DeviceStatus, icon: Info,         label: "Not Tracked" },
        ] as const).map(({ status, icon: Icon, label }) => {
          const cfg = statusCfg[status];
          const active = selectedStatus === status;
          return (
            <motion.button
              key={status} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedStatus(active ? "all" : status)}
              className={`rounded-xl border p-4 text-left transition-all ${active ? `ring-2 ring-blue-500 ${cfg.bg}` : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300"}`}
            >
              <Icon className={`w-5 h-5 mb-2 ${cfg.color}`} />
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{statusCounts[status]}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </motion.button>
          );
        })}
      </div>

      {/* Ward Distribution Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" /> Devices by Ward
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wardData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="ward" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" name="Devices" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ward Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          {wardNames.filter(w => devices.some(d => d.ward === w)).map(ward => (
            <WardSummaryCard key={ward} ward={ward} devices={devices.filter(d => d.ward === ward)} />
          ))}
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search devices, type, ward…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={selectedWard} onChange={e => setSelectedWard(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {["All Wards", ...wardNames].map(w => <option key={w}>{w}</option>)}
          </select>
          <button
            onClick={() => setView(v => v === "grid" ? "list" : "grid")}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm hover:bg-slate-50 transition-colors"
          >
            {view === "grid" ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
            {view === "grid" ? "List" : "Grid"}
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Filter className="w-4 h-4" />
        Showing {filtered.length} of {devices.length} devices
        {selectedStatus !== "all" && (
          <button onClick={() => setSelectedStatus("all")} className="ml-2 text-blue-600 hover:underline">Clear filter</button>
        )}
      </div>

      {/* Device Grid / List */}
      <div className={view === "grid"
        ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        : "flex flex-col gap-2"
      }>
        <AnimatePresence mode="popLayout">
          {filtered.map((device, i) => (
            <motion.div key={device.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.03 } }} exit={{ opacity: 0 }}>
              <DeviceCard device={device} view={view} onClick={() => setSelectedDevice(device)} />
            </motion.div>
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className={`${view === "grid" ? "col-span-full" : ""} text-center py-16 text-slate-400`}>
            <Monitor className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{devicesLoaded ? "No devices match your filters" : "Loading devices…"}</p>
          </div>
        )}
      </div>

      {/* Device Drawer */}
      {selectedDevice && (
        <DeviceDrawer device={selectedDevice} onClose={() => setSelectedDevice(null)} />
      )}
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function BiomedicalMonitoring() {
  return (
    <>
      <DeptStaffLayout
        deptKey="biomedical"
        deptName="Biomedical Engineering"
        badgeLabel="BIOMED"
        DeptIcon={Monitor}
        loginPath="/biomedical/login"
        navSections={biomedNav}
        title="Device Monitoring"
        subtitle="Live equipment status across all wards"
      >
        <BiomedicalMonitoringContent />
      </DeptStaffLayout>
      <BiomedicalAIAssistant />
    </>
  );
}
