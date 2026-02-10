import { DataTypes } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import postgresSequelize from '../../db/postgres-sequelize.js';

/**
 * Notification Model (PostgreSQL)
 * Represents system and user notifications
 * 
 * Features:
 * - JSONB for notification data and metadata
 * - Support for multiple notification types
 * - Read/unread tracking
 * - Scheduled notifications
 * - Deep linking support
 */

const Notification = postgresSequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Recipient user ID'
  },
  userType: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'patient',
    comment: 'User type: patient, doctor, admin'
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [[
        'appointment', 'appointment_request', 'appointment_booked', 
        'appointment_accepted', 'appointment_rejected', 'appointment_cancelled',
        'prescription', 'payment', 'payment_received', 'reminder',
        'message', 'alert', 'promotion', 'system', 'verification',
        'booking_confirmed', 'booking_cancelled', 'doctor_message',
        'lab_report', 'medicine_reminder', 'health_tip',
        'consultation_started', 'consultation_ended', 'prescription_ready'
      ]]
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // JSONB for notification-specific data
  data: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Type-specific data: {appointmentId, prescriptionId, amount, etc.}'
  },
  // Deep link for navigation
  deepLink: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Deep link URL for mobile app navigation'
  },
  // Web route for web app navigation
  webRoute: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Route path for web app navigation'
  },
  priority: {
    type: DataTypes.STRING(20),
    defaultValue: 'normal',
    validate: {
      isIn: [['low', 'normal', 'high', 'urgent']]
    }
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // For scheduled notifications
  scheduledFor: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When to send this notification'
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When notification was actually sent'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'sent', 'failed', 'cancelled', 'read']]
    }
  },
  // Delivery channels
  channels: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['app'],
    comment: 'Delivery channels: app, email, sms, push'
  },
  // JSONB for delivery tracking
  deliveryStatus: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Track delivery per channel: {app: "sent", email: "delivered", sms: "failed"}'
  },
  // Additional metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional data: {senderId, campaign, category, tags}'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When notification expires'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['userId', 'userType']
    },
    {
      fields: ['type']
    },
    {
      fields: ['isRead']
    },
    {
      fields: ['status']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['scheduledFor']
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['userId', 'isRead', 'createdAt'],
      name: 'idx_notifications_user_unread'
    },
    {
      using: 'gin',
      fields: ['data'],
      name: 'idx_notifications_data_gin'
    },
    {
      using: 'gin',
      fields: ['metadata'],
      name: 'idx_notifications_metadata_gin'
    },
    {
      fields: ['channels'],
      using: 'gin',
      name: 'idx_notifications_channels_gin'
    }
  ]
});

// Instance methods
Notification.prototype.markAsRead = async function() {
  this.isRead = true;
  this.readAt = new Date();
  return await this.save();
};

Notification.prototype.markAsSent = async function(channel = null) {
  this.status = 'sent';
  this.sentAt = new Date();
  
  if (channel) {
    this.deliveryStatus = this.deliveryStatus || {};
    this.deliveryStatus[channel] = 'sent';
  }
  
  return await this.save();
};

Notification.prototype.isExpired = function() {
  return this.expiresAt && new Date() > new Date(this.expiresAt);
};

Notification.prototype.toJSON = function() {
  const values = { ...this.get() };
  return values;
};

// Static methods
Notification.findUnreadByUser = async function(userId) {
  return await this.findAll({
    where: { 
      userId,
      isRead: false,
      status: 'sent',
      expiresAt: {
        [postgresSequelize.Sequelize.Op.or]: [
          null,
          { [postgresSequelize.Sequelize.Op.gt]: new Date() }
        ]
      }
    },
    order: [['priority', 'DESC'], ['createdAt', 'DESC']]
  });
};

Notification.findByUserAndType = async function(userId, type) {
  return await this.findAll({
    where: { userId, type },
    order: [['createdAt', 'DESC']],
    limit: 50
  });
};

Notification.findPending = async function() {
  return await this.findAll({
    where: {
      status: 'pending',
      scheduledFor: {
        [postgresSequelize.Sequelize.Op.lte]: new Date()
      }
    },
    order: [['priority', 'DESC'], ['scheduledFor', 'ASC']]
  });
};

Notification.markAllAsReadForUser = async function(userId) {
  return await this.update(
    { 
      isRead: true,
      readAt: new Date()
    },
    { 
      where: { 
        userId,
        isRead: false 
      }
    }
  );
};

Notification.getUnreadCount = async function(userId) {
  return await this.count({
    where: {
      userId,
      isRead: false,
      status: 'sent'
    }
  });
};

export default Notification;
