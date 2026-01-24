// Simple Email Config Model with In-Memory Store
const emailStore = [];
const emailLogStore = [];
let initialized = false;
let logInitialized = false;

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

  async save() {
    console.log('SIMPLE SAVE METHOD CALLED for:', this.name);
    
    // Remove existing if updating
    const existingIndex = emailStore.findIndex(config => config.id === this.id);
    if (existingIndex >= 0) {
      emailStore[existingIndex] = this;
      console.log('Updated config in store. Total:', emailStore.length);
    } else {
      emailStore.push(this);
      console.log('Added new config to store. Total:', emailStore.length);
    }
    
    console.log('Store contents:', emailStore.map(c => `${c.name} (${c.id})`));
    return this;
  }

  toObject() {
    return { ...this };
  }

  static async find(filter = {}) {
    // Initialize store once - try to load from PostgreSQL database first
    if (!initialized) {
      console.log('Initializing email config store...');
      try {
        // Try to load from PostgreSQL database
        const { postgresSequelize } = await import('../db/postgres-sequelize.js');
        const [rows] = await postgresSequelize.query('SELECT * FROM email_configs WHERE "isActive" = true ORDER BY "isDefault" DESC');
        if (rows && rows.length > 0) {
          rows.forEach(row => {
            emailStore.push(new EmailConfig({
              id: row.id,
              name: row.name,
              host: row.host,
              port: row.port,
              secure: row.secure,
              username: row.username,
              password: row.password,
              fromEmail: row.fromEmail,
              fromName: row.fromName,
              isDefault: row.isDefault,
              isActive: row.isActive,
              provider: row.provider,
              replyTo: row.replyTo,
              rateLimits: row.rateLimits,
              testResult: row.testResult,
              lastTested: row.lastTested,
              createdAt: row.createdAt,
              createdBy: row.createdBy
            }));
          });
          console.log('Store initialized from database with', emailStore.length, 'configs');
        } else {
          throw new Error('No configs in database');
        }
      } catch (dbError) {
        console.log('Database load failed, using environment fallback:', dbError.message);
        // Fallback to environment variables
        const sampleConfigs = [
          new EmailConfig({
            id: 'smtp_env_fallback',
            name: 'Environment SMTP Config',
            host: process.env.SMTP_HOST || 'smtppro.zoho.in',
            port: parseInt(process.env.SMTP_PORT) || 465,
            secure: (parseInt(process.env.SMTP_PORT) || 465) === 465,
            username: process.env.SMTP_USER || process.env.SMTP_FROM,
            password: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
            fromEmail: process.env.SMTP_FROM || process.env.SMTP_USER,
            fromName: 'Mediqzy',
            isDefault: true,
            isActive: true
          })
        ];
        emailStore.push(...sampleConfigs);
        console.log('Store initialized from environment with', emailStore.length, 'configs');
      }
      initialized = true;
    }

    console.log('EmailConfig.find returning', emailStore.length, 'configs:', emailStore.map(c => c.name));
    return [...emailStore];
  }

  static async findById(id) {
    console.log('EmailConfig.findById called with ID:', id);
    const configs = await this.find();
    const found = configs.find(config => config.id === id) || null;
    console.log('EmailConfig.findById result:', found ? found.name : 'null');
    return found;
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
    console.log('EmailConfig.updateMany:', filter, update);
    const configs = await this.find();
    configs.forEach(config => {
      if (update.isDefault !== undefined) {
        config.isDefault = update.isDefault;
      }
    });
    return { modifiedCount: configs.length };
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
    const index = emailStore.findIndex(config => config.id === id);
    if (index >= 0) {
      const deleted = emailStore.splice(index, 1)[0];
      console.log('EmailConfig.findByIdAndDelete:', id);
      return deleted;
    }
    return null;
  }

  static async create(data) {
    const config = new EmailConfig(data);
    await config.save();
    return config;
  }
}

// Template Storage
let templateStore = [];

export class EmailTemplate {
  constructor(data = {}) {
    this.id = data.id || `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = data.name || '';
    this.category = data.category || 'notification';
    this.subject = data.subject || '';
    this.htmlContent = data.htmlContent || '';
    this.textContent = data.textContent || '';
    this.variables = data.variables || [];
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.createdBy = data.createdBy || 'admin';
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    const existingIndex = templateStore.findIndex(template => template.id === this.id);
    if (existingIndex >= 0) {
      templateStore[existingIndex] = this;
      console.log('EmailTemplate updated:', this.name);
    } else {
      templateStore.push(this);
      console.log('EmailTemplate saved:', this.name);
    }
    return this;
  }

  static async find(filter = {}) {
    let filtered = [...templateStore];
    
    if (filter.category) {
      filtered = filtered.filter(template => template.category === filter.category);
    }
    if (filter.isActive !== undefined) {
      filtered = filtered.filter(template => template.isActive === filter.isActive);
    }
    
    console.log('EmailTemplate.find returning', filtered.length, 'templates');
    return filtered;
  }

  static async findById(id) {
    console.log('EmailTemplate.findById called with ID:', id);
    const found = templateStore.find(template => template.id === id) || null;
    console.log('EmailTemplate.findById result:', found ? found.name : 'null');
    return found;
  }

  static async create(data) {
    const template = new EmailTemplate(data);
    await template.save();
    return template;
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
      await template.save();
      return template;
    }
    return null;
  }

  static async findByIdAndDelete(id) {
    const index = templateStore.findIndex(template => template.id === id);
    if (index >= 0) {
      const deleted = templateStore.splice(index, 1)[0];
      console.log('EmailTemplate deleted:', deleted.name);
      return deleted;
    }
    return null;
  }
}

export class EmailLog {
  constructor(data = {}) {
    this.id = data.id || `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.to = data.to || '';
    this.from = data.from || '';
    this.subject = data.subject || '';
    this.htmlContent = data.htmlContent || '';
    this.textContent = data.textContent || '';
    this.status = data.status || 'pending';
    this.configId = data.configId || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.sentAt = data.sentAt || null;
    this.deliveredAt = data.deliveredAt || null;
    this.openedAt = data.openedAt || null;
    this.clickedAt = data.clickedAt || null;
    this.bounceReason = data.bounceReason || null;
    this.error = data.error || null;
    this.trackingPixelUrl = data.trackingPixelUrl || null;
    this.priority = data.priority || 'normal';
  }

  async save() {
    const existingIndex = emailLogStore.findIndex(log => log.id === this.id);
    if (existingIndex >= 0) {
      emailLogStore[existingIndex] = this;
      console.log('EmailLog updated:', this.to, this.subject);
    } else {
      emailLogStore.push(this);
      console.log('EmailLog saved:', this.to, this.subject);
    }
    return this;
  }

  static async find(filter = {}) {
    return [...emailLogStore];
  }

  static async findById(id) {
    console.log('EmailLog.findById called with ID:', id);
    const found = emailLogStore.find(log => log.id === id) || null;
    console.log('EmailLog.findById result:', found ? `${found.to} - ${found.subject}` : 'null');
    return found;
  }

  static async create(data) {
    const log = new EmailLog(data);
    await log.save();
    return log;
  }

  static async countDocuments(filter = {}) {
    if (!filter || Object.keys(filter).length === 0) {
      return emailLogStore.length;
    }
    // Simple filtering for rate limiting
    let filtered = emailLogStore;
    if (filter.configId) {
      filtered = filtered.filter(log => log.configId === filter.configId);
    }
    if (filter.status && filter.status.$in) {
      filtered = filtered.filter(log => filter.status.$in.includes(log.status));
    }
    return filtered.length;
  }

  static async aggregate() { return []; }

  // Tracking methods
  static async markAsOpened(logId, openedAt = new Date().toISOString()) {
    const log = await this.findById(logId);
    if (log && !log.openedAt) {
      log.openedAt = openedAt;
      await log.save();
      console.log('📧 Email opened:', log.to);
    }
    return log;
  }

  static async markAsClicked(logId, clickedAt = new Date().toISOString()) {
    const log = await this.findById(logId);
    if (log && !log.clickedAt) {
      log.clickedAt = clickedAt;
      await log.save();
      console.log('🖱️ Email clicked:', log.to);
    }
    return log;
  }
}