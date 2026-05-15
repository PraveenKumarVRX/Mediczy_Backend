import { useState, useEffect, useCallback } from "react";
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

type DeviceStatus = "online" | "warning" | "offline" | "maintenance" | "cal-due";

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

// ─── Sample Data ──────────────────────────────────────────────────────────────

const generateHistory = (base: number, variance: number) =>
  ["00:00","02:00","04:00","06:00","08:00","10:00","12:00","14:00","16:00","18:00","20:00","22:00"].map(
    time => ({ time, value: Math.round((base + (Math.random() - 0.5) * variance) * 10) / 10 })
  );

const devices: Device[] = [
  {
    id: "BM-001", name: "Ventilator A", type: "Ventilator", ward: "ICU", bedNo: "Bed 3",
    status: "online", uptime: 99.7, lastReading: "10:42 AM", readingValue: "14", readingUnit: "breaths/min",
    battery: undefined, temperature: 38, errorCode: undefined, nextService: "2026-06-10",
    engineer: "Rajesh Kumar", manufacturer: "Draeger", model: "Evita V800", serialNo: "DV-22910",
    installDate: "2022-03-15", lastCalibration: "2026-03-01", alerts: [],
    trend: "stable", history: generateHistory(14, 2),
  },
  {
    id: "BM-002", name: "Patient Monitor B", type: "Patient Monitor", ward: "ICU", bedNo: "Bed 5",
    status: "warning", uptime: 94.1, lastReading: "10:41 AM", readingValue: "SpO₂ 91%", readingUnit: "",
    battery: 78, temperature: 37, errorCode: "ERR-SPO2-LOW", nextService: "2026-05-28",
    engineer: "Suresh Nair", manufacturer: "Philips", model: "IntelliVue MX500", serialNo: "PH-MX5-0341",
    installDate: "2021-08-20", lastCalibration: "2026-01-15", alerts: ["SpO₂ below threshold", "Sensor contact check required"],
    trend: "down", history: generateHistory(96, 4),
  },
  {
    id: "BM-003", name: "Infusion Pump C", type: "Infusion Pump", ward: "ICU", bedNo: "Bed 7",
    status: "online", uptime: 99.2, lastReading: "10:40 AM", readingValue: "25", readingUnit: "ml/hr",
    battery: 92, temperature: 36, errorCode: undefined, nextService: "2026-07-15",
    engineer: "Rajesh Kumar", manufacturer: "BD Alaris", model: "8015 PC Unit", serialNo: "BD-8015-99231",
    installDate: "2023-01-10", lastCalibration: "2026-02-20", alerts: [],
    trend: "stable", history: generateHistory(25, 3),
  },
  {
    id: "BM-004", name: "Defibrillator D", type: "Defibrillator", ward: "Emergency", bedNo: undefined,
    status: "cal-due", uptime: 98.5, lastReading: "Yesterday", readingValue: "Ready", readingUnit: "",
    battery: 85, temperature: 36, errorCode: "CAL-DUE", nextService: "2026-05-18",
    engineer: "Priya Menon", manufacturer: "Zoll", model: "R Series Plus", serialNo: "ZO-RS-44521",
    installDate: "2020-05-12", lastCalibration: "2025-11-18", alerts: ["Calibration overdue by 12 days"],
    trend: "stable", history: generateHistory(100, 0),
  },
  {
    id: "BM-005", name: "ECG Machine E", type: "ECG", ward: "Cardiology", bedNo: undefined,
    status: "online", uptime: 99.9, lastReading: "10:38 AM", readingValue: "72", readingUnit: "bpm",
    battery: undefined, temperature: 37, errorCode: undefined, nextService: "2026-09-01",
    engineer: "Deepak Singh", manufacturer: "Schiller", model: "AT-102 Plus", serialNo: "SC-AT102-87231",
    installDate: "2019-11-03", lastCalibration: "2026-04-10", alerts: [],
    trend: "stable", history: generateHistory(72, 8),
  },
  {
    id: "BM-006", name: "Anaesthesia Unit F", type: "Anaesthesia Machine", ward: "OT", bedNo: "OT-2",
    status: "maintenance", uptime: 0, lastReading: "Offline since 08:00", readingValue: "—", readingUnit: "",
    battery: undefined, temperature: undefined, errorCode: "MAINT-PPM", nextService: "2026-05-15",
    engineer: "Rajesh Kumar", manufacturer: "GE Healthcare", model: "Avance CS2", serialNo: "GE-AV-33109",
    installDate: "2018-03-22", lastCalibration: "2025-12-05", alerts: ["Scheduled PPM in progress"],
    trend: "stable", history: generateHistory(0, 0),
  },
  {
    id: "BM-007", name: "Syringe Pump G", type: "Syringe Pump", ward: "NICU", bedNo: "Bed 2",
    status: "online", uptime: 99.8, lastReading: "10:42 AM", readingValue: "5", readingUnit: "ml/hr",
    battery: 65, temperature: 36, errorCode: undefined, nextService: "2026-08-20",
    engineer: "Suresh Nair", manufacturer: "Fresenius Kabi", model: "Agilia SP", serialNo: "FK-AG-22819",
    installDate: "2023-06-05", lastCalibration: "2026-03-15", alerts: [],
    trend: "up", history: generateHistory(5, 0.5),
  },
  {
    id: "BM-008", name: "Pulse Oximeter H", type: "Pulse Oximeter", ward: "General Ward", bedNo: "Bed 14",
    status: "offline", uptime: 0, lastReading: "08:22 AM", readingValue: "—", readingUnit: "",
    battery: 12, temperature: undefined, errorCode: "LOW-BATT", nextService: "2026-06-30",
    engineer: "Priya Menon", manufacturer: "Nonin", model: "9560", serialNo: "NN-9560-61023",
    installDate: "2020-09-14", lastCalibration: "2025-10-30", alerts: ["Battery critically low", "Device offline"],
    trend: "down", history: generateHistory(98, 3),
  },
  {
    id: "BM-009", name: "C-Arm Imager I", type: "Imaging", ward: "OT", bedNo: "OT-1",
    status: "online", uptime: 97.3, lastReading: "09:15 AM", readingValue: "Standby", readingUnit: "",
    battery: undefined, temperature: 42, errorCode: undefined, nextService: "2026-10-12",
    engineer: "Deepak Singh", manufacturer: "Siemens Healthineers", model: "Cios Select", serialNo: "SI-CS-99001",
    installDate: "2021-04-08", lastCalibration: "2026-01-20", alerts: [],
    trend: "stable", history: generateHistory(100, 0),
  },
  {
    id: "BM-010", name: "Suction Apparatus J", type: "Suction Machine", ward: "General Ward", bedNo: "Bed 22",
    status: "warning", uptime: 82.4, lastReading: "10:30 AM", readingValue: "450", readingUnit: "mmHg",
    battery: undefined, temperature: 38, errorCode: "PRESS-WARN", nextService: "2026-06-05",
    engineer: "Suresh Nair", manufacturer: "Medela", model: "Vario 18", serialNo: "MD-V18-55012",
    installDate: "2019-07-19", lastCalibration: "2025-09-10", alerts: ["Pressure fluctuation detected"],
    trend: "down", history: generateHistory(450, 30),
  },
  {
    id: "BM-011", name: "Blood Gas Analyser K", type: "Analyser", ward: "Lab", bedNo: undefined,
    status: "online", uptime: 99.5, lastReading: "10:35 AM", readingValue: "pH 7.42", readingUnit: "",
    battery: undefined, temperature: 37, errorCode: undefined, nextService: "2026-07-01",
    engineer: "Deepak Singh", manufacturer: "Radiometer", model: "ABL90 FLEX", serialNo: "RA-ABL-10234",
    installDate: "2022-09-01", lastCalibration: "2026-04-01", alerts: [],
    trend: "stable", history: generateHistory(7.42, 0.05),
  },
  {
    id: "BM-012", name: "Phototherapy Unit L", type: "Phototherapy", ward: "NICU", bedNo: "Bed 4",
    status: "online", uptime: 99.1, lastReading: "10:40 AM", readingValue: "12", readingUnit: "μW/cm²",
    battery: undefined, temperature: 39, errorCode: undefined, nextService: "2026-08-15",
    engineer: "Priya Menon", manufacturer: "GE Healthcare", model: "BiliSoft", serialNo: "GE-BS-77310",
    installDate: "2023-02-28", lastCalibration: "2026-02-28", alerts: [],
    trend: "stable", history: generateHistory(12, 1),
  },
];

const wards = ["All Wards", "ICU", "Emergency", "OT", "Cardiology", "NICU", "General Ward", "Lab"];

const statusCfg: Record<DeviceStatus, { label: string; color: string; dot: string; bg: string }> = {
  online:      { label: "Online",      color: "text-emerald-700", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950" },
  warning:     { label: "Warning",     color: "text-amber-700",   dot: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-950" },
  offline:     { label: "Offline",     color: "text-red-700",     dot: "bg-red-500",     bg: "bg-red-50 dark:bg-red-950" },
  maintenance: { label: "Maintenance", color: "text-blue-700",    dot: "bg-blue-500",    bg: "bg-blue-50 dark:bg-blue-950" },
  "cal-due":   { label: "Cal Due",     color: "text-orange-700",  dot: "bg-orange-500",  bg: "bg-orange-50 dark:bg-orange-950" },
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
  const TrendIcon = trendIcon[device.trend];

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
          <p className="text-sm font-mono font-semibold text-slate-700 dark:text-slate-200">{device.readingValue} <span className="text-xs text-slate-400">{device.readingUnit}</span></p>
          <p className="text-xs text-slate-400">{device.lastReading}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.bg} ${cfg.color} hidden md:inline`}>{cfg.label}</span>
        {device.alerts.length > 0 && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
        <TrendIcon className={`w-4 h-4 ${trendColor[device.trend]} flex-shrink-0`} />
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
        <TrendIcon className={`w-4 h-4 ${trendColor[device.trend]}`} />
      </div>
      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-0.5 leading-tight">{device.name}</p>
      <p className="text-xs text-slate-400 mb-3">{device.type}</p>
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 mb-3">
        <p className="text-lg font-bold font-mono text-slate-900 dark:text-white">
          {device.readingValue} <span className="text-xs text-slate-400 font-normal">{device.readingUnit}</span>
        </p>
        <p className="text-xs text-slate-400">{device.lastReading}</p>
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
  const TrendIcon = trendIcon[device.trend];

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
                <p className="text-lg font-bold">{device.readingValue || "—"}</p>
                <p className="text-xs text-blue-200">{device.readingUnit || "Status"}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <TrendIcon className={`w-5 h-5 ${trendColor[device.trend]}`} />
                </div>
                <p className="text-xs text-blue-200 mt-0.5">Trend</p>
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

            {/* 12h Trend Chart */}
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" /> 24h Parameter Trend
              </p>
              <div className="h-36 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={device.history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="drawerGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="url(#drawerGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
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
                  ["Engineer", device.engineer || "Unassigned"],
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
              {[
                { std: "IEC 60601-1", ok: device.status !== "cal-due" && device.status !== "offline" },
                { std: "NABH Equipment Protocol", ok: device.status === "online" || device.status === "maintenance" },
                { std: "Calibration Current", ok: device.status !== "cal-due" },
                { std: "PPM On Schedule", ok: device.status !== "offline" && device.status !== "cal-due" },
              ].map(({ std, ok }) => (
                <div key={std} className="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                  <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{std}</span>
                  <span className={`text-xs font-medium ${ok ? "text-emerald-600" : "text-red-600"}`}>{ok ? "✓ OK" : "⚠ Review"}</span>
                </div>
              ))}
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

  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => { setRefreshing(false); setLastRefresh(new Date()); }, 1200);
  }, []);

  useEffect(() => {
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
  };

  const alertDevices = devices.filter(d => d.alerts.length > 0 || d.status === "offline" || d.status === "warning");

  const wardNames = wards.filter(w => w !== "All Wards");
  const wardData = wardNames.map(w => ({
    ward: w,
    online:  devices.filter(d => d.ward === w && d.status === "online").length,
    warning: devices.filter(d => d.ward === w && d.status === "warning").length,
    offline: devices.filter(d => d.ward === w && (d.status === "offline" || d.status === "maintenance" || d.status === "cal-due")).length,
  })).filter(w => w.online + w.warning + w.offline > 0);

  return (
    <div className="space-y-6 pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-6 h-6 text-blue-600" /> Device Monitoring
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Real-time status for {devices.length} devices · Last refresh: {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
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
            <BarChart3 className="w-4 h-4 text-blue-500" /> Device Status by Ward
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wardData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="ward" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="online"  name="Online"  fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="warning" name="Warning" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="offline" name="Issue"   fill="#ef4444" radius={[3, 3, 0, 0]} />
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
            {wards.map(w => <option key={w}>{w}</option>)}
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
            <p className="font-medium">No devices match your filters</p>
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
