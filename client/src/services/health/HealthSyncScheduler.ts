/**
 * Health Data Sync Scheduler
 * 
 * Automatically syncs health data from connected devices every 30 minutes.
 * Also triggers device measurements at the same interval.
 */

import api from '@/utils/api';
import { veepooService, VeepooService } from '../ble/VeepooService';
import { fireBolttService } from '../ble/FireBolttService';

// Sync interval in milliseconds (default 30 minutes, user-configurable)
const DEFAULT_SYNC_INTERVAL = 30 * 60 * 1000;
const SYNC_INTERVAL_KEY = 'healthSyncInterval';

function getSyncInterval(): number {
  const stored = parseInt(localStorage.getItem(SYNC_INTERVAL_KEY) || '0', 10);
  return stored > 0 ? stored : DEFAULT_SYNC_INTERVAL;
}

// Storage keys
const LAST_SYNC_KEY = 'lastHealthSync';
const SYNC_ENABLED_KEY = 'healthSyncEnabled';
const PENDING_DATA_KEY = 'pendingHealthData';

export interface HealthReading {
  type: string;
  value: any;
  unit: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
}

export interface SyncStatus {
  isEnabled: boolean;
  lastSync: Date | null;
  nextSync: Date | null;
  pendingReadings: number;
  connectedDevices: number;
}

class HealthSyncScheduler {
  private static instance: HealthSyncScheduler;
  private syncInterval: NodeJS.Timeout | null = null;
  private measurementInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private _isMeasuring = false;
  private pendingReadings: HealthReading[] = [];

  private constructor() {
    this.loadPendingData();
  }

  static getInstance(): HealthSyncScheduler {
    if (!HealthSyncScheduler.instance) {
      HealthSyncScheduler.instance = new HealthSyncScheduler();
    }
    return HealthSyncScheduler.instance;
  }

  /**
   * Load pending data from localStorage
   */
  private loadPendingData() {
    try {
      const pending = localStorage.getItem(PENDING_DATA_KEY);
      if (pending) {
        this.pendingReadings = JSON.parse(pending);
      }
    } catch (e) {
      this.pendingReadings = [];
    }
  }

  /**
   * Save pending data to localStorage
   */
  private savePendingData() {
    try {
      localStorage.setItem(PENDING_DATA_KEY, JSON.stringify(this.pendingReadings));
    } catch (e) {
      console.error('Failed to save pending data:', e);
    }
  }

  /**
   * Start the sync scheduler
   */
  start(intervalMs?: number): void {
    const interval = intervalMs ?? getSyncInterval();
    if (this.isRunning) {
      // Only restart if a different interval was explicitly requested
      if (!intervalMs || getSyncInterval() === interval) return;
      this.stop();
    }

    if (intervalMs) localStorage.setItem(SYNC_INTERVAL_KEY, String(intervalMs));

    console.log(`🔄 Starting health sync scheduler (${Math.round(interval / 60000)} min interval)`);
    this.isRunning = true;
    localStorage.setItem(SYNC_ENABLED_KEY, 'true');

    // Run initial sync
    this.performSync();

    // Schedule periodic sync
    this.syncInterval = setInterval(() => {
      this.performSync();
    }, interval);

    // Schedule periodic measurements (same cadence)
    this.measurementInterval = setInterval(() => {
      this.triggerDeviceMeasurements();
    }, interval);

    // Trigger initial measurement after 5s (devices need time to be ready)
    setTimeout(() => {
      this.triggerDeviceMeasurements();
    }, 5000);
  }

  /**
   * Stop the sync scheduler
   */
  stop(): void {
    console.log('⏹️ Stopping health sync scheduler');
    this.isRunning = false;
    localStorage.setItem(SYNC_ENABLED_KEY, 'false');

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.measurementInterval) {
      clearInterval(this.measurementInterval);
      this.measurementInterval = null;
    }
  }

  /**
   * Check if scheduler should auto-start
   */
  shouldAutoStart(): boolean {
    const enabled = localStorage.getItem(SYNC_ENABLED_KEY);
    const devices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
    return enabled === 'true' && devices.length > 0;
  }

  /**
   * Auto-start if enabled and devices connected
   */
  autoStart(): void {
    if (this.shouldAutoStart()) {
      this.start();
    }
  }

  /**
   * Trigger measurements on connected devices
   */
  async triggerDeviceMeasurements(): Promise<void> {
    if (this._isMeasuring) {
      console.log('📊 Measurement already in progress, skipping concurrent call');
      return;
    }
    this._isMeasuring = true;
    console.log('📊 Triggering device measurements...');

    const devices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
    try {
      for (const device of devices) {
        if (device.isVeepooDevice) {
          // Auto-reconnect before measuring (handles page refresh / lost BLE link)
          if (!veepooService.getConnectionStatus()) {
            console.log(`🔄 Auto-reconnecting to ${device.name}...`);
            const ok = await veepooService.reconnect();
            if (!ok) {
              console.warn(`⚠️ Could not reconnect to ${device.name} – skipping measurement`);
              continue;
            }
          }
          await this.measureVeepooDevice(device);
        } else if (device.isFireBolttDevice) {
          // FireBoltt uses syncAll() which needs the GATT server to be live.
          // If the service has lost its internal server reference, skip gracefully.
          try {
            await this.measureFireBolttDevice(device);
          } catch (err) {
            console.warn(`⚠️ [FireBoltt] Skipping ${device.name}: device not connected`);
          }
        }
      }
    } finally {
      this._isMeasuring = false;
    }
  }

  /**
   * Measure health data from Veepoo device
   */
  private async measureVeepooDevice(device: any): Promise<void> {
    console.log(`⌚ Measuring from ${device.name}...`);

    // Set up callbacks for data
    veepooService.setCallbacks({
      onHeartRateData: (data) => {
        this.addReading({
          type: 'heart_rate',
          value: data.heartRate,
          unit: 'bpm',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      },
      onBloodPressureData: (data) => {
        this.addReading({
          type: 'blood_pressure',
          value: { systolic: data.systolic, diastolic: data.diastolic },
          unit: 'mmHg',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      },
      onSpO2Data: (data) => {
        this.addReading({
          type: 'spo2',
          value: data.spO2,
          unit: '%',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      },
      onTemperatureData: (data) => {
        this.addReading({
          type: 'temperature',
          value: data.temperature,
          unit: '°C',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      },
      onBloodGlucoseData: (data) => {
        this.addReading({
          type: 'blood_glucose',
          value: data.glucose,
          unit: 'mmol/L',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      },
      onStepHistoryData: (data) => {
        this.addReading({
          type: 'steps',
          value: data.steps,
          unit: 'steps',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
        if (data.calories > 0) {
          this.addReading({
            type: 'calories',
            value: data.calories,
            unit: 'kcal',
            timestamp: data.timestamp.toISOString(),
            deviceId: device.id,
            deviceName: device.name
          });
        }
        if (data.activeMinutes > 0) {
          this.addReading({
            type: 'active_minutes',
            value: data.activeMinutes,
            unit: 'min',
            timestamp: data.timestamp.toISOString(),
            deviceId: device.id,
            deviceName: device.name
          });
        }
      },
      onSleepHistoryData: (data) => {
        this.addReading({
          type: 'sleep',
          value: parseFloat((data.totalMinutes / 60).toFixed(2)),
          unit: 'hrs',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      },
      onHrvData: (data) => {
        this.addReading({
          type: 'hrv',
          value: data.hrv,
          unit: 'ms',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      },
      onEcgData: (data) => {
        // Encode rhythm as a numeric: 0=normal,1=afib,2=irregular,3=unknown
        const rhythmCode: Record<string, number> = { normal: 0, afib: 1, irregular: 2, unknown: 3 };
        this.addReading({
          type: 'ecg',
          value: rhythmCode[data.rhythm] ?? 3,
          unit: 'rhythm',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name,
          metadata: { rhythm: data.rhythm, sampleRate: data.sampleRate, durationMs: data.durationMs }
        });
      },
      onUricAcidData: (data) => {
        this.addReading({
          type: 'uric_acid',
          value: data.uricAcid,
          unit: 'μmol/L',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      },
      onCholesterolData: (data) => {
        this.addReading({
          type: 'cholesterol',
          value: data.total,
          unit: 'mmol/L',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name,
          metadata: { hdl: data.hdl, ldl: data.ldl }
        });
        if (data.hdl > 0) this.addReading({
          type: 'cholesterol_hdl', value: data.hdl, unit: 'mmol/L',
          timestamp: data.timestamp.toISOString(), deviceId: device.id, deviceName: device.name
        });
        if (data.ldl > 0) this.addReading({
          type: 'cholesterol_ldl', value: data.ldl, unit: 'mmol/L',
          timestamp: data.timestamp.toISOString(), deviceId: device.id, deviceName: device.name
        });
      },
      onGymActivityData: (data) => {
        this.addReading({
          type: 'gym_workout',
          value: data.durationMinutes,
          unit: 'min',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name,
          metadata: { workoutType: data.workoutType, calories: data.calories, avgHR: data.avgHeartRate, maxHR: data.maxHeartRate, steps: data.steps }
        });
        if (data.calories > 0) this.addReading({
          type: 'calories', value: data.calories, unit: 'kcal',
          timestamp: data.timestamp.toISOString(), deviceId: device.id, deviceName: device.name
        });
      },
      onOutdoorActivityData: (data) => {
        this.addReading({
          type: 'outdoor_activity',
          value: parseFloat((data.distanceMeters / 1000).toFixed(3)),
          unit: 'km',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name,
          metadata: {
            activityType: data.activityType,
            durationMinutes: data.durationMinutes,
            calories: data.calories,
            avgHeartRate: data.avgHeartRate,
            avgPaceSecPerKm: data.avgPaceSecPerKm,
            routePoints: data.route.length,
            route: data.route.slice(0, 200) // cap to 200 GPS points to avoid huge payloads
          }
        });
      },
    });

    // Helper: abort if GATT dropped mid-sequence
    const assertConnected = () => {
      if (!veepooService.getConnectionStatus()) {
        throw new Error('GATT connection lost during measurement sequence');
      }
    };

    // Try to connect and measure
    try {
      // Start measurements
      await veepooService.startHeartRateMeasurement();
      assertConnected();
      
      // Wait for measurement (typically 30 seconds)
      await new Promise(resolve => setTimeout(resolve, 30000));
      assertConnected();
      
      await veepooService.stopHeartRateMeasurement();

      // Blood pressure measurement
      try {
        await veepooService.startBloodPressureMeasurement();
        await new Promise(resolve => setTimeout(resolve, 45000)); // BP takes longer
        await veepooService.stopBloodPressureMeasurement();
      } catch (e) {
        console.log('BP measurement not available');
      }

      // SpO2 measurement
      try {
        await veepooService.startSpO2Measurement();
        await new Promise(resolve => setTimeout(resolve, 20000));
        await veepooService.stopSpO2Measurement();
      } catch (e) {
        console.log('SpO2 measurement not available');
      }

      // Blood glucose measurement (continuous monitor or on-demand, 30s)
      try {
        await veepooService.startBloodGlucoseMeasurement();
        await new Promise(resolve => setTimeout(resolve, 30000));
        await veepooService.stopBloodGlucoseMeasurement();
      } catch (e) {
        console.log('Blood glucose measurement not available on this model');
      }

      // History reads — device responds asynchronously via notify characteristic
      try { await veepooService.readStepHistory(); } catch (e) { /* optional */ }
      await new Promise(resolve => setTimeout(resolve, 3000));
      try { await veepooService.readSleepHistory(); } catch (e) { /* optional */ }
      await new Promise(resolve => setTimeout(resolve, 3000));
      try { await veepooService.readHrvData(); } catch (e) { /* optional */ }
      await new Promise(resolve => setTimeout(resolve, 3000));
      try { await veepooService.readECGHistory(); } catch (e) { /* optional */ }
      await new Promise(resolve => setTimeout(resolve, 3000));
      try { await veepooService.readGymHistory(); } catch (e) { /* optional */ }
      await new Promise(resolve => setTimeout(resolve, 3000));
      try { await veepooService.readOutdoorHistory(); } catch (e) { /* optional */ }
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Uric acid measurement (~30s)
      try {
        await veepooService.startUricAcidMeasurement();
        await new Promise(resolve => setTimeout(resolve, 30000));
        await veepooService.stopUricAcidMeasurement();
      } catch (e) { console.log('Uric acid not available on this model'); }

      // Cholesterol measurement (~30s)
      try {
        await veepooService.startCholesterolMeasurement();
        await new Promise(resolve => setTimeout(resolve, 30000));
        await veepooService.stopCholesterolMeasurement();
      } catch (e) { console.log('Cholesterol not available on this model'); }

      console.log(`✅ Measurements complete for ${device.name}`);
    } catch (error) {
      console.error(`❌ Failed to measure from ${device.name}:`, error);
      console.error('⚠️  Device must be actively connected via Bluetooth to sync data');
      
      // DO NOT generate simulated data for health metrics - this is dangerous
      // Health data must always be real measurements from devices
      throw error;
    }
  }

  /**
   * Measure health data from Fire-Boltt (Jieli) device
   * Reads HR, SpO2, and Steps sequentially to avoid GATT concurrency errors.
   */
  private async measureFireBolttDevice(device: any): Promise<void> {
    console.log(`⌚ [FireBoltt] Measuring from ${device.name}...`);

    try {
      const data = await fireBolttService.syncAll();

      if (data.heartRate) {
        this.addReading({
          type: 'heart_rate',
          value: data.heartRate,
          unit: 'bpm',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      }

      if (data.spo2) {
        this.addReading({
          type: 'spo2',
          value: data.spo2,
          unit: '%',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      }

      if (data.steps) {
        this.addReading({
          type: 'steps',
          value: data.steps,
          unit: 'steps',
          timestamp: data.timestamp.toISOString(),
          deviceId: device.id,
          deviceName: device.name
        });
      }

      console.log(`✅ [FireBoltt] Measurements complete for ${device.name}`);
    } catch (error) {
      console.error(`❌ [FireBoltt] Failed to measure from ${device.name}:`, error);
      console.error('⚠️  Device must be actively connected via Bluetooth to sync data');
      throw error;
    }
  }

  /**
   * REMOVED: Simulated data generation
   * 
   * Health data must NEVER be simulated - it must always come from real device measurements.
   * Simulated health data is dangerous and could lead to incorrect medical decisions.
   * 
   * Users must have their devices actively connected via Bluetooth to sync real data.
   */
  private generateSimulatedReading(device: any): void {
    console.error('❌ CRITICAL: Attempted to generate simulated health data');
    console.error('⚠️  Health data simulation is DISABLED for safety reasons');
    console.error('📱 Please connect your device via Bluetooth to sync real measurements');
    
    // DO NOTHING - never generate fake health data
    return;
  }

  /**
   * Add a reading to pending queue
   */
  addReading(reading: HealthReading): void {
    this.pendingReadings.push(reading);
    this.savePendingData();
    console.log(`📝 Added reading: ${reading.type} = ${JSON.stringify(reading.value)}`);
  }

  /**
   * Perform sync to backend
   */
  async performSync(): Promise<boolean> {
    console.log('🔄 Performing health data sync...');
    
    const now = new Date();
    localStorage.setItem(LAST_SYNC_KEY, now.toISOString());

    if (this.pendingReadings.length === 0) {
      console.log('No pending data to sync');
      return true;
    }

    try {
      // Get auth token
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No auth token, skipping sync');
        return false;
      }

      // Sync to backend
      const response = await api.post('/health-data/ble-sync', {
        readings: this.pendingReadings
      });

      if (response.data.success) {
        console.log(`✅ Synced ${response.data.processedCount} readings`);
        
        // Clear synced readings
        this.pendingReadings = [];
        this.savePendingData();
        
        // Update last sync in localStorage for device cards
        const devices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');
        const updatedDevices = devices.map((d: any) => ({
          ...d,
          lastSync: now.toISOString()
        }));
        localStorage.setItem('connectedDevices', JSON.stringify(updatedDevices));
        
        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('healthDataSynced', {
          detail: { syncTime: now, count: response.data.processedCount }
        }));
        
        return true;
      }
    } catch (error) {
      console.error('Sync failed:', error);
      // Keep data for retry
    }

    return false;
  }

  /**
   * Force immediate sync
   */
  async syncNow(): Promise<boolean> {
    await this.triggerDeviceMeasurements();
    return this.performSync();
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    const lastSyncStr = localStorage.getItem(LAST_SYNC_KEY);
    const lastSync = lastSyncStr ? new Date(lastSyncStr) : null;
    const interval = getSyncInterval();
    const nextSync = lastSync ? new Date(lastSync.getTime() + interval) : null;
    const devices = JSON.parse(localStorage.getItem('connectedDevices') || '[]');

    return {
      isEnabled: this.isRunning,
      lastSync,
      nextSync,
      pendingReadings: this.pendingReadings.length,
      connectedDevices: devices.length
    };
  }

  /**
   * Get time until next sync
   */
  getTimeUntilNextSync(): number {
    const lastSyncStr = localStorage.getItem(LAST_SYNC_KEY);
    if (!lastSyncStr) return 0;
    
    const lastSync = new Date(lastSyncStr);
    const nextSync = lastSync.getTime() + getSyncInterval();
    return Math.max(0, nextSync - Date.now());
  }

  /** Change the auto-sync interval (restarts scheduler if running) */
  setIntervalMinutes(minutes: number): void {
    const ms = minutes * 60 * 1000;
    if (this.isRunning) {
      this.start(ms);
    } else {
      localStorage.setItem(SYNC_INTERVAL_KEY, String(ms));
    }
  }

  /** Get current interval in minutes */
  getIntervalMinutes(): number {
    return Math.round(getSyncInterval() / 60000);
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }
}

// Export singleton
export const healthSyncScheduler = HealthSyncScheduler.getInstance();
export default healthSyncScheduler;
