import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface HealthAppDB extends DBSchema {
  symptoms: {
    key: string;
    value: {
      id: string;
      name: string;
      description: string;
      severity: string;
      timestamp: number;
    };
    indexes: { 'by-timestamp': number };
  };
  medications: {
    key: string;
    value: {
      id: string;
      name: string;
      dosage: string;
      schedule: string;
      timestamp: number;
    };
    indexes: { 'by-timestamp': number };
  };
  healthMetrics: {
    key: string;
    value: {
      id: string;
      type: string;
      value: number;
      unit: string;
      timestamp: number;
    };
    indexes: { 'by-timestamp': number };
  };
  offlineActions: {
    key: string;
    value: {
      id: string;
      action: string;
      data: any;
      timestamp: number;
      synced: boolean;
    };
    indexes: { 'by-synced': boolean };
  };
}

const DB_NAME = 'health-app-offline';
const DB_VERSION = 1;

export class OfflineStorage {
  private db: IDBPDatabase<HealthAppDB> | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // Check if IndexedDB is supported
      if (!('indexedDB' in window)) {
        console.warn('⚠️ IndexedDB not supported - offline features disabled');
        return;
      }

      this.db = await openDB<HealthAppDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          try {
            // Create stores with indexes
            if (!db.objectStoreNames.contains('symptoms')) {
              const symptomsStore = db.createObjectStore('symptoms', { keyPath: 'id' });
              symptomsStore.createIndex('by-timestamp', 'timestamp');
            }

            if (!db.objectStoreNames.contains('medications')) {
              const medicationsStore = db.createObjectStore('medications', { keyPath: 'id' });
              medicationsStore.createIndex('by-timestamp', 'timestamp');
            }

            if (!db.objectStoreNames.contains('healthMetrics')) {
              const healthMetricsStore = db.createObjectStore('healthMetrics', { keyPath: 'id' });
              healthMetricsStore.createIndex('by-timestamp', 'timestamp');
            }

            if (!db.objectStoreNames.contains('offlineActions')) {
              const offlineActionsStore = db.createObjectStore('offlineActions', { keyPath: 'id' });
              offlineActionsStore.createIndex('by-synced', 'synced');
            }
          } catch (error) {
            console.error('Error creating IndexedDB stores:', error);
          }
        },
        blocked() {
          console.warn('⚠️ IndexedDB upgrade blocked');
        },
        blocking() {
          console.warn('⚠️ IndexedDB blocking newer version');
        },
      });

      console.log('✅ IndexedDB initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize IndexedDB:', error);
      // Don't throw - let app continue without offline storage
      this.db = null;
    }
  }

  // Symptoms
  async saveSymptom(symptom: any): Promise<void> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return; // Skip if initialization failed

      await this.db.put('symptoms', {
        ...symptom,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn('⚠️ Failed to save symptom offline:', error);
    }
  }

  async getSymptoms(): Promise<any[]> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return [];

      return this.db.getAllFromIndex('symptoms', 'by-timestamp');
    } catch (error) {
      console.warn('⚠️ Failed to get symptoms offline:', error);
      return [];
    }
  }

  // Medications
  async saveMedication(medication: any): Promise<void> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return;

      await this.db.put('medications', {
        ...medication,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn('⚠️ Failed to save medication offline:', error);
    }
  }

  async getMedications(): Promise<any[]> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return [];

      return this.db.getAllFromIndex('medications', 'by-timestamp');
    } catch (error) {
      console.warn('⚠️ Failed to get medications offline:', error);
      return [];
    }
  }

  // Health Metrics
  async saveHealthMetric(metric: any): Promise<void> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return;

      await this.db.put('healthMetrics', {
        ...metric,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn('⚠️ Failed to save health metric offline:', error);
    }
  }

  async getHealthMetrics(): Promise<any[]> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return [];

      return this.db.getAllFromIndex('healthMetrics', 'by-timestamp');
    } catch (error) {
      console.warn('⚠️ Failed to get health metrics offline:', error);
      return [];
    }
  }

  // Offline Actions
  async saveOfflineAction(action: string, data: any): Promise<void> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return;

      await this.db.put('offlineActions', {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        action,
        data,
        timestamp: Date.now(),
        synced: false,
      });
    } catch (error) {
      console.warn('⚠️ Failed to save offline action:', error);
    }
  }

  async getPendingOfflineActions(): Promise<any[]> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return [];

      // Use the correct method to get records by index
      const transaction = this.db.transaction(['offlineActions'], 'readonly');
      const store = transaction.objectStore('offlineActions');
      const index = store.index('by-synced');
      
      // Get all records where synced is false (0)
      const result = await index.getAll(IDBKeyRange.only(0));
      return result || [];
    } catch (error) {
      console.warn('⚠️ Failed to get pending offline actions:', error);
      return [];
    }
  }

  async markActionAsSynced(id: string): Promise<void> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return;

      const action = await this.db.get('offlineActions', id);
      if (action) {
        action.synced = true;
        await this.db.put('offlineActions', action);
      }
    } catch (error) {
      console.warn('⚠️ Failed to mark action as synced:', error);
    }
  }

  // Utility methods
  async clearOldData(daysToKeep = 30): Promise<void> {
    try {
      if (!this.db) await this.initialize();
      if (!this.db) return;

      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

      const stores = ['symptoms', 'medications', 'healthMetrics'] as const;
      for (const store of stores) {
        const oldItems = await this.db.getAllFromIndex(store, 'by-timestamp');
        for (const item of oldItems) {
          if (item.timestamp < cutoffTime) {
            await this.db.delete(store, item.id);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to clear old data:', error);
    }
  }
}

export const offlineStorage = new OfflineStorage(); 