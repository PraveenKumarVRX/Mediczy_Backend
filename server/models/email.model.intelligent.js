// Email models for Intelligent Database Adapter
// These models work with the intelligent database system instead of direct MongoDB

const INTELLIGENT_DB_URL = 'http://localhost:5005';

// In-memory store for email configurations (persists during server session)
const emailConfigStore = [];
let isStoreInitialized = false;

export class EmailConfig {
  constructor(data = {}) {
    this.id = data.id || `smtp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = data.name || '';
    this.host = data.host || '';
    this.port = data.port || 587;
    this.secure = data.secure !== undefined ? data.secure : (data.port === 465);
    this.username = data.username || '';
    this.password = data.password || '';
    this.fromEmail = data.fromEmail || '';
    this.fromName = data.fromName || '';
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.isDefault = data.isDefault !== undefined ? data.isDefault : false;
    this.lastTested = data.lastTested || null;
    this.testResult = data.testResult || null;
    this.rateLimits = data.rateLimits || { perHour: 100, perDay: 1000 };
    this.createdBy = data.createdBy || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // Instance methods
  async save() {
    console.log('ENHANCED SAVE METHOD CALLED for ID:', this.id);
    // Add this config to the store if it doesn't exist
    const existingIndex = emailConfigStore.findIndex(config => config.id === this.id);
    if (existingIndex === -1) {
      emailConfigStore.push(this);
      console.log('EmailConfig.save: Added', this.id, 'Store size:', emailConfigStore.length);
      console.log('Store contents:', emailConfigStore.map(c => c.name));
    } else {
      emailConfigStore[existingIndex] = this;
      console.log('EmailConfig.update: Updated', this.id, 'Store size:', emailConfigStore.length);
    }
    return this;
  }

  toObject() {
    return {
      id: this.id,
      name: this.name,
      host: this.host,
      port: this.port,
      secure: this.secure,
      username: this.username,
      password: this.password,
      fromEmail: this.fromEmail,
      fromName: this.fromName,
      isActive: this.isActive,
      isDefault: this.isDefault,
      lastTested: this.lastTested,
      testResult: this.testResult,
      rateLimits: this.rateLimits,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Static methods for database operations
  static async create(data) {
    try {
      // Try intelligent database first (when available)
      const response = await fetch(`${INTELLIGENT_DB_URL}/email-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        const result = await response.json();
        return new EmailConfig(result.data || result);
      }
    } catch (error) {
      console.log('Intelligent DB not available, using in-memory store');
    }
    
    // Fallback: use in-memory store
    const newConfig = new EmailConfig(data);
    emailConfigStore.push(newConfig);
    console.log('Created email config:', newConfig.name);
    return newConfig;
  }

  static async find(filter = {}) {
    // Initialize store with sample configurations (only once)
    if (!isStoreInitialized && emailConfigStore.length === 0) {
      const sampleConfigs = [
        new EmailConfig({
          id: 'smtp_001',
          name: 'Production Gmail',
          host: 'smtp.gmail.com',
          port: 587,
          username: 'noreply@mediczy.com',
          password: '***********',
          fromEmail: 'noreply@mediczy.com',
          fromName: 'Mediczy Platform',
          isDefault: true,
          isActive: true,
          testResult: { success: true, message: 'Connection successful', testedAt: new Date().toISOString() },
          lastTested: new Date().toISOString(),
          createdBy: 'admin@mediczy.com'
        }),
        new EmailConfig({
          id: 'smtp_002',
          name: 'Backup SendGrid',
          host: 'smtp.sendgrid.net',
          port: 587,
          username: 'apikey',
          password: '***********',
          fromEmail: 'alerts@mediczy.com',
          fromName: 'Mediczy Alerts',
          isDefault: false,
          isActive: true,
          testResult: { success: true, message: 'Connection successful', testedAt: new Date().toISOString() },
          lastTested: new Date().toISOString(),
          createdBy: 'admin@mediczy.com'
        })
      ];
      
      emailConfigStore.push(...sampleConfigs);
      isStoreInitialized = true;
    }

    console.log('EmailConfig.find called. Store size before:', emailConfigStore.length, 'isStoreInitialized:', isStoreInitialized);
    return [...emailConfigStore];
  }

  static async findById(id) {
    const configs = await this.find();
    return configs.find(config => config.id === id) || null;
  }

  static async findOne(filter) {
    const configs = await this.find();
    if (filter.isDefault) {
      return configs.find(config => config.isDefault) || null;
    }
    return configs[0] || null;
  }

  static async countDocuments() {
    const configs = await this.find();
    return configs.length;
  }

  static async updateMany(filter, update) {
    // In production, this would update the database
    console.log('EmailConfig.updateMany:', filter, update);
    return { modifiedCount: 1 };
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const config = await this.findById(id);
    if (config) {
      Object.assign(config, update);
      config.updatedAt = new Date().toISOString();
      console.log('EmailConfig.findByIdAndUpdate:', id, update);
      return config;
    }
    return null;
  }

  static async findByIdAndDelete(id) {
    console.log('EmailConfig.findByIdAndDelete:', id);
    return { id, deleted: true };
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    console.log('EmailConfig.save:', this.id);
    return this;
  }

  toObject() {
    const obj = { ...this };
    // Don't expose password in responses
    if (obj.password) {
      delete obj.password;
    }
    return obj;
  }
}

export class EmailTemplate {
  constructor(data = {}) {
    this.id = data.id || `tmpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = data.name || '';
    this.category = data.category || 'notification';
    this.subject = data.subject || '';
    this.htmlContent = data.htmlContent || '';
    this.textContent = data.textContent || '';
    this.variables = data.variables || [];
    this.description = data.description || '';
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.usage = data.usage || { totalSent: 0, lastUsed: null };
    this.createdBy = data.createdBy || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  static async find(filter = {}) {
    // Sample email templates for demonstration
    const sampleTemplates = [
      new EmailTemplate({
        id: 'tmpl_001',
        name: 'Welcome Email',
        category: 'notification',
        subject: 'Welcome to Mediczy - {{patientName}}',
        htmlContent: '<h2>Welcome to Mediczy!</h2><p>Dear {{patientName}},</p><p>Welcome to our healthcare platform.</p>',
        textContent: 'Welcome to Mediczy! Dear {{patientName}}, Welcome to our healthcare platform.',
        variables: ['patientName', 'loginUrl'],
        usage: { totalSent: 150, lastUsed: new Date().toISOString() },
        createdBy: 'admin@mediczy.com'
      }),
      new EmailTemplate({
        id: 'tmpl_002',
        name: 'Appointment Confirmation',
        category: 'appointment',
        subject: 'Appointment Confirmed - {{doctorName}} on {{appointmentDate}}',
        htmlContent: '<h2>Appointment Confirmed</h2><p>Dear {{patientName}},</p><p>Your appointment with Dr. {{doctorName}} is confirmed for {{appointmentDate}}.</p>',
        textContent: 'Dear {{patientName}}, Your appointment with Dr. {{doctorName}} is confirmed for {{appointmentDate}}.',
        variables: ['patientName', 'doctorName', 'appointmentDate', 'appointmentTime'],
        usage: { totalSent: 2340, lastUsed: new Date().toISOString() },
        createdBy: 'admin@mediczy.com'
      }),
      new EmailTemplate({
        id: 'tmpl_003',
        name: 'Billing Invoice',
        category: 'billing',
        subject: 'Invoice {{invoiceNumber}} - Amount Due: {{amount}}',
        htmlContent: '<h2>Invoice Generated</h2><p>Dear {{clientName}},</p><p>Invoice {{invoiceNumber}} for {{amount}} is ready.</p>',
        textContent: 'Dear {{clientName}}, Invoice {{invoiceNumber}} for {{amount}} is ready.',
        variables: ['clientName', 'invoiceNumber', 'amount', 'dueDate'],
        usage: { totalSent: 890, lastUsed: new Date().toISOString() },
        createdBy: 'admin@mediczy.com'
      })
    ];

    let results = sampleTemplates;

    // Apply filters
    if (filter.category) {
      results = results.filter(template => template.category === filter.category);
    }
    if (filter.isActive !== undefined) {
      results = results.filter(template => template.isActive === filter.isActive);
    }
    if (filter.$or) {
      // Handle search filters
      const searchTerms = filter.$or;
      results = results.filter(template => {
        return searchTerms.some(term => {
          if (term.name) {
            return template.name.toLowerCase().includes(Object.values(term.name)[0].toLowerCase());
          }
          if (term.subject) {
            return template.subject.toLowerCase().includes(Object.values(term.subject)[0].toLowerCase());
          }
          if (term.description) {
            return template.description.toLowerCase().includes(Object.values(term.description)[0].toLowerCase());
          }
          return false;
        });
      });
    }

    return results;
  }

  static async findById(id) {
    const templates = await this.find();
    return templates.find(template => template.id === id) || null;
  }

  static async countDocuments(filter = {}) {
    const templates = await this.find(filter);
    return templates.length;
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const template = await this.findById(id);
    if (template) {
      Object.assign(template, update);
      template.updatedAt = new Date().toISOString();
      console.log('EmailTemplate.findByIdAndUpdate:', id, update);
      return template;
    }
    return null;
  }

  static async findByIdAndDelete(id) {
    console.log('EmailTemplate.findByIdAndDelete:', id);
    return { id, deleted: true };
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    console.log('EmailTemplate.save:', this.id);
    return this;
  }
}

export class EmailLog {
  constructor(data = {}) {
    this.id = data.id || `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.to = data.to || '';
    this.cc = data.cc || [];
    this.bcc = data.bcc || [];
    this.subject = data.subject || '';
    this.content = data.content || {};
    this.templateId = data.templateId || null;
    this.configId = data.configId || null;
    this.status = data.status || 'pending';
    this.priority = data.priority || 'normal';
    this.scheduledAt = data.scheduledAt || null;
    this.sentAt = data.sentAt || null;
    this.deliveredAt = data.deliveredAt || null;
    this.openedAt = data.openedAt || null;
    this.clickedAt = data.clickedAt || null;
    this.bouncedAt = data.bouncedAt || null;
    this.errorMessage = data.errorMessage || null;
    this.retryCount = data.retryCount || 0;
    this.metadata = data.metadata || {};
    this.variables = data.variables || new Map();
    this.sentBy = data.sentBy || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  static async find(filter = {}) {
    // Sample email logs for demonstration
    const sampleLogs = [
      new EmailLog({
        id: 'log_001',
        to: 'patient@example.com',
        subject: 'Welcome to Mediczy - John Doe',
        templateId: 'tmpl_001',
        configId: 'smtp_001',
        status: 'delivered',
        priority: 'normal',
        sentAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        deliveredAt: new Date(Date.now() - 3500000).toISOString(),
        openedAt: new Date(Date.now() - 3000000).toISOString(),
        sentBy: 'admin@mediczy.com'
      }),
      new EmailLog({
        id: 'log_002',
        to: 'doctor@example.com',
        subject: 'Appointment Confirmed - Dr. Smith on Nov 18, 2025',
        templateId: 'tmpl_002',
        configId: 'smtp_001',
        status: 'sent',
        priority: 'high',
        sentAt: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
        sentBy: 'admin@mediczy.com'
      }),
      new EmailLog({
        id: 'log_003',
        to: 'billing@example.com',
        subject: 'Invoice INV-2024-001 - Amount Due: $150',
        templateId: 'tmpl_003',
        configId: 'smtp_002',
        status: 'failed',
        priority: 'normal',
        errorMessage: 'SMTP connection timeout',
        retryCount: 2,
        sentBy: 'admin@mediczy.com'
      }),
      new EmailLog({
        id: 'log_004',
        to: 'test@example.com',
        subject: 'Test Email',
        configId: 'smtp_001',
        status: 'pending',
        priority: 'low',
        sentBy: 'admin@mediczy.com'
      })
    ];

    let results = sampleLogs;

    // Apply filters
    if (filter.status) {
      results = results.filter(log => log.status === filter.status);
    }
    if (filter.to && filter.to.$regex) {
      const regex = new RegExp(filter.to.$regex, filter.to.$options || 'i');
      results = results.filter(log => regex.test(log.to));
    }
    if (filter.templateId) {
      results = results.filter(log => log.templateId === filter.templateId);
    }
    if (filter.configId) {
      results = results.filter(log => log.configId === filter.configId);
    }
    if (filter.createdAt) {
      const startDate = filter.createdAt.$gte ? new Date(filter.createdAt.$gte) : null;
      const endDate = filter.createdAt.$lte ? new Date(filter.createdAt.$lte) : null;
      results = results.filter(log => {
        const logDate = new Date(log.createdAt);
        if (startDate && logDate < startDate) return false;
        if (endDate && logDate > endDate) return false;
        return true;
      });
    }

    return results;
  }

  static async findById(id) {
    const logs = await this.find();
    return logs.find(log => log.id === id) || null;
  }

  static async countDocuments(filter = {}) {
    const logs = await this.find(filter);
    return logs.length;
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const log = await this.findById(id);
    if (log) {
      Object.assign(log, update);
      log.updatedAt = new Date().toISOString();
      console.log('EmailLog.findByIdAndUpdate:', id, update);
      return log;
    }
    return null;
  }

  static async aggregate(pipeline) {
    // Simplified aggregation for analytics
    const logs = await this.find();
    
    // Handle basic grouping for analytics
    if (pipeline.find(stage => stage.$group)) {
      const groupStage = pipeline.find(stage => stage.$group);
      const results = [];
      
      // Group by day for demo
      const groupedByDay = logs.reduce((acc, log) => {
        const day = log.createdAt.split('T')[0];
        if (!acc[day]) {
          acc[day] = {
            _id: { year: 2025, month: 11, day: 16 },
            sent: 0,
            delivered: 0,
            failed: 0,
            opened: 0,
            clicked: 0
          };
        }
        
        if (['sent', 'delivered'].includes(log.status)) acc[day].sent++;
        if (log.status === 'delivered') acc[day].delivered++;
        if (log.status === 'failed') acc[day].failed++;
        if (log.openedAt) acc[day].opened++;
        if (log.clickedAt) acc[day].clicked++;
        
        return acc;
      }, {});
      
      return Object.values(groupedByDay);
    }
    
    return logs;
  }

  static populate(field) {
    return this; // Simplified for demo
  }

  static sort(criteria) {
    return this; // Simplified for demo
  }

  static skip(count) {
    return this; // Simplified for demo
  }

  static limit(count) {
    return this; // Simplified for demo
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    console.log('EmailLog.save:', this.id);
    return this;
  }
}