/**
 * Capacitor BLE Service
 * Native BLE support for iOS/Android through Capacitor
 * 
 * This service provides native Bluetooth access when running as a Capacitor app,
 * with automatic fallback to Web Bluetooth in browsers.
 */

// Types for Capacitor BLE
export interface BLEDevice {
  deviceId: string;
  name: string;
  rssi?: number;
  localName?: string;
}

export interface BLEService {
  uuid: string;
  characteristics: BLECharacteristic[];
}

export interface BLECharacteristic {
  uuid: string;
  properties: {
    read?: boolean;
    write?: boolean;
    writeWithoutResponse?: boolean;
    notify?: boolean;
    indicate?: boolean;
  };
}

export interface ScanResult {
  device: BLEDevice;
  rssi?: number;
  advertisementData?: any;
}

// Veepoo Service UUIDs
const VEEPOO_SERVICE = '0000ae00-0000-1000-8000-00805f9b34fb';
const VEEPOO_WRITE = '0000ae01-0000-1000-8000-00805f9b34fb';
const VEEPOO_NOTIFY = '0000ae02-0000-1000-8000-00805f9b34fb';

// Health data types
export interface HealthDataReading {
  type: 'heart_rate' | 'blood_pressure' | 'spo2' | 'temperature' | 'steps' | 'sleep';
  value: any;
  timestamp: Date;
  deviceId: string;
}

type ScanCallback = (result: ScanResult) => void;
type DataCallback = (reading: HealthDataReading) => void;
type DisconnectCallback = () => void;

/**
 * CapacitorBLEService - Unified BLE service that works across platforms
 */
export class CapacitorBLEService {
  private static instance: CapacitorBLEService;
  private BleClient: any = null;
  private isCapacitorAvailable = false;
  private connectedDeviceId: string | null = null;
  private dataCallbacks: DataCallback[] = [];
  private disconnectCallbacks: DisconnectCallback[] = [];

  private constructor() {
    this.initialize();
  }

  static getInstance(): CapacitorBLEService {
    if (!CapacitorBLEService.instance) {
      CapacitorBLEService.instance = new CapacitorBLEService();
    }
    return CapacitorBLEService.instance;
  }

  /**
   * Initialize the BLE client
   */
  private async initialize() {
    // Check if Capacitor is available
    if (typeof window !== 'undefined') {
      const capacitor = (window as any).Capacitor;
      
      if (capacitor?.isNativePlatform?.()) {
        try {
          // Try to dynamically import the Capacitor BLE plugin
          // The plugin should be installed: @capacitor-community/bluetooth-le
          const { BleClient } = await import('@capacitor-community/bluetooth-le');
          this.BleClient = BleClient;
          this.isCapacitorAvailable = true;
          
          // Initialize the BLE client
          await BleClient.initialize();
          console.log('Capacitor BLE initialized');
        } catch (error) {
          console.log('Capacitor BLE plugin not available:', error);
          this.isCapacitorAvailable = false;
        }
      }
    }
  }

  /**
   * Check if native BLE is available
   */
  isNativeBLEAvailable(): boolean {
    return this.isCapacitorAvailable && this.BleClient !== null;
  }

  /**
   * Check if Web Bluetooth is available
   */
  isWebBluetoothAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * Request BLE permissions (Android only)
   */
  async requestPermissions(): Promise<boolean> {
    if (this.isCapacitorAvailable && this.BleClient) {
      try {
        await this.BleClient.requestPermissions();
        return true;
      } catch (error) {
        console.error('Permission request failed:', error);
        return false;
      }
    }
    return true; // Web Bluetooth handles permissions differently
  }

  /**
   * Check if Bluetooth is enabled
   */
  async isBluetoothEnabled(): Promise<boolean> {
    if (this.isCapacitorAvailable && this.BleClient) {
      try {
        return await this.BleClient.isEnabled();
      } catch (error) {
        console.error('Error checking Bluetooth status:', error);
        return false;
      }
    }
    // Web Bluetooth doesn't have this API
    return true;
  }

  /**
   * Request to enable Bluetooth (Android only)
   */
  async requestBluetoothEnable(): Promise<void> {
    if (this.isCapacitorAvailable && this.BleClient) {
      try {
        await this.BleClient.requestEnable();
      } catch (error) {
        console.error('Error enabling Bluetooth:', error);
      }
    }
  }

  /**
   * Scan for BLE devices
   */
  async startScan(callback: ScanCallback, filterByName?: string): Promise<void> {
    if (this.isCapacitorAvailable && this.BleClient) {
      // Native Capacitor scan
      try {
        await this.BleClient.requestLEScan(
          {
            services: [], // Scan all services
            namePrefix: filterByName,
          },
          (result: any) => {
            const scanResult: ScanResult = {
              device: {
                deviceId: result.device.deviceId,
                name: result.device.name || result.localName || 'Unknown Device',
                rssi: result.rssi,
                localName: result.localName,
              },
              rssi: result.rssi,
              advertisementData: result.advertisementData,
            };
            callback(scanResult);
          }
        );
      } catch (error) {
        console.error('Scan error:', error);
        throw error;
      }
    } else if (this.isWebBluetoothAvailable()) {
      // Web Bluetooth doesn't support background scanning
      // The requestDevice API shows a browser picker instead
      console.log('Web Bluetooth: Use requestDevice for device selection');
      throw new Error('Web Bluetooth requires using the device picker');
    } else {
      throw new Error('No Bluetooth support available');
    }
  }

  /**
   * Stop scanning
   */
  async stopScan(): Promise<void> {
    if (this.isCapacitorAvailable && this.BleClient) {
      try {
        await this.BleClient.stopLEScan();
      } catch (error) {
        console.error('Error stopping scan:', error);
      }
    }
  }

  /**
   * Connect to a device
   */
  async connect(deviceId: string): Promise<void> {
    if (this.isCapacitorAvailable && this.BleClient) {
      try {
        await this.BleClient.connect(deviceId, (disconnectedDeviceId: string) => {
          console.log('Device disconnected:', disconnectedDeviceId);
          this.connectedDeviceId = null;
          this.disconnectCallbacks.forEach(cb => cb());
        });
        this.connectedDeviceId = deviceId;
        console.log('Connected to device:', deviceId);
      } catch (error) {
        console.error('Connection error:', error);
        throw error;
      }
    } else {
      throw new Error('Native BLE not available');
    }
  }

  /**
   * Disconnect from current device
   */
  async disconnect(): Promise<void> {
    if (this.connectedDeviceId && this.isCapacitorAvailable && this.BleClient) {
      try {
        await this.BleClient.disconnect(this.connectedDeviceId);
        this.connectedDeviceId = null;
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
  }

  /**
   * Get device services
   */
  async getServices(deviceId: string): Promise<BLEService[]> {
    if (!this.isCapacitorAvailable || !this.BleClient) {
      throw new Error('Native BLE not available');
    }

    try {
      const services = await this.BleClient.getServices(deviceId);
      return services;
    } catch (error) {
      console.error('Error getting services:', error);
      throw error;
    }
  }

  /**
   * Read a characteristic
   */
  async readCharacteristic(deviceId: string, serviceUUID: string, characteristicUUID: string): Promise<DataView> {
    if (!this.isCapacitorAvailable || !this.BleClient) {
      throw new Error('Native BLE not available');
    }

    try {
      const result = await this.BleClient.read(deviceId, serviceUUID, characteristicUUID);
      return result;
    } catch (error) {
      console.error('Error reading characteristic:', error);
      throw error;
    }
  }

  /**
   * Write to a characteristic
   */
  async writeCharacteristic(
    deviceId: string, 
    serviceUUID: string, 
    characteristicUUID: string, 
    data: DataView
  ): Promise<void> {
    if (!this.isCapacitorAvailable || !this.BleClient) {
      throw new Error('Native BLE not available');
    }

    try {
      await this.BleClient.write(deviceId, serviceUUID, characteristicUUID, data);
    } catch (error) {
      console.error('Error writing characteristic:', error);
      throw error;
    }
  }

  /**
   * Start notifications for a characteristic
   */
  async startNotifications(
    deviceId: string, 
    serviceUUID: string, 
    characteristicUUID: string,
    callback: (value: DataView) => void
  ): Promise<void> {
    if (!this.isCapacitorAvailable || !this.BleClient) {
      throw new Error('Native BLE not available');
    }

    try {
      await this.BleClient.startNotifications(
        deviceId, 
        serviceUUID, 
        characteristicUUID, 
        callback
      );
    } catch (error) {
      console.error('Error starting notifications:', error);
      throw error;
    }
  }

  /**
   * Stop notifications
   */
  async stopNotifications(deviceId: string, serviceUUID: string, characteristicUUID: string): Promise<void> {
    if (!this.isCapacitorAvailable || !this.BleClient) {
      return;
    }

    try {
      await this.BleClient.stopNotifications(deviceId, serviceUUID, characteristicUUID);
    } catch (error) {
      console.error('Error stopping notifications:', error);
    }
  }

  /**
   * Register data callback
   */
  onData(callback: DataCallback): () => void {
    this.dataCallbacks.push(callback);
    return () => {
      this.dataCallbacks = this.dataCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Register disconnect callback
   */
  onDisconnect(callback: DisconnectCallback): () => void {
    this.disconnectCallbacks.push(callback);
    return () => {
      this.disconnectCallbacks = this.disconnectCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Connect to a Veepoo device (VE30, etc.) and set up health data monitoring
   */
  async connectVeepooDevice(deviceId: string): Promise<boolean> {
    if (!this.isCapacitorAvailable || !this.BleClient) {
      throw new Error('Native BLE required for Veepoo devices');
    }

    try {
      // Connect to the device
      await this.connect(deviceId);
      
      // Get services to find Veepoo service
      const services = await this.getServices(deviceId);
      const veepooService = services.find((s: BLEService) => 
        s.uuid.toLowerCase().includes('ae00')
      );

      if (!veepooService) {
        throw new Error('Veepoo service not found on device');
      }

      // Set up notifications for health data
      await this.startNotifications(
        deviceId,
        VEEPOO_SERVICE,
        VEEPOO_NOTIFY,
        (value: DataView) => {
          this.handleVeepooNotification(deviceId, value);
        }
      );

      console.log('Veepoo device connected and monitoring started');
      return true;
    } catch (error) {
      console.error('Error connecting Veepoo device:', error);
      throw error;
    }
  }

  /**
   * Handle Veepoo device notifications
   */
  private handleVeepooNotification(deviceId: string, value: DataView) {
    const data = new Uint8Array(value.buffer);
    if (data.length < 2) return;

    const commandType = data[0];
    const timestamp = new Date();

    let reading: HealthDataReading | null = null;

    switch (commandType) {
      case 0x11: // Heart rate
        if (data.length >= 3) {
          reading = {
            type: 'heart_rate',
            value: { heartRate: data[2], status: data[1] },
            timestamp,
            deviceId,
          };
        }
        break;

      case 0x13: // Blood pressure
        if (data.length >= 4) {
          reading = {
            type: 'blood_pressure',
            value: { systolic: data[2], diastolic: data[3], heartRate: data.length > 4 ? data[4] : undefined },
            timestamp,
            deviceId,
          };
        }
        break;

      case 0x15: // SpO2
        if (data.length >= 3) {
          reading = {
            type: 'spo2',
            value: { spO2: data[2], heartRate: data.length > 3 ? data[3] : undefined },
            timestamp,
            deviceId,
          };
        }
        break;

      case 0x17: // Temperature
        if (data.length >= 3) {
          const tempRaw = (data[1] << 8) | data[2];
          reading = {
            type: 'temperature',
            value: { temperature: tempRaw / 10 },
            timestamp,
            deviceId,
          };
        }
        break;
    }

    if (reading) {
      this.dataCallbacks.forEach(cb => cb(reading!));
    }
  }

  /**
   * Send command to Veepoo device
   */
  async sendVeepooCommand(deviceId: string, command: number, data: number[] = []): Promise<void> {
    if (!this.isCapacitorAvailable || !this.BleClient) {
      throw new Error('Native BLE required');
    }

    const packet = new Uint8Array([command, ...data]);
    const dataView = new DataView(packet.buffer);

    await this.writeCharacteristic(deviceId, VEEPOO_SERVICE, VEEPOO_WRITE, dataView);
  }

  /**
   * Start heart rate measurement on Veepoo device
   */
  async startHeartRateMeasurement(deviceId: string): Promise<void> {
    await this.sendVeepooCommand(deviceId, 0x11);
  }

  /**
   * Stop heart rate measurement on Veepoo device
   */
  async stopHeartRateMeasurement(deviceId: string): Promise<void> {
    await this.sendVeepooCommand(deviceId, 0x12);
  }

  /**
   * Start blood pressure measurement on Veepoo device
   */
  async startBloodPressureMeasurement(deviceId: string): Promise<void> {
    await this.sendVeepooCommand(deviceId, 0x13);
  }

  /**
   * Stop blood pressure measurement on Veepoo device
   */
  async stopBloodPressureMeasurement(deviceId: string): Promise<void> {
    await this.sendVeepooCommand(deviceId, 0x14);
  }

  /**
   * Start SpO2 measurement on Veepoo device
   */
  async startSpO2Measurement(deviceId: string): Promise<void> {
    await this.sendVeepooCommand(deviceId, 0x15);
  }

  /**
   * Stop SpO2 measurement on Veepoo device
   */
  async stopSpO2Measurement(deviceId: string): Promise<void> {
    await this.sendVeepooCommand(deviceId, 0x16);
  }

  /**
   * Sync time to Veepoo device
   */
  async syncTime(deviceId: string): Promise<void> {
    const now = new Date();
    const data = [
      now.getFullYear() - 2000,
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds()
    ];
    await this.sendVeepooCommand(deviceId, 0x01, data);
  }

  /**
   * Find device (make it vibrate)
   */
  async findDevice(deviceId: string): Promise<void> {
    await this.sendVeepooCommand(deviceId, 0x33);
  }
}

// Export singleton instance
export const capacitorBLE = CapacitorBLEService.getInstance();
export default capacitorBLE;
