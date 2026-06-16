/**
 * DeviceIntegration — Unified Device Hub
 *
 * Categories:
 *  1. Fitness Watches / Bands  (BLE / Health Connect)
 *  2. CGM Devices              (Dexcom, FreeStyle Libre, Nightscout)
 *  3. Blood Pressure Monitors  (BLE — Omron, iHealth, Withings)
 *  4. Glucometers              (BLE — Accu-Chek, OneTouch)
 *  5. Platform Aggregators     (Google Fit / Health Connect, Apple Health)
 *  6. My Devices               (paired devices from backend + localStorage)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Watch, Activity, Bluetooth, CheckCircle, XCircle, RefreshCw,
  Plus, Heart, Droplets, Thermometer, Link2, Settings, Info,
  Smartphone, Zap, Shield,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/utils/api';
import bleService from '@/services/ble/BLEService';
import veepooService from '@/services/ble/VeepooService';
import fireBolttService, { FIREBOLTT_SERVICE_UUID } from '@/services/ble/FireBolttService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PairedDevice {
  id: string;
  device_id?: string;
  deviceId?: string;
  device_name?: string;
  name?: string;
  type?: string;
  brand?: string;
  model?: string;
  battery?: number;
  last_sync?: string;
  lastSync?: string;
  // extra flags from localStorage
  isVeepooDevice?: boolean;
  isFireBolttDevice?: boolean;
}

type ModalType =
  | 'dexcom'
  | 'libre'
  | 'nightscout'
  | 'fitbit-oauth'
  | 'garmin-oauth'
  | 'apple-health'
  | 'google-fit'
  | null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLastSyncDate(device: PairedDevice): Date | null {
  const raw = device.last_sync ?? device.lastSync ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function syncStatus(device: PairedDevice): 'green' | 'amber' | 'red' {
  const last = getLastSyncDate(device);
  if (!last) return 'red';
  const diffMin = (Date.now() - last.getTime()) / 60000;
  if (diffMin <= 30) return 'green';
  if (diffMin <= 1440) return 'amber';
  return 'red';
}

const STATUS_DOT: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-teal-400',
  amber: 'bg-amber-400',
  red:   'bg-red-500',
};

function formatRelative(date: Date | null): string {
  if (!date) return 'Never';
  const diff = Math.round((Date.now() - date.getTime()) / 60000);
  if (diff < 1)   return 'Just now';
  if (diff < 60)  return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function lsDevices(): PairedDevice[] {
  try {
    return JSON.parse(localStorage.getItem('connectedDevices') || '[]');
  } catch {
    return [];
  }
}

function saveLsDevice(dev: PairedDevice) {
  const list = lsDevices();
  const idx = list.findIndex(d => (d.id ?? d.device_id) === (dev.id ?? dev.device_id));
  if (idx >= 0) list[idx] = { ...list[idx], ...dev };
  else list.push(dev);
  localStorage.setItem('connectedDevices', JSON.stringify(list));
}

function removeLsDevice(id: string) {
  const list = lsDevices().filter(d => (d.id ?? d.device_id) !== id);
  localStorage.setItem('connectedDevices', JSON.stringify(list));
}

// ─── Section configs ──────────────────────────────────────────────────────────

const FITNESS_WATCHES = [
  {
    id: 'apple-watch',
    name: 'Apple Watch',
    description: 'Health data via Apple Health / HealthKit',
    icon: '⌚',
    flow: 'apple-health' as ModalType,
    tags: ['HR', 'Steps', 'Sleep', 'ECG', 'SpO2'],
  },
  {
    id: 'samsung-watch',
    name: 'Samsung Galaxy Watch',
    description: 'Sync via Google Health Connect',
    icon: '⌚',
    flow: 'google-fit' as ModalType,
    tags: ['HR', 'Steps', 'Sleep', 'BP'],
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    description: 'Fitbit OAuth API',
    icon: '📿',
    flow: 'fitbit-oauth' as ModalType,
    tags: ['HR', 'Steps', 'Sleep', 'Calories'],
  },
  {
    id: 'garmin',
    name: 'Garmin',
    description: 'Garmin Connect OAuth API',
    icon: '⌚',
    flow: 'garmin-oauth' as ModalType,
    tags: ['HR', 'Steps', 'GPS', 'SpO2'],
  },
  {
    id: 'mi-band',
    name: 'Mi Band / Xiaomi',
    description: 'Direct BLE pairing',
    icon: '📿',
    flow: 'ble-generic' as const,
    tags: ['HR', 'Steps', 'Sleep'],
  },
  {
    id: 'fire-boltt',
    name: 'Fire-Boltt',
    description: 'Direct BLE pairing',
    icon: '⌚',
    flow: 'ble-fireboltt' as const,
    tags: ['HR', 'SpO2', 'BP', 'Steps'],
  },
  {
    id: 'veepoo',
    name: 'Veepoo (VE30 / VE20 / VE40)',
    description: 'Direct BLE pairing via HBand SDK',
    icon: '⌚',
    flow: 'ble-veepoo' as const,
    tags: ['HR', 'BP', 'SpO2', 'HRV', 'Steps'],
  },
  {
    id: 'generic-ble',
    name: 'Generic BLE Watch',
    description: 'Any Bluetooth LE wearable',
    icon: '📱',
    flow: 'ble-generic' as const,
    tags: ['HR', 'Steps'],
  },
];

const CGM_DEVICES = [
  {
    id: 'dexcom',
    name: 'Dexcom G6 / G7',
    description: 'Requires Dexcom Share enabled in Dexcom app',
    icon: '📡',
    flow: 'dexcom' as ModalType,
    tags: ['Continuous Glucose', 'Alerts'],
  },
  {
    id: 'libre',
    name: 'FreeStyle Libre 2 / 3',
    description: 'BLE direct + LibreLink polling',
    icon: '📡',
    flow: 'libre' as ModalType,
    tags: ['Continuous Glucose', 'Trends'],
  },
  {
    id: 'nightscout',
    name: 'Nightscout',
    description: 'Enter your Nightscout URL to pull CGM readings',
    icon: '🌐',
    flow: 'nightscout' as ModalType,
    tags: ['CGM Data', 'Self-hosted'],
  },
];

const BP_MONITORS = [
  {
    id: 'omron',
    name: 'Omron',
    description: 'BLE — pairs via OMRON prefix',
    icon: '🩺',
    flow: 'ble-bp-omron' as const,
    tags: ['Systolic', 'Diastolic', 'HR'],
  },
  {
    id: 'ihealth',
    name: 'iHealth',
    description: 'BLE — GATT Blood Pressure Service',
    icon: '🩺',
    flow: 'ble-bp' as const,
    tags: ['Systolic', 'Diastolic'],
  },
  {
    id: 'withings-bpm',
    name: 'Withings BPM',
    description: 'BLE pairing',
    icon: '🩺',
    flow: 'ble-bp' as const,
    tags: ['Systolic', 'Diastolic', 'HR'],
  },
];

const GLUCOMETERS = [
  {
    id: 'accu-chek',
    name: 'Accu-Chek',
    description: 'BLE Glucose Service',
    icon: '💉',
    flow: 'ble-glucose' as const,
    tags: ['Blood Glucose'],
  },
  {
    id: 'onetouch',
    name: 'OneTouch',
    description: 'BLE Glucose Service',
    icon: '💉',
    flow: 'ble-glucose' as const,
    tags: ['Blood Glucose'],
  },
];

const AGGREGATORS = [
  {
    id: 'google-fit',
    name: 'Google Fit / Health Connect',
    description: 'Import activity, heart rate, sleep and more from Google Health services',
    icon: '🟢',
    flow: 'google-fit-sync' as const,
    tags: ['Steps', 'HR', 'Sleep', 'Calories', 'Weight'],
  },
  {
    id: 'apple-health',
    name: 'Apple Health',
    description: 'Import HealthKit data from iPhone',
    icon: '🍎',
    flow: 'apple-health-sync' as const,
    tags: ['HR', 'Steps', 'Sleep', 'Blood Glucose', 'Weight'],
  },
];

// ─── Device Catalog Row ───────────────────────────────────────────────────────

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  flow: string;
  tags: string[];
}

const DeviceRow: React.FC<{
  entry: CatalogEntry;
  onConnect: (flow: string, id: string) => void;
  connecting: string | null;
}> = ({ entry, onConnect, connecting }) => (
  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/40 hover:border-teal-600/40 transition-colors">
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-2xl flex-shrink-0">{entry.icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{entry.name}</p>
        <p className="text-xs text-slate-400 truncate">{entry.description}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {entry.tags.map(t => (
            <Badge key={t} className="text-[10px] px-1 py-0 h-4 bg-slate-700 text-slate-300 border-0">
              {t}
            </Badge>
          ))}
        </div>
      </div>
    </div>
    <Button
      size="sm"
      variant="outline"
      className="flex-shrink-0 border-teal-500/40 text-teal-400 hover:bg-teal-500/10"
      disabled={connecting === entry.id}
      onClick={() => onConnect(entry.flow, entry.id)}
    >
      {connecting === entry.id ? (
        <RefreshCw className="w-3 h-3 animate-spin mr-1" />
      ) : (
        <Plus className="w-3 h-3 mr-1" />
      )}
      Connect
    </Button>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const DeviceIntegration: React.FC = () => {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [nightscoutUrl, setNightscoutUrl] = useState(
    () => localStorage.getItem('nightscoutUrl') ?? ''
  );
  const [nightscoutInput, setNightscoutInput] = useState(nightscoutUrl);

  // ── Fetch registered devices from backend ─────────────────────────────────
  const { data: wearablesData, isLoading: wearablesLoading, refetch: refetchWearables } = useQuery({
    queryKey: ['wearables'],
    queryFn: async () => {
      const res = await api.get('/health-data/devices');
      const devices = Array.isArray(res.data) ? res.data : res.data?.devices ?? [];
      return devices.map((device: any) => ({
        id: String(device.id ?? device.device_id ?? device.deviceId ?? 'unknown'),
        device_id: device.device_id ?? device.deviceId,
        deviceId: device.deviceId ?? device.device_id,
        device_name: device.device_name ?? device.name ?? device.deviceId ?? device.device_id ?? 'Health device',
        name: device.name ?? device.device_name,
        type: device.type ?? device.device_type ?? device.source ?? 'wearable',
        brand: device.brand,
        model: device.model,
        battery: device.battery,
        last_sync: device.last_sync ?? device.lastSyncTime ?? device.lastSync,
        lastSync: device.lastSync ?? device.last_sync ?? device.lastSyncTime,
      })) as PairedDevice[];
    },
    staleTime: 60_000,
  });

  // Merge backend devices with localStorage
  const [localDevices, setLocalDevices] = useState<PairedDevice[]>([]);
  useEffect(() => {
    setLocalDevices(lsDevices());
  }, []);

  const allDevices: PairedDevice[] = React.useMemo(() => {
    const backendIds = new Set(
      (wearablesData ?? []).map(d => d.device_id ?? d.id)
    );
    const extra = localDevices.filter(ld => !backendIds.has(ld.id ?? ld.device_id ?? ''));
    return [...(wearablesData ?? []), ...extra];
  }, [wearablesData, localDevices]);

  // ── Unregister / disconnect device ───────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      try {
        await api.delete(`/health-data/devices/${deviceId}`);
      } catch {
        // non-fatal if row missing
      }
      removeLsDevice(deviceId);
    },
    onSuccess: () => {
      setLocalDevices(lsDevices());
      queryClient.invalidateQueries({ queryKey: ['wearables'] });
      toast.success('Device removed');
    },
  });

  // ── Sync device ──────────────────────────────────────────────────────────
  const syncDevice = useCallback(async (device: PairedDevice) => {
    const id = device.device_id ?? device.deviceId ?? device.id ?? '';
    toast.info(`Syncing ${device.device_name ?? device.name ?? 'device'}…`);
    try {
      if (device.isVeepooDevice) {
        if (!veepooService.getConnectionStatus()) await veepooService.reconnect();
        if (veepooService.getConnectionStatus()) {
          await veepooService.startHeartRateMeasurement();
          toast.success('Veepoo measurement started');
        } else {
          toast.warning('Watch out of range — showing cached data');
        }
      } else if (device.isFireBolttDevice) {
        const d = await fireBolttService.syncAll();
        toast.success(`Fire-Boltt synced — HR: ${d.heartRate ?? '—'} bpm`);
      } else {
        // Generic BLE — use bleService
        const ble = bleService.getDevice(id);
        if (ble) {
          await bleService.syncDevice(id);
          toast.success('Device synced');
        } else {
          toast.info('Device not in BLE range — latest data shown from server');
        }
      }
      refetchWearables();
    } catch (e) {
      toast.error('Sync failed — ensure device is nearby and Bluetooth is on');
    }
  }, [refetchWearables]);

  // ── BLE pairing helpers ──────────────────────────────────────────────────
  const pairBleGeneric = useCallback(async (entryId: string, options?: RequestDeviceOptions) => {
    setConnecting(entryId);
    try {
      const device = await bleService.requestDevice(options);
      if (!device) { toast.info('Pairing cancelled'); return; }

      const connected = await bleService.connect(device);
      if (!connected) { toast.error('Could not connect to device'); return; }

      const newDev: PairedDevice = {
        id: device.id,
        device_id: device.id,
        device_name: device.name,
        name: device.name,
        type: device.type,
        last_sync: new Date().toISOString(),
      };

      // Register on server
      try {
        await api.post('/health-data/devices/register', {
          deviceId: device.id,
          deviceName: device.name,
          deviceType: device.type,
        });
      } catch { /* non-fatal */ }

      saveLsDevice(newDev);
      setLocalDevices(lsDevices());
      queryClient.invalidateQueries({ queryKey: ['wearables'] });
      toast.success(`${device.name} paired successfully!`);
    } catch (err: any) {
      if (err.message?.includes('not supported')) {
        toast.error('Web Bluetooth is not supported in this browser. Use Chrome on Android or desktop.');
      } else {
        toast.error(`Pairing failed: ${err.message}`);
      }
    } finally {
      setConnecting(null);
    }
  }, [queryClient]);

  const pairVeepoo = useCallback(async (entryId: string) => {
    setConnecting(entryId);
    try {
      const deviceInfo = await veepooService.connect();
      if (!deviceInfo) { toast.error('Veepoo connection failed'); return; }

      const generatedId = `veepoo-${deviceInfo.mac ?? Date.now()}`;
      const newDev: PairedDevice = {
        id: generatedId,
        device_id: generatedId,
        device_name: deviceInfo.name ?? 'Veepoo Watch',
        name: deviceInfo.name ?? 'Veepoo Watch',
        type: 'smartwatch',
        battery: deviceInfo.battery,
        isVeepooDevice: true,
        last_sync: new Date().toISOString(),
      };

      try {
        await api.post('/health-data/devices/register', {
          deviceId: newDev.device_id,
          deviceName: newDev.device_name,
          deviceType: 'smartwatch',
        });
      } catch { /* non-fatal */ }

      saveLsDevice(newDev);
      setLocalDevices(lsDevices());
      queryClient.invalidateQueries({ queryKey: ['wearables'] });
      toast.success(`${newDev.device_name} paired!`);
    } catch (err: any) {
      toast.error(`Veepoo pairing failed: ${err.message}`);
    } finally {
      setConnecting(null);
    }
  }, [queryClient]);

  const pairFireBoltt = useCallback(async (entryId: string) => {
    setConnecting(entryId);
    try {
      // Request the BLE device first, then hand the GATT server to FireBolttService
      const bleDevice = await bleService.requestDevice({
        filters: [
          { namePrefix: 'Fire-Boltt' },
          { namePrefix: 'FB' },
          { services: [FIREBOLTT_SERVICE_UUID] },
        ],
        optionalServices: ['0000180f-0000-1000-8000-00805f9b34fb'],
      });
      if (!bleDevice) { toast.info('Pairing cancelled'); return; }

      const rawDevice = bleDevice.rawDevice;
      if (!rawDevice?.gatt) { toast.error('GATT not available on this device'); return; }

      const server = await rawDevice.gatt.connect();
      const success = await fireBolttService.connect(server);
      if (!success) { toast.error('Fire-Boltt connection failed'); return; }

      const deviceId = rawDevice.id ?? `fire-boltt-${Date.now()}`;
      const newDev: PairedDevice = {
        id: deviceId,
        device_id: deviceId,
        device_name: rawDevice.name ?? 'Fire-Boltt',
        name: rawDevice.name ?? 'Fire-Boltt',
        type: 'smartwatch',
        isFireBolttDevice: true,
        last_sync: new Date().toISOString(),
      };

      try {
        await api.post('/health-data/devices/register', {
          deviceId,
          deviceName: newDev.device_name,
          deviceType: 'smartwatch',
        });
      } catch { /* non-fatal */ }

      saveLsDevice(newDev);
      setLocalDevices(lsDevices());
      queryClient.invalidateQueries({ queryKey: ['wearables'] });
      toast.success('Fire-Boltt paired!');
    } catch (err: any) {
      if (err.message?.includes('not supported')) {
        toast.error('Web Bluetooth not supported in this browser. Use Chrome on Android or desktop.');
      } else {
        toast.error(`Fire-Boltt pairing failed: ${err.message}`);
      }
    } finally {
      setConnecting(null);
    }
  }, [queryClient]);

  const syncGoogleFit = useCallback(async () => {
    setConnecting('google-fit');
    try {
      // Post empty readings array — server accepts the sync signal
      await api.post('/health-data/google-fit-sync', { readings: [], syncId: `manual-${Date.now()}` });
      toast.success('Google Fit sync triggered — check Health Connect on your Android device');
    } catch {
      toast.error('Google Fit sync failed');
    } finally {
      setConnecting(null);
    }
  }, []);

  const syncAppleHealth = useCallback(async () => {
    setConnecting('apple-health');
    try {
      await api.post('/health-data/apple-health-sync', { readings: [], syncId: `manual-${Date.now()}` });
      toast.success('Apple Health sync triggered — open Mediczy on your iPhone to export data');
    } catch {
      toast.error('Apple Health sync failed');
    } finally {
      setConnecting(null);
    }
  }, []);

  const saveNightscoutUrl = () => {
    const trimmed = nightscoutInput.trim();
    if (trimmed && !trimmed.startsWith('https://')) {
      toast.error('Nightscout URL must start with https://');
      return;
    }
    localStorage.setItem('nightscoutUrl', trimmed);
    setNightscoutUrl(trimmed);
    toast.success(trimmed ? 'Nightscout URL saved — CGM data will appear in Watch Analytics' : 'Nightscout URL cleared');
    setModal(null);
  };

  // ── Connect handler dispatcher ────────────────────────────────────────────
  const handleConnect = useCallback(async (flow: string, entryId: string) => {
    switch (flow) {
      case 'ble-generic':
        await pairBleGeneric(entryId);
        break;
      case 'ble-veepoo':
        await pairVeepoo(entryId);
        break;
      case 'ble-fireboltt':
        await pairFireBoltt(entryId);
        break;
      case 'ble-bp':
        await pairBleGeneric(entryId, {
          filters: [{ services: ['00001810-0000-1000-8000-00805f9b34fb'] }],
          optionalServices: ['0000180f-0000-1000-8000-00805f9b34fb', '0000180a-0000-1000-8000-00805f9b34fb'],
        });
        break;
      case 'ble-bp-omron':
        await pairBleGeneric(entryId, {
          filters: [
            { namePrefix: 'OMRON' },
            { namePrefix: 'BLEsmart' },
            { services: ['00001810-0000-1000-8000-00805f9b34fb'] },
          ],
          optionalServices: ['0000180f-0000-1000-8000-00805f9b34fb', '0000180a-0000-1000-8000-00805f9b34fb'],
        });
        break;
      case 'ble-glucose':
        await pairBleGeneric(entryId, {
          filters: [{ services: ['00001808-0000-1000-8000-00805f9b34fb'] }],
          optionalServices: ['0000180f-0000-1000-8000-00805f9b34fb', '0000180a-0000-1000-8000-00805f9b34fb'],
        });
        break;
      case 'google-fit-sync':
        await syncGoogleFit();
        break;
      case 'apple-health-sync':
        await syncAppleHealth();
        break;
      // Modal flows
      case 'dexcom':
        setModal('dexcom');
        break;
      case 'libre':
        setModal('libre');
        break;
      case 'nightscout':
        setModal('nightscout');
        break;
      case 'fitbit-oauth':
        setModal('fitbit-oauth');
        break;
      case 'garmin-oauth':
        setModal('garmin-oauth');
        break;
      case 'apple-health':
        setModal('apple-health');
        break;
      case 'google-fit':
        setModal('google-fit');
        break;
      default:
        toast.info('This device type is coming soon');
    }
  }, [pairBleGeneric, pairVeepoo, pairFireBoltt, syncGoogleFit, syncAppleHealth]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-8 px-4 md:px-6 py-6 animate-in fade-in duration-500">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_70%_50%,rgba(20,184,166,0.6),transparent)]" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-teal-500/20 border border-teal-500/30">
                <Watch className="w-6 h-6 text-teal-400" />
              </div>
              <Badge className="bg-white/10 text-white/90 border-white/20">
                {allDevices.length} device{allDevices.length !== 1 ? 's' : ''} paired
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">Device Hub</h1>
            <p className="text-slate-300 text-sm">
              Connect fitness trackers, CGMs, blood pressure monitors and glucometers
            </p>
          </div>
          <Link to="/patient/watch-analytics">
            <Button variant="outline" className="border-teal-500/40 text-teal-300 hover:bg-teal-500/10">
              <Activity className="w-4 h-4 mr-2" />
              View Analytics
            </Button>
          </Link>
        </div>
      </div>

      {/* ── My Devices ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings className="w-4 h-4 text-teal-400" />
          My Devices
        </h2>

        {wearablesLoading && (
          <div className="flex items-center gap-2 text-slate-400 py-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading devices…</span>
          </div>
        )}

        {!wearablesLoading && allDevices.length === 0 && (
          <Card className="bg-slate-800/60 border-slate-700/40">
            <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
              <Bluetooth className="w-10 h-10 text-slate-500" />
              <p className="text-slate-400 text-sm text-center">
                No devices paired yet. Connect a device from one of the sections below.
              </p>
            </CardContent>
          </Card>
        )}

        {allDevices.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allDevices.map((device) => {
              const did = device.device_id ?? device.deviceId ?? device.id ?? '';
              const dname = device.device_name ?? device.name ?? 'Unknown Device';
              const status = syncStatus(device);
              const lastSyncDate = getLastSyncDate(device);

              return (
                <Card key={did} className="bg-slate-800/60 border-slate-700/40 hover:border-teal-600/40 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                        <p className="text-sm font-medium text-white truncate max-w-[140px]">{dname}</p>
                      </div>
                      {device.battery != null && (
                        <Badge className="bg-slate-700 text-slate-300 border-0 text-[10px]">
                          {device.battery}%
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-0.5 mb-4">
                      {device.type && (
                        <p className="text-xs text-slate-500 capitalize">{device.type.replace('_', ' ')}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        Last sync: {formatRelative(lastSyncDate)}
                      </p>
                      {(device.isVeepooDevice || device.isFireBolttDevice) && (
                        <Badge className="text-[10px] px-1 py-0 h-4 bg-teal-500/20 text-teal-400 border-0 mt-1">
                          {device.isVeepooDevice ? 'Veepoo' : 'Fire-Boltt'}
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-teal-500/40 text-teal-400 hover:bg-teal-500/10"
                        onClick={() => syncDevice(device)}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Sync
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => removeMutation.mutate(did)}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Status legend ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-400" />Synced within 30 min</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Synced &gt;30 min ago</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Never synced / disconnected</span>
      </div>

      {/* ── Fitness Watches ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Watch className="w-5 h-5 text-teal-400" />
          <h2 className="text-lg font-semibold text-white">Fitness Watches & Bands</h2>
        </div>
        <div className="space-y-2">
          {FITNESS_WATCHES.map(entry => (
            <DeviceRow
              key={entry.id}
              entry={entry as CatalogEntry}
              onConnect={handleConnect}
              connecting={connecting}
            />
          ))}
        </div>
      </section>

      {/* ── CGM Devices ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Droplets className="w-5 h-5 text-lime-400" />
          <h2 className="text-lg font-semibold text-white">CGM (Continuous Glucose Monitors)</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          CGM data appears in Watch Analytics as a live glucose reading when Nightscout is configured.
        </p>
        {nightscoutUrl && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-lime-500/10 border border-lime-500/30">
            <CheckCircle className="w-4 h-4 text-lime-400 flex-shrink-0" />
            <span className="text-xs text-lime-300 truncate">Nightscout: {nightscoutUrl}</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-lime-400 hover:text-lime-300 h-6 px-2"
              onClick={() => setModal('nightscout')}
            >
              Edit
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {CGM_DEVICES.map(entry => (
            <DeviceRow
              key={entry.id}
              entry={entry as CatalogEntry}
              onConnect={handleConnect}
              connecting={connecting}
            />
          ))}
        </div>
      </section>

      {/* ── Blood Pressure Monitors ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Heart className="w-5 h-5 text-pink-400" />
          <h2 className="text-lg font-semibold text-white">Blood Pressure Monitors</h2>
        </div>
        <div className="space-y-2">
          {BP_MONITORS.map(entry => (
            <DeviceRow
              key={entry.id}
              entry={entry as CatalogEntry}
              onConnect={handleConnect}
              connecting={connecting}
            />
          ))}
        </div>
      </section>

      {/* ── Glucometers ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Thermometer className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-semibold text-white">Glucometers (Point-in-time)</h2>
        </div>
        <div className="space-y-2">
          {GLUCOMETERS.map(entry => (
            <DeviceRow
              key={entry.id}
              entry={entry as CatalogEntry}
              onConnect={handleConnect}
              connecting={connecting}
            />
          ))}
        </div>
      </section>

      {/* ── Platform Aggregators ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Platform Health Aggregators</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Google Fit */}
          <Card className="bg-slate-800/60 border-slate-700/40 hover:border-teal-600/40 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">🟢</span>
                <div>
                  <p className="text-sm font-medium text-white">Google Fit / Health Connect</p>
                  <p className="text-xs text-slate-400">Steps, HR, sleep, calories from Android</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Requires Health Connect app installed on Android 9+. Grant permissions then tap Sync.
              </p>
              <Button
                size="sm"
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                disabled={connecting === 'google-fit'}
                onClick={() => handleConnect('google-fit-sync', 'google-fit')}
              >
                {connecting === 'google-fit' ? (
                  <RefreshCw className="w-3 h-3 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-3 h-3 mr-2" />
                )}
                Sync Google Fit
              </Button>
            </CardContent>
          </Card>

          {/* Apple Health */}
          <Card className="bg-slate-800/60 border-slate-700/40 hover:border-teal-600/40 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">🍎</span>
                <div>
                  <p className="text-sm font-medium text-white">Apple Health</p>
                  <p className="text-xs text-slate-400">HealthKit data from iPhone</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Open Mediczy on your iPhone and tap "Export to Mediczy" to push HealthKit data.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full border-teal-500/40 text-teal-400 hover:bg-teal-500/10"
                disabled={connecting === 'apple-health'}
                onClick={() => handleConnect('apple-health-sync', 'apple-health')}
              >
                {connecting === 'apple-health' ? (
                  <RefreshCw className="w-3 h-3 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-3 h-3 mr-2" />
                )}
                Sync Apple Health
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Info footer ──────────────────────────────────────────────────── */}
      <Card className="bg-slate-800/40 border-slate-700/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white mb-1">Privacy & Security</p>
              <p className="text-xs text-slate-400">
                All health data is encrypted in transit and at rest. BLE connections are local-only — data is only sent to
                Mediczy servers after you initiate a sync. OAuth connections use read-only scopes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─────────────────────────── Modals ────────────────────────────── */}

      {/* Nightscout */}
      <Dialog open={modal === 'nightscout'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">🌐</span> Nightscout CGM
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter your Nightscout URL to pull continuous glucose readings into Watch Analytics.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Nightscout URL (must be HTTPS)</label>
              <Input
                value={nightscoutInput}
                onChange={e => setNightscoutInput(e.target.value)}
                placeholder="https://mynightscout.herokuapp.com"
                className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1.5">
              <p className="text-xs font-medium text-slate-300">How to set up Nightscout</p>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                <li>Deploy Nightscout (nightscout.github.io) or use a provider like ns.10be.de</li>
                <li>Set AUTH_DEFAULT_ROLES=readable in your Nightscout env</li>
                <li>Paste your site URL above and tap Save</li>
                <li>CGM readings will appear on the Watch Analytics page</li>
              </ol>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-teal-600 hover:bg-teal-700"
                onClick={saveNightscoutUrl}
              >
                Save URL
              </Button>
              {nightscoutUrl && (
                <Button
                  variant="outline"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                  onClick={() => { setNightscoutInput(''); saveNightscoutUrl(); }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dexcom */}
      <Dialog open={modal === 'dexcom'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">📡</span> Dexcom G6 / G7
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Connect via Dexcom Share API
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
              <p className="text-xs text-amber-300 font-medium mb-1">Dexcom Share credentials required</p>
              <p className="text-xs text-amber-200/70">
                Full OAuth integration requires Dexcom developer API keys (server-side setup). Contact your Mediczy administrator to enable this.
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Alternative: Use Nightscout as a bridge</p>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                <li>Enable Dexcom Share in the Dexcom G6/G7 app</li>
                <li>Install xDrip+ (Android) or Spike (iOS) and connect to Dexcom Share</li>
                <li>Configure xDrip+/Spike to upload to your Nightscout site</li>
                <li>Add your Nightscout URL in the Nightscout section above</li>
              </ol>
            </div>
            <Button
              className="w-full bg-teal-600 hover:bg-teal-700"
              onClick={() => { setModal('nightscout'); }}
            >
              Set Up Nightscout Instead
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* FreeStyle Libre */}
      <Dialog open={modal === 'libre'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">📡</span> FreeStyle Libre 2 / 3
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              BLE direct connection + LibreLink polling
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Option 1 — BLE Direct (Libre 2 / 3)</p>
              <p className="text-xs text-slate-400">
                Libre 2 and Libre 3 broadcast BLE. Compatible reader apps (e.g. xDrip+, Diabox) can forward readings to Nightscout.
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Option 2 — via Nightscout</p>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                <li>Install LibreLink on Android and enable connections</li>
                <li>Use xDrip+ to bridge LibreLink → Nightscout</li>
                <li>Add your Nightscout URL in the Nightscout section</li>
              </ol>
            </div>
            <Button
              className="w-full bg-teal-600 hover:bg-teal-700"
              onClick={() => { setModal('nightscout'); }}
            >
              Set Up Nightscout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fitbit OAuth */}
      <Dialog open={modal === 'fitbit-oauth'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">📿</span> Fitbit OAuth
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Connect your Fitbit account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-xs text-amber-300 font-medium">Setup Required</p>
              </div>
              <p className="text-xs text-amber-200/70">
                Fitbit OAuth requires server-side credentials (Fitbit App client ID + secret). This feature is pending activation by your Mediczy administrator.
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3">
              <p className="text-xs font-medium text-slate-300 mb-1">What you'll be able to do</p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                <li>Sync 7-day heart rate, steps, sleep, calories</li>
                <li>Import weight and BMI data</li>
                <li>Auto-refresh every 30 minutes</li>
              </ul>
            </div>
            <p className="text-xs text-slate-500">
              As an alternative, you can also sync Fitbit data via Google Health Connect on Android.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Garmin OAuth */}
      <Dialog open={modal === 'garmin-oauth'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">⌚</span> Garmin Connect
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Connect your Garmin account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-xs text-amber-300 font-medium">Setup Required</p>
              </div>
              <p className="text-xs text-amber-200/70">
                Garmin Health API OAuth requires approved developer access. This feature is pending activation.
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3">
              <p className="text-xs text-slate-400">
                You can pair your Garmin watch via direct BLE (select "Generic BLE Watch") to read heart rate and SpO2 data in real-time.
              </p>
            </div>
            <Button
              className="w-full bg-teal-600 hover:bg-teal-700"
              onClick={() => { setModal(null); handleConnect('ble-generic', 'generic-ble'); }}
            >
              <Bluetooth className="w-3 h-3 mr-2" />
              Pair via BLE Instead
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Apple Health instruction modal */}
      <Dialog open={modal === 'apple-health'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">🍎</span> Apple Watch / Apple Health
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Sync HealthKit data from your iPhone
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Steps to sync</p>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                <li>Open the Mediczy app on your iPhone (iOS app required)</li>
                <li>Go to Settings → Health Integration</li>
                <li>Tap "Connect Apple Health" and grant permissions</li>
                <li>Tap "Export to Mediczy" — data syncs automatically</li>
              </ol>
            </div>
            <p className="text-xs text-slate-500">
              Apple Watch health data (HR, ECG, SpO2, sleep) flows through HealthKit and is included in the export.
            </p>
            <Button
              className="w-full bg-teal-600 hover:bg-teal-700"
              onClick={() => { syncAppleHealth(); setModal(null); }}
            >
              <Zap className="w-3 h-3 mr-2" />
              Trigger Sync Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Google Fit / Health Connect instruction modal */}
      <Dialog open={modal === 'google-fit'} onOpenChange={o => !o && setModal(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">🟢</span> Samsung Galaxy Watch / Google Fit
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Sync via Google Health Connect
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-lg bg-slate-800/60 p-3 space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Steps to sync</p>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                <li>Install "Health Connect" from the Play Store</li>
                <li>Open Samsung Health or Google Fit and link to Health Connect</li>
                <li>Open Mediczy on Android — it will request Health Connect permissions</li>
                <li>Tap "Sync Google Fit" below to import data</li>
              </ol>
            </div>
            <Button
              className="w-full bg-teal-600 hover:bg-teal-700"
              onClick={() => { syncGoogleFit(); setModal(null); }}
            >
              <Zap className="w-3 h-3 mr-2" />
              Sync Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default DeviceIntegration;
