/**
 * Mediczy Brand Configuration
 * Centralized branding constants for consistent UI across all dashboards
 */

export const BRAND = {
  // Brand Names
  name: 'Mediqzy',
  fullName: 'Mediqzy CareOS',
  tagline: 'The AI-Native Healthcare Operating System for Hospitals, Health Systems, and Cross-Border Care.',
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
    email: 'support@smarthealth.com',
    phone: '+91 1800-XXX-XXXX',
    website: 'https://smarthealth.com',
  },
  
  // Social links
  social: {
    twitter: 'https://twitter.com/smarthealth',
    facebook: 'https://facebook.com/smarthealth',
    linkedin: 'https://linkedin.com/company/smarthealth',
  },
};

export const CAREOS = {
  name: 'Mediqzy',
  product: 'Mediqzy CareOS',
  tagline: 'The AI-Native Healthcare Operating System for Hospitals, Health Systems, and Cross-Border Care.',
  shortTagline: 'AI-Native Healthcare Operating System',
} as const;

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
