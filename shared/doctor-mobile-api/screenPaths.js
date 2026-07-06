/**
 * Map voice-assistant navigate_to screen keys → React Navigation route names (msh_d_app).
 * Adjust route names to match your navigator if they differ.
 */
export const ISHA_SCREEN_ROUTES = {
  appointments: 'Appointments',
  patients: 'PatientsList',
  prescriptions: 'Prescriptions',
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  billing: 'Billing',
  'health-records': 'HealthRecords',
  'er-dashboard': 'EmergencyTriage',
  'icu-dashboard': 'HealthMonitoring',
  'voice-scribe': 'VoiceScribe',
  calculators: 'Calculators',
  'ai-assist': 'AIAssist',
  templates: 'Templates',
  monitoring: 'HealthMonitoring',
  queue: 'Appointments',
  staff: 'Settings',
  settings: 'Settings',
  availability: 'SetTimeSlots',
  'patient-details': 'PatientDetails',
};

export function resolveIshaScreenRoute(screenKey) {
  if (!screenKey) return null;
  const key = String(screenKey).trim();
  return ISHA_SCREEN_ROUTES[key] || ISHA_SCREEN_ROUTES[key.toLowerCase()] || null;
}
