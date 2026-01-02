/**
 * React Hook for BLE Device Management
 * Provides easy-to-use React integration for the BLE Service
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  bleService, 
  BLEDevice, 
  HealthReading, 
  BLEEvent, 
  BLEEventType,
  ConnectionState,
  HealthDataType
} from './BLEService';

export interface UseBLEReturn {
  // State
  isSupported: boolean;
  isScanning: boolean;
  connectedDevices: BLEDevice[];
  lastReading: HealthReading | null;
  error: string | null;
  
  // Actions
  requestDevice: () => Promise<BLEDevice | null>;
  requestHeartRateMonitor: () => Promise<BLEDevice | null>;
  requestBloodPressureMonitor: () => Promise<BLEDevice | null>;
  requestWeightScale: () => Promise<BLEDevice | null>;
  requestGlucoseMeter: () => Promise<BLEDevice | null>;
  connect: (device: BLEDevice) => Promise<boolean>;
  disconnect: (deviceId: string) => Promise<void>;
  syncDevice: (deviceId: string) => Promise<HealthReading[]>;
  syncAllDevices: () => Promise<void>;
  startRealTimeMonitoring: (deviceId: string, dataTypes: HealthDataType[]) => Promise<void>;
  stopRealTimeMonitoring: (deviceId: string) => Promise<void>;
  
  // Device info
  getDevice: (deviceId: string) => BLEDevice | undefined;
  getDeviceReadings: (deviceId: string) => HealthReading[];
}

export function useBLE(): UseBLEReturn {
  const [isSupported] = useState(() => bleService.isSupported());
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<BLEDevice[]>([]);
  const [lastReading, setLastReading] = useState<HealthReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceReadings, setDeviceReadings] = useState<Map<string, HealthReading[]>>(new Map());

  // Update connected devices list
  const updateConnectedDevices = useCallback(() => {
    setConnectedDevices(bleService.getConnectedDevices());
  }, []);

  // Subscribe to BLE events
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Device discovered
    unsubscribers.push(
      bleService.on('device_discovered', (event) => {
        updateConnectedDevices();
      })
    );

    // Device connected
    unsubscribers.push(
      bleService.on('device_connected', (event) => {
        updateConnectedDevices();
        setError(null);
      })
    );

    // Device disconnected
    unsubscribers.push(
      bleService.on('device_disconnected', (event) => {
        updateConnectedDevices();
      })
    );

    // Data received
    unsubscribers.push(
      bleService.on('data_received', (event) => {
        if (event.data && !Array.isArray(event.data)) {
          setLastReading(event.data);
          
          // Update device readings
          if (event.device) {
            setDeviceReadings(prev => {
              const newMap = new Map(prev);
              const readings = newMap.get(event.device!.id) || [];
              newMap.set(event.device!.id, [...readings, event.data as HealthReading].slice(-100)); // Keep last 100
              return newMap;
            });
          }
        }
      })
    );

    // Connection error
    unsubscribers.push(
      bleService.on('connection_error', (event) => {
        setError(event.error?.message || 'Connection failed');
        updateConnectedDevices();
      })
    );

    // Sync error
    unsubscribers.push(
      bleService.on('sync_error', (event) => {
        setError(event.error?.message || 'Sync failed');
      })
    );

    // Initial load
    updateConnectedDevices();

    // Cleanup
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [updateConnectedDevices]);

  // Request any device
  const requestDevice = useCallback(async (): Promise<BLEDevice | null> => {
    setIsScanning(true);
    setError(null);
    try {
      const device = await bleService.requestDevice();
      return device;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Request heart rate monitor
  const requestHeartRateMonitor = useCallback(async (): Promise<BLEDevice | null> => {
    setIsScanning(true);
    setError(null);
    try {
      const device = await bleService.requestHeartRateMonitor();
      return device;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Request blood pressure monitor
  const requestBloodPressureMonitor = useCallback(async (): Promise<BLEDevice | null> => {
    setIsScanning(true);
    setError(null);
    try {
      const device = await bleService.requestBloodPressureMonitor();
      return device;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Request weight scale
  const requestWeightScale = useCallback(async (): Promise<BLEDevice | null> => {
    setIsScanning(true);
    setError(null);
    try {
      const device = await bleService.requestWeightScale();
      return device;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Request glucose meter
  const requestGlucoseMeter = useCallback(async (): Promise<BLEDevice | null> => {
    setIsScanning(true);
    setError(null);
    try {
      const device = await bleService.requestGlucoseMeter();
      return device;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Connect to device
  const connect = useCallback(async (device: BLEDevice): Promise<boolean> => {
    setError(null);
    try {
      const result = await bleService.connect(device);
      updateConnectedDevices();
      return result;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [updateConnectedDevices]);

  // Disconnect from device
  const disconnect = useCallback(async (deviceId: string): Promise<void> => {
    try {
      await bleService.disconnect(deviceId);
      updateConnectedDevices();
    } catch (err: any) {
      setError(err.message);
    }
  }, [updateConnectedDevices]);

  // Sync device
  const syncDevice = useCallback(async (deviceId: string): Promise<HealthReading[]> => {
    setError(null);
    try {
      const readings = await bleService.syncDevice(deviceId);
      
      // Update device readings
      setDeviceReadings(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(deviceId) || [];
        newMap.set(deviceId, [...existing, ...readings].slice(-100));
        return newMap;
      });
      
      return readings;
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, []);

  // Sync all devices
  const syncAllDevices = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await bleService.syncAllDevices();
      updateConnectedDevices();
    } catch (err: any) {
      setError(err.message);
    }
  }, [updateConnectedDevices]);

  // Start real-time monitoring
  const startRealTimeMonitoring = useCallback(async (
    deviceId: string, 
    dataTypes: HealthDataType[]
  ): Promise<void> => {
    try {
      await bleService.startRealTimeMonitoring(deviceId, dataTypes);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Stop real-time monitoring
  const stopRealTimeMonitoring = useCallback(async (deviceId: string): Promise<void> => {
    try {
      await bleService.stopRealTimeMonitoring(deviceId);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Get device by ID
  const getDevice = useCallback((deviceId: string): BLEDevice | undefined => {
    return bleService.getDevice(deviceId);
  }, []);

  // Get device readings
  const getDeviceReadings = useCallback((deviceId: string): HealthReading[] => {
    return deviceReadings.get(deviceId) || [];
  }, [deviceReadings]);

  return {
    isSupported,
    isScanning,
    connectedDevices,
    lastReading,
    error,
    requestDevice,
    requestHeartRateMonitor,
    requestBloodPressureMonitor,
    requestWeightScale,
    requestGlucoseMeter,
    connect,
    disconnect,
    syncDevice,
    syncAllDevices,
    startRealTimeMonitoring,
    stopRealTimeMonitoring,
    getDevice,
    getDeviceReadings
  };
}

/**
 * Hook for real-time health data monitoring
 */
export function useRealTimeHealth(deviceId: string | null, dataTypes: HealthDataType[] = ['heart_rate']) {
  const [readings, setReadings] = useState<HealthReading[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [latestReading, setLatestReading] = useState<HealthReading | null>(null);

  useEffect(() => {
    if (!deviceId) return;

    const unsubscribe = bleService.on('data_received', (event) => {
      if (event.device?.id === deviceId && event.data && !Array.isArray(event.data)) {
        const reading = event.data;
        if (dataTypes.includes(reading.type)) {
          setLatestReading(reading);
          setReadings(prev => [...prev, reading].slice(-100));
        }
      }
    });

    // Start monitoring
    bleService.startRealTimeMonitoring(deviceId, dataTypes)
      .then(() => setIsMonitoring(true))
      .catch(console.error);

    return () => {
      unsubscribe();
      if (deviceId) {
        bleService.stopRealTimeMonitoring(deviceId);
        setIsMonitoring(false);
      }
    };
  }, [deviceId, dataTypes.join(',')]);

  return {
    readings,
    latestReading,
    isMonitoring,
    clearReadings: () => setReadings([])
  };
}

/**
 * Hook for device battery monitoring
 */
export function useDeviceBattery(deviceId: string | null) {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  useEffect(() => {
    if (!deviceId) {
      setBatteryLevel(null);
      return;
    }

    // Get initial battery level
    const device = bleService.getDevice(deviceId);
    if (device?.batteryLevel !== undefined) {
      setBatteryLevel(device.batteryLevel);
    }

    // Subscribe to battery updates
    const unsubscribe = bleService.on('battery_updated', (event) => {
      if (event.device?.id === deviceId && event.device?.batteryLevel !== undefined) {
        setBatteryLevel(event.device.batteryLevel);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [deviceId]);

  return batteryLevel;
}

export default useBLE;
