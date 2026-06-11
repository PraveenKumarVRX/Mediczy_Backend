/**
 * HyperGrid IoT & Edge Intelligence View
 * Covers: MQTT device fabric, Edge gateway fleet, live readings, connectors, DICOM worklist
 */

import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import api from "@/utils/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  Radio, Server, Wifi, WifiOff, RefreshCw, GitBranch,
  MonitorCheck, Stethoscope, Activity, AlertTriangle,
  ClipboardList, Camera, PackageCheck, ChevronRight,
  Circle, Router, Thermometer, Heart, Gauge,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────
type DeviceStatus = "online" | "offline" | "maintenance";

interface MQTTDevice {
  id: string;
  name: string;
  type: string;
  status: DeviceStatus;
  facilityId: string;
  lastSeen?: string;
  topic?: string;
}

interface EdgeGateway {
  id: string;
  facilityId: string;
  status: DeviceStatus;
  deviceCount: number;
  pendingSync: number;
  lastHeartbeat?: string;
  version?: string;
}

interface EquipmentCoverage {
  id: string;
  name: string;
  category: string;
  protocols: string[];
  coverage: string;
  connected: boolean;
}

interface EquipmentInventoryItem {
  id: number;
  equipment_class: string;
  device_name: string;
  manufacturer?: string;
  model?: string;
  department?: string;
  protocol?: string;
  owner_department?: string;
  integration_status: string;
}

// ── Fake data (used until real API responds) ────────────────────────────────
const fakeDevices: MQTTDevice[] = [
  { id: "dev-001", name: "ECG Monitor Bed-3A",   type: "ecg_monitor",     status: "online",      facilityId: "hosp-01", lastSeen: "2s ago",    topic: "devices/ecg/hosp-01/bed-3a" },
  { id: "dev-002", name: "Pulse Ox ICU-2",        type: "pulse_oximeter",  status: "online",      facilityId: "hosp-01", lastSeen: "4s ago",    topic: "devices/pulseox/hosp-01/icu-2" },
  { id: "dev-003", name: "Ventilator ICU-1",      type: "ventilator",      status: "online",      facilityId: "hosp-01", lastSeen: "8s ago",    topic: "devices/ventilator/hosp-01/icu-1" },
  { id: "dev-004", name: "Smart Glucometer W-4",  type: "glucometer",      status: "online",      facilityId: "hosp-02", lastSeen: "15s ago",   topic: "devices/glucose/hosp-02/ward-4" },
  { id: "dev-005", name: "Infusion Pump B-7",     type: "infusion_pump",   status: "maintenance", facilityId: "hosp-02", lastSeen: "2 min ago", topic: "devices/infusion/hosp-02/bed-7" },
  { id: "dev-006", name: "CT Scanner Radiology",  type: "ct_scanner",      status: "online",      facilityId: "hosp-01", lastSeen: "1 min ago", topic: "devices/ct/hosp-01/radiology" },
  { id: "dev-007", name: "Wearable Band P-102",   type: "wearable",        status: "online",      facilityId: "clinic-01",lastSeen: "30s ago",  topic: "devices/wearable/clinic-01/p102" },
  { id: "dev-008", name: "BP Monitor OPD-1",      type: "bp_monitor",      status: "offline",     facilityId: "clinic-01",lastSeen: "12 min ago",topic: "devices/bp/clinic-01/opd-1" },
];

const fakeGateways: EdgeGateway[] = [
  { id: "gw-hosp-01",   facilityId: "City General Hospital",    status: "online",      deviceCount: 24, pendingSync: 0,  lastHeartbeat: "8s ago",   version: "1.3.2" },
  { id: "gw-hosp-02",   facilityId: "Sunrise Medical Centre",   status: "online",      deviceCount: 18, pendingSync: 3,  lastHeartbeat: "12s ago",  version: "1.3.1" },
  { id: "gw-clinic-01", facilityId: "Sharma Clinic",            status: "online",      deviceCount: 6,  pendingSync: 0,  lastHeartbeat: "1 min ago",version: "1.2.8" },
  { id: "gw-amb-01",    facilityId: "Ambulance Fleet (North)",  status: "degraded",    deviceCount: 4,  pendingSync: 7,  lastHeartbeat: "3 min ago",version: "1.3.0" },
  { id: "gw-diag-01",   facilityId: "PathLab Diagnostics",      status: "offline",     deviceCount: 0,  pendingSync: 0,  lastHeartbeat: "1 h ago",  version: "1.2.5" },
];

const fakeConnectors = [
  { name: "HL7 v2 Inbound",   type: "hl7v2",   status: "active",      pack: "Hospital Core v2", mappings: 12 },
  { name: "FHIR R4 REST",     type: "fhir_r4", status: "active",      pack: "FHIR R4 Full",     mappings: 28 },
  { name: "ABHA Bridge",      type: "abha",    status: "certified",   pack: "India ABHA v1",    mappings: 5 },
  { name: "IHX Claims API",   type: "ihx",     status: "configured",  pack: "Claims Pro",       mappings: 9 },
  { name: "Lab (LIS)",        type: "lis",     status: "active",      pack: "Lab Suite v1",     mappings: 7 },
  { name: "NHA Claims",       type: "nha",     status: "draft",       pack: "Custom",           mappings: 0 },
];

const fakeReadingsTrend = Array.from({ length: 20 }, (_, i) => ({
  t: `${i}:00`,
  heartRate: Math.round(68 + Math.random() * 20),
  spo2:      Math.round(95 + Math.random() * 4),
  temp:      parseFloat((36.5 + Math.random() * 1.5).toFixed(1)),
}));

const fakeDicomWorklist = [
  { accession: "ACC-2024-9011", patient: "Ramesh K.",    modality: "CT",  status: "pending",    submitted: "Today 08:30" },
  { accession: "ACC-2024-9012", patient: "Priya S.",     modality: "MRI", status: "processing", submitted: "Today 09:15" },
  { accession: "ACC-2024-9013", patient: "Mohan V.",     modality: "X-Ray",status:"completed",  submitted: "Yesterday"   },
  { accession: "ACC-2024-9014", patient: "Asha T.",      modality: "USG", status: "pending",    submitted: "Today 10:00" },
  { accession: "ACC-2024-9015", patient: "Sunita G.",    modality: "PET", status: "pending",    submitted: "Today 10:45" },
];

// ── Small helpers ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    online:      "bg-green-100 text-green-700",
    offline:     "bg-red-100 text-red-700",
    degraded:    "bg-yellow-100 text-yellow-700",
    maintenance: "bg-orange-100 text-orange-700",
    active:      "bg-green-100 text-green-700",
    certified:   "bg-blue-100 text-blue-700",
    configured:  "bg-indigo-100 text-indigo-700",
    draft:       "bg-gray-100 text-gray-600",
    pending:     "bg-yellow-100 text-yellow-700",
    processing:  "bg-indigo-100 text-indigo-700",
    completed:   "bg-green-100 text-green-700",
  };
  return (
    <Badge className={`text-xs capitalize ${styles[status] ?? "bg-gray-100"}`}>
      {status}
    </Badge>
  );
}

const DEVICE_ICON: Record<string, React.ElementType> = {
  ecg_monitor: Heart, pulse_oximeter: Activity, ventilator: Gauge,
  glucometer: Thermometer, infusion_pump: Stethoscope, ct_scanner: Camera,
  wearable: Radio, bp_monitor: Gauge,
};

// ── Main ────────────────────────────────────────────────────────────────────
export default function HyperGridIoTView() {
  const [devices,   setDevices]   = useState<MQTTDevice[]>([]);
  const [gateways,  setGateways]  = useState<EdgeGateway[]>([]);
  const [brokerStats, setBrokerStats] = useState<any>(null);
  const [equipmentCoverage, setEquipmentCoverage] = useState<EquipmentCoverage[]>([]);
  const [coverageSummary, setCoverageSummary] = useState<any>(null);
  const [equipmentInventory, setEquipmentInventory] = useState<EquipmentInventoryItem[]>([]);
  const [rolloutSummary, setRolloutSummary] = useState<any>(null);
  const [loading,   setLoading]   = useState(false);
  const [registration, setRegistration] = useState({ equipmentClass: '', deviceName: '', manufacturer: '', model: '', serialNumber: '', department: '', location: '', protocol: '', ownerDepartment: 'Biomedical', notes: '' });
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [devRes, gwRes, brokerRes, coverageRes, inventoryRes, rolloutRes] = await Promise.allSettled([
        api.get("/hypergrid/mqtt/devices"),
        api.get("/hypergrid/edge/fleet/status"),
        api.get("/hypergrid/mqtt/broker/stats"),
        api.get("/hypergrid/connectors/equipment/coverage"),
        api.get("/hypergrid/connectors/equipment/inventory"),
        api.get("/hypergrid/connectors/equipment/rollout"),
      ]);
      if (devRes.status === "fulfilled" && devRes.value.data.devices?.length) {
        setDevices(devRes.value.data.devices);
      } else {
        setDevices(fakeDevices);
      }
      if (gwRes.status === "fulfilled" && gwRes.value.data.gateways?.length) {
        setGateways(gwRes.value.data.gateways);
      } else {
        setGateways(fakeGateways);
      }
      if (brokerRes.status === "fulfilled") {
        setBrokerStats(brokerRes.value.data);
      }
      if (coverageRes.status === "fulfilled") {
        setEquipmentCoverage(coverageRes.value.data.equipment || []);
        setCoverageSummary(coverageRes.value.data.summary || null);
      }
      if (inventoryRes.status === "fulfilled") setEquipmentInventory(inventoryRes.value.data.equipment || []);
      if (rolloutRes.status === "fulfilled") setRolloutSummary(rolloutRes.value.data.data || null);
    } catch (_) {
      setDevices(fakeDevices);
      setGateways(fakeGateways);
    }
    setLoading(false);
    setRefreshedAt(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);

  const onlineCount  = devices.filter(d => d.status === "online").length;
  const offlineCount = devices.filter(d => d.status === "offline").length;
  const gwOnline     = gateways.filter(g => g.status === "online").length;
  const vendorQueue = equipmentInventory.filter((item) => item.equipment_class === 'proprietary-device' || item.integration_status === 'blocked');
  const registerEquipment = async () => {
    if (!registration.equipmentClass || !registration.deviceName) return;
    await api.post('/hypergrid/connectors/equipment/inventory', registration);
    setRegistration({ equipmentClass: '', deviceName: '', manufacturer: '', model: '', serialNumber: '', department: '', location: '', protocol: '', ownerDepartment: 'Biomedical', notes: '' });
    await load();
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-screen-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="h-6 w-6 text-sky-500" />
              HyperGrid IoT & Edge
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              MQTT Device Fabric · Edge Gateway Fleet · Connectors · DICOM Worklist
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{refreshedAt.toLocaleTimeString()}</span>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Devices Online",    value: onlineCount,                                               icon: Wifi,        color: "text-green-500" },
            { label: "Devices Offline",   value: offlineCount,                                              icon: WifiOff,     color: "text-red-400" },
            { label: "Gateways Online",   value: `${gwOnline} / ${gateways.length}`,                       icon: Router,      color: "text-sky-500" },
            { label: "MQTT Connected",    value: brokerStats?.connectedClients ?? devices.filter(d => d.status === "online").length, icon: Radio, color: "text-indigo-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="devices" className="mt-2">
          <TabsList>
            <TabsTrigger value="devices">MQTT Devices</TabsTrigger>
            <TabsTrigger value="gateways">Edge Gateways</TabsTrigger>
            <TabsTrigger value="readings">Live Readings</TabsTrigger>
            <TabsTrigger value="connectors">Connectors</TabsTrigger>
            <TabsTrigger value="equipment">Equipment Coverage</TabsTrigger>
            <TabsTrigger value="dicom">DICOM Worklist</TabsTrigger>
          </TabsList>

          {/* ── MQTT DEVICES ── */}
          <TabsContent value="devices" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Radio className="h-4 w-4 text-sky-500" />
                    Registered MQTT Devices
                  </CardTitle>
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    + Register Device
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 pr-4">Device</th>
                        <th className="text-left pb-2 pr-4">Type</th>
                        <th className="text-left pb-2 pr-4">Facility</th>
                        <th className="text-left pb-2 pr-4">Topic</th>
                        <th className="text-left pb-2 pr-4">Status</th>
                        <th className="text-left pb-2">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {devices.map(dev => {
                        const Icon = DEVICE_ICON[dev.type] ?? Radio;
                        return (
                          <tr key={dev.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2 pr-4 font-medium flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                              {dev.name}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge variant="outline" className="text-xs capitalize">
                                {dev.type.replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground text-xs">{dev.facilityId}</td>
                            <td className="py-2 pr-4 text-muted-foreground text-xs font-mono">{dev.topic ?? "—"}</td>
                            <td className="py-2 pr-4"><StatusBadge status={dev.status} /></td>
                            <td className="py-2 text-xs text-muted-foreground">{dev.lastSeen ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── EDGE GATEWAYS ── */}
          <TabsContent value="gateways" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {gateways.map(gw => (
                <Card key={gw.id} className={`border-l-4 ${
                  gw.status === "online" ? "border-l-green-400" :
                  gw.status === "degraded" ? "border-l-yellow-400" : "border-l-red-400"
                }`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Router className="h-4 w-4 text-sky-500" />
                        {gw.facilityId}
                      </CardTitle>
                      <StatusBadge status={gw.status} />
                    </div>
                    <CardDescription className="text-xs font-mono">{gw.id}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted rounded p-2 text-center">
                        <p className="text-muted-foreground">Devices</p>
                        <p className="font-bold text-base">{gw.deviceCount}</p>
                      </div>
                      <div className={`rounded p-2 text-center ${gw.pendingSync > 0 ? "bg-yellow-50" : "bg-muted"}`}>
                        <p className="text-muted-foreground">Pending Sync</p>
                        <p className={`font-bold text-base ${gw.pendingSync > 0 ? "text-yellow-600" : ""}`}>{gw.pendingSync}</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Last heartbeat: <strong className="text-foreground">{gw.lastHeartbeat}</strong></span>
                      <span>v{gw.version}</span>
                    </div>
                    <Progress
                      value={gw.status === "online" ? 100 : gw.status === "degraded" ? 50 : 0}
                      className="h-1"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Fleet summary bar */}
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Fleet Device Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={gateways.map(g => ({ name: g.id.replace("gw-", ""), devices: g.deviceCount, sync: g.pendingSync }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="devices" fill="#6366f1" name="Devices" radius={[2,2,0,0]} />
                    <Bar dataKey="sync"    fill="#f59e0b" name="Pending Sync" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── LIVE READINGS ── */}
          <TabsContent value="readings" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  Live Telemetry Stream (Simulated — 20 samples)
                </CardTitle>
                <CardDescription>Heart rate · SpO₂ · Temperature from MQTT topics</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={fakeReadingsTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="t" tick={{ fontSize: 10 }} interval={3} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 10 }} domain={[60, 110]} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[90, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left"  type="monotone" dataKey="heartRate" stroke="#ef4444" name="Heart Rate (bpm)" dot={false} strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="spo2"      stroke="#06b6d4" name="SpO₂ (%)"         dot={false} strokeWidth={2} />
                    <Line yAxisId="left"  type="monotone" dataKey="temp"      stroke="#f59e0b" name="Temp (°C)"        dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CONNECTORS ── */}
          <TabsContent value="connectors" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {fakeConnectors.map(conn => (
                <Card key={conn.name}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-purple-500" />
                        {conn.name}
                      </CardTitle>
                      <StatusBadge status={conn.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Type</span>
                      <Badge variant="outline" className="text-xs uppercase">{conn.type}</Badge>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Pack</span>
                      <span className="font-medium text-foreground">{conn.pack}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Mappings</span>
                      <span className="font-semibold text-foreground">{conn.mappings}</span>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
                        Configure <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="equipment" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Hospital Equipment Integration Coverage</CardTitle>
                <CardDescription>Protocol support, onboarding readiness, and vendor-adapter gaps by equipment class.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Equipment classes', value: coverageSummary?.totalClasses ?? equipmentCoverage.length },
                    { label: 'Connected now', value: coverageSummary?.connectedClasses ?? 0 },
                    { label: 'Supported classes', value: coverageSummary?.supportedClasses ?? 0 },
                    { label: 'Vendor adapters needed', value: coverageSummary?.vendorAdapterClasses ?? 0 },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-xl font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  {['identified','protocol_confirmed','mapped','certified','active'].map((status) => (
                    <div key={status} className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground capitalize">{status.replace(/_/g, ' ')}</p>
                      <p className="text-xl font-semibold">{rolloutSummary?.byStatus?.[status] ?? 0}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">Rollout sequence</p>
                  <p className="mt-1 text-muted-foreground">{(rolloutSummary?.nextSteps || []).join(' -> ')}</p>
                </div>
                <div className="rounded-md border p-4 space-y-3">
                  <p className="text-sm font-medium">Register Device For Integration</p>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Equipment class" value={registration.equipmentClass} onChange={(e)=>setRegistration({...registration,equipmentClass:e.target.value})} />
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Device name" value={registration.deviceName} onChange={(e)=>setRegistration({...registration,deviceName:e.target.value})} />
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Manufacturer" value={registration.manufacturer} onChange={(e)=>setRegistration({...registration,manufacturer:e.target.value})} />
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Model" value={registration.model} onChange={(e)=>setRegistration({...registration,model:e.target.value})} />
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Serial number" value={registration.serialNumber} onChange={(e)=>setRegistration({...registration,serialNumber:e.target.value})} />
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Department" value={registration.department} onChange={(e)=>setRegistration({...registration,department:e.target.value})} />
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Location" value={registration.location} onChange={(e)=>setRegistration({...registration,location:e.target.value})} />
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Protocol" value={registration.protocol} onChange={(e)=>setRegistration({...registration,protocol:e.target.value})} />
                    <input className="h-9 rounded-md border px-3 text-sm" placeholder="Owner department" value={registration.ownerDepartment} onChange={(e)=>setRegistration({...registration,ownerDepartment:e.target.value})} />
                  </div>
                  <textarea className="min-h-20 w-full rounded-md border p-3 text-sm" placeholder="Notes" value={registration.notes} onChange={(e)=>setRegistration({...registration,notes:e.target.value})} />
                  <Button size="sm" onClick={registerEquipment}>Register Device</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 pr-4">Equipment</th>
                        <th className="text-left pb-2 pr-4">Category</th>
                        <th className="text-left pb-2 pr-4">Protocols</th>
                        <th className="text-left pb-2 pr-4">Coverage</th>
                        <th className="text-left pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {equipmentCoverage.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 pr-4 font-medium">{item.name}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{item.category}</td>
                          <td className="py-2 pr-4 text-xs">{item.protocols.join(', ')}</td>
                          <td className="py-2 pr-4"><StatusBadge status={item.coverage.replace(/_/g, ' ')} /></td>
                          <td className="py-2"><StatusBadge status={item.connected ? 'online' : 'pending'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Vendor Adapter Work Queue</p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-left">Device</th><th className="p-2 text-left">Manufacturer</th><th className="p-2 text-left">Protocol</th><th className="p-2 text-left">Owner</th><th className="p-2 text-left">Reason</th></tr></thead><tbody className="divide-y">{vendorQueue.map((item)=><tr key={item.id}><td className="p-2">{item.device_name}</td><td className="p-2">{item.manufacturer || 'Unknown'}</td><td className="p-2">{item.protocol || 'Vendor adapter needed'}</td><td className="p-2">{item.owner_department || 'Pending'}</td><td className="p-2">{item.integration_status === 'blocked' ? 'Blocked' : 'Proprietary interface'}</td></tr>)}</tbody></table>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Actual Device Onboarding Register</p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-left">Device</th><th className="p-2 text-left">Class</th><th className="p-2 text-left">Dept</th><th className="p-2 text-left">Protocol</th><th className="p-2 text-left">Owner</th><th className="p-2 text-left">Rollout</th></tr></thead>
                      <tbody className="divide-y">{equipmentInventory.map((item) => <tr key={item.id}><td className="p-2"><div className="font-medium">{item.device_name}</div><div className="text-xs text-muted-foreground">{[item.manufacturer,item.model].filter(Boolean).join(' ')}</div></td><td className="p-2">{item.equipment_class}</td><td className="p-2">{item.department || 'Unassigned'}</td><td className="p-2">{item.protocol || 'Pending'}</td><td className="p-2">{item.owner_department || 'Pending'}</td><td className="p-2"><StatusBadge status={item.integration_status.replace(/_/g, ' ')} /></td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DICOM WORKLIST ── */}
          <TabsContent value="dicom" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Camera className="h-4 w-4 text-cyan-500" />
                    DICOM Imaging Worklist
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge className="text-xs bg-yellow-100 text-yellow-700">
                      {fakeDicomWorklist.filter(d => d.status === "pending").length} pending
                    </Badge>
                    <Button size="sm" variant="outline" className="h-7 text-xs">STOW-RS Upload</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 pr-4">Accession</th>
                        <th className="text-left pb-2 pr-4">Patient</th>
                        <th className="text-left pb-2 pr-4">Modality</th>
                        <th className="text-left pb-2 pr-4">Status</th>
                        <th className="text-left pb-2">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {fakeDicomWorklist.map(item => (
                        <tr key={item.accession} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-mono text-xs">{item.accession}</td>
                          <td className="py-2 pr-4 font-medium">{item.patient}</td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className="text-xs">{item.modality}</Badge>
                          </td>
                          <td className="py-2 pr-4"><StatusBadge status={item.status} /></td>
                          <td className="py-2 text-xs text-muted-foreground">{item.submitted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Endpoints: <code className="bg-muted px-1 rounded">POST /api/hypergrid/dicom/stow-rs</code>
                  · <code className="bg-muted px-1 rounded">GET /api/hypergrid/dicom/wado-rs/:uid</code>
                  · <code className="bg-muted px-1 rounded">GET /api/hypergrid/dicom/worklist</code>
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
