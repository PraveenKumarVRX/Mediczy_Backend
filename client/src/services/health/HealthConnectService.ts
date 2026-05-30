/**
 * Google Health Connect Integration Service
 *
 * Architecture note:
 *   Google Health Connect is an Android-native API — it is NOT a cloud REST API
 *   and cannot be accessed from a web browser. Data flow:
 *
 *   Android device
 *     └── Health Connect SDK (reads from Samsung Health, Fitbit, Wear OS, etc.)
 *         └── Mediczy Android app (via Capacitor + @capacitor-community/health-connect)
 *             └── POST /api/fitness/health-connect/sync → our backend
 *                 └── HealthData + FitnessData stored in DB
 *   Web dashboard
 *     └── GET /api/fitness/health-connect/status / summary ← reads stored data
 *
 * This service handles the Capacitor native path on Android. On web it exposes
 * status + data retrieval only.
 */

import api from '@/utils/api';

// ─── Health Connect data types (mapped from Android SDK record types) ─────────
export const HealthConnectTypes = {
  steps:          'Steps',
  calories:       'ActiveCaloriesBurned',
  distance:       'Distance',
  heartRate:      'HeartRate',
  sleep:          'SleepSession',
  weight:         'Weight',
  bloodOxygen:    'OxygenSaturation',
  bloodPressure:  'BloodPressure',
  bloodGlucose:   'BloodGlucose',
  bodyTemperature:'BodyTemperature',
} as const;

export interface HealthConnectDayRecord {
  date: string;                        // YYYY-MM-DD
  steps?: number;
  calories?: number;
  distance?: number;                   // metres
  activeMinutes?: number;
  heartRate?: { avg: number; min: number; max: number };
  sleepHours?: number;
  bloodOxygen?: number;                // SpO2 %
  weight?: number;                     // kg
  source?: string;
  appVersion?: string;
}

export interface HealthConnectSyncResult {
  success: boolean;
  savedCount: number;
  failedCount: number;
  partialFailure: boolean;
}

export interface HealthConnectStatus {
  connected: boolean;
  lastSync: string | null;
}

// ─── Service class ────────────────────────────────────────────────────────────

export class HealthConnectService {
  private static instance: HealthConnectService;
  private plugin: any = null;

  private constructor() {
    this.initPlugin();
  }

  static getInstance(): HealthConnectService {
    if (!HealthConnectService.instance) {
      HealthConnectService.instance = new HealthConnectService();
    }
    return HealthConnectService.instance;
  }

  // ── Plugin init (Android Capacitor only) ────────────────────────────────────
  private async initPlugin() {
    const capacitor = (window as any)?.Capacitor;
    if (capacitor?.isNativePlatform?.() && capacitor?.getPlatform?.() === 'android') {
      try {
        // @capacitor-community/health-connect or equivalent plugin
        const mod = await import('@capacitor-community/health-connect').catch(() => null);
        this.plugin = mod?.HealthConnect ?? null;
        if (this.plugin) {
          console.log('[HealthConnect] native plugin loaded');
        }
      } catch {
        console.log('[HealthConnect] native plugin not available');
      }
    }
  }

  /** True if running inside the Mediczy Android native app */
  isNativeAndroid(): boolean {
    const cap = (window as any)?.Capacitor;
    return Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'android');
  }

  /** Request Health Connect permissions on Android (no-op on web) */
  async requestPermissions(): Promise<boolean> {
    if (!this.plugin) return false;
    try {
      const result = await this.plugin.requestHealthPermissions({
        read: Object.values(HealthConnectTypes),
      });
      return result?.grantedPermissions?.length > 0;
    } catch (err) {
      console.error('[HealthConnect] permission request failed:', err);
      return false;
    }
  }

  /**
   * Read one day of data from Health Connect (Android native only).
   * Returns null on web — use syncFromServer() to get stored data instead.
   */
  async readDay(date: Date): Promise<HealthConnectDayRecord | null> {
    if (!this.plugin) return null;

    const dateStr = date.toISOString().split('T')[0];
    const start   = new Date(dateStr + 'T00:00:00');
    const end     = new Date(dateStr + 'T23:59:59');

    try {
      const [steps, calories, hr, sleep, spo2] = await Promise.allSettled([
        this.plugin.readRecords({ type: 'Steps',               startTime: start.toISOString(), endTime: end.toISOString() }),
        this.plugin.readRecords({ type: 'ActiveCaloriesBurned',startTime: start.toISOString(), endTime: end.toISOString() }),
        this.plugin.readRecords({ type: 'HeartRate',           startTime: start.toISOString(), endTime: end.toISOString() }),
        this.plugin.readRecords({ type: 'SleepSession',        startTime: start.toISOString(), endTime: end.toISOString() }),
        this.plugin.readRecords({ type: 'OxygenSaturation',    startTime: start.toISOString(), endTime: end.toISOString() }),
      ]);

      const sum = (arr: any[], fn: (r: any) => number) =>
        arr.reduce((a, r) => a + (fn(r) || 0), 0);

      const stepsVal    = steps.status    === 'fulfilled' ? sum(steps.value?.records ?? [], r => r.count) : 0;
      const calVal      = calories.status === 'fulfilled' ? Math.round(sum(calories.value?.records ?? [], r => r.energy?.inKilocalories ?? 0)) : 0;
      const hrRecords   = hr.status       === 'fulfilled' ? (hr.value?.records ?? []).flatMap((r: any) => r.samples ?? []) : [];
      const hrValues    = hrRecords.map((s: any) => s.beatsPerMinute ?? 0).filter((v: number) => v > 0);
      const sleepMs     = sleep.status    === 'fulfilled' ? sum(sleep.value?.records ?? [], (r: any) => new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) : 0;
      const spo2Vals    = spo2.status     === 'fulfilled' ? (spo2.value?.records ?? []).map((r: any) => r.percentage ?? 0).filter((v: number) => v > 0) : [];

      return {
        date: dateStr,
        steps: stepsVal || undefined,
        calories: calVal || undefined,
        heartRate: hrValues.length ? {
          avg: Math.round(hrValues.reduce((a: number, b: number) => a + b, 0) / hrValues.length),
          min: Math.min(...hrValues),
          max: Math.max(...hrValues),
        } : undefined,
        sleepHours: sleepMs > 0 ? Math.round((sleepMs / 3_600_000) * 10) / 10 : undefined,
        bloodOxygen: spo2Vals.length ? Math.round(spo2Vals.reduce((a: number, b: number) => a + b, 0) / spo2Vals.length) : undefined,
        source: 'health_connect',
      };
    } catch (err) {
      console.error('[HealthConnect] readDay error:', err);
      return null;
    }
  }

  /**
   * Read the last N days from Health Connect and push to our server.
   * Android native only — noop on web.
   */
  async syncToServer(days = 7): Promise<HealthConnectSyncResult> {
    if (!this.plugin) {
      return { success: false, savedCount: 0, failedCount: 0, partialFailure: false };
    }

    const records: HealthConnectDayRecord[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const r = await this.readDay(d);
      if (r) records.push(r);
    }

    if (!records.length) {
      return { success: true, savedCount: 0, failedCount: 0, partialFailure: false };
    }

    try {
      const { data } = await api.post('/fitness/health-connect/sync', { days: records });
      return {
        success: data.success ?? true,
        savedCount: data.savedCount ?? 0,
        failedCount: data.failedCount ?? 0,
        partialFailure: data.partialFailure ?? false,
      };
    } catch (err) {
      console.error('[HealthConnect] syncToServer error:', err);
      return { success: false, savedCount: 0, failedCount: 0, partialFailure: false };
    }
  }

  // ── Server-side status + data (works on web too) ───────────────────────────

  async getStatus(): Promise<HealthConnectStatus> {
    try {
      const { data } = await api.get('/fitness/health-connect/status');
      return { connected: data.connected ?? false, lastSync: data.lastSync ?? null };
    } catch {
      return { connected: false, lastSync: null };
    }
  }

  async disconnect(deleteData = false): Promise<void> {
    await api.delete(`/fitness/health-connect/disconnect?deleteData=${deleteData}`);
  }
}

export const healthConnectService = HealthConnectService.getInstance();
export default healthConnectService;
