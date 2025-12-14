import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Watch, Activity, Smartphone, Bluetooth, CheckCircle, XCircle, RefreshCw, Plus, Settings } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  type: 'smartwatch' | 'fitness_band' | 'smart_ring' | 'bp_monitor' | 'glucometer' | 'weight_scale';
  brand: string;
  model: string;
  status: 'connected' | 'disconnected' | 'syncing';
  lastSync: Date | null;
  battery?: number;
  dataTypes: string[];
}

const DeviceIntegration: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([
    {
      id: '1',
      name: 'Apple Watch Series 9',
      type: 'smartwatch',
      brand: 'Apple',
      model: 'Series 9',
      status: 'connected',
      lastSync: new Date('2025-01-15T08:30:00'),
      battery: 85,
      dataTypes: ['Heart Rate', 'Steps', 'Sleep', 'Calories', 'Activity']
    },
    {
      id: '2',
      name: 'Mi Band 7',
      type: 'fitness_band',
      brand: 'Xiaomi',
      model: 'Mi Band 7',
      status: 'connected',
      lastSync: new Date('2025-01-15T07:15:00'),
      battery: 62,
      dataTypes: ['Steps', 'Heart Rate', 'Sleep']
    },
    {
      id: '3',
      name: 'Omron BP Monitor',
      type: 'bp_monitor',
      brand: 'Omron',
      model: 'HEM-7156T',
      status: 'disconnected',
      lastSync: new Date('2025-01-12T19:00:00'),
      dataTypes: ['Blood Pressure']
    }
  ]);

  const [availableDevices] = useState([
    { type: 'smartwatch', icon: Watch, brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Fitbit Versa'] },
    { type: 'fitness_band', icon: Activity, brands: ['Mi Band', 'Fitbit Charge', 'Garmin Vivosmart'] },
    { type: 'smart_ring', icon: Watch, brands: ['Oura Ring', 'Circular Ring'] },
    { type: 'bp_monitor', icon: Activity, brands: ['Omron', 'iHealth', 'Withings'] },
    { type: 'glucometer', icon: Activity, brands: ['Accu-Chek', 'OneTouch', 'FreeStyle'] },
    { type: 'weight_scale', icon: Activity, brands: ['Withings', 'Fitbit Aria', 'Eufy Smart Scale'] }
  ]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; icon: any; color: string }> = {
      connected: { label: 'Connected', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
      disconnected: { label: 'Disconnected', icon: XCircle, color: 'bg-red-100 text-red-800' },
      syncing: { label: 'Syncing...', icon: RefreshCw, color: 'bg-blue-100 text-blue-800' }
    };
    const variant = variants[status];
    const Icon = variant.icon;
    return (
      <Badge className={`${variant.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {variant.label}
      </Badge>
    );
  };

  const handleSync = (deviceId: string) => {
    setDevices(devices.map(device => 
      device.id === deviceId 
        ? { ...device, status: 'syncing' as const }
        : device
    ));

    setTimeout(() => {
      setDevices(devices.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'connected' as const, lastSync: new Date() }
          : device
      ));
    }, 2000);
  };

  const handleConnect = (deviceId: string) => {
    setDevices(devices.map(device => 
      device.id === deviceId 
        ? { ...device, status: 'connected' as const, lastSync: new Date() }
        : device
    ));
  };

  const handleDisconnect = (deviceId: string) => {
    setDevices(devices.map(device => 
      device.id === deviceId 
        ? { ...device, status: 'disconnected' as const }
        : device
    ));
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'smartwatch':
      case 'fitness_band':
      case 'smart_ring':
        return Watch;
      case 'bp_monitor':
      case 'glucometer':
      case 'weight_scale':
        return Activity;
      default:
        return Smartphone;
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Device Integration</h1>
          <p className="text-gray-600 mt-1">Connect and sync your health devices</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Device
        </Button>
      </div>

      {/* Connected Devices */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Connected Devices</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {devices.map((device) => {
            const Icon = getDeviceIcon(device.type);
            return (
              <Card key={device.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Icon className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{device.name}</CardTitle>
                        <CardDescription>
                          {device.brand} • {device.model}
                        </CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(device.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Battery Level */}
                    {device.battery !== undefined && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Battery</span>
                          <span className="font-medium">{device.battery}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              device.battery > 50 ? 'bg-green-500' : 
                              device.battery > 20 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${device.battery}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Last Sync */}
                    {device.lastSync && (
                      <div className="text-sm text-gray-600">
                        Last synced: {new Date(device.lastSync).toLocaleString()}
                      </div>
                    )}

                    {/* Data Types */}
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Data Types:</p>
                      <div className="flex flex-wrap gap-2">
                        {device.dataTypes.map((dataType, index) => (
                          <Badge key={index} variant="secondary">
                            {dataType}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      {device.status === 'connected' ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSync(device.id)}
                            disabled={device.status === 'syncing'}
                          >
                            <RefreshCw className={`mr-2 h-4 w-4 ${device.status === 'syncing' ? 'animate-spin' : ''}`} />
                            Sync Now
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisconnect(device.id)}
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleConnect(device.id)}
                        >
                          <Bluetooth className="mr-2 h-4 w-4" />
                          Connect
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Available Devices */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Available Device Types</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {availableDevices.map((device, index) => {
            const Icon = device.icon;
            return (
              <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Icon className="h-6 w-6 text-gray-600" />
                    </div>
                    <CardTitle className="text-base capitalize">
                      {device.type.replace('_', ' ')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">Supported brands:</p>
                  <div className="space-y-1">
                    {device.brands.map((brand, brandIndex) => (
                      <div key={brandIndex} className="text-sm text-gray-700">
                        • {brand}
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="w-full mt-4" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Device
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Integration Info */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>How Device Integration Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              <strong>Automatic Sync:</strong> Connected devices automatically sync data when in range
            </p>
            <p>
              <strong>Data Privacy:</strong> All health data is encrypted and stored securely
            </p>
            <p>
              <strong>Battery Monitoring:</strong> Track device battery levels to ensure continuous monitoring
            </p>
            <p>
              <strong>Multiple Devices:</strong> Connect multiple devices to track different health metrics
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceIntegration;
