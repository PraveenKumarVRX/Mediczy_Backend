import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const Lab = sequelize.define('Lab', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },
  
  // Basic Information
  name: { 
    type: DataTypes.STRING(255), 
    allowNull: false,
    unique: true
  },
  registrationNumber: { 
    type: DataTypes.STRING(100), 
    unique: true,
    comment: 'Government registration/license number'
  },
  email: { 
    type: DataTypes.STRING(255), 
    validate: { isEmail: true },
    unique: true
  },
  phoneNumber: { 
    type: DataTypes.STRING(50),
    allowNull: false
  },
  website: { 
    type: DataTypes.STRING(255),
    validate: { isUrl: true }
  },
  
  // Address Information
  address: { 
    type: DataTypes.TEXT, 
    get() { 
      const v = this.getDataValue('address'); 
      return v ? JSON.parse(v) : {}; 
    }, 
    set(val) { 
      this.setDataValue('address', JSON.stringify(val || {})); 
    }
  },
  
  // Comprehensive Services
  services: { 
    type: DataTypes.TEXT, 
    get() { 
      const v = this.getDataValue('services'); 
      return v ? JSON.parse(v) : []; 
    }, 
    set(val) { 
      this.setDataValue('services', JSON.stringify(val || [])); 
    },
    comment: 'Array of service categories offered'
  },
  
  // Test Categories and Specializations
  testCategories: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('testCategories');
      return v ? JSON.parse(v) : [];
    },
    set(val) {
      this.setDataValue('testCategories', JSON.stringify(val || []));
    },
    comment: 'Detailed test categories and subcategories'
  },
  
  // Laboratory Equipment and Capabilities
  equipment: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('equipment');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('equipment', JSON.stringify(val || {}));
    },
    comment: 'Laboratory equipment and analytical capabilities'
  },
  
  // Accreditation and Certifications
  accreditation: { 
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('accreditation');
      return v ? JSON.parse(v) : [];
    },
    set(val) {
      this.setDataValue('accreditation', JSON.stringify(val || []));
    },
    comment: 'NABL, CAP, ISO certifications'
  },
  
  // Operating Information
  operatingHours: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('operatingHours');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('operatingHours', JSON.stringify(val || {}));
    }
  },
  
  // Sample Collection
  sampleCollection: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('sampleCollection');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('sampleCollection', JSON.stringify(val || {}));
    },
    comment: 'Home collection, walk-in, appointment-based'
  },
  
  // Turnaround Times
  turnaroundTime: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('turnaroundTime');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('turnaroundTime', JSON.stringify(val || {}));
    },
    comment: 'Expected reporting times for different test types'
  },
  
  // Pricing Information
  pricingTiers: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('pricingTiers');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('pricingTiers', JSON.stringify(val || {}));
    }
  },
  
  // Quality Metrics
  qualityMetrics: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('qualityMetrics');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('qualityMetrics', JSON.stringify(val || {}));
    },
    comment: 'Accuracy rates, customer satisfaction, error rates'
  },
  
  // Digital Integration
  digitalFeatures: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('digitalFeatures');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('digitalFeatures', JSON.stringify(val || {}));
    },
    comment: 'Online booking, digital reports, mobile app'
  },
  
  // Network and Partnerships
  networkInfo: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('networkInfo');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('networkInfo', JSON.stringify(val || {}));
    },
    comment: 'Chain information, partner hospitals, referral network'
  },
  
  // Insurance and Payment
  insuranceAccepted: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('insuranceAccepted');
      return v ? JSON.parse(v) : [];
    },
    set(val) {
      this.setDataValue('insuranceAccepted', JSON.stringify(val || []));
    }
  },
  
  // Compliance and Safety
  safetyProtocols: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('safetyProtocols');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('safetyProtocols', JSON.stringify(val || {}));
    },
    comment: 'COVID protocols, infection control, waste management'
  },
  
  // Staff Information
  staffInfo: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('staffInfo');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('staffInfo', JSON.stringify(val || {}));
    },
    comment: 'Pathologists, technicians, support staff'
  },
  
  // Status and Flags
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Verification status for accreditation and licenses'
  },
  featured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Featured/premium listing'
  },
  
  // Performance Metrics
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    validate: { min: 0, max: 5 },
    comment: 'Average customer rating'
  },
  totalReviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  monthlyTests: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Estimated monthly test volume'
  },
  
  // Geographic and Accessibility
  coordinates: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('coordinates');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('coordinates', JSON.stringify(val || {}));
    },
    comment: 'Latitude, longitude for location services'
  },
  accessibilityFeatures: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('accessibilityFeatures');
      return v ? JSON.parse(v) : [];
    },
    set(val) {
      this.setDataValue('accessibilityFeatures', JSON.stringify(val || []));
    }
  },
  
  // Emergency and Special Services
  emergencyServices: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  homeSampleCollection: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  reportDelivery: {
    type: DataTypes.TEXT,
    get() {
      const v = this.getDataValue('reportDelivery');
      return v ? JSON.parse(v) : {};
    },
    set(val) {
      this.setDataValue('reportDelivery', JSON.stringify(val || {}));
    }
  }
  
}, { 
  timestamps: true, 
  tableName: 'labs',
  indexes: [
    { fields: ['name'] },
    { fields: ['email'] },
    { fields: ['phoneNumber'] },
    { fields: ['isActive'] },
    { fields: ['isVerified'] },
    { fields: ['featured'] },
    { fields: ['rating'] },
    { fields: ['registrationNumber'] }
  ]
});

// Add comprehensive test categories and services data
Lab.COMPREHENSIVE_TEST_CATEGORIES = {
  clinical_pathology: {
    name: 'Clinical Pathology',
    subcategories: {
      hematology: {
        name: 'Hematology',
        tests: [
          'Complete Blood Count (CBC)',
          'Erythrocyte Sedimentation Rate (ESR)',
          'Peripheral Blood Smear',
          'Reticulocyte Count',
          'Platelet Function Tests',
          'Bone Marrow Examination',
          'Hemoglobin Electrophoresis',
          'G6PD Deficiency Test',
          'Sickling Test',
          'Osmotic Fragility Test',
          'Direct & Indirect Coombs Test',
          'Flow Cytometry',
          'Coagulation Studies (PT/INR, PTT)',
          'D-Dimer',
          'Fibrinogen Level',
          'Factor Assays'
        ]
      },
      clinical_chemistry: {
        name: 'Clinical Chemistry',
        tests: [
          'Basic Metabolic Panel (BMP)',
          'Comprehensive Metabolic Panel (CMP)',
          'Liver Function Tests (LFT)',
          'Kidney Function Tests (KFT)',
          'Lipid Profile',
          'Thyroid Function Tests (TSH, T3, T4)',
          'Blood Glucose (Fasting, Random, OGTT)',
          'HbA1c (Glycated Hemoglobin)',
          'Cardiac Markers (Troponin, CK-MB, BNP)',
          'Tumor Markers (PSA, CEA, CA-125, CA 19-9)',
          'Electrolytes (Na, K, Cl, CO2)',
          'Protein Studies (Total Protein, Albumin)',
          'Enzyme Tests (ALT, AST, ALP, LDH)',
          'Vitamin Levels (B12, D3, Folate)',
          'Mineral Tests (Iron, TIBC, Ferritin)',
          'Inflammatory Markers (CRP, Procalcitonin)',
          'Arterial Blood Gas (ABG)',
          'Lactate, Ammonia, Bilirubin'
        ]
      },
      urinalysis: {
        name: 'Urinalysis',
        tests: [
          'Routine Urine Examination',
          'Urine Culture & Sensitivity',
          '24-Hour Urine Collection Studies',
          'Urine Microscopy',
          'Proteinuria Assessment',
          'Microalbuminuria',
          'Urine Electrolytes',
          'Creatinine Clearance',
          'Drug Screening (Urine)',
          'Pregnancy Test (Urine)',
          'Bence Jones Protein',
          'Urine Cytology'
        ]
      }
    }
  },
  microbiology: {
    name: 'Microbiology',
    subcategories: {
      bacteriology: {
        name: 'Bacteriology',
        tests: [
          'Blood Culture & Sensitivity',
          'Urine Culture & Sensitivity',
          'Sputum Culture & Sensitivity',
          'Wound Culture & Sensitivity',
          'Stool Culture & Sensitivity',
          'CSF Culture & Sensitivity',
          'Throat Culture',
          'MRSA Screening',
          'TB Culture (AFB)',
          'Anaerobic Culture',
          'Gram Staining',
          'Antibiotic Sensitivity Testing'
        ]
      },
      virology: {
        name: 'Virology',
        tests: [
          'COVID-19 RT-PCR',
          'COVID-19 Rapid Antigen',
          'Hepatitis Panel (A, B, C)',
          'HIV Testing (ELISA, Western Blot)',
          'Herpes Simplex (HSV-1, HSV-2)',
          'Epstein-Barr Virus (EBV)',
          'Cytomegalovirus (CMV)',
          'Varicella Zoster Virus (VZV)',
          'Influenza A/B',
          'Respiratory Syncytial Virus (RSV)',
          'Dengue (IgM/IgG, NS1)',
          'Chikungunya',
          'Viral Load Studies'
        ]
      },
      parasitology: {
        name: 'Parasitology',
        tests: [
          'Stool Examination for Ova & Parasites',
          'Malaria Testing (Smear, Rapid Test)',
          'Filaria Testing',
          'Toxoplasma Testing',
          'Amoeba Testing',
          'Giardia Antigen',
          'Cryptosporidium Testing',
          'Pinworm Test',
          'Leishmaniasis Testing'
        ]
      },
      mycology: {
        name: 'Mycology',
        tests: [
          'KOH Preparation',
          'Fungal Culture',
          'Yeast Identification',
          'Antifungal Sensitivity',
          'Candida Testing',
          'Aspergillus Testing',
          'Cryptococcal Antigen'
        ]
      }
    }
  },
  molecular_diagnostics: {
    name: 'Molecular Diagnostics',
    subcategories: {
      genetic_testing: {
        name: 'Genetic Testing',
        tests: [
          'Karyotyping',
          'FISH Analysis',
          'Chromosomal Microarray',
          'Next Generation Sequencing (NGS)',
          'Sanger Sequencing',
          'Pharmacogenomics',
          'Carrier Screening',
          'Prenatal Genetic Testing',
          'Cancer Genetic Testing',
          'Hereditary Disease Testing'
        ]
      },
      infectious_disease: {
        name: 'Infectious Disease',
        tests: [
          'PCR Testing (Various Pathogens)',
          'Viral Load Quantification',
          'Resistance Testing',
          'TB Drug Resistance Testing',
          'HPV Typing',
          'Sexually Transmitted Infections Panel',
          'Respiratory Pathogen Panel',
          'Gastrointestinal Pathogen Panel',
          'Meningitis/Encephalitis Panel',
          'Sepsis Panel'
        ]
      }
    }
  },
  immunology_serology: {
    name: 'Immunology & Serology',
    subcategories: {
      autoimmune: {
        name: 'Autoimmune Testing',
        tests: [
          'Antinuclear Antibody (ANA)',
          'Anti-dsDNA',
          'Rheumatoid Factor (RF)',
          'Anti-CCP Antibodies',
          'Complement Levels (C3, C4)',
          'Anti-Centromere Antibodies',
          'Anti-Scl-70 Antibodies',
          'Anti-Jo-1 Antibodies',
          'ANCA Testing',
          'Anti-Phospholipid Antibodies'
        ]
      },
      allergy_testing: {
        name: 'Allergy Testing',
        tests: [
          'Total IgE',
          'Specific IgE (RAST)',
          'Food Allergy Panel',
          'Environmental Allergy Panel',
          'Drug Allergy Testing',
          'Skin Prick Tests',
          'Component Resolved Diagnostics'
        ]
      },
      immunodeficiency: {
        name: 'Immunodeficiency',
        tests: [
          'Immunoglobulin Levels (IgG, IgA, IgM)',
          'Lymphocyte Subset Analysis',
          'Complement Function Tests',
          'Neutrophil Function Tests',
          'Vaccine Response Testing'
        ]
      }
    }
  },
  histopathology: {
    name: 'Histopathology',
    subcategories: {
      surgical_pathology: {
        name: 'Surgical Pathology',
        tests: [
          'Biopsy Examination',
          'Frozen Section',
          'Immunohistochemistry',
          'Special Stains',
          'Electron Microscopy',
          'Digital Pathology'
        ]
      },
      cytopathology: {
        name: 'Cytopathology',
        tests: [
          'Pap Smear',
          'Fine Needle Aspiration (FNA)',
          'Body Fluid Cytology',
          'Sputum Cytology',
          'Urine Cytology',
          'Liquid-Based Cytology'
        ]
      }
    }
  },
  specialized_testing: {
    name: 'Specialized Testing',
    subcategories: {
      toxicology: {
        name: 'Toxicology',
        tests: [
          'Drug of Abuse Screening',
          'Therapeutic Drug Monitoring',
          'Heavy Metal Testing',
          'Alcohol Testing',
          'Forensic Toxicology',
          'Workplace Drug Testing'
        ]
      },
      nutrition_metabolism: {
        name: 'Nutrition & Metabolism',
        tests: [
          'Amino Acid Analysis',
          'Organic Acid Analysis',
          'Fatty Acid Profile',
          'Antioxidant Status',
          'Metabolic Screening',
          'Newborn Screening'
        ]
      },
      reproductive_health: {
        name: 'Reproductive Health',
        tests: [
          'Hormone Profiles (Male/Female)',
          'Fertility Testing',
          'Prenatal Screening',
          'TORCH Panel',
          'Semen Analysis',
          'Ovarian Reserve Testing',
          'Pregnancy Monitoring'
        ]
      }
    }
  }
};

Lab.EQUIPMENT_CATEGORIES = {
  analytical_instruments: [
    'Automated Chemistry Analyzers',
    'Hematology Analyzers',
    'Coagulation Analyzers',
    'Immunoassay Analyzers',
    'PCR Machines (Real-time, Digital)',
    'DNA Sequencers',
    'Mass Spectrometers',
    'HPLC Systems',
    'Flow Cytometers',
    'Electrophoresis Equipment'
  ],
  microscopy: [
    'Light Microscopes',
    'Fluorescence Microscopes',
    'Digital Microscopy Systems',
    'Electron Microscopes',
    'Automated Microscopy'
  ],
  molecular_biology: [
    'Thermal Cyclers',
    'Gel Electrophoresis Systems',
    'DNA/RNA Extractors',
    'Microplate Readers',
    'Luminometers',
    'Next Generation Sequencing Platforms'
  ],
  microbiology: [
    'Incubators',
    'Autoclaves',
    'Biosafety Cabinets',
    'Automated Culture Systems',
    'MALDI-TOF Systems',
    'Antimicrobial Susceptibility Testing Systems'
  ],
  sample_processing: [
    'Centrifuges',
    'Sample Processors',
    'Automated Pipetting Systems',
    'Laboratory Robotics',
    'Sample Storage Systems',
    'Barcode Systems'
  ]
};

Lab.ACCREDITATION_TYPES = [
  'NABL (National Accreditation Board for Testing and Calibration Laboratories)',
  'CAP (College of American Pathologists)',
  'ISO 15189 (Medical Laboratories)',
  'ISO 9001 (Quality Management)',
  'CLIA (Clinical Laboratory Improvement Amendments)',
  'JCI (Joint Commission International)',
  'NABH (National Accreditation Board for Hospitals)',
  'DSIR (Department of Scientific and Industrial Research)',
  'ICMR (Indian Council of Medical Research)',
  'State Health Department License',
  'Drug Controller License',
  'Pollution Control Board Clearance'
];

Lab.QUALITY_INDICATORS = [
  'Turnaround Time Compliance',
  'Critical Value Notification Time',
  'Sample Rejection Rate',
  'Report Error Rate',
  'Customer Satisfaction Score',
  'Proficiency Testing Results',
  'Equipment Uptime',
  'Staff Competency Maintenance',
  'External Quality Assessment',
  'Reference Range Validation'
];

export default Lab;