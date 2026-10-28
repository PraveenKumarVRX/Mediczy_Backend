import bleService from '@/services/ble/BLEService';
import veepooService from '@/services/ble/VeepooService';
import fireBolttService from '@/services/ble/FireBolttService';

export function liveDeviceStatus(device: { id?: string; device_id?: string; deviceId?: string }): 'connected' | 'disconnected' {
  const id = device.device_id || device.deviceId || device.id;
  const generic = id ? bleService.getDevice(String(id)) : undefined;
  const connected = generic?.gattServer?.connected ||
    (veepooService.getDevice()?.id === id && veepooService.getConnectionStatus()) ||
    (fireBolttService.getConnectedDeviceId() === id);
  return connected ? 'connected' : 'disconnected';
}
