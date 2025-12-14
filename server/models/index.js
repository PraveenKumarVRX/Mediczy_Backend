/**
 * Model Index - PostgreSQL Primary
 * 
 * Exports PostgreSQL models as primary and provides MariaDB models as fallback
 */

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
import { EHRRecord as EHRRecordPostgres, HealthDiary as HealthDiaryPostgres } from './postgres/ehr.model.postgres.js';

// MariaDB Models (Legacy - for backward compatibility)
import UserMariaDB from './user.model.mariadb.js';
import DoctorMariaDB from './doctor.model.mariadb.js';
import AppointmentMariaDB from './appointment.model.mariadb.js';
import PrescriptionMariaDB from './prescription.model.mariadb.js';
import CorporateMariaDB from './corporate.model.mariadb.js';
import NurseMariaDB from './nurse.model.mariadb.js';
import AssistantMariaDB from './assistant.model.mariadb.js';

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
export const EHRRecord = EHRRecordPostgres;
export const HealthDiary = HealthDiaryPostgres;

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
  EHRRecord: EHRRecordPostgres,
  HealthDiary: HealthDiaryPostgres
};

// Legacy exports (for backward compatibility)
export const Legacy = {
  User: UserMariaDB,
  Doctor: DoctorMariaDB,
  Appointment: AppointmentMariaDB,
  Prescription: PrescriptionMariaDB,
  Corporate: CorporateMariaDB,
  Nurse: NurseMariaDB,
  Assistant: AssistantMariaDB
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
  EHRRecordPostgres,
  HealthDiaryPostgres,
  UserMariaDB,
  DoctorMariaDB,
  AppointmentMariaDB,
  PrescriptionMariaDB,
  CorporateMariaDB,
  NurseMariaDB,
  AssistantMariaDB
};
