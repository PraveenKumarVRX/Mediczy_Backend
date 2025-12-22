# Apple HealthKit Integration Guide

## Overview

This document provides comprehensive guidance for integrating Apple HealthKit into the Mediczy mobile app for iOS users. The backend API endpoints are ready, and this guide covers the iOS native implementation required.

## Backend Implementation ✅

### API Endpoints

All endpoints require authentication via JWT token in the `Authorization: Bearer <token>` header.

#### 1. Sync Apple Health Data
```
POST /api/apple-health/sync
```

**Request Body:**
```json
{
  "date": "2025-12-09",
  "healthData": {
    "stepCount": 8547,
    "activeEnergyBurned": 452,
    "distanceWalkingRunning": 6.2,
    "appleExerciseTime": 45,
    "heartRate": {
      "min": 58,
      "max": 142,
      "avg": 72
    },
    "sleepAnalysis": {
      "duration": 7.5,
      "efficiency": 92
    },
    "bodyMass": 70.5,
    "height": 175,
    "bloodPressure": {
      "systolic": 120,
      "diastolic": 80
    },
    "bloodGlucose": 95,
    "oxygenSaturation": 98,
    "respiratoryRate": 16,
    "bodyTemperature": 36.6
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Apple Health data synced successfully",
  "data": { ... }
}
```

#### 2. Batch Sync Multiple Days
```
POST /api/apple-health/sync-batch
```

**Request Body:**
```json
{
  "healthDataArray": [
    {
      "date": "2025-12-09",
      "healthData": { ... }
    },
    {
      "date": "2025-12-08",
      "healthData": { ... }
    }
  ]
}
```

#### 3. Get Sync Status
```
GET /api/apple-health/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isConnected": true,
    "lastSyncDate": "2025-12-09",
    "totalRecords": 30,
    "lastSyncData": {
      "steps": 8547,
      "calories": 452,
      "distance": 6.2
    }
  }
}
```

#### 4. Get Summary
```
GET /api/apple-health/summary?days=7
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalDays": 7,
      "averageSteps": 7823,
      "averageCalories": 428,
      "averageDistance": 5.8,
      "averageActiveMinutes": 38,
      "totalSteps": 54761,
      "totalCalories": 2996,
      "totalDistance": 40.6,
      "totalActiveMinutes": 266
    },
    "records": [ ... ]
  }
}
```

#### 5. Disconnect
```
DELETE /api/apple-health/disconnect
```

**Response:**
```json
{
  "success": true,
  "message": "Apple Health disconnected successfully",
  "recordsDeleted": 30
}
```

## iOS Native Implementation Required

### Step 1: Add HealthKit Capability

1. Open your Xcode project
2. Select your app target
3. Go to "Signing & Capabilities"
4. Click "+ Capability"
5. Add "HealthKit"

### Step 2: Update Info.plist

Add the following keys to request HealthKit permissions:

```xml
<key>NSHealthShareUsageDescription</key>
<string>Mediczy needs access to your health data to provide personalized health insights and track your wellness journey.</string>
<key>NSHealthUpdateUsageDescription</key>
<string>Mediczy needs permission to save health data to your Health app.</string>
```

### Step 3: Create HealthKit Manager (Swift)

```swift
// HealthKitManager.swift
import HealthKit

class HealthKitManager {
    
    static let shared = HealthKitManager()
    let healthStore = HKHealthStore()
    
    // Define the health data types we want to read
    let typesToRead: Set<HKObjectType> = [
        HKObjectType.quantityType(forIdentifier: .stepCount)!,
        HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
        HKObjectType.quantityType(forIdentifier: .appleExerciseTime)!,
        HKObjectType.quantityType(forIdentifier: .heartRate)!,
        HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        HKObjectType.quantityType(forIdentifier: .bodyMass)!,
        HKObjectType.quantityType(forIdentifier: .height)!,
        HKObjectType.quantityType(forIdentifier: .bloodPressureSystolic)!,
        HKObjectType.quantityType(forIdentifier: .bloodPressureDiastolic)!,
        HKObjectType.quantityType(forIdentifier: .bloodGlucose)!,
        HKObjectType.quantityType(forIdentifier: .oxygenSaturation)!,
        HKObjectType.quantityType(forIdentifier: .respiratoryRate)!,
        HKObjectType.quantityType(forIdentifier: .bodyTemperature)!
    ]
    
    // Request authorization
    func requestAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false, NSError(domain: "HealthKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "HealthKit is not available"]))
            return
        }
        
        healthStore.requestAuthorization(toShare: nil, read: typesToRead) { success, error in
            completion(success, error)
        }
    }
    
    // Fetch health data for a specific date
    func fetchHealthData(for date: Date, completion: @escaping ([String: Any]?, Error?) -> Void) {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
        
        var healthData: [String: Any] = [:]
        let group = DispatchGroup()
        
        // Fetch step count
        group.enter()
        fetchQuantity(type: .stepCount, predicate: predicate) { value in
            healthData["stepCount"] = value
            group.leave()
        }
        
        // Fetch active energy burned
        group.enter()
        fetchQuantity(type: .activeEnergyBurned, predicate: predicate) { value in
            healthData["activeEnergyBurned"] = value
            group.leave()
        }
        
        // Fetch distance
        group.enter()
        fetchQuantity(type: .distanceWalkingRunning, predicate: predicate) { value in
            healthData["distanceWalkingRunning"] = value
            group.leave()
        }
        
        // Fetch exercise time
        group.enter()
        fetchQuantity(type: .appleExerciseTime, predicate: predicate) { value in
            healthData["appleExerciseTime"] = value
            group.leave()
        }
        
        // Fetch heart rate (min, max, avg)
        group.enter()
        fetchHeartRate(predicate: predicate) { hrData in
            healthData["heartRate"] = hrData
            group.leave()
        }
        
        // Fetch sleep data
        group.enter()
        fetchSleep(for: date) { sleepData in
            healthData["sleepAnalysis"] = sleepData
            group.leave()
        }
        
        // Wait for all fetches to complete
        group.notify(queue: .main) {
            completion(healthData, nil)
        }
    }
    
    private func fetchQuantity(type: HKQuantityTypeIdentifier, predicate: NSPredicate, completion: @escaping (Double?) -> Void) {
        guard let quantityType = HKQuantityType.quantityType(forIdentifier: type) else {
            completion(nil)
            return
        }
        
        let query = HKStatisticsQuery(quantityType: quantityType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, _ in
            guard let result = result, let sum = result.sumQuantity() else {
                completion(nil)
                return
            }
            
            let unit: HKUnit
            switch type {
            case .stepCount:
                unit = .count()
            case .activeEnergyBurned:
                unit = .kilocalorie()
            case .distanceWalkingRunning:
                unit = .meter()
            case .appleExerciseTime:
                unit = .minute()
            default:
                unit = .count()
            }
            
            let value = sum.doubleValue(for: unit)
            completion(type == .distanceWalkingRunning ? value / 1000 : value)
        }
        
        healthStore.execute(query)
    }
    
    private func fetchHeartRate(predicate: NSPredicate, completion: @escaping ([String: Int]) -> Void) {
        guard let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
            completion([:])
            return
        }
        
        let query = HKSampleQuery(sampleType: heartRateType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            guard let samples = samples as? [HKQuantitySample], !samples.isEmpty else {
                completion([:])
                return
            }
            
            let heartRates = samples.map { $0.quantity.doubleValue(for: HKUnit(from: "count/min")) }
            let min = Int(heartRates.min() ?? 0)
            let max = Int(heartRates.max() ?? 0)
            let avg = Int(heartRates.reduce(0, +) / Double(heartRates.count))
            
            completion(["min": min, "max": max, "avg": avg])
        }
        
        healthStore.execute(query)
    }
    
    private func fetchSleep(for date: Date, completion: @escaping ([String: Double]) -> Void) {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion([:])
            return
        }
        
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: .strictStartDate)
        
        let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            guard let samples = samples as? [HKCategorySample] else {
                completion([:])
                return
            }
            
            let sleepSamples = samples.filter { $0.value == HKCategoryValueSleepAnalysis.asleep.rawValue }
            let totalSleep = sleepSamples.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
            let hours = totalSleep / 3600
            
            completion(["duration": hours, "efficiency": 85.0]) // Efficiency is a placeholder
        }
        
        healthStore.execute(query)
    }
}
```

### Step 4: Create API Service (Swift)

```swift
// AppleHealthService.swift
import Foundation

class AppleHealthService {
    
    static let shared = AppleHealthService()
    private let baseURL = "https://your-api-url.com/api/apple-health"
    
    func syncHealthData(date: Date, healthData: [String: Any], completion: @escaping (Bool, Error?) -> Void) {
        guard let token = UserDefaults.standard.string(forKey: "authToken") else {
            completion(false, NSError(domain: "Auth", code: 401, userInfo: [NSLocalizedDescriptionKey: "No auth token"]))
            return
        }
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let dateString = dateFormatter.string(from: date)
        
        let payload: [String: Any] = [
            "date": dateString,
            "healthData": healthData
        ]
        
        guard let url = URL(string: "\(baseURL)/sync") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(false, error)
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                completion(false, NSError(domain: "API", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))
                return
            }
            
            completion(true, nil)
        }.resume()
    }
    
    func batchSyncHealthData(healthDataArray: [[String: Any]], completion: @escaping (Bool, Error?) -> Void) {
        guard let token = UserDefaults.standard.string(forKey: "authToken") else {
            completion(false, NSError(domain: "Auth", code: 401, userInfo: [NSLocalizedDescriptionKey: "No auth token"]))
            return
        }
        
        let payload: [String: Any] = [
            "healthDataArray": healthDataArray
        ]
        
        guard let url = URL(string: "\(baseURL)/sync-batch") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(false, error)
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                completion(false, NSError(domain: "API", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))
                return
            }
            
            completion(true, nil)
        }.resume()
    }
}
```

### Step 5: Background Sync Setup

Create a background task to sync health data periodically:

```swift
// AppDelegate.swift
import UIKit
import BackgroundTasks

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Register background task
        BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.mediczy.healthsync", using: nil) { task in
            self.handleHealthSync(task: task as! BGProcessingTask)
        }
        
        return true
    }
    
    func applicationDidEnterBackground(_ application: UIApplication) {
        scheduleHealthSync()
    }
    
    private func scheduleHealthSync() {
        let request = BGProcessingTaskRequest(identifier: "com.mediczy.healthsync")
        request.requiresNetworkConnectivity = true
        request.earliestBeginDate = Date(timeIntervalSinceNow: 3600) // 1 hour
        
        try? BGTaskScheduler.shared.submit(request)
    }
    
    private func handleHealthSync(task: BGProcessingTask) {
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        
        task.expirationHandler = {
            queue.cancelAllOperations()
        }
        
        // Fetch today's health data
        HealthKitManager.shared.fetchHealthData(for: Date()) { healthData, error in
            guard let healthData = healthData else {
                task.setTaskCompleted(success: false)
                return
            }
            
            // Sync to backend
            AppleHealthService.shared.syncHealthData(date: Date(), healthData: healthData) { success, _ in
                task.setTaskCompleted(success: success)
                self.scheduleHealthSync()
            }
        }
    }
}
```

### Step 6: Update Info.plist for Background Tasks

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.mediczy.healthsync</string>
</array>
```

## React Native Bridge (Optional)

If using React Native, create a native module:

```typescript
// AppleHealthModule.ts
import { NativeModules } from 'react-native';

const { AppleHealthModule } = NativeModules;

export interface HealthData {
  stepCount: number;
  activeEnergyBurned: number;
  distanceWalkingRunning: number;
  // ... other fields
}

export const AppleHealth = {
  requestAuthorization: (): Promise<boolean> => {
    return AppleHealthModule.requestAuthorization();
  },
  
  fetchHealthData: (date: Date): Promise<HealthData> => {
    return AppleHealthModule.fetchHealthData(date.toISOString());
  },
  
  syncToBackend: (date: Date, healthData: HealthData): Promise<boolean> => {
    return AppleHealthModule.syncToBackend(date.toISOString(), healthData);
  },
};
```

## Testing Checklist

- [ ] HealthKit permissions requested successfully
- [ ] Health data fetched from HealthKit
- [ ] Data synced to backend API
- [ ] Background sync working
- [ ] Dashboard showing Apple Health data
- [ ] Disconnect functionality working
- [ ] Error handling for missing permissions
- [ ] Testing on physical iOS device (simulator doesn't have Health app)

## Data Types Supported

| HealthKit Type | Backend Field | Unit |
|----------------|---------------|------|
| stepCount | steps | count |
| activeEnergyBurned | calories | kcal |
| distanceWalkingRunning | distance | km |
| appleExerciseTime | active_minutes | minutes |
| heartRate | heart_rate_* | bpm |
| sleepAnalysis | sleep_duration | hours |
| bodyMass | weight | kg |
| height | height | cm |
| bloodPressureSystolic | blood_pressure_systolic | mmHg |
| bloodPressureDiastolic | blood_pressure_diastolic | mmHg |
| bloodGlucose | blood_glucose | mg/dL |
| oxygenSaturation | oxygen_saturation | % |
| respiratoryRate | respiratory_rate | breaths/min |
| bodyTemperature | body_temperature | °C |

## Privacy & Security

1. **User Consent**: Always request explicit permission before accessing HealthKit
2. **Data Minimization**: Only request the health data types you actually need
3. **Secure Transmission**: All API calls use HTTPS with JWT authentication
4. **Data Retention**: Users can disconnect and delete all their data anytime
5. **Transparency**: Show users what data is being synced and when

## Troubleshooting

### Issue: HealthKit not available
**Solution**: Check if device supports HealthKit (not available on iPad)

### Issue: Permission denied
**Solution**: Guide user to Settings > Privacy > Health > Mediczy

### Issue: No data returned
**Solution**: Check if user has data in Health app for requested date range

### Issue: Background sync not working
**Solution**: Verify BGTaskScheduler identifier in Info.plist matches code

## Next Steps

1. Implement the iOS native HealthKit integration using the provided Swift code
2. Test on physical iOS devices (iPhone with iOS 14+)
3. Submit app for Apple App Store review with HealthKit entitlement
4. Update user documentation with Apple Health setup instructions
5. Monitor sync status and error rates in production

## Support

For issues with:
- **Backend API**: Check server logs at `/home/ubuntu/Mediczy/server.log`
- **iOS Implementation**: Review Xcode console for HealthKit errors
- **Data Sync**: Check network requests in backend logs

---

**Status**: Backend ✅ Complete | iOS Implementation ⏳ Required
**Last Updated**: December 9, 2025
