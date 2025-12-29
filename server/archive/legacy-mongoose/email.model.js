import mongoose from 'mongoose';

const emailConfigSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  host: {
    type: String,
    required: true,
    trim: true
  },
  port: {
    type: Number,
    required: true,
    min: 1,
    max: 65535
  },
  secure: {
    type: Boolean,
    default: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  fromEmail: {
    type: String,
    required: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  fromName: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  lastTested: {
    type: Date
  },
  testResult: {
    success: Boolean,
    message: String,
    testedAt: Date
  },
  rateLimits: {
    perHour: { type: Number, default: 100 },
    perDay: { type: Number, default: 1000 }
  },
  createdBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['notification', 'welcome', 'reminder', 'billing', 'system', 'marketing'],
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  htmlContent: {
    type: String,
    required: true
  },
  textContent: {
    type: String,
    required: true
  },
  variables: [{
    name: String,
    description: String,
    example: String,
    required: { type: Boolean, default: false }
  }],
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  usage: {
    totalSent: { type: Number, default: 0 },
    lastUsed: Date
  },
  createdBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

const emailLogSchema = new mongoose.Schema({
  to: {
    type: String,
    required: true,
    lowercase: true
  },
  cc: [String],
  bcc: [String],
  subject: {
    type: String,
    required: true
  },
  content: {
    html: String,
    text: String
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailTemplate'
  },
  configId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailConfig',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  scheduledAt: Date,
  sentAt: Date,
  deliveredAt: Date,
  openedAt: Date,
  clickedAt: Date,
  bouncedAt: Date,
  errorMessage: String,
  retryCount: {
    type: Number,
    default: 0,
    max: 3
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    messageId: String,
    trackingId: String
  },
  variables: {
    type: Map,
    of: String
  },
  sentBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for performance
emailLogSchema.index({ to: 1, sentAt: -1 });
emailLogSchema.index({ status: 1, createdAt: -1 });
emailLogSchema.index({ templateId: 1 });
emailLogSchema.index({ configId: 1 });

emailConfigSchema.index({ isActive: 1, isDefault: 1 });
emailTemplateSchema.index({ category: 1, isActive: 1 });

export const EmailConfig = mongoose.model('EmailConfig', emailConfigSchema);
export const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
export const EmailLog = mongoose.model('EmailLog', emailLogSchema);