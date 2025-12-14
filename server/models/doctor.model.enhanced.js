import { connectToDb as getIntelligentDB } from '../db/mariadb.js';
import bcrypt from 'bcrypt';

/**
 * Enhanced Doctor Model with comprehensive profile management
 * Includes consultation types, availability, fees, media uploads
 */
class DoctorModel {
  constructor() {
    console.log('[DoctorModel] Constructor called');
    this.db = getIntelligentDB();
    console.log('[DoctorModel] this.db:', typeof this.db, this.db ? 'Promise' : 'null');
  }

  /**
   * Create doctor with enhanced profile fields
   */
  async create(doctorData) {
    const hashedPassword = doctorData.password ? 
      await bcrypt.hash(doctorData.password, 10) : null;
    
    const doctorId = `doctor_${Date.now()}`;
    const doctor = {
      id: doctorId,
      // Basic Information
      prefix: doctorData.prefix || 'Dr',
      firstName: doctorData.firstName,
      lastName: doctorData.lastName,
      email: doctorData.email,
      phoneNumber: doctorData.phoneNumber,
      alternatePhoneNumber: doctorData.alternatePhoneNumber,
      password: hashedPassword,
      
      // Professional Information
      specialization: doctorData.specialization,
      subSpecializations: doctorData.subSpecializations || [],
      experience: doctorData.experience || 0,
      registrationNumber: doctorData.registrationNumber,
      medicalCouncil: doctorData.medicalCouncil,
      
      // Qualifications
      ugQualifications: doctorData.ugQualifications || [],
      pgQualifications: doctorData.pgQualifications || [],
      fellowships: doctorData.fellowships || [],
      certifications: doctorData.certifications || [],
      
      // Practice Information
      hospitalClinicName: doctorData.hospitalClinicName,
      practiceType: doctorData.practiceType, // 'hospital', 'clinic', 'both'
      
      // Address Information
      practiceAddress: {
        street: doctorData.practiceAddress?.street,
        city: doctorData.practiceAddress?.city,
        state: doctorData.practiceAddress?.state,
        zipCode: doctorData.practiceAddress?.zipCode,
        country: doctorData.practiceAddress?.country || 'India',
        latitude: doctorData.practiceAddress?.latitude,
        longitude: doctorData.practiceAddress?.longitude
      },
      
      // Consultation Types & Fees
      consultationTypes: {
        online: {
          available: doctorData.consultationTypes?.online?.available || false,
          fee: doctorData.consultationTypes?.online?.fee || 0,
          duration: doctorData.consultationTypes?.online?.duration || 30, // minutes
          platforms: doctorData.consultationTypes?.online?.platforms || ['video', 'audio', 'chat']
        },
        walkIn: {
          available: doctorData.consultationTypes?.walkIn?.available || false,
          fee: doctorData.consultationTypes?.walkIn?.fee || 0,
          duration: doctorData.consultationTypes?.walkIn?.duration || 20
        },
        homeVisit: {
          available: doctorData.consultationTypes?.homeVisit?.available || false,
          fee: doctorData.consultationTypes?.homeVisit?.fee || 0,
          travelRadius: doctorData.consultationTypes?.homeVisit?.travelRadius || 10 // km
        }
      },
      
      // Availability Slots
      weeklyAvailability: doctorData.weeklyAvailability || {
        monday: { slots: [], isAvailable: false },
        tuesday: { slots: [], isAvailable: false },
        wednesday: { slots: [], isAvailable: false },
        thursday: { slots: [], isAvailable: false },
        friday: { slots: [], isAvailable: false },
        saturday: { slots: [], isAvailable: false },
        sunday: { slots: [], isAvailable: false }
      },
      
      // Media & Documents
      profilePicture: doctorData.profilePicture,
      digitalSignature: doctorData.digitalSignature,
      medicalSeal: doctorData.medicalSeal,
      clinicHospitalImages: doctorData.clinicHospitalImages || [],
      verificationDocuments: {
        degreesCertificates: doctorData.verificationDocuments?.degreesCertificates || [],
        licenseDocument: doctorData.verificationDocuments?.licenseDocument,
        registrationCertificate: doctorData.verificationDocuments?.registrationCertificate
      },
      
      // Communication & Services
      languages: doctorData.languages || ['English'],
      about: doctorData.about,
      servicesOffered: doctorData.servicesOffered || [],
      treatmentApproaches: doctorData.treatmentApproaches || [],
      
      // Insurance & Payment
      insuranceAccepted: doctorData.insuranceAccepted || [],
      paymentMethods: doctorData.paymentMethods || ['cash', 'card', 'upi'],
      
      // Status & Verification
      isVerified: doctorData.isVerified || true, // Auto-verify for testing
      verificationStatus: doctorData.verificationStatus || 'verified', // verified for testing
      isActive: doctorData.isActive !== undefined ? doctorData.isActive : true,
      onlineStatus: doctorData.onlineStatus || 'offline', // online, offline, busy
      
      // Ratings & Reviews
      rating: {
        average: 0,
        count: 0,
        breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      },
      
      // Statistics
      stats: {
        totalConsultations: 0,
        onlineConsultations: 0,
        walkInConsultations: 0,
        homeVisitConsultations: 0,
        totalPatients: 0
      },
      
      // Timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null,
      profileCompletedAt: null
    };
    
    const db = await this.db;
    return await db.Doctor.create(doctor);
  }

  /**
   * Update doctor availability slots
   */
  async updateAvailability(doctorId, availabilityData) {
    const db = await this.db;
    const doctor = await db.Doctor.findByPk(doctorId);
    if (!doctor) throw new Error('Doctor not found');
    
    const updatedDoctor = {
      ...doctor,
      weeklyAvailability: {
        ...doctor.weeklyAvailability,
        ...availabilityData
      },
      updatedAt: new Date().toISOString()
    };
    
    return await db.Doctor.update(doctorId, updatedDoctor);
  }

  /**
   * Update consultation fees
   */
  async updateConsultationFees(doctorId, feesData) {
    const db = await this.db;
    const doctor = await db.Doctor.findByPk(doctorId);
    if (!doctor) throw new Error('Doctor not found');
    
    const updatedDoctor = {
      ...doctor,
      consultationTypes: {
        ...doctor.consultationTypes,
        ...feesData
      },
      updatedAt: new Date().toISOString()
    };
    
    return await db.Doctor.update(doctorId, updatedDoctor);
  }

  /**
   * Upload and update doctor media
   */
  async updateMedia(doctorId, mediaType, mediaUrl) {
    const db = await this.db;
    const doctor = await db.Doctor.findByPk(doctorId);
    if (!doctor) throw new Error('Doctor not found');
    
    const updateData = { updatedAt: new Date().toISOString() };
    
    switch (mediaType) {
      case 'profilePicture':
        updateData.profilePicture = mediaUrl;
        break;
      case 'digitalSignature':
        updateData.digitalSignature = mediaUrl;
        break;
      case 'medicalSeal':
        updateData.medicalSeal = mediaUrl;
        break;
      case 'clinicImage':
        updateData.clinicHospitalImages = [...(doctor.clinicHospitalImages || []), mediaUrl];
        break;
    }
    
    return await db.Doctor.update(doctorId, { ...doctor, ...updateData });
  }

  /**
   * Get available slots for booking
   */
  async getAvailableSlots(doctorId, date, consultationType = 'online') {
    const db = await this.db;
    const doctor = await db.Doctor.findByPk(doctorId);
    if (!doctor) throw new Error('Doctor not found');
    
    const dayName = new Date(date).toLocaleLowerString('en-US', { weekday: 'long' });
    const dayAvailability = doctor.weeklyAvailability[dayName];
    
    if (!dayAvailability?.isAvailable) {
      return [];
    }
    
    // Filter slots based on consultation type
    return dayAvailability.slots.filter(slot => 
      slot.consultationType === consultationType || slot.consultationType === 'both'
    );
  }

  /**
   * Search doctors with enhanced filters
   */
  async searchDoctors(filters) {
    const db = await this.db;
    const doctors = await db.Doctor.findAll();
    
    return doctors.filter(doctor => {
      if (filters.specialization && doctor.specialization !== filters.specialization) {
        return false;
      }
      if (filters.city && doctor.practiceAddress?.city !== filters.city) {
        return false;
      }
      if (filters.consultationType && !doctor.consultationTypes[filters.consultationType]?.available) {
        return false;
      }
      if (filters.languages && !doctor.languages.some(lang => filters.languages.includes(lang))) {
        return false;
      }
      if (filters.maxFee) {
        const fee = doctor.consultationTypes[filters.consultationType || 'online']?.fee || 0;
        if (fee > filters.maxFee) return false;
      }
      if (filters.isVerified !== undefined && doctor.isVerified !== filters.isVerified) {
        return false;
      }
      return doctor.isActive;
    });
  }

  /**
   * Find doctor by primary key - enhanced method
   */
  async findByPk(id) {
    try {
      const db = await this.db;
      const doctor = await db.Doctor.findByPk(id);
      if (doctor) {
        // Ensure consultationTypes structure exists
        if (!doctor.consultationTypes) {
          doctor.consultationTypes = {
            online: { available: false, fee: 0 },
            walkIn: { available: false, fee: 0 },
            homeVisit: { available: false, fee: 0 }
          };
        }
        
        // Ensure weeklyAvailability structure exists
        if (!doctor.weeklyAvailability) {
          doctor.weeklyAvailability = {
            monday: { slots: [], isAvailable: false },
            tuesday: { slots: [], isAvailable: false },
            wednesday: { slots: [], isAvailable: false },
            thursday: { slots: [], isAvailable: false },
            friday: { slots: [], isAvailable: false },
            saturday: { slots: [], isAvailable: false },
            sunday: { slots: [], isAvailable: false }
          };
        }
      }
      return doctor;
    } catch (error) {
      console.error('Enhanced Doctor findByPk error:', error.message);
      return null;
    }
  }

  async findOne(query) {
    console.log('[DoctorModel.findOne] Called with query:', query);
    console.log('[DoctorModel.findOne] this.db type:', typeof this.db);
    const db = await this.db;
    console.log('[DoctorModel.findOne] db type:', typeof db);
    console.log('[DoctorModel.findOne] db.Doctor exists:', !!db.Doctor);
    return await db.Doctor.findOne(query);
  }

  async findAll(options = {}) {
    const db = await this.db;
    return await db.Doctor.findAll(options);
  }

  async update(id, updateData) {
    const db = await this.db;
    return await db.Doctor.update(id, updateData);
  }

  async destroy(id) {
    const db = await this.db;
    return await db.Doctor.destroy(id);
  }

  async count(options = {}) {
    const db = await this.db;
    return await db.Doctor.count(options);
  }

  async findAndCountAll(options = {}) {
    const db = await this.db;
    return await db.Doctor.findAndCountAll(options);
  }
}

// Export singleton instance and legacy compatibility
const doctorModel = new DoctorModel();
export default doctorModel;

// Legacy export for existing imports
export { DoctorModel };
export const Doctor = {
  async create(data) { return await doctorModel.create(data); },
  async findByPk(id) { return await doctorModel.findByPk(id); },
  async findOne(query) { return await doctorModel.findOne(query); },
  async findAll(options) { return await doctorModel.findAll(options); },
  async update(id, data) { return await doctorModel.update(id, data); },
  async destroy(id) { return await doctorModel.destroy(id); }
};