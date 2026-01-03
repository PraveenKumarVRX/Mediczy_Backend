/**
 * Apple Health Integration Service
 * 
 * This service provides integration with Apple HealthKit through Capacitor
 * for reading and syncing health data from Apple Health.
 * 
 * Requires @nicholasleblanc/capacitor-healthkit-plugin
 */

// HealthKit data types
export const HealthKitDataTypes = {
  // Quantity Types
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  stepCount: 'HKQuantityTypeIdentifierStepCount',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  distance: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  bloodPressureSystolic: 'HKQuantityTypeIdentifierBloodPressureSystolic',
  bloodPressureDiastolic: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
  bodyMass: 'HKQuantityTypeIdentifierBodyMass',
  bodyFat: 'HKQuantityTypeIdentifierBodyFatPercentage',
  bodyTemperature: 'HKQuantityTypeIdentifierBodyTemperature',
  oxygenSaturation: 'HKQuantityTypeIdentifierOxygenSaturation',
  bloodGlucose: 'HKQuantityTypeIdentifierBloodGlucose',
  hrv: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  
  // Category Types
  sleepAnalysis: 'HKCategoryTypeIdentifierSleepAnalysis',
  
  // Workout Types
  workout: 'HKWorkoutType',
};

export interface HealthKitReading {
  type: string;
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  sourceName?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}

export interface HealthKitSyncResult {
  success: boolean;
  processedCount: number;
  totalReceived: number;
  errors?: any[];
}

/**
 * Apple Health Service
 */
export class AppleHealthService {
  private static instance: AppleHealthService;
  private HealthKit: any = null;
  private isAvailable = false;
  private isAuthorized = false;

  private constructor() {
    this.initialize();
  }

  static getInstance(): AppleHealthService {
    if (!AppleHealthService.instance) {
      AppleHealthService.instance = new AppleHealthService();
    }
    return AppleHealthService.instance;
  }

  /**
   * Initialize HealthKit
   */
  private async initialize() {
    if (typeof window === 'undefined') return;

    const capacitor = (window as any).Capacitor;
    
    // Only available on iOS
    if (!capacitor?.isNativePlatform?.() || capacitor?.getPlatform?.() !== 'ios') {
      console.log('Apple Health is only available on iOS');
      return;
    }

    try {
      // Try to import HealthKit plugin
      const { HealthKit } = await import('@nicholasleblanc/capacitor-healthkit');
      this.HealthKit = HealthKit;
      
      // Check availability
      const result = await HealthKit.isAvailable();
      this.isAvailable = result.available;
      
      if (this.isAvailable) {
        console.log('Apple HealthKit is available');
      }
    } catch (error) {
      console.log('HealthKit plugin not available:', error);
    }
  }

  /**
   * Check if HealthKit is available
   */
  isHealthKitAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Request authorization for HealthKit data
   */
  async requestAuthorization(): Promise<boolean> {
    if (!this.isAvailable || !this.HealthKit) {
      return false;
    }

    try {
      const readTypes = [
        HealthKitDataTypes.heartRate,
        HealthKitDataTypes.stepCount,
        HealthKitDataTypes.activeEnergy,
        HealthKitDataTypes.distance,
        HealthKitDataTypes.bloodPressureSystolic,
        HealthKitDataTypes.bloodPressureDiastolic,
        HealthKitDataTypes.bodyMass,
        HealthKitDataTypes.bodyFat,
        HealthKitDataTypes.bodyTemperature,
        HealthKitDataTypes.oxygenSaturation,
        HealthKitDataTypes.bloodGlucose,
        HealthKitDataTypes.hrv,
        HealthKitDataTypes.sleepAnalysis,
        HealthKitDataTypes.workout,
      ];

      const writeTypes = [
        HealthKitDataTypes.heartRate,
        HealthKitDataTypes.stepCount,
        HealthKitDataTypes.activeEnergy,
        HealthKitDataTypes.bodyMass,
        HealthKitDataTypes.bodyFat,
      ];

      await this.HealthKit.requestAuthorization({
        read: readTypes,
        write: writeTypes,
      });

      this.isAuthorized = true;
      return true;
    } catch (error) {
      console.error('HealthKit authorization failed:', error);
      return false;
    }
  }

  /**
   * Read heart rate data
   */
  async readHeartRate(startDate: Date, endDate: Date = new Date()): Promise<HealthKitReading[]> {
    if (!this.isAvailable || !this.HealthKit) {
      return [];
    }

    try {
      const result = await this.HealthKit.queryHKitSampleType({
        sampleName: HealthKitDataTypes.heartRate,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1000,
      });

      return (result.data || []).map((sample: any) => ({
        type: HealthKitDataTypes.heartRate,
        value: sample.value,
        unit: 'bpm',
        startDate: sample.startDate,
        endDate: sample.endDate,
        sourceName: sample.sourceName,
        sourceId: sample.sourceBundleId,
      }));
    } catch (error) {
      console.error('Error reading heart rate:', error);
      return [];
    }
  }

  /**
   * Read step count data
   */
  async readStepCount(startDate: Date, endDate: Date = new Date()): Promise<HealthKitReading[]> {
    if (!this.isAvailable || !this.HealthKit) {
      return [];
    }

    try {
      const result = await this.HealthKit.queryHKitSampleType({
        sampleName: HealthKitDataTypes.stepCount,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1000,
      });

      return (result.data || []).map((sample: any) => ({
        type: HealthKitDataTypes.stepCount,
        value: sample.value,
        unit: 'steps',
        startDate: sample.startDate,
        endDate: sample.endDate,
        sourceName: sample.sourceName,
        sourceId: sample.sourceBundleId,
      }));
    } catch (error) {
      console.error('Error reading step count:', error);
      return [];
    }
  }

  /**
   * Read blood pressure data
   */
  async readBloodPressure(startDate: Date, endDate: Date = new Date()): Promise<HealthKitReading[]> {
    if (!this.isAvailable || !this.HealthKit) {
      return [];
    }

    const readings: HealthKitReading[] = [];

    try {
      // Read systolic
      const systolic = await this.HealthKit.queryHKitSampleType({
        sampleName: HealthKitDataTypes.bloodPressureSystolic,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1000,
      });

      readings.push(...(systolic.data || []).map((sample: any) => ({
        type: HealthKitDataTypes.bloodPressureSystolic,
        value: sample.value,
        unit: 'mmHg',
        startDate: sample.startDate,
        endDate: sample.endDate,
        sourceName: sample.sourceName,
        sourceId: sample.sourceBundleId,
      })));

      // Read diastolic
      const diastolic = await this.HealthKit.queryHKitSampleType({
        sampleName: HealthKitDataTypes.bloodPressureDiastolic,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1000,
      });

      readings.push(...(diastolic.data || []).map((sample: any) => ({
        type: HealthKitDataTypes.bloodPressureDiastolic,
        value: sample.value,
        unit: 'mmHg',
        startDate: sample.startDate,
        endDate: sample.endDate,
        sourceName: sample.sourceName,
        sourceId: sample.sourceBundleId,
      })));
    } catch (error) {
      console.error('Error reading blood pressure:', error);
    }

    return readings;
  }

  /**
   * Read SpO2 data
   */
  async readSpO2(startDate: Date, endDate: Date = new Date()): Promise<HealthKitReading[]> {
    if (!this.isAvailable || !this.HealthKit) {
      return [];
    }

    try {
      const result = await this.HealthKit.queryHKitSampleType({
        sampleName: HealthKitDataTypes.oxygenSaturation,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1000,
      });

      return (result.data || []).map((sample: any) => ({
        type: HealthKitDataTypes.oxygenSaturation,
        value: sample.value * 100, // Convert from 0-1 to percentage
        unit: '%',
        startDate: sample.startDate,
        endDate: sample.endDate,
        sourceName: sample.sourceName,
        sourceId: sample.sourceBundleId,
      }));
    } catch (error) {
      console.error('Error reading SpO2:', error);
      return [];
    }
  }

  /**
   * Read sleep analysis data
   */
  async readSleep(startDate: Date, endDate: Date = new Date()): Promise<HealthKitReading[]> {
    if (!this.isAvailable || !this.HealthKit) {
      return [];
    }

    try {
      const result = await this.HealthKit.queryHKitSampleType({
        sampleName: HealthKitDataTypes.sleepAnalysis,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1000,
      });

      return (result.data || []).map((sample: any) => ({
        type: HealthKitDataTypes.sleepAnalysis,
        value: sample.value, // Sleep category value
        unit: 'category',
        startDate: sample.startDate,
        endDate: sample.endDate,
        sourceName: sample.sourceName,
        sourceId: sample.sourceBundleId,
        metadata: {
          category: this.getSleepCategory(sample.value),
        },
      }));
    } catch (error) {
      console.error('Error reading sleep:', error);
      return [];
    }
  }

  /**
   * Get sleep category name
   */
  private getSleepCategory(value: number): string {
    const categories: Record<number, string> = {
      0: 'InBed',
      1: 'Asleep',
      2: 'Awake',
      3: 'Core',
      4: 'Deep',
      5: 'REM',
    };
    return categories[value] || 'Unknown';
  }

  /**
   * Read all available health data
   */
  async readAllHealthData(startDate: Date, endDate: Date = new Date()): Promise<HealthKitReading[]> {
    const allReadings: HealthKitReading[] = [];

    const [heartRate, steps, bloodPressure, spO2, sleep] = await Promise.all([
      this.readHeartRate(startDate, endDate),
      this.readStepCount(startDate, endDate),
      this.readBloodPressure(startDate, endDate),
      this.readSpO2(startDate, endDate),
      this.readSleep(startDate, endDate),
    ]);

    allReadings.push(...heartRate, ...steps, ...bloodPressure, ...spO2, ...sleep);

    return allReadings;
  }

  /**
   * Sync health data to the backend
   */
  async syncToBackend(readings: HealthKitReading[], apiBaseUrl: string, token: string): Promise<HealthKitSyncResult> {
    try {
      const response = await fetch(`${apiBaseUrl}/api/health-data/apple-health-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          readings,
          syncId: Date.now().toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error syncing to backend:', error);
      return {
        success: false,
        processedCount: 0,
        totalReceived: readings.length,
        errors: [error],
      };
    }
  }

  /**
   * Write heart rate data to HealthKit
   */
  async writeHeartRate(value: number, date: Date = new Date()): Promise<boolean> {
    if (!this.isAvailable || !this.HealthKit) {
      return false;
    }

    try {
      await this.HealthKit.writeData({
        sampleName: HealthKitDataTypes.heartRate,
        value,
        startDate: date.toISOString(),
        endDate: date.toISOString(),
      });
      return true;
    } catch (error) {
      console.error('Error writing heart rate:', error);
      return false;
    }
  }

  /**
   * Write step count to HealthKit
   */
  async writeStepCount(value: number, startDate: Date, endDate: Date = new Date()): Promise<boolean> {
    if (!this.isAvailable || !this.HealthKit) {
      return false;
    }

    try {
      await this.HealthKit.writeData({
        sampleName: HealthKitDataTypes.stepCount,
        value,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      return true;
    } catch (error) {
      console.error('Error writing step count:', error);
      return false;
    }
  }
}

// Export singleton
export const appleHealthService = AppleHealthService.getInstance();
export default appleHealthService;
