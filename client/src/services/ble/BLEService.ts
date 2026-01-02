/**
 * BLE (Bluetooth Low Energy) Service
 * Comprehensive SDK for connecting and syncing health devices
 */

// Standard Bluetooth GATT Service UUIDs
export const GATT_SERVICES = {
  HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
  BATTERY: '0000180f-0000-1000-8000-00805f9b34fb',
  DEVICE_INFO: '0000180a-0000-1000-8000-00805f9b34fb',
  HEALTH_THERMOMETER: '00001809-0000-1000-8000-00805f9b34fb',
  BLOOD_PRESSURE: '00001810-0000-1000-8000-00805f9b34fb',
  GLUCOSE: '00001808-0000-1000-8000-00805f9b34fb',
  WEIGHT_SCALE: '0000181d-0000-1000-8000-00805f9b34fb',
  BODY_COMPOSITION: '0000181b-0000-1000-8000-00805f9b34fb',
  USER_DATA: '0000181c-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE: '00001826-0000-1000-8000-00805f9b34fb',
  RUNNING_SPEED_CADENCE: '00001814-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER: '00001818-0000-1000-8000-00805f9b34fb',
  CYCLING_SPEED_CADENCE: '00001816-0000-1000-8000-00805f9b34fb',
  GENERIC_ACCESS: '00001800-0000-1000-8000-00805f9b34fb',
  GENERIC_ATTRIBUTE: '00001801-0000-1000-8000-00805f9b34fb',
} as const;

// Standard Bluetooth GATT Characteristic UUIDs
export const GATT_CHARACTERISTICS = {
  // Heart Rate Service
  HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',
  BODY_SENSOR_LOCATION: '00002a38-0000-1000-8000-00805f9b34fb',
  HEART_RATE_CONTROL_POINT: '00002a39-0000-1000-8000-00805f9b34fb',
  
  // Battery Service
  BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',
  
  // Device Information Service
  MANUFACTURER_NAME: '00002a29-0000-1000-8000-00805f9b34fb',
  MODEL_NUMBER: '00002a24-0000-1000-8000-00805f9b34fb',
  SERIAL_NUMBER: '00002a25-0000-1000-8000-00805f9b34fb',
  HARDWARE_REVISION: '00002a27-0000-1000-8000-00805f9b34fb',
  FIRMWARE_REVISION: '00002a26-0000-1000-8000-00805f9b34fb',
  SOFTWARE_REVISION: '00002a28-0000-1000-8000-00805f9b34fb',
  
  // Health Thermometer
  TEMPERATURE_MEASUREMENT: '00002a1c-0000-1000-8000-00805f9b34fb',
  TEMPERATURE_TYPE: '00002a1d-0000-1000-8000-00805f9b34fb',
  INTERMEDIATE_TEMPERATURE: '00002a1e-0000-1000-8000-00805f9b34fb',
  
  // Blood Pressure
  BLOOD_PRESSURE_MEASUREMENT: '00002a35-0000-1000-8000-00805f9b34fb',
  INTERMEDIATE_CUFF_PRESSURE: '00002a36-0000-1000-8000-00805f9b34fb',
  BLOOD_PRESSURE_FEATURE: '00002a49-0000-1000-8000-00805f9b34fb',
  
  // Weight Scale
  WEIGHT_MEASUREMENT: '00002a9d-0000-1000-8000-00805f9b34fb',
  WEIGHT_SCALE_FEATURE: '00002a9e-0000-1000-8000-00805f9b34fb',
  
  // Body Composition
  BODY_COMPOSITION_MEASUREMENT: '00002a9c-0000-1000-8000-00805f9b34fb',
  BODY_COMPOSITION_FEATURE: '00002a9b-0000-1000-8000-00805f9b34fb',
  
  // Glucose
  GLUCOSE_MEASUREMENT: '00002a18-0000-1000-8000-00805f9b34fb',
  GLUCOSE_MEASUREMENT_CONTEXT: '00002a34-0000-1000-8000-00805f9b34fb',
  GLUCOSE_FEATURE: '00002a51-0000-1000-8000-00805f9b34fb',
  RECORD_ACCESS_CONTROL_POINT: '00002a52-0000-1000-8000-00805f9b34fb',
  
  // Running Speed and Cadence
  RSC_MEASUREMENT: '00002a53-0000-1000-8000-00805f9b34fb',
  RSC_FEATURE: '00002a54-0000-1000-8000-00805f9b34fb',
  
  // Cycling Speed and Cadence
  CSC_MEASUREMENT: '00002a5b-0000-1000-8000-00805f9b34fb',
  CSC_FEATURE: '00002a5c-0000-1000-8000-00805f9b34fb',
} as const;

// Device types
export type DeviceType = 
  | 'smartwatch' 
  | 'fitness_band' 
  | 'smart_ring' 
  | 'bp_monitor' 
  | 'glucometer' 
  | 'weight_scale' 
  | 'thermometer'
  | 'pulse_oximeter'
  | 'ecg_monitor'
  | 'unknown';

// Data types that can be synced
export type HealthDataType = 
  | 'heart_rate'
  | 'hrv'
  | 'ecg'
  | 'steps'
  | 'calories'
  | 'distance'
  | 'sleep'
  | 'blood_pressure'
  | 'blood_glucose'
  | 'weight'
  | 'body_fat'
  | 'temperature'
  | 'spo2'
  | 'activity'
  | 'total_cholesterol'
  | 'uric_acid';

// Connection states
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error';

// BLE Device interface
export interface BLEDevice {
  id: string;
  name: string;
  type: DeviceType;
  connectionState: ConnectionState;
  batteryLevel?: number;
  lastSyncTime?: Date;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  supportedDataTypes: HealthDataType[];
  rawDevice?: BluetoothDevice;
  gattServer?: BluetoothRemoteGATTServer;
}

// Health data reading
export interface HealthReading {
  type: HealthDataType;
  value: number;
  unit: string;
  timestamp: Date;
  deviceId: string;
  metadata?: Record<string, any>;
}

// Event types
export type BLEEventType = 
  | 'device_discovered'
  | 'device_connected'
  | 'device_disconnected'
  | 'data_received'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_error'
  | 'battery_updated'
  | 'connection_error';

export interface BLEEvent {
  type: BLEEventType;
  device?: BLEDevice;
  data?: HealthReading | HealthReading[];
  error?: Error;
  timestamp: Date;
}

type BLEEventCallback = (event: BLEEvent) => void;

/**
 * BLE Service Class - Main SDK
 */
export class BLEService {
  private static instance: BLEService;
  private connectedDevices: Map<string, BLEDevice> = new Map();
  private eventListeners: Map<BLEEventType, Set<BLEEventCallback>> = new Map();
  private isScanning: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private dataBuffer: HealthReading[] = [];
  private readonly SYNC_INTERVAL_MS = 30000; // 30 seconds
  private readonly BUFFER_FLUSH_SIZE = 10;

  private constructor() {
    // Initialize event listener maps
    const eventTypes: BLEEventType[] = [
      'device_discovered', 'device_connected', 'device_disconnected',
      'data_received', 'sync_started', 'sync_completed', 'sync_error',
      'battery_updated', 'connection_error'
    ];
    eventTypes.forEach(type => this.eventListeners.set(type, new Set()));
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): BLEService {
    if (!BLEService.instance) {
      BLEService.instance = new BLEService();
    }
    return BLEService.instance;
  }

  /**
   * Check if Web Bluetooth is supported
   */
  public isSupported(): boolean {
    return 'bluetooth' in navigator;
  }

  /**
   * Request a Bluetooth device using the Web Bluetooth API
   */
  public async requestDevice(options?: RequestDeviceOptions): Promise<BLEDevice | null> {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser');
    }

    try {
      const defaultOptions: RequestDeviceOptions = {
        acceptAllDevices: true,
        optionalServices: Object.values(GATT_SERVICES)
      };

      const device = await navigator.bluetooth.requestDevice(options || defaultOptions);
      
      if (!device) {
        return null;
      }

      const bleDevice = await this.createBLEDevice(device);
      this.emitEvent({ type: 'device_discovered', device: bleDevice, timestamp: new Date() });
      
      return bleDevice;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        // User cancelled
        return null;
      }
      throw error;
    }
  }

  /**
   * Request device with specific filters
   */
  public async requestDeviceWithFilters(filters: BluetoothLEScanFilter[]): Promise<BLEDevice | null> {
    return this.requestDevice({
      filters,
      optionalServices: Object.values(GATT_SERVICES)
    });
  }

  /**
   * Request heart rate monitor
   */
  public async requestHeartRateMonitor(): Promise<BLEDevice | null> {
    return this.requestDevice({
      filters: [{ services: [GATT_SERVICES.HEART_RATE] }],
      optionalServices: [GATT_SERVICES.BATTERY, GATT_SERVICES.DEVICE_INFO]
    });
  }

  /**
   * Request blood pressure monitor
   */
  public async requestBloodPressureMonitor(): Promise<BLEDevice | null> {
    return this.requestDevice({
      filters: [{ services: [GATT_SERVICES.BLOOD_PRESSURE] }],
      optionalServices: [GATT_SERVICES.BATTERY, GATT_SERVICES.DEVICE_INFO]
    });
  }

  /**
   * Request weight scale
   */
  public async requestWeightScale(): Promise<BLEDevice | null> {
    return this.requestDevice({
      filters: [{ services: [GATT_SERVICES.WEIGHT_SCALE] }],
      optionalServices: [GATT_SERVICES.BATTERY, GATT_SERVICES.DEVICE_INFO, GATT_SERVICES.BODY_COMPOSITION]
    });
  }

  /**
   * Request glucose meter
   */
  public async requestGlucoseMeter(): Promise<BLEDevice | null> {
    return this.requestDevice({
      filters: [{ services: [GATT_SERVICES.GLUCOSE] }],
      optionalServices: [GATT_SERVICES.BATTERY, GATT_SERVICES.DEVICE_INFO]
    });
  }

  /**
   * Connect to a device
   */
  public async connect(device: BLEDevice): Promise<boolean> {
    if (!device.rawDevice) {
      throw new Error('Invalid device: no raw Bluetooth device');
    }

    try {
      device.connectionState = 'connecting';
      this.connectedDevices.set(device.id, device);

      // Connect to GATT server
      const server = await device.rawDevice.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }

      device.gattServer = server;
      device.connectionState = 'connected';

      // Set up disconnect listener
      device.rawDevice.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnection(device);
      });

      // Read device information
      await this.readDeviceInfo(device);
      
      // Read battery level
      await this.readBatteryLevel(device);

      // Subscribe to notifications
      await this.subscribeToNotifications(device);

      this.emitEvent({ type: 'device_connected', device, timestamp: new Date() });
      
      // Start periodic sync
      this.startPeriodicSync();

      return true;
    } catch (error: any) {
      device.connectionState = 'error';
      this.emitEvent({ type: 'connection_error', device, error, timestamp: new Date() });
      return false;
    }
  }

  /**
   * Disconnect from a device
   */
  public async disconnect(deviceId: string): Promise<void> {
    const device = this.connectedDevices.get(deviceId);
    if (!device) return;

    try {
      if (device.gattServer?.connected) {
        device.gattServer.disconnect();
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }

    this.handleDisconnection(device);
  }

  /**
   * Get all connected devices
   */
  public getConnectedDevices(): BLEDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  /**
   * Get a specific device by ID
   */
  public getDevice(deviceId: string): BLEDevice | undefined {
    return this.connectedDevices.get(deviceId);
  }

  /**
   * Sync data from a device
   */
  public async syncDevice(deviceId: string): Promise<HealthReading[]> {
    const device = this.connectedDevices.get(deviceId);
    if (!device || device.connectionState !== 'connected') {
      throw new Error('Device not connected');
    }

    device.connectionState = 'syncing';
    this.emitEvent({ type: 'sync_started', device, timestamp: new Date() });

    const readings: HealthReading[] = [];

    try {
      // Read all available health data
      for (const dataType of device.supportedDataTypes) {
        const data = await this.readHealthData(device, dataType);
        if (data) {
          readings.push(...(Array.isArray(data) ? data : [data]));
        }
      }

      device.connectionState = 'connected';
      device.lastSyncTime = new Date();
      
      this.emitEvent({ 
        type: 'sync_completed', 
        device, 
        data: readings, 
        timestamp: new Date() 
      });

      // Add to buffer for batch upload
      this.dataBuffer.push(...readings);
      await this.flushDataBufferIfNeeded();

      return readings;
    } catch (error: any) {
      device.connectionState = 'connected';
      this.emitEvent({ type: 'sync_error', device, error, timestamp: new Date() });
      throw error;
    }
  }

  /**
   * Sync all connected devices
   */
  public async syncAllDevices(): Promise<Map<string, HealthReading[]>> {
    const results = new Map<string, HealthReading[]>();
    
    for (const [deviceId, device] of this.connectedDevices) {
      if (device.connectionState === 'connected') {
        try {
          const readings = await this.syncDevice(deviceId);
          results.set(deviceId, readings);
        } catch (error) {
          console.error(`Error syncing device ${deviceId}:`, error);
          results.set(deviceId, []);
        }
      }
    }

    return results;
  }

  /**
   * Subscribe to BLE events
   */
  public on(eventType: BLEEventType, callback: BLEEventCallback): () => void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.add(callback);
    }

    // Return unsubscribe function
    return () => {
      listeners?.delete(callback);
    };
  }

  /**
   * Remove event listener
   */
  public off(eventType: BLEEventType, callback: BLEEventCallback): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Start real-time monitoring for a device
   */
  public async startRealTimeMonitoring(deviceId: string, dataTypes: HealthDataType[]): Promise<void> {
    const device = this.connectedDevices.get(deviceId);
    if (!device || !device.gattServer) {
      throw new Error('Device not connected');
    }

    for (const dataType of dataTypes) {
      await this.subscribeToDataType(device, dataType);
    }
  }

  /**
   * Stop real-time monitoring
   */
  public async stopRealTimeMonitoring(deviceId: string): Promise<void> {
    const device = this.connectedDevices.get(deviceId);
    if (!device || !device.gattServer) return;

    // Unsubscribe from all notifications
    // Note: Web Bluetooth doesn't have a direct way to unsubscribe all
    // The notifications will stop when the device disconnects
  }

  // ==================== Private Methods ====================

  private async createBLEDevice(rawDevice: BluetoothDevice): Promise<BLEDevice> {
    const deviceType = this.detectDeviceType(rawDevice.name || '');
    const supportedDataTypes = this.getSupportedDataTypes(deviceType);

    return {
      id: rawDevice.id,
      name: rawDevice.name || 'Unknown Device',
      type: deviceType,
      connectionState: 'disconnected',
      supportedDataTypes,
      rawDevice
    };
  }

  private detectDeviceType(name: string): DeviceType {
    const nameLower = name.toLowerCase();
    
    if (nameLower.includes('watch') || nameLower.includes('galaxy') || nameLower.includes('apple')) {
      return 'smartwatch';
    }
    if (nameLower.includes('ring') || nameLower.includes('oura')) {
      return 'smart_ring';
    }
    if (nameLower.includes('scale') || nameLower.includes('weight')) {
      return 'weight_scale';
    }
    if (nameLower.includes('bp') || nameLower.includes('pressure') || nameLower.includes('omron')) {
      return 'bp_monitor';
    }
    if (nameLower.includes('gluco') || nameLower.includes('accu-chek') || nameLower.includes('onetouch')) {
      return 'glucometer';
    }
    if (nameLower.includes('thermo') || nameLower.includes('temp')) {
      return 'thermometer';
    }
    if (nameLower.includes('band') || nameLower.includes('mi band') || nameLower.includes('fitbit')) {
      return 'fitness_band';
    }
    if (nameLower.includes('pulse') || nameLower.includes('oximeter') || nameLower.includes('spo2')) {
      return 'pulse_oximeter';
    }
    
    return 'fitness_band'; // Default to fitness band
  }

  private getSupportedDataTypes(deviceType: DeviceType): HealthDataType[] {
    switch (deviceType) {
      case 'smartwatch':
      case 'fitness_band':
        return ['heart_rate', 'steps', 'calories', 'distance', 'sleep', 'spo2', 'activity'];
      case 'smart_ring':
        return ['heart_rate', 'sleep', 'activity', 'spo2'];
      case 'bp_monitor':
        return ['blood_pressure', 'heart_rate'];
      case 'glucometer':
        return ['blood_glucose'];
      case 'weight_scale':
        return ['weight', 'body_fat'];
      case 'thermometer':
        return ['temperature'];
      case 'pulse_oximeter':
        return ['spo2', 'heart_rate'];
      default:
        return ['heart_rate'];
    }
  }

  private async readDeviceInfo(device: BLEDevice): Promise<void> {
    if (!device.gattServer) return;

    try {
      const service = await device.gattServer.getPrimaryService(GATT_SERVICES.DEVICE_INFO);
      
      try {
        const manufacturerChar = await service.getCharacteristic(GATT_CHARACTERISTICS.MANUFACTURER_NAME);
        const manufacturerValue = await manufacturerChar.readValue();
        device.manufacturer = new TextDecoder().decode(manufacturerValue);
      } catch {}

      try {
        const modelChar = await service.getCharacteristic(GATT_CHARACTERISTICS.MODEL_NUMBER);
        const modelValue = await modelChar.readValue();
        device.model = new TextDecoder().decode(modelValue);
      } catch {}

      try {
        const firmwareChar = await service.getCharacteristic(GATT_CHARACTERISTICS.FIRMWARE_REVISION);
        const firmwareValue = await firmwareChar.readValue();
        device.firmwareVersion = new TextDecoder().decode(firmwareValue);
      } catch {}
    } catch (error) {
      console.log('Device info service not available');
    }
  }

  private async readBatteryLevel(device: BLEDevice): Promise<void> {
    if (!device.gattServer) return;

    try {
      const service = await device.gattServer.getPrimaryService(GATT_SERVICES.BATTERY);
      const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.BATTERY_LEVEL);
      const value = await characteristic.readValue();
      device.batteryLevel = value.getUint8(0);
      
      // Subscribe to battery notifications
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const newLevel = event.target.value.getUint8(0);
        device.batteryLevel = newLevel;
        this.emitEvent({ type: 'battery_updated', device, timestamp: new Date() });
      });
    } catch (error) {
      console.log('Battery service not available');
    }
  }

  private async subscribeToNotifications(device: BLEDevice): Promise<void> {
    for (const dataType of device.supportedDataTypes) {
      await this.subscribeToDataType(device, dataType);
    }
  }

  private async subscribeToDataType(device: BLEDevice, dataType: HealthDataType): Promise<void> {
    if (!device.gattServer) return;

    try {
      switch (dataType) {
        case 'heart_rate':
          await this.subscribeToHeartRate(device);
          break;
        case 'blood_pressure':
          await this.subscribeToBloodPressure(device);
          break;
        case 'weight':
          await this.subscribeToWeight(device);
          break;
        case 'blood_glucose':
          await this.subscribeToGlucose(device);
          break;
        case 'temperature':
          await this.subscribeToTemperature(device);
          break;
      }
    } catch (error) {
      console.log(`Could not subscribe to ${dataType}:`, error);
    }
  }

  private async subscribeToHeartRate(device: BLEDevice): Promise<void> {
    if (!device.gattServer) return;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.HEART_RATE);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.HEART_RATE_MEASUREMENT);
    
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      const value = event.target.value;
      const reading = this.parseHeartRateMeasurement(value, device.id);
      this.handleDataReceived(device, reading);
    });
  }

  private async subscribeToBloodPressure(device: BLEDevice): Promise<void> {
    if (!device.gattServer) return;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.BLOOD_PRESSURE);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.BLOOD_PRESSURE_MEASUREMENT);
    
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      const value = event.target.value;
      const reading = this.parseBloodPressureMeasurement(value, device.id);
      this.handleDataReceived(device, reading);
    });
  }

  private async subscribeToWeight(device: BLEDevice): Promise<void> {
    if (!device.gattServer) return;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.WEIGHT_SCALE);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.WEIGHT_MEASUREMENT);
    
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      const value = event.target.value;
      const reading = this.parseWeightMeasurement(value, device.id);
      this.handleDataReceived(device, reading);
    });
  }

  private async subscribeToGlucose(device: BLEDevice): Promise<void> {
    if (!device.gattServer) return;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.GLUCOSE);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.GLUCOSE_MEASUREMENT);
    
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      const value = event.target.value;
      const reading = this.parseGlucoseMeasurement(value, device.id);
      this.handleDataReceived(device, reading);
    });
  }

  private async subscribeToTemperature(device: BLEDevice): Promise<void> {
    if (!device.gattServer) return;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.HEALTH_THERMOMETER);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.TEMPERATURE_MEASUREMENT);
    
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      const value = event.target.value;
      const reading = this.parseTemperatureMeasurement(value, device.id);
      this.handleDataReceived(device, reading);
    });
  }

  private async readHealthData(device: BLEDevice, dataType: HealthDataType): Promise<HealthReading | HealthReading[] | null> {
    if (!device.gattServer) return null;

    try {
      switch (dataType) {
        case 'heart_rate':
          return await this.readHeartRate(device);
        case 'blood_pressure':
          return await this.readBloodPressure(device);
        case 'weight':
          return await this.readWeight(device);
        case 'blood_glucose':
          return await this.readGlucose(device);
        case 'temperature':
          return await this.readTemperature(device);
        default:
          return null;
      }
    } catch (error) {
      console.log(`Could not read ${dataType}:`, error);
      return null;
    }
  }

  private async readHeartRate(device: BLEDevice): Promise<HealthReading | null> {
    if (!device.gattServer) return null;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.HEART_RATE);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.HEART_RATE_MEASUREMENT);
    const value = await characteristic.readValue();
    return this.parseHeartRateMeasurement(value, device.id);
  }

  private async readBloodPressure(device: BLEDevice): Promise<HealthReading | null> {
    if (!device.gattServer) return null;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.BLOOD_PRESSURE);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.BLOOD_PRESSURE_MEASUREMENT);
    const value = await characteristic.readValue();
    return this.parseBloodPressureMeasurement(value, device.id);
  }

  private async readWeight(device: BLEDevice): Promise<HealthReading | null> {
    if (!device.gattServer) return null;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.WEIGHT_SCALE);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.WEIGHT_MEASUREMENT);
    const value = await characteristic.readValue();
    return this.parseWeightMeasurement(value, device.id);
  }

  private async readGlucose(device: BLEDevice): Promise<HealthReading | null> {
    if (!device.gattServer) return null;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.GLUCOSE);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.GLUCOSE_MEASUREMENT);
    const value = await characteristic.readValue();
    return this.parseGlucoseMeasurement(value, device.id);
  }

  private async readTemperature(device: BLEDevice): Promise<HealthReading | null> {
    if (!device.gattServer) return null;

    const service = await device.gattServer.getPrimaryService(GATT_SERVICES.HEALTH_THERMOMETER);
    const characteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.TEMPERATURE_MEASUREMENT);
    const value = await characteristic.readValue();
    return this.parseTemperatureMeasurement(value, device.id);
  }

  // ==================== Data Parsers ====================

  private parseHeartRateMeasurement(value: DataView, deviceId: string): HealthReading {
    const flags = value.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const heartRate = is16Bit ? value.getUint16(1, true) : value.getUint8(1);

    return {
      type: 'heart_rate',
      value: heartRate,
      unit: 'bpm',
      timestamp: new Date(),
      deviceId,
      metadata: { flags }
    };
  }

  private parseBloodPressureMeasurement(value: DataView, deviceId: string): HealthReading {
    const flags = value.getUint8(0);
    const isKPa = (flags & 0x01) !== 0;
    
    const systolic = value.getUint16(1, true) / 10;
    const diastolic = value.getUint16(3, true) / 10;
    const meanAP = value.getUint16(5, true) / 10;

    return {
      type: 'blood_pressure',
      value: systolic, // Main value is systolic
      unit: isKPa ? 'kPa' : 'mmHg',
      timestamp: new Date(),
      deviceId,
      metadata: {
        systolic,
        diastolic,
        meanArterialPressure: meanAP,
        flags
      }
    };
  }

  private parseWeightMeasurement(value: DataView, deviceId: string): HealthReading {
    const flags = value.getUint8(0);
    const isImperial = (flags & 0x01) !== 0;
    
    // Weight is in resolution of 0.005 kg or 0.01 lb
    const rawWeight = value.getUint16(1, true);
    const weight = isImperial ? rawWeight * 0.01 : rawWeight * 0.005;

    return {
      type: 'weight',
      value: weight,
      unit: isImperial ? 'lb' : 'kg',
      timestamp: new Date(),
      deviceId,
      metadata: { flags }
    };
  }

  private parseGlucoseMeasurement(value: DataView, deviceId: string): HealthReading {
    const flags = value.getUint8(0);
    const sequenceNumber = value.getUint16(1, true);
    
    // Glucose concentration
    let offset = 3;
    
    // Skip timestamp if present
    if (flags & 0x01) {
      offset += 7; // Year (2) + Month + Day + Hour + Min + Sec
    }
    
    const glucoseConcentration = value.getUint16(offset, true);
    const isMolPerL = (flags & 0x04) === 0;
    
    // Convert to mg/dL if needed
    const glucoseValue = isMolPerL ? glucoseConcentration * 18 : glucoseConcentration;

    return {
      type: 'blood_glucose',
      value: glucoseValue,
      unit: 'mg/dL',
      timestamp: new Date(),
      deviceId,
      metadata: { sequenceNumber, flags }
    };
  }

  private parseTemperatureMeasurement(value: DataView, deviceId: string): HealthReading {
    const flags = value.getUint8(0);
    const isFahrenheit = (flags & 0x01) !== 0;
    
    // Temperature is IEEE-11073 32-bit FLOAT
    const tempValue = this.parseIEEE11073Float(value, 1);
    
    return {
      type: 'temperature',
      value: tempValue,
      unit: isFahrenheit ? '°F' : '°C',
      timestamp: new Date(),
      deviceId,
      metadata: { flags }
    };
  }

  private parseIEEE11073Float(dataView: DataView, offset: number): number {
    const data = dataView.getUint32(offset, true);
    const mantissa = data & 0x00FFFFFF;
    let exponent = (data >> 24) & 0xFF;
    
    if (exponent >= 128) {
      exponent = exponent - 256;
    }
    
    let result = mantissa;
    if (mantissa >= 0x800000) {
      result = result - 0x1000000;
    }
    
    return result * Math.pow(10, exponent);
  }

  // ==================== Event Handling ====================

  private handleDataReceived(device: BLEDevice, reading: HealthReading): void {
    this.dataBuffer.push(reading);
    this.emitEvent({
      type: 'data_received',
      device,
      data: reading,
      timestamp: new Date()
    });
    
    this.flushDataBufferIfNeeded();
  }

  private handleDisconnection(device: BLEDevice): void {
    device.connectionState = 'disconnected';
    device.gattServer = undefined;
    
    this.emitEvent({ type: 'device_disconnected', device, timestamp: new Date() });
    
    // Don't remove from connected devices - allow reconnection
    // User can explicitly remove if needed
  }

  private emitEvent(event: BLEEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('Error in BLE event listener:', error);
        }
      });
    }
  }

  // ==================== Data Sync ====================

  private startPeriodicSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(async () => {
      await this.syncAllDevices();
    }, this.SYNC_INTERVAL_MS);
  }

  private stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private async flushDataBufferIfNeeded(): Promise<void> {
    if (this.dataBuffer.length >= this.BUFFER_FLUSH_SIZE) {
      await this.flushDataBuffer();
    }
  }

  private async flushDataBuffer(): Promise<void> {
    if (this.dataBuffer.length === 0) return;

    const dataToSync = [...this.dataBuffer];
    this.dataBuffer = [];

    try {
      // Send to backend
      await this.uploadHealthData(dataToSync);
    } catch (error) {
      console.error('Failed to upload health data:', error);
      // Put data back in buffer for retry
      this.dataBuffer = [...dataToSync, ...this.dataBuffer];
    }
  }

  private async uploadHealthData(readings: HealthReading[]): Promise<void> {
    // Import api dynamically to avoid circular dependencies
    const { default: api } = await import('@/utils/api');
    
    await api.post('/health-data/ble-sync', {
      readings: readings.map(r => ({
        type: r.type,
        value: r.value,
        unit: r.unit,
        timestamp: r.timestamp.toISOString(),
        deviceId: r.deviceId,
        metadata: r.metadata
      }))
    });
  }

  /**
   * Force flush all buffered data
   */
  public async forceFlush(): Promise<void> {
    await this.flushDataBuffer();
  }

  /**
   * Get buffered readings count
   */
  public getBufferedReadingsCount(): number {
    return this.dataBuffer.length;
  }

  /**
   * Cleanup - call when app is closing
   */
  public async cleanup(): Promise<void> {
    this.stopPeriodicSync();
    await this.flushDataBuffer();
    
    // Disconnect all devices
    for (const deviceId of this.connectedDevices.keys()) {
      await this.disconnect(deviceId);
    }
  }
}

// Export singleton instance
export const bleService = BLEService.getInstance();
export default bleService;
