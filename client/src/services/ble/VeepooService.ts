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
    this.device = null;
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
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingCommands.has(command)) {
          this.pendingCommands.delete(command);
          reject(new Error('Command timeout'));
        }
      }, 10000);
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
      // Try standard heart rate service
      await this.startStandardHeartRate();
      return;
    }

    try {
      await this.sendCommand(VeepooCommand.START_HEART_RATE);
    } catch (e) {
      console.log('Failed to start heart rate via Veepoo protocol, trying standard...');
      await this.startStandardHeartRate();
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
