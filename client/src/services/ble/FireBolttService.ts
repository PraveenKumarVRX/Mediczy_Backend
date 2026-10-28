/**
 * Fire-Boltt / Jieli Chip BLE Service
 *
 * Fire-Boltt smartwatches (FB108, FB092, FB89, ring series, etc.) use the
 * Jieli JL7012F/AC695N chip.  Their GATT layout is:
 *
 *   Service  : 0000fee7-0000-1000-8000-00805f9b34fb
 *   Write    : 0000fec8-0000-1000-8000-00805f9b34fb  (write-with-response)
 *   Notify   : 0000fec9-0000-1000-8000-00805f9b34fb  (notify)
 *   Step/Data: 0000fed3-0000-1000-8000-00805f9b34fb  (notify, batch step/activity)
 *
 * Measurement trigger command format (Jieli proprietary):
 *   [0xAB, 0x00, len, 0xFF, cmd, 0x80, 0x01, 0x00]
 *   where cmd: 0x31 = HR, 0x32 = SpO2, 0x33 = step count
 *
 * The watch responds on the notify char within ~1-2 seconds.
 */

export const FIREBOLTT_SERVICE_UUID  = '0000fee7-0000-1000-8000-00805f9b34fb';
export const FIREBOLTT_WRITE_UUID    = '0000fec8-0000-1000-8000-00805f9b34fb';
export const FIREBOLTT_NOTIFY_UUID   = '0000fec9-0000-1000-8000-00805f9b34fb';
export const FIREBOLTT_STEP_UUID     = '0000fed3-0000-1000-8000-00805f9b34fb';

export interface FireBolttHealthData {
  heartRate?: number;
  steps?: number;
  calories?: number;
  spo2?: number;
  battery?: number;
  timestamp: Date;
}

type DataCallback = (data: FireBolttHealthData) => void;

export class FireBolttService {
  getConnectedDeviceId(): string | null {
    return this.server?.connected ? this.server.device.id : null;
  }
  private server: BluetoothRemoteGATTServer | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private stepChar: BluetoothRemoteGATTCharacteristic | null = null;
  private pendingResolve: ((data: Uint8Array) => void) | null = null;
  private dataCallbacks: Set<DataCallback> = new Set();

  /** Returns true if this device looks like a Fire-Boltt / Jieli watch */
  static isFireBoltt(device: BluetoothDevice): boolean {
    const name = (device.name || '').toLowerCase();
    return (
      name.includes('fire-boltt') ||
      name.includes('fireboltt') ||
      name.includes('fb108') ||
      name.includes('fb092') ||
      name.includes('fb 10') ||
      name.includes('fb 09') ||
      name.includes('jl ') ||
      name.startsWith('fb')
    );
  }

  /** Detect Fire-Boltt by checking available GATT services after connection */
  static async hasFireBolttService(server: BluetoothRemoteGATTServer): Promise<boolean> {
    try {
      await server.getPrimaryService(FIREBOLTT_SERVICE_UUID);
      return true;
    } catch {
      return false;
    }
  }

  /** Connect and set up the Jieli characteristics */
  async connect(server: BluetoothRemoteGATTServer): Promise<boolean> {
    try {
      const service = await server.getPrimaryService(FIREBOLTT_SERVICE_UUID);

      this.writeChar  = await service.getCharacteristic(FIREBOLTT_WRITE_UUID);
      this.notifyChar = await service.getCharacteristic(FIREBOLTT_NOTIFY_UUID);

      // Set up notification listener for measurement responses
      await this.notifyChar.startNotifications();
      this.notifyChar.addEventListener('characteristicvaluechanged', this._onNotify.bind(this));

      // Optional step data characteristic
      try {
        this.stepChar = await service.getCharacteristic(FIREBOLTT_STEP_UUID);
        await this.stepChar.startNotifications();
        this.stepChar.addEventListener('characteristicvaluechanged', this._onStepData.bind(this));
      } catch {
        // Not all models expose fed3 — that's fine
      }

      this.server = server;
      console.log('[FireBoltt] Connected and characteristics ready');
      return true;
    } catch (e) {
      console.error('[FireBoltt] connect failed:', e);
      return false;
    }
  }

  /** Register a callback to receive live health readings */
  onData(cb: DataCallback): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  /** Read heart rate. Sends trigger and waits for notify response. */
  async readHeartRate(): Promise<number | null> {
    const raw = await this._trigger(0x31);
    if (!raw) return null;
    // Jieli HR response: [0xAB, len_hi, len_lo, 0xFF, 0x31, hr, ...]
    const hr = raw[5] ?? null;
    return (hr && hr > 0 && hr < 250) ? hr : null;
  }

  /** Read SpO2. Sends trigger and waits for notify response. */
  async readSpO2(): Promise<number | null> {
    const raw = await this._trigger(0x32);
    if (!raw) return null;
    const spo2 = raw[5] ?? null;
    return (spo2 && spo2 >= 70 && spo2 <= 100) ? spo2 : null;
  }

  /** Read step count for today. Sends trigger and waits for notify response. */
  async readSteps(): Promise<number | null> {
    const raw = await this._trigger(0x33);
    if (!raw || raw.length < 8) return null;
    // Steps are little-endian uint32 starting at byte 5
    const steps =
      (raw[5] ?? 0) |
      ((raw[6] ?? 0) << 8) |
      ((raw[7] ?? 0) << 16) |
      ((raw[8] ?? 0) << 24);
    return steps > 0 ? steps : null;
  }

  /** Read battery level via standard GATT battery service (0x180F) */
  async readBattery(): Promise<number | null> {
    if (!this.server) return null;
    try {
      const svc  = await this.server.getPrimaryService('battery_service');
      const char = await svc.getCharacteristic('battery_level');
      const val  = await char.readValue();
      return val.getUint8(0);
    } catch {
      return null;
    }
  }

  /** Sync all available metrics at once — runs sequentially to avoid GATT concurrency errors */
  async syncAll(): Promise<FireBolttHealthData> {
    const result: FireBolttHealthData = { timestamp: new Date() };

    // GATT on Web Bluetooth is single-threaded: only one operation at a time.
    // Running reads in parallel causes "GATT operation already in progress".
    try { result.heartRate = (await this.readHeartRate()) ?? undefined; } catch { /* non-fatal */ }
    try { result.spo2      = (await this.readSpO2())      ?? undefined; } catch { /* non-fatal */ }
    try { result.steps     = (await this.readSteps())     ?? undefined; } catch { /* non-fatal */ }
    try { result.battery   = (await this.readBattery())   ?? undefined; } catch { /* non-fatal */ }

    this._emit(result);
    return result;
  }

  /** Sync phone time to the watch (Jieli cmd 0x11) — call once after connect() */
  async syncTime(): Promise<void> {
    if (!this.writeChar) return;
    const now = new Date();
    const year = now.getFullYear();
    // Frame: [0xAB, 0x00, len, 0xFF, 0x11, year_lo, year_hi, month, day, hour, min, sec]
    // len = 8 bytes after 0xFF
    const cmd = new Uint8Array([
      0xAB, 0x00, 0x08, 0xFF,
      0x11,
      year & 0xFF, (year >> 8) & 0xFF,
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    ]);
    try {
      await this.writeChar.writeValueWithResponse(cmd);
      console.log('[FireBoltt] Time synced to', now.toLocaleTimeString());
    } catch (e) {
      console.warn('[FireBoltt] syncTime failed (non-fatal):', e);
    }
  }

  disconnect(): void {
    this.server = null;
    this.writeChar = null;
    this.notifyChar = null;
    this.stepChar = null;
    this.pendingResolve = null;
  }

  // ---- Private helpers ----

  /** Write the Jieli trigger command and await one notify response (1.8s timeout) */
  private _trigger(cmdByte: number): Promise<Uint8Array | null> {
    return new Promise(async (resolve) => {
      if (!this.writeChar) { resolve(null); return; }

      const timeout = setTimeout(() => {
        this.pendingResolve = null;
        resolve(null);
      }, 2000);

      this.pendingResolve = (data) => {
        clearTimeout(timeout);
        this.pendingResolve = null;
        resolve(data);
      };

      const cmd = new Uint8Array([0xAB, 0x00, 0x04, 0xFF, cmdByte, 0x80, 0x01, 0x00]);
      try {
        await this.writeChar.writeValueWithResponse(cmd);
      } catch (e) {
        console.error('[FireBoltt] write error:', e);
        clearTimeout(timeout);
        this.pendingResolve = null;
        resolve(null);
      }
    });
  }

  private _onNotify(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const bytes = new Uint8Array(value.buffer);
    if (this.pendingResolve) {
      this.pendingResolve(bytes);
    }
  }

  private _onStepData(event: Event): void {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value || value.byteLength < 4) return;
    const bytes = new Uint8Array(value.buffer);
    const steps = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
    if (steps > 0) {
      this._emit({ steps, timestamp: new Date() });
    }
  }

  private _emit(data: FireBolttHealthData): void {
    this.dataCallbacks.forEach(cb => cb(data));
  }
}

export const fireBolttService = new FireBolttService();
export default fireBolttService;
