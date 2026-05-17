import doctorModel from "../models/doctor.model.intelligent.js";
import { addJob } from "../config/queues.js";

const NOTIFICATION_QUEUE = "notifications";
const FALLBACK_SPECIALIZATION = "General Medicine";

const formatDoctor = (doctorInstance) => {
  if (!doctorInstance) return null;
  return {
    id: doctorInstance.id,
    name: `${doctorInstance.firstName || ""} ${doctorInstance.lastName || ""}`.trim(),
    specialization: doctorInstance.specialization,
    experience: doctorInstance.experience,
    consultationModes: doctorInstance.consultationModes || ["Video", "Voice", "Chat"],
    nextAvailableSlot: doctorInstance.nextAvailableSlot || null,
    languages: doctorInstance.languages || [],
    fee: doctorInstance.consultationFee || doctorInstance.fee || null
  };
};

const inferSpecialization = (providedSpecialization, keywords = []) => {
  if (providedSpecialization) return providedSpecialization;
  const text = keywords.join(" ").toLowerCase();
  if (text.includes("migraine") || text.includes("headache") || text.includes("vision")) return "Neurology";
  if (text.includes("heart") || text.includes("chest")) return "Cardiology";
  if (text.includes("breath") || text.includes("asthma")) return "Pulmonology";
  if (text.includes("pregnancy")) return "Obstetrics";
  return FALLBACK_SPECIALIZATION;
};

export const getDoctorSuggestions = async ({ specialization, limit = 3 }) => {
  const whereClause = specialization ? { specialization } : {};
  const doctors = await doctorModel.findAll({
    where: whereClause,
    limit,
    order: [["experience", "DESC"]]
  });
  return doctors.map(formatDoctor).filter(Boolean);
};

export const enqueueIntentNotification = async ({ intentType, userId, message, keywords, specialization, doctorIds }) => {
  try {
    await addJob(NOTIFICATION_QUEUE, `intent-${intentType}`, {
      intentType,
      userId,
      message,
      keywords,
      specialization,
      doctorIds,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("⚠️ Unable to enqueue intent notification:", error.message);
  }
};

export const handleIntentEscalation = async ({ intentType, userId, message, keywords = [], specialization }) => {
  const inferredSpecialization = inferSpecialization(specialization, keywords);
  const doctorSuggestions = await getDoctorSuggestions({ specialization: inferredSpecialization });

  await enqueueIntentNotification({
    intentType,
    userId,
    message,
    keywords,
    specialization: inferredSpecialization,
    doctorIds: doctorSuggestions.map((doctor) => doctor.id)
  });

  return {
    specialization: inferredSpecialization,
    doctorSuggestions
  };
};

export default handleIntentEscalation;
