/**
 * Device Monitoring Cron Job
 * Runs every 5 minutes to check device health
 */

import cron from 'node-cron';
import deviceMonitoringService from '../services/device-monitoring.service.js';
import { tick, tickError } from '../utils/cronRegistry.js';

// Run every 5 minutes
const scheduleDeviceMonitoring = () => {
  console.log('📱 Device monitoring cron job initialized');
  
  // Every 5 minutes: Check heartbeats and low battery
  cron.schedule('*/5 * * * *', async () => {
    // 288 of these a day said only that cron works; the registry tick() already records
    // every run, and a failure still logs below.
    if (process.env.LOG_DEVICE_HEARTBEAT === 'true') {
      console.log('🔍 Running device heartbeat check...');
    }
    try {
      await deviceMonitoringService.checkOfflineDevices();
      await deviceMonitoringService.checkLowBatteryDevices();
      tick('device_heartbeat');
    } catch (error) {
      tickError('device_heartbeat', error.message);
      console.error('Heartbeat check error:', error);
    }
  });

  // Every hour: Check AMC and subscription expiry
  cron.schedule('0 * * * *', async () => {
    console.log('📋 Running AMC and subscription checks...');
    try {
      await deviceMonitoringService.checkExpiringAMCs();
      await deviceMonitoringService.deactivateExpiredAMCs();
      await deviceMonitoringService.checkExpiringSubscriptions();
      tick('device_amc');
    } catch (error) {
      tickError('device_amc', error.message);
      console.error('AMC check error:', error);
    }
  });

  // Daily at 9 AM: Check maintenance schedule
  cron.schedule('0 9 * * *', async () => {
    console.log('🔧 Running maintenance schedule check...');
    try {
      await deviceMonitoringService.checkMaintenanceSchedule();
      tick('device_maintenance');
    } catch (error) {
      tickError('device_maintenance', error.message);
      console.error('Maintenance check error:', error);
    }
  });

  // Daily at 8 AM: Generate health report
  cron.schedule('0 8 * * *', async () => {
    console.log('📊 Generating daily device health report...');
    try {
      const report = await deviceMonitoringService.getDeviceHealthReport();
      console.log('Daily Health Report:', JSON.stringify(report, null, 2));
      tick('device_health_report');
    } catch (error) {
      tickError('device_health_report', error.message);
      console.error('Health report error:', error);
    }
  });

  console.log('✅ Device monitoring cron jobs scheduled:');
  console.log('   - Heartbeat check: Every 5 minutes');
  console.log('   - AMC/Subscription check: Every hour');
  console.log('   - Maintenance check: Daily at 9 AM');
  console.log('   - Health report: Daily at 8 AM');
};

export default scheduleDeviceMonitoring;
