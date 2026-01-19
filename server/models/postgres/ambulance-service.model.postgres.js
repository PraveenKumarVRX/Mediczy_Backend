/**
import { JWT_CONFIG } from '../../config/auth.config.js';
 * Ambulance Service Entity Model (PostgreSQL)
 * 
 * For ambulance service providers:
 * - Fleet management
 * - Emergency dispatch
 * - Real-time tracking
 * - Hospital coordination
 */

import { DataTypes, Op } from 'sequelize';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';

const AmbulanceService = sequelize.define('AmbulanceService', {
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
  
  // Parent Organization (if part of hospital/corporate/NGO)
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
    comment: 'Ambulance service name'
  },
  
  service_type: {
    type: DataTypes.ENUM('bls', 'als', 'icu', 'neonatal', 'mortuary', 'patient_transport', 'multi'),
    defaultValue: 'bls',
    comment: 'BLS=Basic, ALS=Advanced, ICU=Mobile ICU'
  },
  
  license_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Transport license number'
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
    allowNull: false,
    comment: '24x7 emergency dispatch number'
  },
  
  website: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  // Address/Base Station
  base_station: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Primary base station address'
  },
  
  additional_stations: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Additional base stations'
  },
  
  // Service Area
  service_areas: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of cities/areas served'
  },
  
  service_radius_km: {
    type: DataTypes.INTEGER,
    defaultValue: 50,
    comment: 'Maximum service radius in kilometers'
  },
  
  // Fleet Information
  fleet_size: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Total number of ambulances'
  },
  
  fleet_details: {
    type: DataTypes.JSONB,
    defaultValue: {
      bls: 0,      // Basic Life Support
      als: 0,      // Advanced Life Support
      icu_mobile: 0,
      neonatal: 0,
      mortuary: 0,
      patient_transport: 0
    }
  },
  
  active_vehicles: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Currently active ambulances'
  },
  
  // Individual Vehicles
  vehicles: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of vehicle records: { id, reg_number, type, driver_id, status, gps_id }'
  },
  
  // Staff
  total_staff: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  staff_breakdown: {
    type: DataTypes.JSONB,
    defaultValue: {
      drivers: 0,
      emts: 0,        // Emergency Medical Technicians
      paramedics: 0,
      nurses: 0,
      doctors: 0,
      dispatch_operators: 0
    }
  },
  
  // Dispatch Configuration
  dispatch_config: {
    type: DataTypes.JSONB,
    defaultValue: {
      auto_dispatch: false,
      gps_tracking: true,
      avg_response_time_mins: 15,
      24x7_available: true,
      dispatch_system: null  // 'internal', 'third_party', 'integrated'
    }
  },
  
  // Pricing
  pricing: {
    type: DataTypes.JSONB,
    defaultValue: {
      base_fare: 500,
      per_km_rate: 25,
      waiting_charge_per_hour: 200,
      night_surcharge_percent: 25,
      free_km: 5
    }
  },
  
  // Hospital Network
  network_hospitals: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of hospital IDs for patient transport'
  },
  
  // Equipment
  standard_equipment: {
    type: DataTypes.JSONB,
    defaultValue: {
      oxygen: true,
      stretcher: true,
      first_aid: true,
      defibrillator: false,
      ventilator: false,
      cardiac_monitor: false,
      suction_unit: true
    }
  },
  
  // Statistics
  stats: {
    type: DataTypes.JSONB,
    defaultValue: {
      total_trips: 0,
      trips_this_month: 0,
      avg_response_time: 0,
      avg_transport_time: 0,
      patient_rating: 0
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
  tableName: 'ambulance_services',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['parent_organization_id'] },
    { fields: ['service_type'] },
    { fields: ['status'] },
    { using: 'GIN', fields: ['service_areas'] },
    { using: 'GIN', fields: ['network_hospitals'] }
  ]
});

// Instance Methods
AmbulanceService.prototype.getAvailableVehicles = function() {
  return (this.vehicles || []).filter(v => v.status === 'available');
};

AmbulanceService.prototype.updateVehicleStatus = async function(vehicleId, status) {
  const vehicles = this.vehicles || [];
  const vehicleIndex = vehicles.findIndex(v => v.id === vehicleId);
  if (vehicleIndex >= 0) {
    vehicles[vehicleIndex].status = status;
    this.vehicles = vehicles;
    await this.save();
  }
};

export default AmbulanceService;
