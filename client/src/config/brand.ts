/**
 * Mediqzy Brand Configuration
 * Centralized branding constants for consistent UI across all dashboards
 */

export const BRAND = {
  // Brand Names
  name: 'Mediqzy',
  fullName: 'HealthOS',
  tagline: 'Mediqzy - HealthOS',
  signoff: 'Team Mediqzy',

  // Logo
  logo: '/logo/Mediqzy_logo.jpeg',
  
  // Colors (Tailwind classes)
  colors: {
    primary: 'teal',
    primaryLight: 'teal-50',
    primaryDark: 'teal-700',
    accent: 'teal-500',
    accentLight: 'teal-100',
    accentDark: 'teal-600',
    gradient: 'from-teal-500 to-teal-600',
    gradientHover: 'from-teal-600 to-teal-700',
    gradientText: 'from-teal-600 to-teal-700',
    success: 'emerald',
    warning: 'amber',
    error: 'red',
    info: 'blue',
  },
  
  // Role-specific labels
  roleLabels: {
    user: 'User Dashboard',
    doctor: 'Doctor Portal',
    nurse: 'Nurse Station',
    admin: 'Admin Console',
    team: 'Team Portal',
    assistant: 'Assistant Portal',
    clinic: 'Clinic Dashboard',
    lab: 'Lab Portal',
    pharmacy: 'Pharmacy Portal',
    hospital: 'Hospital Portal',
    corporate: 'Corporate Portal',
    homecare: 'Homecare Portal',
    asset: 'Asset Management',
    biomedical: 'Biomedical',
    bloodBank: 'Blood Bank',
    consent: 'Consent',
    cssd: 'CSSD',
    dietary: 'Dietary',
    feedback: 'Feedback',
    finance: 'Finance',
    infectionControl: 'Infection Control',
    mortuary: 'Mortuary',
    procurement: 'Procurement',
    queue: 'Queue',
  },
  
  // Support info
  support: {
    email: 'support@mediqzy.com',
    // Real, actively-used Twilio WhatsApp Business number (see
    // TWILIO_WHATSAPP_NUMBER) — there is no separate voice support line
    // configured anywhere in the system.
    phone: '+91 8098998998',
    website: 'https://mediqzy.com',
  },
  
  // Social links
  social: {
    twitter: 'https://twitter.com/mediqzy',
    facebook: 'https://facebook.com/mediqzy',
    linkedin: 'https://linkedin.com/company/mediqzy',
  },
};

/** Mediqzy HealthOS — product brand (API namespace remains /careos) */
export const HEALTH_OS = {
  name: 'Mediqzy',
  product: 'HealthOS',
  brandLine: 'Mediqzy - HealthOS',
  tagline: 'Mediqzy - HealthOS',
} as const;

/** @deprecated Use HEALTH_OS */
export const CAREOS = HEALTH_OS;

// Helper function to get role label
export const getRoleLabel = (role: string): string => {
  return BRAND.roleLabels[role as keyof typeof BRAND.roleLabels] || 'Dashboard';
};

// Helper function to get short role label (for header badges)
export const getShortRoleLabel = (role: string): string => {
  const labels: Record<string, string> = {
    user: 'User',
    doctor: 'Doctor',
    nurse: 'Nurse',
    admin: 'Admin',
    team: 'Team',
    assistant: 'Assistant',
    clinic: 'Clinic',
    lab: 'Lab',
    pharmacy: 'Pharmacy',
    hospital: 'Hospital',
    corporate: 'Corporate',
    homecare: 'Homecare',
  };
  return labels[role] || 'Dashboard';
};

export default BRAND;
