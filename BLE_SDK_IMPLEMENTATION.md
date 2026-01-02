# BLE SDK Implementation Documentation

## Overview

A comprehensive Bluetooth Low Energy (BLE) SDK has been implemented for syncing health devices and exchanging data between devices and the application. This SDK supports various health monitoring devices including smartwatches, fitness bands, blood pressure monitors, glucometers, and more.

## Architecture

### Components

1. **Frontend BLE SDK** (`client/src/services/ble/`)
   - `BLEService.ts` - Core BLE service class with device management
   - `useBLE.ts` - React hooks for easy integration
   - `index.ts` - Export module

2. **Backend API** (`server/routes/healthData.route.js`)
   - `/api/health-data/ble-sync` - Receive and store BLE readings
   - `/api/health-data/recent` - Get recent health readings
   - `/api/health-data/summary` - Get health data summary
   - `/api/health-data/devices` - List synced devices
   - `/api/health-data/device/:deviceId` - Delete device data

3. **Database Model** (`server/models/HealthData.model.intelligent.js`)
   - PostgreSQL model with intelligent query methods
   - Supports aggregation, time-range queries, and real-time updates

## Supported GATT Services

The SDK supports standard Bluetooth GATT services:

| Service | UUID | Description |
|---------|------|-------------|
| Heart Rate | 0x180D | Heart rate measurement |
| Blood Pressure | 0x1810 | Blood pressure measurement |
| Glucose | 0x1808 | Blood glucose measurement |
| Weight Scale | 0x181D | Weight measurement |
| Body Composition | 0x181B | Body composition analysis |
| Health Thermometer | 0x1809 | Body temperature |
| Fitness Machine | 0x1826 | Fitness equipment data |
| Battery | 0x180F | Device battery level |
| Device Info | 0x180A | Manufacturer, model info |

## Supported Device Types

- `smartwatch` - Smart watches (Apple Watch, Samsung Galaxy Watch, etc.)
- `fitness_band` - Fitness bands (Mi Band, Fitbit, etc.)
- `smart_ring` - Smart rings (Oura, etc.)
- `bp_monitor` - Blood pressure monitors
- `glucometer` - Blood glucose monitors
- `weight_scale` - Smart scales
- `thermometer` - Digital thermometers
- `pulse_oximeter` - SpO2 monitors
- `ecg_monitor` - ECG devices

## Health Data Types

| Type | Unit | Description |
|------|------|-------------|
| heart_rate | bpm | Heart rate in beats per minute |
| steps | steps | Step count |
| calories | kcal | Calories burned |
| distance | km | Distance traveled |
| sleep | hours | Sleep duration |
| blood_pressure | mmHg | Systolic/Diastolic BP |
| blood_glucose | mg/dL | Blood glucose level |
| weight | kg | Body weight |
| body_fat | % | Body fat percentage |
| temperature | °C | Body temperature |
| spo2 | % | Blood oxygen saturation |
| activity | minutes | Active minutes |

## Frontend Usage

### Basic Usage with Hooks

```tsx
import { useBLE } from '@/services/ble';

function DeviceManager() {
  const { 
    isSupported,
    connectedDevices,
    lastReading,
    requestDevice,
    connect,
    syncDevice,
    disconnect,
    isConnecting,
    error
  } = useBLE();

  // Check browser support
  if (!isSupported) {
    return <p>Bluetooth is not supported in this browser</p>;
  }

  // Pair a new device
  const handlePair = async () => {
    const device = await requestDevice({
      filters: [{ services: ['heart_rate'] }]
    });
    if (device) {
      await connect(device);
    }
  };

  // Sync data from device
  const handleSync = async (deviceId: string) => {
    await syncDevice(deviceId);
  };

  return (
    <div>
      <button onClick={handlePair}>Pair Device</button>
      {connectedDevices.map(device => (
        <div key={device.id}>
          <span>{device.name}</span>
          <button onClick={() => handleSync(device.id)}>Sync</button>
          <button onClick={() => disconnect(device.id)}>Disconnect</button>
        </div>
      ))}
      {lastReading && (
        <p>Latest: {lastReading.value} {lastReading.unit}</p>
      )}
    </div>
  );
}
```

### Real-time Health Monitoring

```tsx
import { useRealTimeHealth } from '@/services/ble';

function LiveHealthMonitor({ deviceId }: { deviceId: string }) {
  const { 
    heartRate, 
    spo2, 
    temperature, 
    isMonitoring 
  } = useRealTimeHealth(deviceId);

  return (
    <div>
      <p>Heart Rate: {heartRate?.value || '--'} bpm</p>
      <p>SpO2: {spo2?.value || '--'}%</p>
      <p>Temperature: {temperature?.value || '--'}°C</p>
      <p>Status: {isMonitoring ? 'Monitoring' : 'Stopped'}</p>
    </div>
  );
}
```

### Battery Monitoring

```tsx
import { useDeviceBattery } from '@/services/ble';

function DeviceBattery({ deviceId }: { deviceId: string }) {
  const { batteryLevel, isCharging } = useDeviceBattery(deviceId);

  return (
    <div>
      <p>Battery: {batteryLevel}%</p>
      {isCharging && <span>⚡ Charging</span>}
    </div>
  );
}
```

### Direct Service Access

```tsx
import { BLEService } from '@/services/ble';

// Get singleton instance
const bleService = BLEService.getInstance();

// Request device
const device = await bleService.requestDevice();

// Connect
await bleService.connect(device.id);

// Read specific data
const heartRate = await bleService.readHeartRate(device.id);
const battery = await bleService.readBatteryLevel(device.id);

// Subscribe to notifications
await bleService.subscribeToNotifications(device.id, 'heart_rate');

// Listen for events
bleService.on('data_received', (event) => {
  console.log('New reading:', event.data);
});

// Disconnect
await bleService.disconnect(device.id);
```

## Backend API

### POST /api/health-data/ble-sync

Sync health readings from BLE devices.

**Request:**
```json
{
  "readings": [
    {
      "type": "heart_rate",
      "value": 72,
      "unit": "bpm",
      "timestamp": "2025-01-15T10:30:00.000Z",
      "deviceId": "xx:xx:xx:xx:xx:xx",
      "metadata": {}
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "processedCount": 1,
  "totalReceived": 1
}
```

### GET /api/health-data/recent

Get recent health readings.

**Query Parameters:**
- `type` - Filter by data type (optional)
- `hours` - Hours to look back (default: 24)
- `limit` - Max results (default: 100)

### GET /api/health-data/summary

Get health data summary for a period.

**Query Parameters:**
- `days` - Number of days (default: 7)

**Response:**
```json
{
  "period": {
    "start": "2025-01-08T00:00:00.000Z",
    "end": "2025-01-15T00:00:00.000Z",
    "days": 7
  },
  "latest": {
    "heart_rate": {
      "value": 72,
      "unit": "bpm",
      "timestamp": "2025-01-15T10:30:00.000Z",
      "deviceId": "xx:xx:xx:xx:xx:xx"
    }
  },
  "averages": {
    "heart_rate": 75,
    "steps": 8500,
    "spo2": 98
  },
  "lastSync": "2025-01-15T10:30:00.000Z"
}
```

### GET /api/health-data/devices

List synced devices for the user.

### DELETE /api/health-data/device/:deviceId

Delete all data from a specific device.

## Data Flow

1. **Device Discovery**: User initiates device pairing
2. **Browser Dialog**: Web Bluetooth API shows device picker
3. **Connection**: GATT server connection established
4. **Service Discovery**: Available services/characteristics identified
5. **Data Reading**: Health data read from characteristics
6. **Buffering**: Data buffered locally (10 readings or 30 seconds)
7. **Backend Sync**: Buffered data sent to `/api/health-data/ble-sync`
8. **Storage**: Data stored in PostgreSQL with timestamps
9. **Real-time**: Socket.IO notifies connected clients

## Browser Support

Web Bluetooth API is supported in:
- ✅ Chrome (Desktop & Android)
- ✅ Edge
- ✅ Opera
- ⚠️ Safari (experimental flag required)
- ❌ Firefox (not supported)

## Security Considerations

1. **HTTPS Required**: Web Bluetooth only works on secure origins
2. **User Gesture**: Device request must be triggered by user action
3. **Authentication**: All API endpoints require JWT authentication
4. **Data Validation**: Server validates all incoming readings
5. **Device Isolation**: Users can only access their own device data

## Files Created

- `client/src/services/ble/BLEService.ts` - Core BLE SDK (~800 lines)
- `client/src/services/ble/useBLE.ts` - React hooks (~300 lines)
- `client/src/services/ble/index.ts` - Module exports
- `server/routes/healthData.route.js` - Backend API
- `server/models/HealthData.model.intelligent.js` - Database model

## Integration with Existing Components

The BLE SDK can be integrated with the existing `DeviceIntegration.tsx` component to replace the basic Bluetooth pairing flow with full data sync capabilities.

---

*Last Updated: January 15, 2025*
