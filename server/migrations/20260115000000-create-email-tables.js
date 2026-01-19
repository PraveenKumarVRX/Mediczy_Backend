/**
 * Migration: Create Email Management Tables
 * Creates email_configs, email_templates, and email_logs tables
 */

export async function up(queryInterface, Sequelize) {
  // Create email_configs table
  await queryInterface.createTable('email_configs', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    host: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    port: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 587
    },
    secure: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    username: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    password: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    fromEmail: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    fromName: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    replyTo: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    provider: {
      type: Sequelize.STRING(100),
      defaultValue: 'Custom SMTP'
    },
    isActive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    },
    isDefault: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    lastTested: {
      type: Sequelize.DATE,
      allowNull: true
    },
    testResult: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    rateLimits: {
      type: Sequelize.JSONB,
      defaultValue: {
        perHour: 100,
        perDay: 1000,
        perMonth: 30000
      }
    },
    maxRetries: {
      type: Sequelize.INTEGER,
      defaultValue: 3
    },
    retryDelay: {
      type: Sequelize.INTEGER,
      defaultValue: 5000
    },
    createdBy: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  });

  // Create indexes for email_configs
  await queryInterface.addIndex('email_configs', ['isActive']);
  await queryInterface.addIndex('email_configs', ['isDefault']);
  await queryInterface.addIndex('email_configs', ['provider']);

  // Create email_templates table
  await queryInterface.createTable('email_templates', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    category: {
      type: Sequelize.ENUM('notification', 'welcome', 'reminder', 'billing', 'system', 'marketing'),
      allowNull: false,
      defaultValue: 'notification'
    },
    subject: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    htmlContent: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    textContent: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    variables: {
      type: Sequelize.JSONB,
      defaultValue: []
    },
    isActive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    },
    createdBy: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  });

  // Create indexes for email_templates
  await queryInterface.addIndex('email_templates', ['category']);
  await queryInterface.addIndex('email_templates', ['isActive']);

  // Create email_logs table
  await queryInterface.createTable('email_logs', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    configId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'email_configs',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    templateId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'email_templates',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    to: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    from: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    subject: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    status: {
      type: Sequelize.ENUM('pending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'),
      defaultValue: 'pending'
    },
    priority: {
      type: Sequelize.ENUM('low', 'normal', 'high', 'urgent'),
      defaultValue: 'normal'
    },
    sentAt: {
      type: Sequelize.DATE,
      allowNull: true
    },
    deliveredAt: {
      type: Sequelize.DATE,
      allowNull: true
    },
    openedAt: {
      type: Sequelize.DATE,
      allowNull: true
    },
    clickedAt: {
      type: Sequelize.DATE,
      allowNull: true
    },
    errorMessage: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    retryCount: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    metadata: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    scheduledAt: {
      type: Sequelize.DATE,
      allowNull: true
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  });

  // Create indexes for email_logs
  await queryInterface.addIndex('email_logs', ['status']);
  await queryInterface.addIndex('email_logs', ['to']);
  await queryInterface.addIndex('email_logs', ['sentAt']);
  await queryInterface.addIndex('email_logs', ['configId']);
  await queryInterface.addIndex('email_logs', ['templateId']);

  // Insert default Zoho Pro SMTP configuration
  await queryInterface.bulkInsert('email_configs', [{
    name: 'Zoho Pro SMTP (Default)',
    host: 'smtppro.zoho.in',
    port: 465,
    secure: true,
    username: 'notification@mayden.in',
    password: process.env.SMTP_PASSWORD || 'changeme',
    fromEmail: 'notification@mayden.in',
    fromName: 'Mediqzy Notifications',
    replyTo: 'support@mediqzy.com',
    provider: 'Zoho Professional Mail',
    isActive: true,
    isDefault: true,
    rateLimits: JSON.stringify({ perHour: 100, perDay: 1000, perMonth: 30000 }),
    testResult: JSON.stringify({ success: true, message: 'Not tested yet' }),
    maxRetries: 3,
    retryDelay: 5000,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date()
  }]);

  console.log('✅ Email management tables created successfully');
}

export async function down(queryInterface, Sequelize) {
  // Drop tables in reverse order (respecting foreign keys)
  await queryInterface.dropTable('email_logs');
  await queryInterface.dropTable('email_templates');
  await queryInterface.dropTable('email_configs');
  
  console.log('✅ Email management tables dropped successfully');
}
