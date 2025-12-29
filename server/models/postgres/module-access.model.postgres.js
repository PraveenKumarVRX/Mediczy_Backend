/**
 * Module Access Control Model
 * Manages which modules are accessible to different user types
 * Super Admin configures these settings to control access across the platform
 */

import { DataTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

// Define all available modules in the system
export const SYSTEM_MODULES = {
  // User Dashboard Modules
  USER_DASHBOARD: 'user_dashboard',
  USER_APPOINTMENTS: 'user_appointments',
  USER_CONSULTATIONS: 'user_consultations',
  USER_PRESCRIPTIONS: 'user_prescriptions',
  USER_LAB_REPORTS: 'user_lab_reports',
  USER_HEALTH_RECORDS: 'user_health_records',
  USER_VITALS: 'user_vitals',
  USER_MEDICATIONS: 'user_medications',
  USER_INSURANCE: 'user_insurance',
  USER_PAYMENTS: 'user_payments',
  USER_FAMILY: 'user_family',
  USER_AI_CHAT: 'user_ai_chat',
  USER_VIDEO_CALL: 'user_video_call',
  USER_NOTIFICATIONS: 'user_notifications',
  USER_PROFILE: 'user_profile',
  USER_WEARABLES: 'user_wearables',
  USER_HEALTH_GOALS: 'user_health_goals',
  USER_REWARDS: 'user_rewards',
  
  // Doctor Dashboard Modules
  DOCTOR_DASHBOARD: 'doctor_dashboard',
  DOCTOR_APPOINTMENTS: 'doctor_appointments',
  DOCTOR_PATIENTS: 'doctor_patients',
  DOCTOR_EMR: 'doctor_emr',
  DOCTOR_PRESCRIPTIONS: 'doctor_prescriptions',
  DOCTOR_CONSULTATIONS: 'doctor_consultations',
  DOCTOR_SCHEDULE: 'doctor_schedule',
  DOCTOR_BILLING: 'doctor_billing',
  DOCTOR_ANALYTICS: 'doctor_analytics',
  DOCTOR_VIDEO_CALL: 'doctor_video_call',
  DOCTOR_AI_SCRIBE: 'doctor_ai_scribe',
  DOCTOR_CHAT: 'doctor_chat',
  DOCTOR_PROFILE: 'doctor_profile',
  DOCTOR_ASSISTANTS: 'doctor_assistants',
  
  // Corporate Dashboard Modules
  CORPORATE_DASHBOARD: 'corporate_dashboard',
  CORPORATE_EMPLOYEES: 'corporate_employees',
  CORPORATE_HEALTH_PROGRAMS: 'corporate_health_programs',
  CORPORATE_ANALYTICS: 'corporate_analytics',
  CORPORATE_BILLING: 'corporate_billing',
  CORPORATE_REPORTS: 'corporate_reports',
  
  // Lab Dashboard Modules
  LAB_DASHBOARD: 'lab_dashboard',
  LAB_ORDERS: 'lab_orders',
  LAB_REPORTS: 'lab_reports',
  LAB_INVENTORY: 'lab_inventory',
  LAB_BILLING: 'lab_billing',
  
  // Pharmacy Dashboard Modules
  PHARMACY_DASHBOARD: 'pharmacy_dashboard',
  PHARMACY_ORDERS: 'pharmacy_orders',
  PHARMACY_INVENTORY: 'pharmacy_inventory',
  PHARMACY_BILLING: 'pharmacy_billing',
  
  // Hospital/Clinic Modules
  HOSPITAL_DASHBOARD: 'hospital_dashboard',
  HOSPITAL_PATIENTS: 'hospital_patients',
  HOSPITAL_STAFF: 'hospital_staff',
  HOSPITAL_BILLING: 'hospital_billing',
  
  // Communication Modules (shared)
  CHAT: 'chat',
  VIDEO_CALL: 'video_call',
  VOICE_CALL: 'voice_call',
  SMS: 'sms',
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
};

// User types that can have module access
export const USER_TYPES = {
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  CORPORATE_ADMIN: 'corporate_admin',
  CORPORATE_EMPLOYEE: 'corporate_employee',
  LAB_ADMIN: 'lab_admin',
  LAB_TECHNICIAN: 'lab_technician',
  PHARMACY_ADMIN: 'pharmacy_admin',
  PHARMACY_STAFF: 'pharmacy_staff',
  HOSPITAL_ADMIN: 'hospital_admin',
  CLINIC_ADMIN: 'clinic_admin',
  NURSE: 'nurse',
  ASSISTANT: 'assistant',
  TEAM_MEMBER: 'team_member',
};

// Default module access for each user type
export const DEFAULT_MODULE_ACCESS = {
  [USER_TYPES.PATIENT]: [
    SYSTEM_MODULES.USER_DASHBOARD,
    SYSTEM_MODULES.USER_APPOINTMENTS,
    SYSTEM_MODULES.USER_CONSULTATIONS,
    SYSTEM_MODULES.USER_PRESCRIPTIONS,
    SYSTEM_MODULES.USER_LAB_REPORTS,
    SYSTEM_MODULES.USER_HEALTH_RECORDS,
    SYSTEM_MODULES.USER_VITALS,
    SYSTEM_MODULES.USER_MEDICATIONS,
    SYSTEM_MODULES.USER_PAYMENTS,
    SYSTEM_MODULES.USER_FAMILY,
    SYSTEM_MODULES.USER_AI_CHAT,
    SYSTEM_MODULES.USER_NOTIFICATIONS,
    SYSTEM_MODULES.USER_PROFILE,
  ],
  [USER_TYPES.DOCTOR]: [
    SYSTEM_MODULES.DOCTOR_DASHBOARD,
    SYSTEM_MODULES.DOCTOR_APPOINTMENTS,
    SYSTEM_MODULES.DOCTOR_PATIENTS,
    SYSTEM_MODULES.DOCTOR_EMR,
    SYSTEM_MODULES.DOCTOR_PRESCRIPTIONS,
    SYSTEM_MODULES.DOCTOR_CONSULTATIONS,
    SYSTEM_MODULES.DOCTOR_SCHEDULE,
    SYSTEM_MODULES.DOCTOR_BILLING,
    SYSTEM_MODULES.DOCTOR_VIDEO_CALL,
    SYSTEM_MODULES.DOCTOR_CHAT,
    SYSTEM_MODULES.DOCTOR_PROFILE,
  ],
  [USER_TYPES.CORPORATE_ADMIN]: [
    SYSTEM_MODULES.CORPORATE_DASHBOARD,
    SYSTEM_MODULES.CORPORATE_EMPLOYEES,
    SYSTEM_MODULES.CORPORATE_HEALTH_PROGRAMS,
    SYSTEM_MODULES.CORPORATE_ANALYTICS,
    SYSTEM_MODULES.CORPORATE_BILLING,
    SYSTEM_MODULES.CORPORATE_REPORTS,
  ],
};

/**
 * ModuleAccess Model
 * Stores the module access configuration for each user type
 * Can be overridden at individual user level
 */
const ModuleAccess = sequelize.define('ModuleAccess', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // User type this configuration applies to
  userType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'User type: patient, doctor, corporate_admin, etc.'
  },
  
  // Module identifier
  moduleId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Module identifier from SYSTEM_MODULES'
  },
  
  // Module display name
  moduleName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: 'Human-readable module name'
  },
  
  // Module category for grouping
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Category for grouping modules in UI'
  },
  
  // Access permissions
  isEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this module is enabled for the user type'
  },
  
  canView: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'View permission'
  },
  
  canCreate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Create permission'
  },
  
  canEdit: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Edit permission'
  },
  
  canDelete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Delete permission'
  },
  
  canExport: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Export data permission'
  },
  
  // Additional permissions as JSONB for flexibility
  additionalPermissions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Module-specific additional permissions'
  },
  
  // Display order in navigation
  displayOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Order in which module appears in navigation'
  },
  
  // Icon for the module
  icon: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Lucide icon name for the module'
  },
  
  // Route path
  routePath: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Frontend route path for the module'
  },
  
  // Who last modified
  modifiedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Admin who last modified this configuration'
  },
  
  // Notes
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Admin notes about this configuration'
  }
}, {
  tableName: 'module_access',
  timestamps: true,
  indexes: [
    { fields: ['userType'] },
    { fields: ['moduleId'] },
    { fields: ['userType', 'moduleId'], unique: true },
    { fields: ['isEnabled'] },
    { fields: ['category'] }
  ]
});

/**
 * UserModuleOverride Model
 * Allows individual user-level module access overrides
 */
const UserModuleOverride = sequelize.define('UserModuleOverride', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // User ID this override applies to
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'User ID for individual override'
  },
  
  // User type for validation
  userType: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  
  // Module being overridden
  moduleId: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  
  // Override permissions (null means use default)
  isEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  
  canView: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  
  canCreate: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  
  canEdit: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  
  canDelete: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  
  canExport: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  },
  
  // Reason for override
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason for this individual override'
  },
  
  // Expiry date for temporary overrides
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Override expiry date for temporary permissions'
  },
  
  // Who granted this override
  grantedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Admin who granted this override'
  }
}, {
  tableName: 'user_module_overrides',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['userId', 'moduleId'], unique: true },
    { fields: ['expiresAt'] }
  ]
});

/**
 * Helper function to get effective module access for a user
 */
export const getEffectiveModuleAccess = async (userId, userType) => {
  try {
    // Get default access for user type
    const defaultAccess = await ModuleAccess.findAll({
      where: { userType, isEnabled: true },
      order: [['displayOrder', 'ASC']]
    });
    
    // Get individual overrides
    const overrides = await UserModuleOverride.findAll({
      where: { 
        userId,
        [sequelize.Sequelize.Op.or]: [
          { expiresAt: null },
          { expiresAt: { [sequelize.Sequelize.Op.gt]: new Date() } }
        ]
      }
    });
    
    // Merge overrides with defaults
    const overrideMap = {};
    overrides.forEach(o => { overrideMap[o.moduleId] = o; });
    
    return defaultAccess.map(module => {
      const override = overrideMap[module.moduleId];
      if (override) {
        return {
          ...module.toJSON(),
          isEnabled: override.isEnabled ?? module.isEnabled,
          canView: override.canView ?? module.canView,
          canCreate: override.canCreate ?? module.canCreate,
          canEdit: override.canEdit ?? module.canEdit,
          canDelete: override.canDelete ?? module.canDelete,
          canExport: override.canExport ?? module.canExport,
          hasOverride: true
        };
      }
      return { ...module.toJSON(), hasOverride: false };
    });
  } catch (error) {
    console.error('Error getting effective module access:', error);
    return [];
  }
};

/**
 * Initialize default module access for all user types
 */
export const initializeDefaultModuleAccess = async () => {
  try {
    const moduleDefinitions = [
      // Patient Modules
      { userType: 'patient', moduleId: 'user_dashboard', moduleName: 'Dashboard', category: 'Main', icon: 'LayoutDashboard', routePath: '/dashboard', displayOrder: 1 },
      { userType: 'patient', moduleId: 'user_appointments', moduleName: 'Appointments', category: 'Healthcare', icon: 'Calendar', routePath: '/appointments', displayOrder: 2 },
      { userType: 'patient', moduleId: 'user_consultations', moduleName: 'Consultations', category: 'Healthcare', icon: 'Video', routePath: '/consultations', displayOrder: 3 },
      { userType: 'patient', moduleId: 'user_prescriptions', moduleName: 'Prescriptions', category: 'Healthcare', icon: 'FileText', routePath: '/prescriptions', displayOrder: 4 },
      { userType: 'patient', moduleId: 'user_lab_reports', moduleName: 'Lab Reports', category: 'Healthcare', icon: 'FlaskConical', routePath: '/lab-reports', displayOrder: 5 },
      { userType: 'patient', moduleId: 'user_health_records', moduleName: 'Health Records', category: 'Healthcare', icon: 'FileHeart', routePath: '/health-records', displayOrder: 6 },
      { userType: 'patient', moduleId: 'user_vitals', moduleName: 'Vitals', category: 'Health', icon: 'HeartPulse', routePath: '/vitals', displayOrder: 7 },
      { userType: 'patient', moduleId: 'user_medications', moduleName: 'Medications', category: 'Healthcare', icon: 'Pill', routePath: '/medications', displayOrder: 8 },
      { userType: 'patient', moduleId: 'user_insurance', moduleName: 'Insurance', category: 'Finance', icon: 'Shield', routePath: '/insurance', displayOrder: 9, isEnabled: true, canView: true },
      { userType: 'patient', moduleId: 'user_payments', moduleName: 'Payments', category: 'Finance', icon: 'CreditCard', routePath: '/payments', displayOrder: 10 },
      { userType: 'patient', moduleId: 'user_family', moduleName: 'Family Members', category: 'Account', icon: 'Users', routePath: '/family', displayOrder: 11 },
      { userType: 'patient', moduleId: 'user_ai_chat', moduleName: 'AI Health Assistant', category: 'Support', icon: 'Bot', routePath: '/ai-chat', displayOrder: 12 },
      { userType: 'patient', moduleId: 'user_video_call', moduleName: 'Video Consultation', category: 'Communication', icon: 'Video', routePath: '/video-call', displayOrder: 13 },
      { userType: 'patient', moduleId: 'user_notifications', moduleName: 'Notifications', category: 'Account', icon: 'Bell', routePath: '/notifications', displayOrder: 14 },
      { userType: 'patient', moduleId: 'user_profile', moduleName: 'Profile', category: 'Account', icon: 'User', routePath: '/profile', displayOrder: 15 },
      { userType: 'patient', moduleId: 'user_wearables', moduleName: 'Wearables', category: 'Health', icon: 'Watch', routePath: '/wearables', displayOrder: 16 },
      { userType: 'patient', moduleId: 'user_health_goals', moduleName: 'Health Goals', category: 'Health', icon: 'Target', routePath: '/health-goals', displayOrder: 17 },
      { userType: 'patient', moduleId: 'user_rewards', moduleName: 'Rewards', category: 'Engagement', icon: 'Gift', routePath: '/rewards', displayOrder: 18 },
      
      // Doctor Modules
      { userType: 'doctor', moduleId: 'doctor_dashboard', moduleName: 'Dashboard', category: 'Main', icon: 'LayoutDashboard', routePath: '/doctor', displayOrder: 1 },
      { userType: 'doctor', moduleId: 'doctor_appointments', moduleName: 'Appointments', category: 'Clinical', icon: 'Calendar', routePath: '/doctor/appointments', displayOrder: 2 },
      { userType: 'doctor', moduleId: 'doctor_patients', moduleName: 'My Patients', category: 'Clinical', icon: 'Users', routePath: '/doctor/patients', displayOrder: 3 },
      { userType: 'doctor', moduleId: 'doctor_emr', moduleName: 'EMR', category: 'Clinical', icon: 'FileHeart', routePath: '/doctor/emr', displayOrder: 4 },
      { userType: 'doctor', moduleId: 'doctor_prescriptions', moduleName: 'Prescriptions', category: 'Clinical', icon: 'FileText', routePath: '/doctor/prescriptions', displayOrder: 5 },
      { userType: 'doctor', moduleId: 'doctor_consultations', moduleName: 'Consultations', category: 'Clinical', icon: 'Video', routePath: '/doctor/consultations', displayOrder: 6 },
      { userType: 'doctor', moduleId: 'doctor_schedule', moduleName: 'Schedule', category: 'Management', icon: 'Clock', routePath: '/doctor/schedule', displayOrder: 7 },
      { userType: 'doctor', moduleId: 'doctor_billing', moduleName: 'Billing', category: 'Finance', icon: 'CreditCard', routePath: '/doctor/billing', displayOrder: 8 },
      { userType: 'doctor', moduleId: 'doctor_analytics', moduleName: 'Analytics', category: 'Management', icon: 'BarChart3', routePath: '/doctor/analytics', displayOrder: 9 },
      { userType: 'doctor', moduleId: 'doctor_video_call', moduleName: 'Video Call', category: 'Communication', icon: 'Video', routePath: '/doctor/video-call', displayOrder: 10 },
      { userType: 'doctor', moduleId: 'doctor_ai_scribe', moduleName: 'AI Scribe', category: 'Tools', icon: 'Mic', routePath: '/doctor/ai-scribe', displayOrder: 11 },
      { userType: 'doctor', moduleId: 'doctor_chat', moduleName: 'Chat', category: 'Communication', icon: 'MessageSquare', routePath: '/doctor/chat', displayOrder: 12 },
      { userType: 'doctor', moduleId: 'doctor_profile', moduleName: 'Profile', category: 'Account', icon: 'User', routePath: '/doctor/profile', displayOrder: 13 },
      { userType: 'doctor', moduleId: 'doctor_assistants', moduleName: 'Assistants', category: 'Management', icon: 'UserPlus', routePath: '/doctor/assistants', displayOrder: 14 },
      
      // Corporate Admin Modules
      { userType: 'corporate_admin', moduleId: 'corporate_dashboard', moduleName: 'Dashboard', category: 'Main', icon: 'LayoutDashboard', routePath: '/corporate', displayOrder: 1 },
      { userType: 'corporate_admin', moduleId: 'corporate_employees', moduleName: 'Employees', category: 'Management', icon: 'Users', routePath: '/corporate/employees', displayOrder: 2 },
      { userType: 'corporate_admin', moduleId: 'corporate_health_programs', moduleName: 'Health Programs', category: 'Programs', icon: 'HeartPulse', routePath: '/corporate/programs', displayOrder: 3 },
      { userType: 'corporate_admin', moduleId: 'corporate_analytics', moduleName: 'Analytics', category: 'Reports', icon: 'BarChart3', routePath: '/corporate/analytics', displayOrder: 4 },
      { userType: 'corporate_admin', moduleId: 'corporate_billing', moduleName: 'Billing', category: 'Finance', icon: 'CreditCard', routePath: '/corporate/billing', displayOrder: 5 },
      { userType: 'corporate_admin', moduleId: 'corporate_reports', moduleName: 'Reports', category: 'Reports', icon: 'FileText', routePath: '/corporate/reports', displayOrder: 6 },
    ];
    
    // Upsert each module definition
    for (const module of moduleDefinitions) {
      await ModuleAccess.upsert({
        ...module,
        isEnabled: true,
        canView: true,
        canCreate: ['doctor', 'corporate_admin'].includes(module.userType),
        canEdit: ['doctor', 'corporate_admin'].includes(module.userType),
        canDelete: false,
        canExport: ['doctor', 'corporate_admin'].includes(module.userType),
      });
    }
    
    console.log('✅ Default module access initialized');
    return true;
  } catch (error) {
    console.error('Error initializing default module access:', error);
    return false;
  }
};

export { ModuleAccess, UserModuleOverride };
export default ModuleAccess;
