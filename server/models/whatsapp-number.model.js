/**
 * WhatsApp Number Model
 * Manages multiple WhatsApp numbers for different communication routes
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

const WhatsAppNumber = sequelize.define('WhatsAppNumber', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    validate: {
      is: /^(\+91|91)?[6-9]\d{9}$/
    }
  },
  
  displayName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  
  description: {
    type: DataTypes.TEXT
  },
  
  provider: {
    type: DataTypes.ENUM('twilio', 'facebook', 'gupshup', 'karix', 'infobip', 'messagebird'),
    allowNull: false
  },
  
  providerNumberId: {
    type: DataTypes.STRING(100)
  },
  
  route: {
    type: DataTypes.ENUM(
      'appointments', 'prescriptions', 'test-results', 'general-support',
      'emergency', 'reminders', 'billing', 'marketing', 'teleconsultation',
      'feedback', 'custom'
    ),
    allowNull: false
  },
  
  customRouteName: {
    type: DataTypes.STRING(100)
  },
  
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    validate: { min: 1, max: 100 }
  },
  
  dailyLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 1000
  },
  
  monthlyLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 30000
  },
  
  stats: {
    type: DataTypes.JSONB,
    defaultValue: {
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      messagesToday: 0,
      messagesThisMonth: 0,
      lastMessageSentAt: null,
      lastMessageReceivedAt: null,
      lastResetDate: null
    }
  },
  
  operatingHours: {
    type: DataTypes.JSONB,
    defaultValue: {
      enabled: false,
      timezone: 'Asia/Kolkata',
      schedule: []
    }
  },
  
  allowedTemplates: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  
  webhook: {
    type: DataTypes.JSONB,
    defaultValue: { url: null, enabled: false }
  },
  
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  
  notes: {
    type: DataTypes.TEXT
  },
  
  createdBy: {
    type: DataTypes.UUID
  },
  
  updatedBy: {
    type: DataTypes.UUID
  }
}, {
  tableName: 'whatsapp_numbers',
  timestamps: true,
  indexes: [
    { fields: ['phoneNumber'], unique: true },
    { fields: ['provider', 'active'] },
    { fields: ['route', 'active'] },
    { fields: ['active', 'priority'] }
  ]
});

WhatsAppNumber.prototype.getFormattedNumber = function() {
  const num = this.phoneNumber.replace(/\D/g, '');
  if (num.length === 10) return `+91 ${num.substring(0, 5)} ${num.substring(5)}`;
  if (num.length === 12 && num.startsWith('91')) return `+${num.substring(0, 2)} ${num.substring(2, 7)} ${num.substring(7)}`;
  return this.phoneNumber;
};

WhatsAppNumber.prototype.getRouteDisplayName = function() {
  if (this.route === 'custom' && this.customRouteName) return this.customRouteName;
  const routeNames = {
    'appointments': 'Appointment Reminders', 'prescriptions': 'Prescription Alerts',
    'test-results': 'Test Results', 'general-support': 'General Support',
    'emergency': 'Emergency Alerts', 'reminders': 'General Reminders',
    'billing': 'Billing & Payments', 'marketing': 'Marketing & Promotions',
    'teleconsultation': 'Teleconsultation', 'feedback': 'Feedback & Surveys'
  };
  return routeNames[this.route] || this.route;
};

WhatsAppNumber.prototype.getUsagePercentage = function() {
  if (!this.dailyLimit) return 0;
  return Math.round((this.stats.messagesToday / this.dailyLimit) * 100);
};

WhatsAppNumber.prototype.isAvailable = function() {
  if (!this.active || !this.verified) return false;
  if (this.stats.messagesToday >= this.dailyLimit) return false;
  if (this.stats.messagesThisMonth >= this.monthlyLimit) return false;
  if (this.operatingHours.enabled) {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: this.operatingHours.timezone }).toLowerCase();
    const currentTime = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: this.operatingHours.timezone });
    const schedule = this.operatingHours.schedule.find(s => s.day === day);
    if (!schedule || currentTime < schedule.startTime || currentTime > schedule.endTime) return false;
  }
  return true;
};

WhatsAppNumber.prototype.incrementMessageCount = async function(type = 'sent') {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const stats = { ...this.stats };
  if (!stats.lastResetDate || new Date(stats.lastResetDate) < today) {
    stats.messagesToday = 0;
    stats.lastResetDate = today.toISOString();
  }
  const currentMonth = now.getMonth();
  const lastMonth = stats.lastResetDate ? new Date(stats.lastResetDate).getMonth() : currentMonth;
  if (currentMonth !== lastMonth) stats.messagesThisMonth = 0;
  if (type === 'sent') {
    stats.totalMessagesSent = (stats.totalMessagesSent || 0) + 1;
    stats.messagesToday = (stats.messagesToday || 0) + 1;
    stats.messagesThisMonth = (stats.messagesThisMonth || 0) + 1;
    stats.lastMessageSentAt = now.toISOString();
  } else if (type === 'received') {
    stats.totalMessagesReceived = (stats.totalMessagesReceived || 0) + 1;
    stats.lastMessageReceivedAt = now.toISOString();
  }
  this.stats = stats;
  await this.save();
};

WhatsAppNumber.getBestNumberForRoute = async function(route, provider = null) {
  const where = { route, active: true, verified: true };
  if (provider) where.provider = provider;
  const numbers = await WhatsAppNumber.findAll({ where, order: [['priority', 'ASC']] });
  for (const number of numbers) {
    if (number.isAvailable()) return number;
  }
  return null;
};

WhatsAppNumber.getActiveNumbers = async function() {
  return await WhatsAppNumber.findAll({ where: { active: true }, order: [['route', 'ASC'], ['priority', 'ASC']] });
};

WhatsAppNumber.getNumbersByProvider = async function(provider) {
  return await WhatsAppNumber.findAll({ where: { provider, active: true }, order: [['priority', 'ASC']] });
};

WhatsAppNumber.beforeSave(async (instance) => {
  if (instance.phoneNumber) {
    const cleaned = instance.phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 10) instance.phoneNumber = `+91${cleaned}`;
    else if (cleaned.length === 12 && cleaned.startsWith('91')) instance.phoneNumber = `+${cleaned}`;
  }
});

export default WhatsAppNumber;
