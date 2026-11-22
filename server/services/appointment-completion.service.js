/**
 * AppointmentCompletionService — orchestrates the "complete an appointment"
 * business transaction: fetch + authorize, auto-draft a prescription for
 * online consultations, and update the appointment status, all inside the
 * one RLS transaction the appointments/prescriptions tables require.
 *
 * Split out of appointment.controller.js's completeAppointment handler,
 * which mixed HTTP concerns with this multi-step domain operation.
 */
import * as appointmentRepository from '../repositories/appointment.repository.js';
import { isOwnedByActor } from './appointment-identity.service.js';

const AUTO_PRESCRIPTION_CONSULTATION_TYPES = ['online', 'video', 'audio', 'chat'];

async function draftPrescriptionForCompletion({ appointment, notes, transaction }) {
  const { Prescription, Doctor, User } = await import('../models/index.js');

  const existingPrescription = await Prescription.findOne({
    where: { appointmentId: appointment.id },
    transaction,
  });

  if (existingPrescription) {
    return {
      prescriptionId: existingPrescription.prescriptionId,
      status: existingPrescription.status,
      message: 'Prescription already exists',
    };
  }

  // Attribute the draft to the appointment's own doctor, not to whoever is
  // completing it — an admin can complete an appointment on a doctor's
  // behalf, and req.user.id in that case is the admin's id, not the
  // doctor's, so it can never be trusted here.
  const doctor = await Doctor.findByPk(appointment.doctorId);
  const patient = await User.findByPk(appointment.userId);
  if (!doctor || !patient) return null;

  let patientAge = null;
  if (patient.dateOfBirth) {
    const dob = new Date(patient.dateOfBirth);
    const today = new Date();
    patientAge = today.getFullYear() - dob.getFullYear();
  }

  const newPrescription = await Prescription.create({
    appointmentId: appointment.id,
    tenant_id: appointment.tenant_id || appointment.organization_id || null,
    corporate_tenant_id: appointment.corporate_tenant_id || null,
    organization_id: appointment.organization_id || null,
    organization_type: appointment.organization_type || null,
    patientId: appointment.userId,
    patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appointment.patientName,
    patientAge,
    patientGender: patient.gender || 'Not specified',
    patientPhone: patient.phoneNumber || patient.phone || appointment.patientPhone,
    doctorId: doctor.id,
    doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
    doctorQualifications: Array.isArray(doctor.qualifications)
      ? doctor.qualifications.join(', ')
      : (doctor.qualifications || doctor.qualification || 'MBBS'),
    doctorRegNo: doctor.registrationNumber || doctor.licenseNumber || 'N/A',
    specialty: doctor.specialization || 'General Medicine',
    clinicName: doctor.clinicHospitalName || doctor.clinicName || 'My SmartHealth',
    clinicAddress: appointment.consultationType === 'in-person'
      ? (doctor.clinicAddress || 'Clinic')
      : 'Online Consultation / Telemedicine',
    clinicPhone: doctor.phone || doctor.phoneNumber,
    clinicEmail: doctor.email,
    clinicDetails: {
      name: doctor.clinicHospitalName || doctor.clinicName || 'My SmartHealth',
      address: appointment.consultationType === 'in-person'
        ? (doctor.clinicAddress || 'Clinic')
        : 'Online Consultation / Telemedicine',
      phone: doctor.phone || doctor.phoneNumber,
      email: doctor.email,
      specialty: doctor.specialization,
      consultationType: appointment.consultationType,
    },
    diagnosis: 'To be filled by doctor',
    chiefComplaints: appointment.symptoms || ['As discussed during consultation'],
    medications: [],
    labTests: [],
    instructions: [
      'Complete the full course of medications',
      'Take medicines as directed',
      'Contact doctor if symptoms worsen',
    ],
    vitals: {},
    validityDays: 30,
    notes: notes || `${appointment.consultationType} consultation completed`,
    status: 'draft',
  }, { transaction });

  return {
    prescriptionId: newPrescription.prescriptionId,
    status: 'draft',
    message: 'Prescription draft auto-created',
  };
}

/**
 * Complete an appointment: authorize, optionally auto-draft a prescription,
 * mark it completed. Returns { notFound: true } | { forbidden: true } |
 * { appointment, prescriptionData }. Kafka publish is the caller's job —
 * it's a side effect that shouldn't roll back the transaction if it fails.
 */
export async function completeAppointment(req, actor, id, { notes, prescription, autoCreatePrescription } = {}) {
  return appointmentRepository.withTransaction(req, async (rlsTransaction) => {
    const appointment = await appointmentRepository.findByIdForActorInTransaction(actor, id, rlsTransaction);
    if (!appointment) return { notFound: true };
    if (!isOwnedByActor(appointment, actor)) return { forbidden: true };

    let prescriptionData = null;

    // mapConsultationTypeForDb() stores every video/audio/chat booking as
    // consultationType='online' — 'online' must be included here or every
    // online consultation silently skips auto-prescription.
    if (autoCreatePrescription !== false && AUTO_PRESCRIPTION_CONSULTATION_TYPES.includes(appointment.consultationType)) {
      try {
        prescriptionData = await draftPrescriptionForCompletion({ appointment, notes, transaction: rlsTransaction });
      } catch (prescriptionError) {
        console.error('Auto-prescription creation failed:', prescriptionError);
        // Continue even if prescription creation fails
      }
    }

    await appointment.update({
      status: 'completed',
      notes: notes || appointment.notes,
      prescription: prescription || prescriptionData?.prescriptionId || appointment.prescription,
    }, { transaction: rlsTransaction });

    return { appointment, prescriptionData };
  });
}
