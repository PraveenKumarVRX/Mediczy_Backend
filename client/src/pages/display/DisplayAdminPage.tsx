import React, { useEffect, useState, useCallback } from 'react';
import HospDeptLayout from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, Wifi, WifiOff, AlertTriangle, PlusCircle, Trash2, Megaphone, RefreshCw } from 'lucide-react';

interface Device {
  id: number;
  device_token: string;
  name: string;
  zone_id: string;
  display_type: string;
  url_path: string;
  ip_address: string;
  last_seen: string | null;
  active: boolean;
}

interface Broadcast {
  id: number;
  title: string;
  message: string;
  severity: string;
  zone_id: string | null;
  pushed_by: string;
  created_at: string;
}

interface Stats {
  connected: number;
  byZone: Record<string, number>;
}

const ZONE_CATALOG = [
  'main-entrance', 'opd-waiting', 'opd-counter', 'pharmacy-waiting',
  'lab-waiting', 'radiology-waiting', 'er-triage', 'er-waiting',
  'icu', 'ot-complex', 'ward-general', 'ward-private',
  'blood-bank', 'cssd', 'discharge-lounge', 'insurance-desk', 'cafeteria', 'bedside',
];

const DISPLAY_TYPES = [
  { type: 'opd-queue', label: 'OPD Queue Board', path: '/display/queue' },
  { type: 'self-checkin', label: 'Self Check-in Kiosk', path: '/kiosk/checkin' },
  { type: 'icu-board', label: 'ICU Board', path: '/display/icu-board' },
  { type: 'ot-status', label: 'OT Status', path: '/display/ot-status' },
  { type: 'ward-nursing', label: 'Ward Nursing Station', path: '/display/ward' },
  { type: 'bedside', label: 'Bedside Terminal', path: '/display/bedside' },
  { type: 'blood-bank', label: 'Blood Bank Inventory', path: '/display/blood-bank' },
  { type: 'discharge-status', label: 'Discharge Status Lounge', path: '/display/discharge-status' },
  { type: 'command-centre', label: 'Command Centre KPI Wall', path: '/display/command' },
  { type: 'floor-map', label: 'Digital Twin Floor Map', path: '/display/floor-map' },
  { type: 'family-video', label: 'Family Video Kiosk', path: '/kiosk/family-video' },
  { type: 'er-triage-kiosk', label: 'ER Tele-Triage Kiosk', path: '/kiosk/er-triage' },
  { type: 'er-triage-board', label: 'ER Triage Queue Board', path: '/display/er-triage' },
  { type: 'queue-console', label: 'Queue Console', path: '/hospital/queue-console' },
];

const navSections = [
  { title: 'Display Control', items: [{ label: 'Overview', href: '/display/admin' }] },
];

export default function DisplayAdminPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [newDevice, setNewDevice] = useState({ name: '', zone_id: '', display_type: '', ip_address: '' });
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', severity: 'critical', zone_id: '' });
  const [broadcastSent, setBroadcastSent] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [devRes, brRes, stRes] = await Promise.all([
        fetch('/api/display/devices', { headers: authHeaders() }),
        fetch('/api/display/emergency', { headers: authHeaders() }),
        fetch('/api/display/stats'),
      ]);
      const [devJson, brJson, stJson] = await Promise.all([devRes.json(), brRes.json(), stRes.json()]);
      if (devJson.success) setDevices(devJson.devices);
      if (brJson.success) setBroadcasts(brJson.broadcasts);
      if (stJson.success) setStats(stJson);
    } catch (_) {} finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const registerDevice = async () => {
    if (!newDevice.name || !newDevice.display_type) return;
    const dt = DISPLAY_TYPES.find(d => d.type === newDevice.display_type);
    try {
      await fetch('/api/display/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ...newDevice, url_path: dt?.path }),
      });
      setNewDevice({ name: '', zone_id: '', display_type: '', ip_address: '' });
      setShowRegister(false);
      fetchAll();
    } catch (_) {}
  };

  const deactivateDevice = async (token: string) => {
    await fetch(`/api/display/devices/${token}`, { method: 'DELETE', headers: authHeaders() });
    fetchAll();
  };

  const sendBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.message) return;
    try {
      await fetch('/api/display/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(broadcastForm),
      });
      setBroadcastSent(true);
      setBroadcastForm({ title: '', message: '', severity: 'critical', zone_id: '' });
      setShowBroadcast(false);
      fetchAll();
      setTimeout(() => setBroadcastSent(false), 4000);
    } catch (_) {}
  };

  const dismissBroadcast = async (id: number) => {
    await fetch(`/api/display/emergency/${id}`, { method: 'DELETE', headers: authHeaders() });
    fetchAll();
  };

  const lastSeenText = (ls: string | null) => {
    if (!ls) return 'Never';
    const mins = Math.floor((Date.now() - new Date(ls).getTime()) / 60000);
    if (mins < 2) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return new Date(ls).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <HospDeptLayout
      deptKey="hospital"
      deptName="Display & Kiosk Control"
      badgeLabel="Displays"
      loginPath="/hospital/login"
      DeptIcon={Monitor}
      navSections={navSections}
      title="Display Control Centre"
      subtitle="Manage all hospital kiosks, boards, and emergency broadcasts"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Registered Devices</p>
            <p className="text-3xl font-black mt-1">{devices.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Live Connections</p>
            <p className="text-3xl font-black mt-1 text-teal-600">{stats?.connected ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Active Broadcasts</p>
            <p className={`text-3xl font-black mt-1 ${broadcasts.length > 0 ? 'text-red-600' : ''}`}>
              {broadcasts.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Active Zones</p>
            <p className="text-3xl font-black mt-1">{stats ? Object.keys(stats.byZone).length : '—'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device list */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Monitor className="h-4 w-4 text-teal-600" /> Registered Devices
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1 text-xs">
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
              <Button size="sm" className="gap-1 text-xs bg-teal-600 hover:bg-teal-700" onClick={() => setShowRegister(!showRegister)}>
                <PlusCircle className="h-3 w-3" /> Register
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Register form */}
            {showRegister && (
              <div className="mb-4 p-4 bg-muted/40 rounded-xl border space-y-3">
                <h4 className="text-sm font-semibold">Register New Device</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="border rounded-lg px-3 py-2 text-sm bg-background"
                    placeholder="Device name (e.g. OPD Queue TV-1)"
                    value={newDevice.name}
                    onChange={e => setNewDevice(d => ({ ...d, name: e.target.value }))}
                  />
                  <input
                    className="border rounded-lg px-3 py-2 text-sm bg-background"
                    placeholder="IP address (optional)"
                    value={newDevice.ip_address}
                    onChange={e => setNewDevice(d => ({ ...d, ip_address: e.target.value }))}
                  />
                  <select
                    className="border rounded-lg px-3 py-2 text-sm bg-background"
                    value={newDevice.display_type}
                    onChange={e => setNewDevice(d => ({ ...d, display_type: e.target.value }))}
                  >
                    <option value="">Select display type</option>
                    {DISPLAY_TYPES.map(dt => (
                      <option key={dt.type} value={dt.type}>{dt.label}</option>
                    ))}
                  </select>
                  <select
                    className="border rounded-lg px-3 py-2 text-sm bg-background"
                    value={newDevice.zone_id}
                    onChange={e => setNewDevice(d => ({ ...d, zone_id: e.target.value }))}
                  >
                    <option value="">Select zone</option>
                    {ZONE_CATALOG.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={registerDevice}>Register</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowRegister(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading devices…</p>
            ) : devices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No devices registered yet</p>
            ) : (
              <div className="space-y-2">
                {devices.map(dev => {
                  const isOnline = dev.last_seen && (Date.now() - new Date(dev.last_seen).getTime()) < 60000;
                  return (
                    <div key={dev.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-teal-400' : 'bg-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{dev.name}</p>
                        <p className="text-xs text-muted-foreground">{dev.display_type} · {dev.zone_id} · Last seen: {lastSeenText(dev.last_seen)}</p>
                      </div>
                      <code className="text-xs text-muted-foreground font-mono hidden lg:block">{dev.device_token.slice(0, 12)}…</code>
                      {isOnline ? <Wifi className="h-4 w-4 text-teal-500 shrink-0" /> : <WifiOff className="h-4 w-4 text-gray-400 shrink-0" />}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => deactivateDevice(dev.device_token)}
                        className="text-red-500 hover:text-red-600 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emergency broadcast + active alerts */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-red-500" /> Emergency Broadcast
              </CardTitle>
            </CardHeader>
            <CardContent>
              {broadcastSent && (
                <p className="text-sm text-teal-600 mb-3 font-medium">✓ Broadcast sent to all displays</p>
              )}
              {showBroadcast ? (
                <div className="space-y-3">
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    placeholder="Alert title (e.g. Code Blue — ICU)"
                    value={broadcastForm.title}
                    onChange={e => setBroadcastForm(f => ({ ...f, title: e.target.value }))}
                  />
                  <textarea
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                    rows={3}
                    placeholder="Alert message…"
                    value={broadcastForm.message}
                    onChange={e => setBroadcastForm(f => ({ ...f, message: e.target.value }))}
                  />
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    value={broadcastForm.severity}
                    onChange={e => setBroadcastForm(f => ({ ...f, severity: e.target.value }))}
                  >
                    <option value="critical">🔴 Critical</option>
                    <option value="warning">🟡 Warning</option>
                    <option value="info">🔵 Information</option>
                  </select>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    value={broadcastForm.zone_id}
                    onChange={e => setBroadcastForm(f => ({ ...f, zone_id: e.target.value }))}
                  >
                    <option value="">📢 All zones (hospital-wide)</option>
                    {ZONE_CATALOG.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700" onClick={sendBroadcast}>
                      Send Broadcast
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowBroadcast(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full bg-red-600 hover:bg-red-700 gap-2"
                  onClick={() => setShowBroadcast(true)}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Push Emergency Alert
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Active broadcasts */}
          {broadcasts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Active Alerts ({broadcasts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {broadcasts.map(b => (
                  <div key={b.id} className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{b.title}</p>
                        <p className="text-xs text-muted-foreground">{b.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {b.zone_id ? `Zone: ${b.zone_id}` : 'All zones'} · by {b.pushed_by}
                        </p>
                      </div>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => dismissBroadcast(b.id)}
                        className="shrink-0 text-xs"
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Live connections by zone */}
          {stats && Object.keys(stats.byZone).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-teal-500" /> Live Connections
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {Object.entries(stats.byZone).map(([zone, count]) => (
                  <div key={zone} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">{zone}</span>
                    <Badge variant="secondary" className="text-xs">{count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Quick launch links */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Quick Launch Display URLs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DISPLAY_TYPES.map(dt => (
              <a
                key={dt.type}
                href={dt.path}
                target="_blank"
                rel="noreferrer"
                className="block p-3 border rounded-xl hover:bg-muted/50 transition-colors text-center"
              >
                <Monitor className="h-5 w-5 mx-auto mb-1 text-teal-600" />
                <p className="text-xs font-medium">{dt.label}</p>
                <p className="text-xs text-muted-foreground font-mono">{dt.path}</p>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </HospDeptLayout>
  );
}
