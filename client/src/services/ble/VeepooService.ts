/**
 * Veepoo/HBand BLE Service
 * Implements the Veepoo SDK protocol for VE30 and similar smartwatches
 * 
 * Based on HBandSDK: https://github.com/HBandSDK
 * 
 * Service UUIDs:
 * - Main Service: 0000ae00-0000-1000-8000-00805f9b34fb
 * - Write Characteristic: 0000ae01-0000-1000-8000-00805f9b34fb
 * - Notify Characteristic: 0000ae02-0000-1000-8000-00805f9b34fb
 */

// Veepoo Service UUIDs
export const VEEPOO_SERVICE_UUID = '0000ae00-0000-1000-8000-00805f9b34fb';
export const VEEPOO_WRITE_UUID = '0000ae01-0000-1000-8000-00805f9b34fb';
export const VEEPOO_NOTIFY_UUID = '0000ae02-0000-1000-8000-00805f9b34fb';

// Command opcodes for Veepoo protocol
export enum VeepooCommand {
  // Device commands
  PASSWORD_VERIFY = 0x20,
  SYNC_TIME = 0x01,
  GET_DEVICE_INFO = 0x02,
  GET_BATTERY = 0x03,
  
  // Health measurement commands
  START_HEART_RATE = 0x11,
  STOP_HEART_RATE = 0x12,
  START_BLOOD_PRESSURE = 0x13,
  STOP_BLOOD_PRESSURE = 0x14,
  START_SPO2 = 0x15,
  STOP_SPO2 = 0x16,
  START_TEMPERATURE = 0x17,
  STOP_TEMPERATURE = 0x18,
  START_BLOOD_GLUCOSE = 0x19,
  STOP_BLOOD_GLUCOSE = 0x1A,
  
  // Data reading commands
  READ_HEART_RATE_HISTORY = 0x21,
  READ_BLOOD_PRESSURE_HISTORY = 0x22,
  READ_SPO2_HISTORY = 0x23,
  READ_STEP_HISTORY = 0x24,
  READ_SLEEP_HISTORY = 0x25,
  READ_HRV_DATA = 0x26,
  READ_ECG_DATA = 0x27,
  
  // Extended health measurement commands
  START_ECG = 0x1B,
  STOP_ECG = 0x1C,
  START_URIC_ACID = 0x1D,
  STOP_URIC_ACID = 0x1E,
  START_CHOLESTEROL = 0x1F,
  STOP_CHOLESTEROL = 0x28,
  START_GYM_WORKOUT = 0x29,
  STOP_GYM_WORKOUT = 0x2A,
  READ_GYM_HISTORY = 0x2B,
  START_OUTDOOR_ACTIVITY = 0x2C,
  STOP_OUTDOOR_ACTIVITY = 0x2D,
  READ_OUTDOOR_HISTORY = 0x2E,

  // Settings
  SET_PERSONAL_INFO = 0x30,
  SET_ALARM = 0x31,
  SET_NOTIFICATION = 0x32,
  FIND_DEVICE = 0x33,
}

// Health data types
export interface HeartRateData {
  timestamp: Date;
  heartRate: number;
  status: 'normal' | 'high' | 'low' | 'irregular';
}

export interface BloodPressureData {
  timestamp: Date;
  systolic: number;
  diastolic: number;
  heartRate?: number;
}

export interface SpO2Data {
  timestamp: Date;
  spO2: number;
  heartRate?: number;
}

export interface StepData {
  timestamp: Date;
  steps: number;
  calories: number;
  distance: number; // in meters
}

export interface SleepData {
  timestamp: Date;
  startTime: Date;
  endTime: Date;
  deepSleep: number; // minutes
  lightSleep: number; // minutes
  awake: number; // minutes
}

export interface TemperatureData {
  timestamp: Date;
  temperature: number; // in Celsius
}

export interface BloodGlucoseData {
  timestamp: Date;
  glucose: number; // mmol/L
}

export interface HrvData {
  timestamp: Date;
  hrv: number; // RMSSD in milliseconds
}

export interface StepHistoryData {
  timestamp: Date;
  steps: number;
  calories: number;
  distance: number; // metres
  activeMinutes: number;
}

export interface SleepHistoryData {
  timestamp: Date;
  totalMinutes: number;
  deepMinutes: number;
  lightMinutes: number;
  remMinutes: number;
  awakeMinutes: number;
  efficiency: number; // 0-100
}

export interface EcgData {
  timestamp: Date;
  rhythm: 'normal' | 'afib' | 'irregular' | 'unknown';
  samples: number[];    // raw mV values, at sampleRate Hz
  sampleRate: number;   // Hz (typically 250 Hz for HBand)
  durationMs: number;
}

export interface UricAcidData {
  timestamp: Date;
  uricAcid: number;    // μmol/L
}

export interface CholesterolData {
  timestamp: Date;
  total: number;  // mmol/L
  hdl: number;    // mmol/L
  ldl: number;    // mmol/L
}

export type WorkoutType = 'running' | 'cycling' | 'strength' | 'yoga' | 'swimming' | 'other';

export interface GymActivityData {
  timestamp: Date;
  workoutType: WorkoutType;
  durationMinutes: number;
  calories: number;
  avgHeartRate: number;
  maxHeartRate: number;
  steps: number;
}

export interface GpsCoordinate {
  lat: number;
  lng: number;
  altitudeM: number;
  speedKmh: number;
  timestamp: Date;
}

export interface OutdoorActivityData {
  timestamp: Date;
  activityType: 'walk' | 'run' | 'cycling' | 'hike' | 'other';
  durationMinutes: number;
  distanceMeters: number;
  calories: number;
  avgHeartRate: number;
  avgPaceSecPerKm: number;  // seconds per km
  route: GpsCoordinate[];
}

export interface DeviceInfo {
  name: string;
  model: string;
  version: string;
  battery: number;
  mac?: string;
}

// Callback interfaces
export interface VeepooCallbacks {
  onConnected?: (device: BluetoothDevice) => void;
  onDisconnected?: () => void;
  onHeartRateData?: (data: HeartRateData) => void;
  onBloodPressureData?: (data: BloodPressureData) => void;
  onSpO2Data?: (data: SpO2Data) => void;
  onTemperatureData?: (data: TemperatureData) => void;
  onBloodGlucoseData?: (data: BloodGlucoseData) => void;
  onStepData?: (data: StepData) => void;
  onSleepData?: (data: SleepData) => void;
  onHrvData?: (data: HrvData) => void;
  onStepHistoryData?: (data: StepHistoryData) => void;
  onSleepHistoryData?: (data: SleepHistoryData) => void;
  onEcgData?: (data: EcgData) => void;
  onUricAcidData?: (data: UricAcidData) => void;
  onCholesterolData?: (data: CholesterolData) => void;
  onGymActivityData?: (data: GymActivityData) => void;
  onOutdoorActivityData?: (data: OutdoorActivityData) => void;
  onBatteryUpdate?: (level: number) => void;
  onError?: (error: Error) => void;
}

/**
 * VeepooService - Manages Bluetooth connection and data exchange with Veepoo devices
 */
export class VeepooService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private callbacks: VeepooCallbacks = {};
  private isConnected = false;
  private responseBuffer: Uint8Array = new Uint8Array(0);
  private pendingCommands: Map<number, { resolve: (data: Uint8Array) => void; reject: (error: Error) => void }> = new Map();
  
  constructor() {
    this.handleNotification = this.handleNotification.bind(this);
    this.handleDisconnection = this.handleDisconnection.bind(this);
  }

  /**
   * Set callbacks for device events
   */
  setCallbacks(callbacks: VeepooCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Check if Web Bluetooth is supported
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 
           'bluetooth' in navigator && 
           typeof navigator.bluetooth.requestDevice === 'function';
  }

  /**
   * Get supported device features based on device name
   */
  static getDeviceFeatures(deviceName: string): string[] {
    const nameLower = deviceName.toLowerCase();
    const features: string[] = [];
    
    // VE30 and similar models support these features
    if (nameLower.includes('ve30') || nameLower.includes('ve20') || nameLower.includes('ve40')) {
      features.push(
        'Heart Rate',
        'Blood Pressure',
        'Blood Oxygen',
        'Steps',
        'Calories',
        'Sleep',
        'Temperature',
        'HRV'
      );
    }
    
    // Generic Veepoo device features
    if (features.length === 0) {
      features.push('Heart Rate', 'Steps', 'Calories', 'Sleep');
    }
    
    return features;
  }

  /**
   * Scan and connect to a Veepoo device
   */
  async connect(): Promise<DeviceInfo | null> {
    if (!VeepooService.isSupported()) {
      throw new Error('Web Bluetooth is not supported on this browser');
    }

    try {
      // Request device with Veepoo service UUID
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [VEEPOO_SERVICE_UUID] },
          // Also accept devices by name pattern
          { namePrefix: 'VE' },
          { namePrefix: 'V' },
        ],
        optionalServices: [
          VEEPOO_SERVICE_UUID,
          'battery_service',
          'device_information',
          'heart_rate',
        ]
      });

      if (!this.device) {
        throw new Error('No device selected');
      }

      // Listen for disconnection
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnection);

      // Connect to GATT server
      this.server = await this.device.gatt!.connect();
      
      // Get the Veepoo service
      try {
        this.service = await this.server.getPrimaryService(VEEPOO_SERVICE_UUID);
      } catch (e) {
        console.log('Veepoo service not found, trying standard services...');
        // Fallback to standard heart rate service
        try {
          this.service = await this.server.getPrimaryService('heart_rate');
        } catch (e2) {
          throw new Error('Device does not support Veepoo or standard health services');
        }
      }

      // Get characteristics
      try {
        this.writeCharacteristic = await this.service.getCharacteristic(VEEPOO_WRITE_UUID);
        this.notifyCharacteristic = await this.service.getCharacteristic(VEEPOO_NOTIFY_UUID);
        
        // Enable notifications
        await this.notifyCharacteristic.startNotifications();
        this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification);
      } catch (e) {
        console.log('Custom characteristics not found, using standard...');
      }

      this.isConnected = true;
      
      // Get device info
      const deviceInfo = await this.getDeviceInfo();
      
      // Notify callback
      if (this.callbacks.onConnected) {
        this.callbacks.onConnected(this.device);
      }

      return deviceInfo;
    } catch (error) {
      console.error('Connection error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error as Error);
      }
      throw error;
    }
  }

  /**
   * Connect to a specific device by ID (for reconnection)
   */
  async connectToDevice(deviceId: string): Promise<DeviceInfo | null> {
    // Web Bluetooth doesn't support connecting by ID directly
    // The device needs to be in the browser's permission list
    return this.connect();
  }

  /**
   * Attach to an already-connected BluetoothRemoteGATTServer (no new device picker).
   * Use this when the pairing flow in Index.tsx has already called device.gatt.connect().
   */
  async connectWithServer(device: BluetoothDevice, server: BluetoothRemoteGATTServer): Promise<boolean> {
    try {
      this.device = device;
      this.server = server;

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnection);

      // Get Veepoo service
      this.service = await this.server.getPrimaryService(VEEPOO_SERVICE_UUID);

      // Get write + notify characteristics and start notifications
      this.writeCharacteristic = await this.service.getCharacteristic(VEEPOO_WRITE_UUID);
      this.notifyCharacteristic = await this.service.getCharacteristic(VEEPOO_NOTIFY_UUID);
      await this.notifyCharacteristic.startNotifications();
      this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification);

      this.isConnected = true;
      console.log('[VeepooService] Attached to existing GATT server for', device.name);
      return true;
    } catch (e) {
      console.error('[VeepooService] connectWithServer failed:', e);
      this.cleanup();
      return false;
    }
  }

  /**
   * Try to silently reconnect to a previously-paired Veepoo device using
   * navigator.bluetooth.getDevices() (no device picker popup).
   * Returns true if successfully reconnected.
   */
  async reconnect(): Promise<boolean> {
    if (this.getConnectionStatus()) return true; // already connected

    try {
      // Prefer the cached device reference (set during connect/connectWithServer)
      // to avoid needing getDevices() which only works for requestDevice()-paired devices.
      let veepooDevice: BluetoothDevice | undefined = this.device ?? undefined;

      if (!veepooDevice) {
        // Fall back to getDevices() for devices paired via the browser picker
        const devices: BluetoothDevice[] = await (navigator.bluetooth as any).getDevices?.() ?? [];
        veepooDevice = devices.find((d) => {
          const name = (d.name ?? '').toUpperCase();
          return name.startsWith('VE') || name.includes('HBAND') || name.includes('VEEPOO');
        });
      }

      if (!veepooDevice) {
        console.log('[VeepooService] No previously-paired Veepoo device found');
        return false;
      }

      console.log('[VeepooService] Reconnecting to', veepooDevice.name, '...');
      this.device = veepooDevice;
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnection);

      this.server = await veepooDevice.gatt!.connect();
      this.service = await this.server.getPrimaryService(VEEPOO_SERVICE_UUID);
      this.writeCharacteristic = await this.service.getCharacteristic(VEEPOO_WRITE_UUID);
      this.notifyCharacteristic = await this.service.getCharacteristic(VEEPOO_NOTIFY_UUID);
      await this.notifyCharacteristic.startNotifications();
      this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification);

      this.isConnected = true;
      console.log('[VeepooService] Reconnected to', veepooDevice.name);
      return true;
    } catch (e) {
      console.error('[VeepooService] Reconnect failed:', e);
      this.cleanup();
      return false;
    }
  }

  /**
   * Disconnect from the device
   */
  async disconnect(): Promise<void> {
    if (this.notifyCharacteristic) {
      try {
        await this.notifyCharacteristic.stopNotifications();
        this.notifyCharacteristic.removeEventListener('characteristicvaluechanged', this.handleNotification);
      } catch (e) {
        console.log('Error stopping notifications:', e);
      }
    }

    if (this.server?.connected) {
      this.server.disconnect();
    }

    this.cleanup();
  }

  /**
   * Handle device disconnection
   */
  private handleDisconnection() {
    console.log('Device disconnected');
    this.cleanup();
    if (this.callbacks.onDisconnected) {
      this.callbacks.onDisconnected();
    }
  }

  /**
   * Cleanup connection state
   */
  private cleanup() {
    this.isConnected = false;
    // NOTE: intentionally keep this.device — reconnect() needs it to re-establish
    // a GATT connection without showing the device picker again.
    this.server = null;
    this.service = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.responseBuffer = new Uint8Array(0);
    this.pendingCommands.clear();
  }

  /**
   * Handle incoming notifications from the device
   */
  private handleNotification(event: Event) {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    
    if (!value) return;

    const data = new Uint8Array(value.buffer);
    console.log('Received data:', this.arrayToHex(data));
    
    // Parse the response based on command type
    this.parseResponse(data);
  }

  /**
   * Parse response data from device
   */
  private parseResponse(data: Uint8Array) {
    if (data.length < 2) return;

    const commandType = data[0];
    const payload = data.slice(1);

    switch (commandType) {
      case VeepooCommand.START_HEART_RATE: // 0x11
        this.parseHeartRateData(payload);
        break;
      
      case VeepooCommand.START_BLOOD_PRESSURE: // 0x13
        this.parseBloodPressureData(payload);
        break;
      
      case VeepooCommand.START_SPO2: // 0x15
        this.parseSpO2Data(payload);
        break;
      
      case VeepooCommand.START_TEMPERATURE: // 0x17
        this.parseTemperatureData(payload);
        break;
      
      case VeepooCommand.GET_BATTERY: // 0x03
        this.parseBatteryData(payload);
        break;

      case VeepooCommand.START_BLOOD_GLUCOSE: // 0x19
        this.parseBloodGlucoseData(payload);
        break;

      case VeepooCommand.READ_STEP_HISTORY: // 0x24
        this.parseStepHistoryData(payload);
        break;

      case VeepooCommand.READ_SLEEP_HISTORY: // 0x25
        this.parseSleepHistoryData(payload);
        break;

      case VeepooCommand.READ_HRV_DATA: // 0x26
        this.parseHrvData(payload);
        break;

      case VeepooCommand.READ_ECG_DATA:     // 0x27 — history read or live response
      case VeepooCommand.START_ECG:         // 0x1B — live ECG stream
        this.parseEcgData(payload);
        break;

      case VeepooCommand.START_URIC_ACID:   // 0x1D
        this.parseUricAcidData(payload);
        break;

      case VeepooCommand.START_CHOLESTEROL: // 0x1F
        this.parseCholesterolData(payload);
        break;

      case VeepooCommand.STOP_GYM_WORKOUT:  // 0x2A — device sends summary on stop
      case VeepooCommand.READ_GYM_HISTORY:  // 0x2B
        this.parseGymActivityData(payload);
        break;

      case VeepooCommand.STOP_OUTDOOR_ACTIVITY: // 0x2D — device sends summary on stop
      case VeepooCommand.READ_OUTDOOR_HISTORY:  // 0x2E
        this.parseOutdoorActivityData(payload);
        break;

      default:
        // Check if there's a pending command waiting for this response
        if (this.pendingCommands.has(commandType)) {
          const { resolve } = this.pendingCommands.get(commandType)!;
          this.pendingCommands.delete(commandType);
          resolve(data);
        }
        break;
    }
  }

  /**
   * Parse heart rate data
   */
  private parseHeartRateData(data: Uint8Array) {
    if (data.length < 2) return;

    const status = data[0];
    const heartRate = data[1];

    if (heartRate > 0 && heartRate < 250) {
      const hrData: HeartRateData = {
        timestamp: new Date(),
        heartRate,
        status: status === 0 ? 'normal' : status === 1 ? 'high' : status === 2 ? 'low' : 'irregular'
      };

      if (this.callbacks.onHeartRateData) {
        this.callbacks.onHeartRateData(hrData);
      }
    }
  }

  /**
   * Parse blood pressure data
   */
  private parseBloodPressureData(data: Uint8Array) {
    if (data.length < 3) return;

    const status = data[0];
    const systolic = data[1];
    const diastolic = data[2];
    const heartRate = data.length > 3 ? data[3] : undefined;

    if (systolic > 0 && diastolic > 0) {
      const bpData: BloodPressureData = {
        timestamp: new Date(),
        systolic,
        diastolic,
        heartRate
      };

      if (this.callbacks.onBloodPressureData) {
        this.callbacks.onBloodPressureData(bpData);
      }
    }
  }

  /**
   * Parse SpO2 data
   */
  private parseSpO2Data(data: Uint8Array) {
    if (data.length < 2) return;

    const status = data[0];
    const spO2 = data[1];
    const heartRate = data.length > 2 ? data[2] : undefined;

    if (spO2 > 0 && spO2 <= 100) {
      const spo2Data: SpO2Data = {
        timestamp: new Date(),
        spO2,
        heartRate
      };

      if (this.callbacks.onSpO2Data) {
        this.callbacks.onSpO2Data(spo2Data);
      }
    }
  }

  /**
   * Parse temperature data
   */
  private parseTemperatureData(data: Uint8Array) {
    if (data.length < 2) return;

    // Temperature is usually in 0.1°C units
    const tempRaw = (data[0] << 8) | data[1];
    const temperature = tempRaw / 10;

    if (temperature > 30 && temperature < 45) {
      const tempData: TemperatureData = {
        timestamp: new Date(),
        temperature
      };

      if (this.callbacks.onTemperatureData) {
        this.callbacks.onTemperatureData(tempData);
      }
    }
  }

  /**
   * Parse battery data
   */
  private parseBatteryData(data: Uint8Array) {
    if (data.length < 1) return;

    const battery = data[0];
    
    if (battery >= 0 && battery <= 100) {
      if (this.callbacks.onBatteryUpdate) {
        this.callbacks.onBatteryUpdate(battery);
      }
    }
  }

  /**
   * Parse blood glucose data
   * Packet: [status, glucose_high, glucose_low] — value in 0.1 mmol/L units
   */
  private parseBloodGlucoseData(data: Uint8Array) {
    if (data.length < 3) return;
    const raw = (data[1] << 8) | data[2];
    const glucose = raw / 10; // convert to mmol/L
    if (glucose > 0 && glucose < 40) {
      const bgData: BloodGlucoseData = { timestamp: new Date(), glucose };
      if (this.callbacks.onBloodGlucoseData) this.callbacks.onBloodGlucoseData(bgData);
    }
  }

  /**
   * Parse step history data
   * Packet: [steps_high, steps_low, cal_high, cal_low, dist_high, dist_low, active_min]
   */
  private parseStepHistoryData(data: Uint8Array) {
    if (data.length < 7) return;
    const steps = (data[0] << 8) | data[1];
    const calories = (data[2] << 8) | data[3];
    const distance = (data[4] << 8) | data[5];
    const activeMinutes = data[6];
    if (steps >= 0) {
      const stepData: StepHistoryData = {
        timestamp: new Date(), steps, calories, distance, activeMinutes
      };
      if (this.callbacks.onStepHistoryData) this.callbacks.onStepHistoryData(stepData);
      // Also fire the legacy StepData callback for compatibility
      const legacyData: StepData = { timestamp: new Date(), steps, calories, distance };
      if (this.callbacks.onStepData) this.callbacks.onStepData(legacyData);
    }
  }

  /**
   * Parse sleep history data
   * Packet: [total_high, total_low, deep_min, light_min, rem_min, awake_min, efficiency]
   */
  private parseSleepHistoryData(data: Uint8Array) {
    if (data.length < 7) return;
    const totalMinutes = (data[0] << 8) | data[1];
    const deepMinutes  = data[2];
    const lightMinutes = data[3];
    const remMinutes   = data[4];
    const awakeMinutes = data[5];
    const efficiency   = data[6]; // 0-100
    if (totalMinutes > 0) {
      const sleepData: SleepHistoryData = {
        timestamp: new Date(), totalMinutes, deepMinutes, lightMinutes,
        remMinutes, awakeMinutes, efficiency
      };
      if (this.callbacks.onSleepHistoryData) this.callbacks.onSleepHistoryData(sleepData);
      // Legacy SleepData callback
      const legacyData: SleepData = {
        timestamp: new Date(),
        startTime: new Date(Date.now() - totalMinutes * 60000),
        endTime: new Date(),
        deepSleep: deepMinutes,
        lightSleep: lightMinutes,
        awake: awakeMinutes
      };
      if (this.callbacks.onSleepData) this.callbacks.onSleepData(legacyData);
    }
  }

  /**
   * Parse HRV data
   * Packet: [hrv_high, hrv_low] — RMSSD in ms
   */
  private parseHrvData(data: Uint8Array) {
    if (data.length < 2) return;
    const hrv = (data[0] << 8) | data[1];
    if (hrv > 0 && hrv < 300) {
      const hrvData: HrvData = { timestamp: new Date(), hrv };
      if (this.callbacks.onHrvData) this.callbacks.onHrvData(hrvData);
    }
  }

  /**
   * Parse ECG data
   * Packet: [rhythm, sample_count_high, sample_count_low, sample_rate, ...int16_samples_big_endian]
   * rhythm: 0=normal, 1=afib, 2=irregular
   * sample_rate: 0=125Hz, 1=250Hz, 2=500Hz
   */
  private parseEcgData(data: Uint8Array) {
    if (data.length < 4) return;
    const rhythmByte = data[0];
    const sampleCount = (data[1] << 8) | data[2];
    const sampleRateCode = data[3];
    const sampleRates = [125, 250, 500];
    const sampleRate = sampleRates[sampleRateCode] ?? 250;
    const rhythmMap: EcgData['rhythm'][] = ['normal', 'afib', 'irregular', 'unknown'];
    const rhythm = rhythmMap[rhythmByte] ?? 'unknown';

    // Each sample is a signed int16 (big-endian), in μV
    const samples: number[] = [];
    for (let i = 4; i + 1 < data.length && samples.length < sampleCount; i += 2) {
      const raw = (data[i] << 8) | data[i + 1];
      // Convert to signed
      const signed = raw > 0x7FFF ? raw - 0x10000 : raw;
      samples.push(signed / 1000); // μV → mV
    }

    const durationMs = samples.length > 0 ? Math.round((samples.length / sampleRate) * 1000) : 0;

    const ecgData: EcgData = { timestamp: new Date(), rhythm, samples, sampleRate, durationMs };
    if (this.callbacks.onEcgData) this.callbacks.onEcgData(ecgData);
  }

  /**
   * Parse uric acid data
   * Packet: [status, value_high, value_low] — value in 0.1 μmol/L units
   */
  private parseUricAcidData(data: Uint8Array) {
    if (data.length < 3) return;
    const raw = (data[1] << 8) | data[2];
    const uricAcid = raw / 10; // → μmol/L
    if (uricAcid > 0 && uricAcid < 1200) {
      const uaData: UricAcidData = { timestamp: new Date(), uricAcid };
      if (this.callbacks.onUricAcidData) this.callbacks.onUricAcidData(uaData);
    }
  }

  /**
   * Parse cholesterol data
   * Packet: [status, total_high, total_low, hdl_high, hdl_low, ldl_high, ldl_low]
   * Values in 0.01 mmol/L units
   */
  private parseCholesterolData(data: Uint8Array) {
    if (data.length < 7) return;
    const total = ((data[1] << 8) | data[2]) / 100;
    const hdl   = ((data[3] << 8) | data[4]) / 100;
    const ldl   = ((data[5] << 8) | data[6]) / 100;
    if (total > 0) {
      const cholData: CholesterolData = { timestamp: new Date(), total, hdl, ldl };
      if (this.callbacks.onCholesterolData) this.callbacks.onCholesterolData(cholData);
    }
  }

  /**
   * Parse gym workout data
   * Packet: [workout_type, duration_high, duration_low, cal_high, cal_low,
   *          avg_hr, max_hr, steps_high, steps_low]
   * workout_type: 0=running,1=cycling,2=strength,3=yoga,4=swimming,5=other
   */
  private parseGymActivityData(data: Uint8Array) {
    if (data.length < 9) return;
    const typeMap: WorkoutType[] = ['running', 'cycling', 'strength', 'yoga', 'swimming', 'other'];
    const workoutType: WorkoutType = typeMap[data[0]] ?? 'other';
    const durationMinutes = (data[1] << 8) | data[2];
    const calories        = (data[3] << 8) | data[4];
    const avgHeartRate    = data[5];
    const maxHeartRate    = data[6];
    const steps           = (data[7] << 8) | data[8];
    if (durationMinutes > 0) {
      const gymData: GymActivityData = {
        timestamp: new Date(), workoutType, durationMinutes, calories, avgHeartRate, maxHeartRate, steps
      };
      if (this.callbacks.onGymActivityData) this.callbacks.onGymActivityData(gymData);
    }
  }

  /**
   * Parse outdoor activity data
   * Packet: [activity_type, duration_high, duration_low,
   *          distance_high(3B), calories_high, calories_low,
   *          avg_hr, gps_count_high, gps_count_low,
   *          ...gps points: lat(4B), lng(4B), alt(2B), speed(1B), ts_offset(2B)]
   * distance: metres (3 bytes big-endian)
   * lat/lng: signed int32 × 1e-7 degrees
   */
  private parseOutdoorActivityData(data: Uint8Array) {
    if (data.length < 10) return;
    const actTypeMap: OutdoorActivityData['activityType'][] = ['walk', 'run', 'cycling', 'hike', 'other'];
    const activityType = actTypeMap[data[0]] ?? 'other';
    const durationMinutes = (data[1] << 8) | data[2];
    const distanceMeters  = (data[3] << 16) | (data[4] << 8) | data[5];
    const calories        = (data[6] << 8) | data[7];
    const avgHeartRate    = data[8];
    const gpsCount        = (data[9] << 8) | (data[10] ?? 0);

    // Parse GPS route points (each point = 13 bytes)
    const route: GpsCoordinate[] = [];
    const baseOffset = 11;
    const now = Date.now();
    for (let i = 0; i < gpsCount && baseOffset + i * 13 + 12 < data.length; i++) {
      const off = baseOffset + i * 13;
      const latRaw = ((data[off] << 24) | (data[off+1] << 16) | (data[off+2] << 8) | data[off+3]);
      const lngRaw = ((data[off+4] << 24) | (data[off+5] << 16) | (data[off+6] << 8) | data[off+7]);
      const altRaw = (data[off+8] << 8) | data[off+9];
      const speedRaw = data[off+10];
      const tsOffset = (data[off+11] << 8) | data[off+12]; // seconds from start
      route.push({
        lat: latRaw / 1e7,
        lng: lngRaw / 1e7,
        altitudeM: altRaw / 10,
        speedKmh: speedRaw / 10,
        timestamp: new Date(now - (durationMinutes * 60 - tsOffset) * 1000)
      });
    }

    const avgPaceSecPerKm = distanceMeters > 0
      ? Math.round((durationMinutes * 60) / (distanceMeters / 1000))
      : 0;

    if (durationMinutes > 0) {
      const outdoorData: OutdoorActivityData = {
        timestamp: new Date(), activityType, durationMinutes, distanceMeters,
        calories, avgHeartRate, avgPaceSecPerKm, route
      };
      if (this.callbacks.onOutdoorActivityData) this.callbacks.onOutdoorActivityData(outdoorData);
    }
  }

  /**
   * Send command to device
   */
  private async sendCommand(command: number, data: Uint8Array = new Uint8Array(0)): Promise<Uint8Array> {
    if (!this.writeCharacteristic) {
      throw new Error('Device not connected');
    }

    // Build command packet
    const packet = new Uint8Array(data.length + 1);
    packet[0] = command;
    packet.set(data, 1);

    console.log('Sending command:', this.arrayToHex(packet));

    // Create promise for response
    const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
      this.pendingCommands.set(command, { resolve, reject });
      
      // Timeout after 5 seconds (shorter to avoid stressing the GATT link
      // with many long-pending commands when the device ignores a command)
      setTimeout(() => {
        if (this.pendingCommands.has(command)) {
          this.pendingCommands.delete(command);
          reject(new Error('Command timeout'));
        }
      }, 5000);
    });

    // Send the command
    await this.writeCharacteristic.writeValue(packet);

    return responsePromise;
  }

  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    const info: DeviceInfo = {
      name: this.device?.name || 'Unknown Device',
      model: 'VE30',
      version: '1.0',
      battery: 100
    };

    // Try to get battery level
    try {
      if (this.server) {
        const batteryService = await this.server.getPrimaryService('battery_service');
        const batteryChar = await batteryService.getCharacteristic('battery_level');
        const batteryValue = await batteryChar.readValue();
        info.battery = batteryValue.getUint8(0);
      }
    } catch (e) {
      console.log('Could not read battery level');
    }

    // Try to get device info
    try {
      if (this.server) {
        const deviceInfoService = await this.server.getPrimaryService('device_information');
        
        try {
          const modelChar = await deviceInfoService.getCharacteristic('model_number_string');
          const modelValue = await modelChar.readValue();
          info.model = new TextDecoder().decode(modelValue);
        } catch (e) {
          // Optional metadata; ignore if unavailable.
        }

        try {
          const versionChar = await deviceInfoService.getCharacteristic('firmware_revision_string');
          const versionValue = await versionChar.readValue();
          info.version = new TextDecoder().decode(versionValue);
        } catch (e) {
          // Optional metadata; ignore if unavailable.
        }
      }
    } catch (e) {
      console.log('Could not read device info');
    }

    return info;
  }

  /**
   * Start heart rate measurement
   */
  async startHeartRateMeasurement(): Promise<void> {
    if (!this.writeCharacteristic) {
      // No proprietary channel — try standard GATT heart rate service
      await this.startStandardHeartRate();
      return;
    }

    try {
      await this.sendCommand(VeepooCommand.START_HEART_RATE);
    } catch (e) {
      // Proprietary channel exists but command failed (e.g. device busy).
      // Do NOT fall back to standard GATT — Veepoo devices (VE35PRO etc.)
      // use the ae00 notify channel for responses, not the standard heart_rate
      // service. Log the failure and return gracefully; the notify callback
      // will fire when the device sends data.
      console.log('Veepoo: START_HEART_RATE command failed, device may not support on-demand HR trigger:', e);
    }
  }

  /**
   * Start heart rate using standard GATT service
   */
  private async startStandardHeartRate(): Promise<void> {
    if (!this.server) throw new Error('Not connected');

    try {
      const hrService = await this.server.getPrimaryService('heart_rate');
      const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
      
      await hrChar.startNotifications();
      hrChar.addEventListener('characteristicvaluechanged', (event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
        if (value) {
          const flags = value.getUint8(0);
          const is16Bit = (flags & 0x01) !== 0;
          const heartRate = is16Bit ? value.getUint16(1, true) : value.getUint8(1);
          
          if (this.callbacks.onHeartRateData) {
            this.callbacks.onHeartRateData({
              timestamp: new Date(),
              heartRate,
              status: 'normal'
            });
          }
        }
      });
    } catch (e) {
      throw new Error('Heart rate service not available');
    }
  }

  /**
   * Stop heart rate measurement
   */
  async stopHeartRateMeasurement(): Promise<void> {
    if (this.writeCharacteristic) {
      try {
        await this.sendCommand(VeepooCommand.STOP_HEART_RATE);
      } catch (e) {
        console.log('Error stopping heart rate:', e);
      }
    }
  }

  /**
   * Start blood pressure measurement
   */
  async startBloodPressureMeasurement(): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('Blood pressure measurement requires Veepoo protocol');
    }
    await this.sendCommand(VeepooCommand.START_BLOOD_PRESSURE);
  }

  /**
   * Stop blood pressure measurement
   */
  async stopBloodPressureMeasurement(): Promise<void> {
    if (this.writeCharacteristic) {
      await this.sendCommand(VeepooCommand.STOP_BLOOD_PRESSURE);
    }
  }

  /**
   * Start SpO2 measurement
   */
  async startSpO2Measurement(): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('SpO2 measurement requires Veepoo protocol');
    }
    await this.sendCommand(VeepooCommand.START_SPO2);
  }

  /**
   * Stop SpO2 measurement
   */
  async stopSpO2Measurement(): Promise<void> {
    if (this.writeCharacteristic) {
      await this.sendCommand(VeepooCommand.STOP_SPO2);
    }
  }

  /**
   * Start temperature measurement
   */
  async startTemperatureMeasurement(): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('Temperature measurement requires Veepoo protocol');
    }
    await this.sendCommand(VeepooCommand.START_TEMPERATURE);
  }

  /**
   * Stop temperature measurement
   */
  async stopTemperatureMeasurement(): Promise<void> {
    if (this.writeCharacteristic) {
      await this.sendCommand(VeepooCommand.STOP_TEMPERATURE);
    }
  }

  /**
   * Start blood glucose measurement
   */
  async startBloodGlucoseMeasurement(): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('Blood glucose measurement requires Veepoo protocol');
    }
    await this.sendCommand(VeepooCommand.START_BLOOD_GLUCOSE);
  }

  /**
   * Stop blood glucose measurement
   */
  async stopBloodGlucoseMeasurement(): Promise<void> {
    if (this.writeCharacteristic) {
      await this.sendCommand(VeepooCommand.STOP_BLOOD_GLUCOSE);
    }
  }

  /**
   * Read step/calorie/distance history for today
   */
  async readStepHistory(): Promise<void> {
    if (!this.writeCharacteristic) return;
    try {
      await this.sendCommand(VeepooCommand.READ_STEP_HISTORY);
    } catch (e) {
      console.error('Error reading step history:', e);
    }
  }

  /**
   * Read sleep analysis history for last night
   */
  async readSleepHistory(): Promise<void> {
    if (!this.writeCharacteristic) return;
    try {
      await this.sendCommand(VeepooCommand.READ_SLEEP_HISTORY);
    } catch (e) {
      console.error('Error reading sleep history:', e);
    }
  }

  /**
   * Read HRV (heart rate variability) data
   */
  async readHrvData(): Promise<void> {
    if (!this.writeCharacteristic) return;
    try {
      await this.sendCommand(VeepooCommand.READ_HRV_DATA);
    } catch (e) {
      console.error('Error reading HRV data:', e);
    }
  }

  /**
   * Start ECG recording
   */
  async startECGRecording(): Promise<void> {
    if (!this.writeCharacteristic) throw new Error('ECG requires Veepoo protocol');
    await this.sendCommand(VeepooCommand.START_ECG);
  }

  /**
   * Stop ECG recording and receive result
   */
  async stopECGRecording(): Promise<void> {
    if (this.writeCharacteristic) {
      try { await this.sendCommand(VeepooCommand.STOP_ECG); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Read stored ECG history from device
   */
  async readECGHistory(): Promise<void> {
    if (!this.writeCharacteristic) return;
    try { await this.sendCommand(VeepooCommand.READ_ECG_DATA); } catch (e) { /* optional */ }
  }

  /**
   * Start uric acid measurement
   */
  async startUricAcidMeasurement(): Promise<void> {
    if (!this.writeCharacteristic) throw new Error('Uric acid requires Veepoo protocol');
    await this.sendCommand(VeepooCommand.START_URIC_ACID);
  }

  /**
   * Stop uric acid measurement
   */
  async stopUricAcidMeasurement(): Promise<void> {
    if (this.writeCharacteristic) {
      try { await this.sendCommand(VeepooCommand.STOP_URIC_ACID); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Start cholesterol measurement
   */
  async startCholesterolMeasurement(): Promise<void> {
    if (!this.writeCharacteristic) throw new Error('Cholesterol requires Veepoo protocol');
    await this.sendCommand(VeepooCommand.START_CHOLESTEROL);
  }

  /**
   * Stop cholesterol measurement
   */
  async stopCholesterolMeasurement(): Promise<void> {
    if (this.writeCharacteristic) {
      try { await this.sendCommand(VeepooCommand.STOP_CHOLESTEROL); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Start a gym workout session
   * @param workoutType  0=running, 1=cycling, 2=strength, 3=yoga, 4=swimming, 5=other
   */
  async startGymWorkout(workoutType: number = 2): Promise<void> {
    if (!this.writeCharacteristic) throw new Error('Gym workout requires Veepoo protocol');
    await this.sendCommand(VeepooCommand.START_GYM_WORKOUT, new Uint8Array([workoutType & 0xFF]));
  }

  /**
   * Stop the current gym workout and receive a summary
   */
  async stopGymWorkout(): Promise<void> {
    if (this.writeCharacteristic) {
      try { await this.sendCommand(VeepooCommand.STOP_GYM_WORKOUT); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Read stored gym workout history from device
   */
  async readGymHistory(): Promise<void> {
    if (!this.writeCharacteristic) return;
    try { await this.sendCommand(VeepooCommand.READ_GYM_HISTORY); } catch (e) { /* optional */ }
  }

  /**
   * Start an outdoor activity session (activates GPS on watch)
   * @param activityType  0=walk, 1=run, 2=cycling, 3=hike, 4=other
   */
  async startOutdoorActivity(activityType: number = 1): Promise<void> {
    if (!this.writeCharacteristic) throw new Error('Outdoor activity requires Veepoo protocol');
    await this.sendCommand(VeepooCommand.START_OUTDOOR_ACTIVITY, new Uint8Array([activityType & 0xFF]));
  }

  /**
   * Stop the outdoor activity and receive summary with GPS route
   */
  async stopOutdoorActivity(): Promise<void> {
    if (this.writeCharacteristic) {
      try { await this.sendCommand(VeepooCommand.STOP_OUTDOOR_ACTIVITY); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Read stored outdoor activity history (with GPS route) from device
   */
  async readOutdoorHistory(): Promise<void> {
    if (!this.writeCharacteristic) return;
    try { await this.sendCommand(VeepooCommand.READ_OUTDOOR_HISTORY); } catch (e) { /* optional */ }
  }

  /**
   * Set personal info on device (used for calorie/distance accuracy)
   * @param height  Height in cm
   * @param weight  Weight in kg
   * @param age     Age in years
   * @param gender  0 = male, 1 = female
   */
  async setPersonalInfo(height: number, weight: number, age: number, gender: 0 | 1): Promise<void> {
    if (!this.writeCharacteristic) return;
    const data = new Uint8Array([
      Math.round(height) & 0xFF,
      Math.round(weight) & 0xFF,
      Math.round(age)    & 0xFF,
      gender,
    ]);
    await this.sendCommand(VeepooCommand.SET_PERSONAL_INFO, data);
  }

  /**
   * Set an alarm on the device
   * @param hour       0–23
   * @param minute     0–59
   * @param enabled    Whether this alarm is active
   * @param repeatDays Bitmask: bit0=Mon … bit6=Sun (0x7F = every day)
   */
  async setAlarm(hour: number, minute: number, enabled: boolean, repeatDays = 0x7F): Promise<void> {
    if (!this.writeCharacteristic) return;
    const data = new Uint8Array([
      hour   & 0xFF,
      minute & 0xFF,
      enabled ? 0x01 : 0x00,
      repeatDays & 0xFF,
    ]);
    await this.sendCommand(VeepooCommand.SET_ALARM, data);
  }

  /**
   * Enable or disable notification forwarding to the watch
   * @param type     0=call, 1=SMS, 2=app/general
   * @param enabled  true to enable, false to disable
   */
  async setNotification(type: 0 | 1 | 2, enabled: boolean): Promise<void> {
    if (!this.writeCharacteristic) return;
    const data = new Uint8Array([type, enabled ? 0x01 : 0x00]);
    await this.sendCommand(VeepooCommand.SET_NOTIFICATION, data);
  }

  /**
   * Find device (make it vibrate)
   */
  async findDevice(): Promise<void> {
    if (!this.writeCharacteristic) {
      throw new Error('Find device requires Veepoo protocol');
    }
    await this.sendCommand(VeepooCommand.FIND_DEVICE);
  }

  /**
   * Sync time to device
   */
  async syncTime(): Promise<void> {
    if (!this.writeCharacteristic) return;

    const now = new Date();
    const data = new Uint8Array([
      now.getFullYear() - 2000,
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds()
    ]);

    await this.sendCommand(VeepooCommand.SYNC_TIME, data);
  }

  /**
   * Read heart rate history
   */
  async readHeartRateHistory(): Promise<HeartRateData[]> {
    if (!this.writeCharacteristic) {
      return [];
    }

    try {
      const response = await this.sendCommand(VeepooCommand.READ_HEART_RATE_HISTORY);
      // Parse history data
      const history: HeartRateData[] = [];
      // Implementation depends on exact protocol format
      return history;
    } catch (e) {
      console.error('Error reading heart rate history:', e);
      return [];
    }
  }

  /**
   * Get battery level
   */
  async getBatteryLevel(): Promise<number> {
    // Try standard battery service first
    try {
      if (this.server) {
        const batteryService = await this.server.getPrimaryService('battery_service');
        const batteryChar = await batteryService.getCharacteristic('battery_level');
        const value = await batteryChar.readValue();
        return value.getUint8(0);
      }
    } catch (e) {
      // Try Veepoo command
      if (this.writeCharacteristic) {
        try {
          const response = await this.sendCommand(VeepooCommand.GET_BATTERY);
          if (response.length > 1) {
            return response[1];
          }
        } catch (e2) {
          console.log('Error getting battery:', e2);
        }
      }
    }
    return -1;
  }

  /**
   * Convert array to hex string for debugging
   */
  private arrayToHex(array: Uint8Array): string {
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
  }

  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected && this.server?.connected === true;
  }

  /**
   * Get connected device
   */
  getDevice(): BluetoothDevice | null {
    return this.device;
  }
}

// Create singleton instance
export const veepooService = new VeepooService();
export default veepooService;
