/**
 * Mediczy Brand Configuration
 * Centralized branding constants for consistent UI across all dashboards
 */

export const BRAND = {
  // Brand Names
  name: 'Mediqzy',
  fullName: 'Mediqzy Healthcare',
  tagline: 'Your Health, Our Priority',
  
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
    
    // Gradient classes
    gradient: 'from-teal-500 to-teal-600',
    gradientHover: 'from-teal-600 to-teal-700',
    gradientText: 'from-teal-600 to-teal-700',
    
    // Badge/Status colors
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
  },
  
  // Support info
  support: {
    email: 'support@mediqzy.com',
    phone: '+91 1800-XXX-XXXX',
    website: 'https://app.mediqzy.com',
  },
  
  // Social links
  social: {
    twitter: 'https://twitter.com/mediqzy',
    facebook: 'https://facebook.com/mediqzy',
    linkedin: 'https://linkedin.com/company/mediqzy',
  },
};

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
