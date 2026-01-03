/**
 * Google Fit Integration Service
 * 
 * This service provides integration with Google Fit for Android devices
 * through Capacitor or Web APIs.
 */

// Google Fit data types
export const GoogleFitDataTypes = {
  heartRate: 'com.google.heart_rate.bpm',
  stepCount: 'com.google.step_count.delta',
  calories: 'com.google.calories.expended',
  distance: 'com.google.distance.delta',
  bloodPressure: 'com.google.blood_pressure',
  weight: 'com.google.weight',
  bodyFat: 'com.google.body.fat.percentage',
  bodyTemperature: 'com.google.body.temperature',
  oxygenSaturation: 'com.google.oxygen_saturation',
  bloodGlucose: 'com.google.blood_glucose',
  sleep: 'com.google.sleep.segment',
  activity: 'com.google.activity.segment',
};

export interface GoogleFitReading {
  type: string;
  value: number;
  unit: string;
  startTime: string;
  endTime: string;
  dataSourceId?: string;
  dataSourceName?: string;
  metadata?: Record<string, any>;
}

export interface GoogleFitSyncResult {
  success: boolean;
  processedCount: number;
  totalReceived: number;
  errors?: any[];
}

// OAuth configuration
const GOOGLE_FIT_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.blood_pressure.read',
  'https://www.googleapis.com/auth/fitness.blood_glucose.read',
  'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
  'https://www.googleapis.com/auth/fitness.body_temperature.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
];

/**
 * Google Fit Service
 */
export class GoogleFitService {
  private static instance: GoogleFitService;
  private accessToken: string | null = null;
  private isAuthorized = false;
  private GoogleAuth: any = null;

  private constructor() {
    this.initialize();
  }

  static getInstance(): GoogleFitService {
    if (!GoogleFitService.instance) {
      GoogleFitService.instance = new GoogleFitService();
    }
    return GoogleFitService.instance;
  }

  /**
   * Initialize Google Fit
   */
  private async initialize() {
    if (typeof window === 'undefined') return;

    const capacitor = (window as any).Capacitor;
    
    // For Capacitor Android app
    if (capacitor?.isNativePlatform?.() && capacitor?.getPlatform?.() === 'android') {
      try {
        // Try to import Capacitor Google Auth plugin
        const { GoogleAuth } = await import('@nicholasleblanc/capacitor-google-fit');
        this.GoogleAuth = GoogleAuth;
        console.log('Google Fit plugin loaded');
      } catch (error) {
        console.log('Google Fit plugin not available, using Web API');
      }
    }
  }

  /**
   * Check if Google Fit is available
   */
  isGoogleFitAvailable(): boolean {
    const capacitor = (window as any)?.Capacitor;
    return (capacitor?.isNativePlatform?.() && capacitor?.getPlatform?.() === 'android') || 
           typeof window !== 'undefined';
  }

  /**
   * Request authorization
   */
  async requestAuthorization(clientId: string): Promise<boolean> {
    // Capacitor native flow
    if (this.GoogleAuth) {
      try {
        const result = await this.GoogleAuth.signIn();
        this.accessToken = result.accessToken;
        this.isAuthorized = true;
        return true;
      } catch (error) {
        console.error('Google Fit authorization failed:', error);
        return false;
      }
    }

    // Web OAuth flow
    try {
      const redirectUri = window.location.origin + '/auth/google-fit/callback';
      const scope = encodeURIComponent(GOOGLE_FIT_SCOPES.join(' '));
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=token&` +
        `scope=${scope}&` +
        `include_granted_scopes=true`;

      // Open popup or redirect
      const width = 500;
      const height = 600;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;
      
      const popup = window.open(
        authUrl,
        'Google Fit Authorization',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        // Popup blocked, redirect instead
        window.location.href = authUrl;
        return false;
      }

      // Listen for the callback
      return new Promise((resolve) => {
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            resolve(this.isAuthorized);
          }
        }, 500);

        // Also listen for message from popup
        window.addEventListener('message', (event) => {
          if (event.data.type === 'google-fit-auth') {
            this.accessToken = event.data.accessToken;
            this.isAuthorized = true;
            popup.close();
            resolve(true);
          }
        }, { once: true });

        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(checkClosed);
          if (!popup.closed) {
            popup.close();
          }
          resolve(false);
        }, 300000);
      });
    } catch (error) {
      console.error('Error requesting Google Fit authorization:', error);
      return false;
    }
  }

  /**
   * Set access token (from OAuth callback)
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
    this.isAuthorized = true;
    localStorage.setItem('googleFitToken', token);
  }

  /**
   * Load saved token
   */
  loadSavedToken(): boolean {
    const token = localStorage.getItem('googleFitToken');
    if (token) {
      this.accessToken = token;
      this.isAuthorized = true;
      return true;
    }
    return false;
  }

  /**
   * Clear authorization
   */
  logout(): void {
    this.accessToken = null;
    this.isAuthorized = false;
    localStorage.removeItem('googleFitToken');
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.accessToken) {
      throw new Error('Not authorized');
    }

    const response = await fetch(`https://www.googleapis.com/fitness/v1/users/me/${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.logout();
        throw new Error('Authorization expired');
      }
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Read data from Google Fit
   */
  async readData(
    dataType: string, 
    startTime: Date, 
    endTime: Date = new Date()
  ): Promise<GoogleFitReading[]> {
    if (!this.isAuthorized) {
      throw new Error('Not authorized');
    }

    try {
      const startTimeNanos = startTime.getTime() * 1000000;
      const endTimeNanos = endTime.getTime() * 1000000;

      const body = {
        aggregateBy: [{
          dataTypeName: dataType,
        }],
        bucketByTime: { durationMillis: 86400000 }, // 1 day buckets
        startTimeMillis: startTime.getTime(),
        endTimeMillis: endTime.getTime(),
      };

      const result = await this.apiRequest('dataset:aggregate', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const readings: GoogleFitReading[] = [];

      for (const bucket of result.bucket || []) {
        for (const dataset of bucket.dataset || []) {
          for (const point of dataset.point || []) {
            const value = point.value?.[0]?.fpVal || point.value?.[0]?.intVal || 0;
            
            readings.push({
              type: dataType,
              value,
              unit: this.getUnit(dataType),
              startTime: new Date(parseInt(point.startTimeNanos) / 1000000).toISOString(),
              endTime: new Date(parseInt(point.endTimeNanos) / 1000000).toISOString(),
              dataSourceId: dataset.dataSourceId,
              dataSourceName: this.getDataSourceName(dataset.dataSourceId),
            });
          }
        }
      }

      return readings;
    } catch (error) {
      console.error(`Error reading ${dataType}:`, error);
      return [];
    }
  }

  /**
   * Get unit for data type
   */
  private getUnit(dataType: string): string {
    const units: Record<string, string> = {
      'com.google.heart_rate.bpm': 'bpm',
      'com.google.step_count.delta': 'steps',
      'com.google.calories.expended': 'kcal',
      'com.google.distance.delta': 'm',
      'com.google.weight': 'kg',
      'com.google.body.fat.percentage': '%',
      'com.google.body.temperature': '°C',
      'com.google.oxygen_saturation': '%',
      'com.google.blood_glucose': 'mmol/L',
    };
    return units[dataType] || '';
  }

  /**
   * Extract data source name from ID
   */
  private getDataSourceName(dataSourceId?: string): string {
    if (!dataSourceId) return 'Google Fit';
    
    // Extract app name from data source ID
    const match = dataSourceId.match(/derived:([^:]+)/);
    return match ? match[1] : 'Google Fit';
  }

  /**
   * Read heart rate data
   */
  async readHeartRate(startTime: Date, endTime: Date = new Date()): Promise<GoogleFitReading[]> {
    return this.readData(GoogleFitDataTypes.heartRate, startTime, endTime);
  }

  /**
   * Read step count data
   */
  async readStepCount(startTime: Date, endTime: Date = new Date()): Promise<GoogleFitReading[]> {
    return this.readData(GoogleFitDataTypes.stepCount, startTime, endTime);
  }

  /**
   * Read calories data
   */
  async readCalories(startTime: Date, endTime: Date = new Date()): Promise<GoogleFitReading[]> {
    return this.readData(GoogleFitDataTypes.calories, startTime, endTime);
  }

  /**
   * Read distance data
   */
  async readDistance(startTime: Date, endTime: Date = new Date()): Promise<GoogleFitReading[]> {
    return this.readData(GoogleFitDataTypes.distance, startTime, endTime);
  }

  /**
   * Read weight data
   */
  async readWeight(startTime: Date, endTime: Date = new Date()): Promise<GoogleFitReading[]> {
    return this.readData(GoogleFitDataTypes.weight, startTime, endTime);
  }

  /**
   * Read blood oxygen data
   */
  async readSpO2(startTime: Date, endTime: Date = new Date()): Promise<GoogleFitReading[]> {
    return this.readData(GoogleFitDataTypes.oxygenSaturation, startTime, endTime);
  }

  /**
   * Read sleep data
   */
  async readSleep(startTime: Date, endTime: Date = new Date()): Promise<GoogleFitReading[]> {
    return this.readData(GoogleFitDataTypes.sleep, startTime, endTime);
  }

  /**
   * Read all available health data
   */
  async readAllHealthData(startTime: Date, endTime: Date = new Date()): Promise<GoogleFitReading[]> {
    const allReadings: GoogleFitReading[] = [];

    const dataTypes = [
      GoogleFitDataTypes.heartRate,
      GoogleFitDataTypes.stepCount,
      GoogleFitDataTypes.calories,
      GoogleFitDataTypes.distance,
      GoogleFitDataTypes.weight,
      GoogleFitDataTypes.oxygenSaturation,
    ];

    for (const dataType of dataTypes) {
      try {
        const readings = await this.readData(dataType, startTime, endTime);
        allReadings.push(...readings);
      } catch (error) {
        console.error(`Error reading ${dataType}:`, error);
      }
    }

    return allReadings;
  }

  /**
   * Sync health data to the backend
   */
  async syncToBackend(readings: GoogleFitReading[], apiBaseUrl: string, token: string): Promise<GoogleFitSyncResult> {
    try {
      const response = await fetch(`${apiBaseUrl}/api/health-data/google-fit-sync`, {
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
   * Get authorization status
   */
  isAuthenticated(): boolean {
    return this.isAuthorized && !!this.accessToken;
  }
}

// Export singleton
export const googleFitService = GoogleFitService.getInstance();
export default googleFitService;
