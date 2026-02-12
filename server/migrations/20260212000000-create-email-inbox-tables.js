import { postgresSequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';

export async function up() {
  const queryInterface = postgresSequelize.getQueryInterface();

  console.log('Creating email_inboxes table...');
  
  // Create email_inboxes table for storing received emails with AI processing
  await queryInterface.createTable('email_inboxes', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    teamMemberId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'team_member_id',
      references: {
        model: 'team_members',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    messageId: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      field: 'message_id'
    },
    from: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    to: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    cc: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    bcc: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    htmlBody: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'html_body'
    },
    attachments: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'received_at'
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_read'
    },
    isStarred: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_starred'
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      defaultValue: 'normal'
    },
    labels: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    threadId: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'thread_id'
    },
    inReplyTo: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'in_reply_to'
    },
    aiProcessed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'ai_processed'
    },
    aiSummary: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'ai_summary'
    },
    aiIntent: {
      type: DataTypes.ENUM(
        'appointment_request',
        'test_result',
        'prescription',
        'billing',
        'patient_query',
        'feedback',
        'other'
      ),
      allowNull: true,
      field: 'ai_intent'
    },
    aiEntities: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'ai_entities'
    },
    aiSentiment: {
      type: DataTypes.ENUM('positive', 'neutral', 'negative'),
      allowNull: true,
      field: 'ai_sentiment'
    },
    aiConfidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
      field: 'ai_confidence'
    },
    linkedResourceType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'linked_resource_type'
    },
    linkedResourceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'linked_resource_id'
    },
    autoUpdatesApplied: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'auto_updates_applied'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  });

  // Add indexes for performance
  await queryInterface.addIndex('email_inboxes', ['team_member_id'], {
    name: 'idx_email_inboxes_team_member_id'
  });

  await queryInterface.addIndex('email_inboxes', ['message_id'], {
    name: 'idx_email_inboxes_message_id',
    unique: true
  });

  await queryInterface.addIndex('email_inboxes', ['is_read'], {
    name: 'idx_email_inboxes_is_read'
  });

  await queryInterface.addIndex('email_inboxes', ['ai_intent'], {
    name: 'idx_email_inboxes_ai_intent'
  });

  await queryInterface.addIndex('email_inboxes', ['priority'], {
    name: 'idx_email_inboxes_priority'
  });

  console.log('Creating appointment_inquiries table...');
  
  // Create appointment_inquiries table
  await queryInterface.createTable('appointment_inquiries', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    emailId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'email_id',
      references: {
        model: 'email_inboxes',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    patientName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'patient_name'
    },
    patientEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'patient_email'
    },
    preferredDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'preferred_date'
    },
    status: {
      type: DataTypes.ENUM('pending', 'contacted', 'scheduled', 'cancelled'),
      defaultValue: 'pending'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  });

  console.log('Creating billing_notifications table...');
  
  // Create billing_notifications table
  await queryInterface.createTable('billing_notifications', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    emailId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'email_id',
      references: {
        model: 'email_inboxes',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    invoiceNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'invoice_number'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'INR'
    },
    status: {
      type: DataTypes.ENUM('received', 'pending', 'paid', 'overdue'),
      defaultValue: 'received'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  });

  console.log('Creating feedback_records table...');
  
  // Create feedback_records table if it doesn't exist
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('feedback_records')) {
    await queryInterface.createTable('feedback_records', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      emailId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'email_id',
        references: {
          model: 'email_inboxes',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      patientName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'patient_name'
      },
      patientEmail: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'patient_email'
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 5
        }
      },
      sentiment: {
        type: DataTypes.ENUM('positive', 'neutral', 'negative'),
        allowNull: true
      },
      feedback: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      category: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('new', 'reviewed', 'responded', 'closed'),
        defaultValue: 'new'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'updated_at'
      }
    });
  }

  console.log('Email inbox tables created successfully!');
}

export async function down() {
  const queryInterface = postgresSequelize.getQueryInterface();

  // Drop tables in reverse order due to foreign key constraints
  await queryInterface.dropTable('feedback_records');
  await queryInterface.dropTable('billing_notifications');
  await queryInterface.dropTable('appointment_inquiries');
  await queryInterface.dropTable('email_inboxes');

  console.log('Email inbox tables dropped successfully!');
}

// Auto-run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running email inbox migration...');
  
  up()
    .then(() => {
      console.log('Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
