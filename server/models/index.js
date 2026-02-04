/**
 * Model Index - PostgreSQL
 * 
 * Exports PostgreSQL models as primary database models
 */

// Import sequelize
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

// PostgreSQL Models (Primary)
import UserPostgres from './postgres/user.model.postgres.js';
import DoctorPostgres from './postgres/doctor.model.postgres.js';
import AppointmentPostgres from './postgres/appointment.model.postgres.js';
import PrescriptionPostgres from './postgres/prescription.model.postgres.js';
import CorporatePostgres from './postgres/corporate.model.postgres.js';
import NursePostgres from './postgres/nurse.model.postgres.js';
import DoctorAssistantPostgres from './postgres/doctor-assistant.model.postgres.js';
import NotificationPostgres from './postgres/notification.model.postgres.js';
import LabPostgres from './postgres/lab.model.postgres.js';
import PharmacyPostgres from './postgres/pharmacy.model.postgres.js';
import AmbulancePostgres from './postgres/ambulance.model.postgres.js';
import HomecareProviderPostgres from './postgres/homecare.model.postgres.js';
import ClinicPostgres from './postgres/clinic.model.postgres.js';
import ReportPostgres from './postgres/report.model.postgres.js';
import LabTestPostgres from './postgres/labTest.model.postgres.js';
import { EHRRecord as EHRRecordPostgres, HealthDiary as HealthDiaryPostgres } from './postgres/ehr.model.postgres.js';
import CouponPostgres from './postgres/coupon.model.postgres.js';
import CouponUsagePostgres from './postgres/coupon-usage.model.postgres.js';
import PharmacyInventoryPostgres from './postgres/pharmacyInventory.model.postgres.js';

// Export PostgreSQL as default
export const User = UserPostgres;
export const Doctor = DoctorPostgres;
export const Appointment = AppointmentPostgres;
export const Prescription = PrescriptionPostgres;
export const Corporate = CorporatePostgres;
export const Nurse = NursePostgres;
export const DoctorAssistant = DoctorAssistantPostgres;
export const Notification = NotificationPostgres;
export const Lab = LabPostgres;
export const Pharmacy = PharmacyPostgres;
export const Ambulance = AmbulancePostgres;
export const HomecareProvider = HomecareProviderPostgres;
export const Clinic = ClinicPostgres;
export const Report = ReportPostgres;
export const LabTest = LabTestPostgres;
export const EHRRecord = EHRRecordPostgres;
export const HealthDiary = HealthDiaryPostgres;
export const Coupon = CouponPostgres;
export const CouponUsage = CouponUsagePostgres;
export const PharmacyInventory = PharmacyInventoryPostgres;
export { sequelize };

// Default exports
export default {
  User: UserPostgres,
  Doctor: DoctorPostgres,
  Appointment: AppointmentPostgres,
  Prescription: PrescriptionPostgres,
  Corporate: CorporatePostgres,
  Nurse: NursePostgres,
  DoctorAssistant: DoctorAssistantPostgres,
  Notification: NotificationPostgres,
  Lab: LabPostgres,
  Pharmacy: PharmacyPostgres,
  Ambulance: AmbulancePostgres,
  HomecareProvider: HomecareProviderPostgres,
  Clinic: ClinicPostgres,
  Report: ReportPostgres,
  LabTest: LabTestPostgres,
  EHRRecord: EHRRecordPostgres,
  HealthDiary: HealthDiaryPostgres,
  Coupon: CouponPostgres,
  CouponUsage: CouponUsagePostgres,
  PharmacyInventory: PharmacyInventoryPostgres,
  sequelize
};

// Named exports for both
export {
  UserPostgres,
  DoctorPostgres,
  AppointmentPostgres,
  PrescriptionPostgres,
  CorporatePostgres,
  NursePostgres,
  DoctorAssistantPostgres,
  NotificationPostgres,
  LabPostgres,
  PharmacyPostgres,
  AmbulancePostgres,
  HomecareProviderPostgres,
  ClinicPostgres,
  ReportPostgres,
  LabTestPostgres,
  EHRRecordPostgres,
  HealthDiaryPostgres,
  CouponPostgres,
  CouponUsagePostgres,
  PharmacyInventoryPostgres
};