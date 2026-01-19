/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * Homecare Service Entity Model (PostgreSQL)
 * 
 * For home healthcare service providers:
 * - Nursing care at home
 * - Physiotherapy
 * - Medical equipment rental
 * - Elder care
 * - Post-operative care
 */

import { DataTypes, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const HomecareService = sequelize.define('HomecareService', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  uid: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    unique: true,
    allowNull: false
  },
  
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to tenants table'
  },
  
  // Parent Organization (if part of hospital/clinic/NGO)
  parent_organization_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Parent hospital/clinic/corporate/NGO tenant ID'
  },
  
  parent_organization_type: {
    type: DataTypes.ENUM('hospital', 'clinic', 'corporate', 'ngo', 'independent'),
    defaultValue: 'independent'
  },
  
  // Service Identity
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Homecare service name'
  },
  
  service_type: {
    type: DataTypes.ENUM('nursing', 'physiotherapy', 'elder_care', 'palliative', 'post_surgical', 'equipment', 'multi'),
    defaultValue: 'multi'
  },
  
  license_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Healthcare service license'
  },
  
  // Contact Information
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { isEmail: true }
  },
  
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  
  emergency_number: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '24x7 emergency number'
  },
  
  website: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  // Address
  office_address: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  
  // Service Areas
  service_areas: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Cities/areas where service is available'
  },
  
  service_pincodes: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of serviceable pincodes'
  },
  
  // Services Offered
  services: {
    type: DataTypes.JSONB,
    defaultValue: {
      nursing_care: true,
      physiotherapy: true,
      doctor_visits: false,
      lab_sample_collection: false,
      medicine_delivery: false,
      wound_dressing: true,
      iv_infusion: false,
      injections: true,
      catheter_care: true,
      tracheostomy_care: false,
      ventilator_care: false,
      dialysis_support: false,
      chemotherapy_support: false,
      palliative_care: false,
      dementia_care: false,
      post_surgical_care: true,
      mother_baby_care: false,
      neonatal_care: false,
      elder_care: true,
      attendant_services: true,
      equipment_rental: true
    }
  },
  
  // Staff
  total_staff: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  staff_breakdown: {
    type: DataTypes.JSONB,
    defaultValue: {
      doctors: 0,
      nurses_bsc: 0,
      nurses_gnm: 0,
      nurses_anm: 0,
      physiotherapists: 0,
      occupational_therapists: 0,
      speech_therapists: 0,
      attendants: 0,
      lab_technicians: 0,
      coordinators: 0
    }
  },
  
  active_caregivers: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Currently active caregivers'
  },
  
  // Equipment Inventory
  equipment_inventory: {
    type: DataTypes.JSONB,
    defaultValue: {
      hospital_beds: 0,
      wheelchairs: 0,
      oxygen_concentrators: 0,
      bipap_cpap: 0,
      patient_monitors: 0,
      suction_machines: 0,
      nebulizers: 0,
      glucometers: 0,
      bp_monitors: 0,
      air_mattresses: 0,
      commodes: 0,
      walkers: 0
    }
  },
  
  // Pricing
  pricing: {
    type: DataTypes.JSONB,
    defaultValue: {
      nurse_visit: 500,
      nurse_12hr: 1200,
      nurse_24hr: 2000,
      physiotherapy_visit: 800,
      doctor_visit: 1500,
      attendant_12hr: 800,
      attendant_24hr: 1200,
      equipment_daily_rate: {}
    }
  },
  
  // Packages
  packages: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of care packages: { name, description, duration, services, price }'
  },
  
  // Partner Network
  partner_hospitals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Referral hospital partners'
  },
  
  partner_labs: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Partner labs for sample collection'
  },
  
  partner_pharmacies: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Partner pharmacies for medicine delivery'
  },
  
  // Quality & Training
  quality_certifications: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of certifications'
  },
  
  training_programs: {
    type: DataTypes.JSONB,
    defaultValue: {
      infection_control: true,
      bls_training: true,
      patient_handling: true,
      communication: true
    }
  },
  
  // Statistics
  stats: {
    type: DataTypes.JSONB,
    defaultValue: {
      total_patients_served: 0,
      active_patients: 0,
      visits_this_month: 0,
      avg_rating: 0,
      total_reviews: 0
    }
  },
  
  // Operating Hours
  operating_hours: {
    type: DataTypes.JSONB,
    defaultValue: {
      is_24x7: true,
      office_hours: {
        start: '09:00',
        end: '18:00'
      },
      booking_advance_hours: 4
    }
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('pending', 'active', 'suspended', 'inactive'),
    defaultValue: 'pending'
  },
  
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'homecare_services',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['parent_organization_id'] },
    { fields: ['service_type'] },
    { fields: ['status'] },
    { using: 'GIN', fields: ['service_areas'] },
    { using: 'GIN', fields: ['services'] },
    { using: 'GIN', fields: ['service_pincodes'] }
  ]
});

// Instance Methods
HomecareService.prototype.isServiceableArea = function(pincode) {
  return (this.service_pincodes || []).includes(pincode);
};

HomecareService.prototype.getAvailableServices = function() {
  return Object.entries(this.services || {})
    .filter(([_, enabled]) => enabled)
    .map(([service]) => service);
};

export default HomecareService;
