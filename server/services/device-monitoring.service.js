/**
 * Device Monitoring Service
 * Handles device heartbeat monitoring and health checks
 */

import Device from '../models/postgres/device.model.postgres.js';
import { Op } from 'sequelize';
// Email service placeholder - integrate with actual email service later
const sendEmail = async (options) => {
  console.log(`[EMAIL] To: ${options.to}, Subject: ${options.subject}`);
};

class DeviceMonitoringService {
  /**
   * Check for offline devices (no heartbeat in last 30 minutes)
   */
  async checkOfflineDevices() {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      const offlineDevices = await Device.findAll({
        where: {
          status: 'active',
          last_online: {
            [Op.lt]: thirtyMinutesAgo
          }
        }
      });

      console.log(`Found ${offlineDevices.length} offline devices`);

      // Update status to maintenance if offline for too long (2 hours)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      for (const device of offlineDevices) {
        if (device.last_online && new Date(device.last_online) < twoHoursAgo) {
          await device.update({ status: 'maintenance' });
          console.log(`Device ${device.device_id} marked as maintenance (offline > 2 hours)`);
          
          // Send alert email
          await this.sendOfflineAlert(device);
        }
      }

      return offlineDevices;
    } catch (error) {
      console.error('Error checking offline devices:', error);
      throw error;
    }
  }

  /**
   * Check for low battery devices (< 20%)
   */
  async checkLowBatteryDevices() {
    try {
      const lowBatteryDevices = await Device.findAll({
        where: {
          status: 'active',
          battery_level: {
            [Op.lt]: 20,
            [Op.ne]: null
          }
        }
      });

      console.log(`Found ${lowBatteryDevices.length} low battery devices`);

      for (const device of lowBatteryDevices) {
        await this.sendLowBatteryAlert(device);
      }

      return lowBatteryDevices;
    } catch (error) {
      console.error('Error checking low battery devices:', error);
      throw error;
    }
  }

  /**
   * Check for AMC expiring soon (within 30 days)
   */
  async checkExpiringAMCs() {
    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const expiringAMCs = await Device.findAll({
        where: {
          amc_active: true,
          amc_end_date: {
            [Op.lte]: thirtyDaysFromNow,
            [Op.gte]: new Date()
          }
        }
      });

      console.log(`Found ${expiringAMCs.length} AMCs expiring within 30 days`);

      for (const device of expiringAMCs) {
        const daysUntilExpiry = device.daysUntilAMCExpiry();
        await this.sendAMCExpiryAlert(device, daysUntilExpiry);
      }

      return expiringAMCs;
    } catch (error) {
      console.error('Error checking expiring AMCs:', error);
      throw error;
    }
  }

  /**
   * Check for expired AMCs and deactivate
   */
  async deactivateExpiredAMCs() {
    try {
      const expiredAMCs = await Device.findAll({
        where: {
          amc_active: true,
          amc_end_date: {
            [Op.lt]: new Date()
          }
        }
      });

      console.log(`Found ${expiredAMCs.length} expired AMCs`);

      for (const device of expiredAMCs) {
        await device.update({ amc_active: false });
        console.log(`Device ${device.device_id} AMC deactivated (expired)`);
        
        await this.sendAMCExpiredAlert(device);
      }

      return expiredAMCs;
    } catch (error) {
      console.error('Error deactivating expired AMCs:', error);
      throw error;
    }
  }

  /**
   * Check for subscription expiring soon (within 7 days)
   */
  async checkExpiringSubscriptions() {
    try {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const expiringSubscriptions = await Device.findAll({
        where: {
          status: 'active',
          subscription_end: {
            [Op.lte]: sevenDaysFromNow,
            [Op.gte]: new Date()
          }
        }
      });

      console.log(`Found ${expiringSubscriptions.length} subscriptions expiring within 7 days`);

      for (const device of expiringSubscriptions) {
        await this.sendSubscriptionExpiryAlert(device);
      }

      return expiringSubscriptions;
    } catch (error) {
      console.error('Error checking expiring subscriptions:', error);
      throw error;
    }
  }

  /**
   * Check devices needing maintenance
   */
  async checkMaintenanceSchedule() {
    try {
      const devicesNeedingMaintenance = await Device.findAll({
        where: {
          status: 'active',
          next_maintenance: {
            [Op.lte]: new Date()
          }
        }
      });

      console.log(`Found ${devicesNeedingMaintenance.length} devices needing maintenance`);

      for (const device of devicesNeedingMaintenance) {
        await this.sendMaintenanceReminderAlert(device);
      }

      return devicesNeedingMaintenance;
    } catch (error) {
      console.error('Error checking maintenance schedule:', error);
      throw error;
    }
  }

  /**
   * Get device health report
   */
  async getDeviceHealthReport() {
    try {
      const totalDevices = await Device.count();
      const activeDevices = await Device.count({ where: { status: 'active' } });
      const maintenanceDevices = await Device.count({ where: { status: 'maintenance' } });
      const faultyDevices = await Device.count({ where: { status: 'faulty' } });

      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const onlineDevices = await Device.count({
        where: {
          status: 'active',
          last_online: {
            [Op.gte]: thirtyMinutesAgo
          }
        }
      });

      const lowBatteryDevices = await Device.count({
        where: {
          battery_level: {
            [Op.lt]: 20,
            [Op.ne]: null
          }
        }
      });

      const activeAMCs = await Device.count({
        where: {
          amc_active: true,
          amc_end_date: {
            [Op.gte]: new Date()
          }
        }
      });

      return {
        total_devices: totalDevices,
        active_devices: activeDevices,
        online_devices: onlineDevices,
        maintenance_devices: maintenanceDevices,
        faulty_devices: faultyDevices,
        low_battery_devices: lowBatteryDevices,
        active_amcs: activeAMCs,
        health_percentage: totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0
      };
    } catch (error) {
      console.error('Error getting device health report:', error);
      throw error;
    }
  }

  /**
   * Send offline device alert
   */
  async sendOfflineAlert(device) {
    // Placeholder for email notification
    console.log(`[ALERT] Device ${device.device_id} is offline - Last seen: ${device.last_online}`);
    
    // TODO: Integrate with actual email service
    // await sendEmail({
    //   to: 'admin@mediczy.com',
    //   subject: `Device Offline Alert: ${device.device_id}`,
    //   text: `Device ${device.device_name} (${device.device_id}) has been offline for more than 2 hours.`
    // });
  }

  /**
   * Send low battery alert
   */
  async sendLowBatteryAlert(device) {
    console.log(`[ALERT] Device ${device.device_id} low battery: ${device.battery_level}%`);
  }

  /**
   * Send AMC expiry alert
   */
  async sendAMCExpiryAlert(device, daysUntilExpiry) {
    console.log(`[ALERT] Device ${device.device_id} AMC expires in ${daysUntilExpiry} days`);
    
    // TODO: Email notification
    // await sendEmail({
    //   to: device tenant contact email,
    //   subject: `AMC Renewal Reminder: ${daysUntilExpiry} days remaining`,
    //   text: `Your AMC for device ${device.device_name} will expire on ${device.amc_end_date}`
    // });
  }

  /**
   * Send AMC expired alert
   */
  async sendAMCExpiredAlert(device) {
    console.log(`[ALERT] Device ${device.device_id} AMC has expired`);
  }

  /**
   * Send subscription expiry alert
   */
  async sendSubscriptionExpiryAlert(device) {
    console.log(`[ALERT] Device ${device.device_id} subscription expires soon`);
  }

  /**
   * Send maintenance reminder
   */
  async sendMaintenanceReminderAlert(device) {
    console.log(`[ALERT] Device ${device.device_id} needs maintenance`);
  }

  /**
   * Run all monitoring checks
   */
  async runAllChecks() {
    console.log('=== Running Device Monitoring Checks ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    try {
      await this.checkOfflineDevices();
      await this.checkLowBatteryDevices();
      await this.checkExpiringAMCs();
      await this.deactivateExpiredAMCs();
      await this.checkExpiringSubscriptions();
      await this.checkMaintenanceSchedule();
      
      const healthReport = await this.getDeviceHealthReport();
      console.log('Device Health Report:', healthReport);
      
      console.log('=== Monitoring Checks Complete ===\n');
      
      return healthReport;
    } catch (error) {
      console.error('Error running monitoring checks:', error);
      throw error;
    }
  }
}

export default new DeviceMonitoringService();
