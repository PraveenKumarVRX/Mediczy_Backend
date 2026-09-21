/**
 * Parking overstay scan — raises alerts for vehicles parked past their lot's
 * limit in security-enabled lots. Idempotent, so overlapping runs are harmless.
 */
import cron from 'node-cron';
import { tick, tickError, tickStart } from '../utils/cronRegistry.js';
import parkingService from './parking.service.js';

export function startParkingOverstayCron() {
  cron.schedule('*/10 * * * *', async () => {
    tickStart('parking_overstay');
    try {
      tick('parking_overstay', await parkingService.scanOverstay());
    } catch (err) {
      tickError('parking_overstay', err.message);
    }
  });
  console.log('[Parking] overstay scan cron scheduled (every 10 min)');
}

export default { startParkingOverstayCron };
