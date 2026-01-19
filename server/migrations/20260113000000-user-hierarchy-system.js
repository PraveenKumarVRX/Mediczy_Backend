/**
 * Database Migration: User Hierarchy System
 * Creates tables and relationships for user-entity associations
 */

export async function up(queryInterface, Sequelize) {
  // 1. Create UserAssociations table
  await queryInterface.createTable('user_associations', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    entityType: {
      type: Sequelize.ENUM(
        'hospital',
        'clinic',
        'corporate',
        'membership_plan',
        'homecare',
        'pharmacy',
        'lab',
        'mediqzy_team'
      ),
      allowNull: false
    },
    entityId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    role: {
      type: Sequelize.ENUM(
        'patient',
        'doctor',
        'nurse',
        'doctor_assistant',
        'team_member',
        'admin',
        'staff',
        'member',
        'dependent'
      ),
      allowNull: false
    },
    isPrimary: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: Sequelize.ENUM('active', 'inactive', 'suspended', 'pending'),
      defaultValue: 'active'
    },
    startDate: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    },
    endDate: {
      type: Sequelize.DATE,
      allowNull: true
    },
    metadata: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    permissions: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    createdBy: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    notes: {
      type: Sequelize.TEXT,
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

  // Create indexes for UserAssociations
  await queryInterface.addIndex('user_associations', ['userId']);
  await queryInterface.addIndex('user_associations', ['entityType', 'entityId']);
  await queryInterface.addIndex('user_associations', ['status']);
  await queryInterface.addIndex('user_associations', ['isPrimary']);
  await queryInterface.addIndex('user_associations', 
    ['userId', 'entityType', 'entityId', 'role'], 
    { 
      unique: true,
      name: 'unique_user_entity_role'
    }
  );

  // 2. Create Patients table
  await queryInterface.createTable('patients', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    unique_id: {
      type: Sequelize.STRING(6),
      unique: true,
      allowNull: true
    },
    mrn: {
      type: Sequelize.STRING(50),
      allowNull: true
    },
    firstVisitDate: {
      type: Sequelize.DATE,
      allowNull: true
    },
    firstDoctorId: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    firstAppointmentId: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    bloodGroup: {
      type: Sequelize.ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
      allowNull: true
    },
    height: {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true
    },
    weight: {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true
    },
    emergencyContact: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    allergies: {
      type: Sequelize.ARRAY(Sequelize.STRING),
      defaultValue: []
    },
    chronicConditions: {
      type: Sequelize.ARRAY(Sequelize.STRING),
      defaultValue: []
    },
    currentMedications: {
      type: Sequelize.JSONB,
      defaultValue: []
    },
    primaryInsuranceId: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    secondaryInsuranceId: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    status: {
      type: Sequelize.ENUM('active', 'inactive', 'deceased', 'transferred'),
      defaultValue: 'active'
    },
    totalVisits: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    lastVisitDate: {
      type: Sequelize.DATE,
      allowNull: true
    },
    metadata: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    consentGiven: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    consentDate: {
      type: Sequelize.DATE,
      allowNull: true
    },
    medicalNotes: {
      type: Sequelize.TEXT,
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

  // Create indexes for Patients
  await queryInterface.addIndex('patients', ['userId'], { unique: true });
  await queryInterface.addIndex('patients', ['unique_id'], { unique: true });
  await queryInterface.addIndex('patients', ['status']);
  await queryInterface.addIndex('patients', ['mrn']);

  // 3. Create TeamMembers table
  await queryInterface.createTable('team_members', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    unique_id: {
      type: Sequelize.STRING(6),
      unique: true,
      allowNull: true
    },
    employeeId: {
      type: Sequelize.STRING(50),
      unique: true,
      allowNull: false
    },
    firstName: {
      type: Sequelize.STRING(100),
      allowNull: false
    },
    lastName: {
      type: Sequelize.STRING(100),
      allowNull: false
    },
    email: {
      type: Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    password: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    phoneNumber: {
      type: Sequelize.STRING(20),
      allowNull: false
    },
    profileImage: {
      type: Sequelize.STRING(500),
      allowNull: true
    },
    role: {
      type: Sequelize.ENUM(
        'admin',
        'super_admin',
        'support',
        'operations',
        'marketing',
        'sales',
        'tech',
        'product',
        'customer_success',
        'finance',
        'hr',
        'legal',
        'medical_advisor'
      ),
      allowNull: false,
      defaultValue: 'support'
    },
    department: {
      type: Sequelize.STRING(100),
      allowNull: true
    },
    designation: {
      type: Sequelize.STRING(100),
      allowNull: true
    },
    joiningDate: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    },
    exitDate: {
      type: Sequelize.DATE,
      allowNull: true
    },
    employmentStatus: {
      type: Sequelize.ENUM('active', 'inactive', 'on_leave', 'terminated'),
      defaultValue: 'active'
    },
    employmentType: {
      type: Sequelize.ENUM('full_time', 'part_time', 'contract', 'intern'),
      defaultValue: 'full_time'
    },
    permissions: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    accessLevel: {
      type: Sequelize.INTEGER,
      defaultValue: 1
    },
    workLocation: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    emergencyContact: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    managerId: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    metadata: {
      type: Sequelize.JSONB,
      defaultValue: {}
    },
    notes: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    isActive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    },
    twoFactorEnabled: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    twoFactorSecret: {
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

  // Create indexes for TeamMembers
  await queryInterface.addIndex('team_members', ['employeeId'], { unique: true });
  await queryInterface.addIndex('team_members', ['email'], { unique: true });
  await queryInterface.addIndex('team_members', ['unique_id'], { unique: true });
  await queryInterface.addIndex('team_members', ['role']);
  await queryInterface.addIndex('team_members', ['employmentStatus']);

  // 4. Add userId column to DoctorAssistants if not exists
  try {
    await queryInterface.addColumn('doctors', 'userId', {
      type: Sequelize.INTEGER,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    });
  } catch (error) {
    console.log('userId column already exists in DoctorAssistants');
  }

  // 5. Add userId column to Nurses if not exists
  try {
    await queryInterface.addColumn('Nurses', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    });
  } catch (error) {
    console.log('userId column already exists in Nurses');
  }

  // 6. Add userId column to Doctors if not exists
  try {
    await queryInterface.addColumn('Doctors', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    });
  } catch (error) {
    console.log('userId column already exists in Doctors');
  }
}

export async function down(queryInterface, Sequelize) {
  // Drop tables in reverse order
  await queryInterface.dropTable('team_members');
  await queryInterface.dropTable('patients');
  await queryInterface.dropTable('user_associations');
  
  // Remove userId columns
  try {
    await queryInterface.removeColumn('DoctorAssistants', 'userId');
  } catch (error) {
    console.log('Error removing userId from DoctorAssistants');
  }
  
  try {
    await queryInterface.removeColumn('Nurses', 'userId');
  } catch (error) {
    console.log('Error removing userId from Nurses');
  }
  
  try {
    await queryInterface.removeColumn('Doctors', 'userId');
  } catch (error) {
    console.log('Error removing userId from Doctors');
  }
}
