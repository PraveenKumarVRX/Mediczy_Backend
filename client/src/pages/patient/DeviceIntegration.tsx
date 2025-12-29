import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Watch, Activity, Smartphone, Bluetooth, CheckCircle, XCircle, RefreshCw, Plus, Settings, Heart, Footprints, Moon, Zap, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

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
      name: 'Oura Ring Gen 3',
      type: 'smart_ring',
      brand: 'Oura',
      model: 'Generation 3',
      status: 'disconnected',
      lastSync: new Date('2025-01-12T19:00:00'),
      battery: 45,
      dataTypes: ['Sleep', 'Heart Rate', 'Activity', 'Temperature']
    }
  ]);

  const [availableDevices] = useState([
    { type: 'smartwatch', emoji: '⌚', brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Fitbit Versa', 'Garmin Venu'] },
    { type: 'fitness_band', emoji: '📱', brands: ['Mi Band', 'Fitbit Charge', 'Garmin Vivosmart', 'Honor Band'] },
    { type: 'smart_ring', emoji: '💍', brands: ['Oura Ring', 'Circular Ring', 'Ultrahuman Ring'] },
    { type: 'bp_monitor', emoji: '🩺', brands: ['Omron', 'iHealth', 'Withings BPM'] },
    { type: 'glucometer', emoji: '💉', brands: ['Accu-Chek', 'OneTouch', 'FreeStyle Libre'] },
    { type: 'weight_scale', emoji: '⚖️', brands: ['Withings Body', 'Fitbit Aria', 'Eufy Smart Scale'] }
  ]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; icon: any; color: string }> = {
      connected: { label: 'Connected', icon: CheckCircle, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' },
      disconnected: { label: 'Disconnected', icon: XCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
      syncing: { label: 'Syncing...', icon: RefreshCw, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' }
    };
    const variant = variants[status];
    const Icon = variant.icon;
    return (
      <Badge className={`${variant.color} flex items-center gap-1`}>
        <Icon className={`h-3 w-3 ${status === 'syncing' ? 'animate-spin' : ''}`} />
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
      setDevices(prev => prev.map(device => 
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

  const getDeviceEmoji = (type: string) => {
    switch (type) {
      case 'smartwatch': return '⌚';
      case 'fitness_band': return '📱';
      case 'smart_ring': return '💍';
      case 'bp_monitor': return '🩺';
      case 'glucometer': return '💉';
      case 'weight_scale': return '⚖️';
      default: return '📱';
    }
  };

  const connectedDevicesCount = devices.filter(d => d.status === 'connected').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-4 md:px-6 py-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                <Watch className="w-6 h-6" />
              </div>
              <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                {connectedDevicesCount} Connected
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Smart Device Integration</h1>
            <p className="text-slate-300 text-sm md:text-base">
              Connect your smartwatch, fitness band, or smart ring to automatically track your health data
            </p>
          </div>
          <div className="flex gap-3">
            <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30">
              <Bluetooth className="mr-2 h-4 w-4" />
              Pair New Device
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Watch, label: 'Devices Connected', value: connectedDevicesCount, colorClass: 'text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30' },
          { icon: Heart, label: 'Heart Rate', value: '72 bpm', colorClass: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' },
          { icon: Footprints, label: 'Steps Today', value: '6,542', colorClass: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' },
          { icon: Moon, label: 'Sleep Score', value: '85%', colorClass: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30' },
        ].map((stat, idx) => (
          <Card key={idx} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.colorClass.split(' ').slice(2).join(' ')}`}>
                  <stat.icon className={`w-5 h-5 ${stat.colorClass.split(' ').slice(0, 2).join(' ')}`} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Connected Devices */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Your Devices</h2>
          <Link to="/health-risk-assessment">
            <Button variant="outline" size="sm" className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Run Health Assessment
            </Button>
          </Link>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <Card key={device.id} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 hover:border-teal-200 dark:hover:border-teal-500/50 transition-all">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/20 rounded-xl">
                      <span className="text-2xl">{getDeviceEmoji(device.type)}</span>
                    </div>
                    <div>
                      <CardTitle className="text-base text-slate-800 dark:text-white">{device.name}</CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400">
                        {device.brand} • {device.model}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(device.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {device.battery !== undefined && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600 dark:text-slate-400">Battery</span>
                        <span className="font-medium text-slate-800 dark:text-white">{device.battery}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            device.battery > 50 ? 'bg-teal-500' : 
                            device.battery > 20 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${device.battery}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {device.lastSync && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Last synced: {new Date(device.lastSync).toLocaleString()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Tracks:</p>
                    <div className="flex flex-wrap gap-2">
                      {device.dataTypes.map((dataType, index) => (
                        <Badge key={index} variant="secondary" className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {dataType}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    {device.status === 'connected' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(device.id)}
                          disabled={device.status === 'syncing'}
                          className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                        >
                          <RefreshCw className={`mr-2 h-4 w-4 ${device.status === 'syncing' ? 'animate-spin' : ''}`} />
                          Sync Now
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect(device.id)}
                          className="text-slate-600 dark:text-slate-400"
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(device.id)}
                        className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white"
                      >
                        <Bluetooth className="mr-2 h-4 w-4" />
                        Connect
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-slate-500">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Available Device Types */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Add New Device</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableDevices.map((device, index) => (
            <Card key={index} className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50 cursor-pointer hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg transition-all group">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 rounded-xl group-hover:from-teal-50 group-hover:to-teal-100/50 dark:group-hover:from-teal-900/30 dark:group-hover:to-teal-800/20 transition-colors">
                    <span className="text-3xl">{device.emoji}</span>
                  </div>
                  <CardTitle className="text-base capitalize text-slate-800 dark:text-white">
                    {device.type.replace('_', ' ')}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Supported brands:</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {device.brands.map((brand, brandIndex) => (
                    <Badge key={brandIndex} variant="outline" className="text-xs text-slate-600 dark:text-slate-400">
                      {brand}
                    </Badge>
                  ))}
                </div>
                <Button variant="outline" className="w-full border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add {device.type.replace('_', ' ')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Integration Info */}
      <Card className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-teal-400" />
            How Device Integration Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { title: 'Automatic Sync', desc: 'Connected devices automatically sync data when in range via Bluetooth' },
              { title: 'Data Privacy', desc: 'All health data is encrypted and stored securely on our servers' },
              { title: 'Health Assessment', desc: 'Synced data is used for personalized health risk assessment' },
              { title: 'Multiple Devices', desc: 'Connect multiple devices to track different health metrics' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                <CheckCircle className="w-5 h-5 text-teal-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white font-medium text-sm">{item.title}</p>
                  <p className="text-slate-400 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceIntegration;
