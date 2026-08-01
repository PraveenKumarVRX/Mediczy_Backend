import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface PortalConfig {
  allowedPaths: string[];
  tokenKey: string;
  loginPath: string;
  userType: string;
}

const CORE_PUBLIC_PATHS = ['/login', '/register'];
const LEGACY_PUBLIC_PATHS = ['/doctor-login', '/doc-register'];
/** Prefix-matched public surfaces (token links, kiosks) — no login required */
const PUBLIC_PATH_PREFIXES = ['/kiosk/', '/display/'];

const USER_TYPES: Record<string, PortalConfig> = {
  user: {
    allowedPaths: [
      '/',
      '/login',
      '/register',
      '/patient',
      '/profile',
      '/health-tracker',
      '/consultation',
      '/doctors',
      '/symptoms',
      '/medicine',
      '/chat',
      '/ai-doctor',
      '/ayushman',
      '/health-feed',
      '/reposts',
      '/report-scanner',
      '/smart-health',
      '/health-dashboard',
      '/my-bookings',
      '/my-prescriptions',
      '/my-plans',
      '/diet',
      '/calorie-calculator',
      '/emergency',
      '/video-test',
      '/video-test-basic'
    ],
    tokenKey: 'token',
    loginPath: '/login',
    userType: 'user'
  },
  doctor: {
    allowedPaths: [
      '/doctor',
      '/doctor/login',
      '/doc-register',
      '/doctor-dashboard',
      '/doctor/dashboard',
      '/doctor/appointments',
      '/doctor/availability',
      '/doctor/prescriptions',
      '/doctor/prescription-writer',
      '/doctor/patients',
      '/doctor/patient',
      '/doctor/triage',
      '/doctor/insights',
      '/doctor/ai-hub',
      '/doctor/clinical-workspace',
      '/doctor/assist',
      '/doctor/health-monitoring',
      '/doctor/alerts',
      '/doctor/video',
      '/doctor/recording-test',
      '/doctor/settings',
      '/doctor/templates',
      '/doctor/template-settings',
      '/doctor/specialty-templates',
      '/doctor/services',
      '/doctor/billing',
      '/doctor/messages',
      '/doctor/contact',
      '/doctor/chat',
      '/doctor/analytics',
      '/doctor/reports',
      '/doctor/remote-monitoring',
      '/doctor/assistant',
      '/doctor/voice-scribe',
      '/doctor/calculators',
      '/doctor/imaging',
      '/doctor/webinars',
      '/doctor/healthos',
      '/doctor/copilot',
      '/doctor/home',
      '/chatdoctor'
    ],
    tokenKey: 'doctorToken',
    loginPath: '/doctor/login',
    userType: 'doctor'
  },
  team: {
    allowedPaths: [
      '/team',
      '/team/login',
      '/team/dashboard',
      '/team/profile',
      '/team/directory',
      '/team/reports',
      '/team/tools',
      '/team/user-management',
      '/team/doctor-management',
      '/team/corporate-management',
      '/team/hospital-management',
      '/team/clinic-management',
      '/team/lab-management',
      '/team/pharmacy-management',
      '/team/appointments',
      '/team/chat',
      '/team/health-plans',
      '/team/activity',
      '/team/settings'
    ],
    tokenKey: 'teamToken',
    loginPath: '/team/login',
    userType: 'team'
  },
  nurse: {
    allowedPaths: [
      '/nurse',
      '/nurse/login',
      '/nurse/dashboard',
      '/nurse/patients',
      '/nurse/vitals',
      '/nurse/medications',
      '/nurse/notes',
      '/nurse/appointments',
      '/nurse/register-patient'
    ],
    tokenKey: 'nurseToken',
    loginPath: '/nurse/login',
    userType: 'nurse'
  },
  assistant: {
    allowedPaths: [
      '/assistant',
      '/assistant/login',
      '/assistant/dashboard',
      '/assistant/orders',
      '/assistant/register-patient'
    ],
    tokenKey: 'assistantToken',
    loginPath: '/assistant/login',
    userType: 'assistant'
  },
  admin: {
    allowedPaths: [
      '/admin',
      '/admin/login',
      '/admin',
      '/admin/dashboard',
      '/admin/test',
      '/admin/system-test',
      '/admin/comprehensive',
      '/admin/doctors',
      '/admin/users',
      '/admin/team',
      '/admin/team-privileges',
      '/admin/chat',
      '/admin/appointments',
      '/admin/plans',
      '/admin/insurance',
      '/admin/insurer',
      '/admin/tpa',
      '/admin/hospitals',
      '/admin/clinics',
      '/admin/corporates',
      '/admin/corporate-health-packages',
      '/admin/corporate-employees',
      '/admin/corporate-plans',
      '/admin/pharmacies',
      '/admin/homecare',
      '/admin/ambulance',
      '/admin/medivac',
      '/admin/ngo',
      '/admin/psu',
      '/admin/ohc',
      '/admin/labs',
      '/admin/billing',
      '/admin/accounting',
      '/admin/payments',
      '/admin/email',
      '/admin/activity-log',
      '/admin/auth-test',
      '/admin/sms',
      '/admin/whatsapp',
      '/admin/video',
      '/admin/voice',
      '/admin/tickets',
      '/admin/health-risk',
      '/admin/reports',
      '/admin/crm',
      '/admin/ai-analytics',
      '/admin/settings',
      '/admin/manage-assistants',
      '/admin/register-patient',
      '/diagnostic'
    ],
    tokenKey: 'adminToken',
    loginPath: '/admin/login',
    userType: 'admin'
  },
  corporate: {
    allowedPaths: [
      '/corporate',
      '/corporate/login',
      '/corporate/dashboard',
      '/corporate/benefits',
      '/corporate/employees',
      '/corporate/appointments',
      '/corporate/analytics',
      '/corporate/risk-monitor',
      '/corporate/departments',
      '/corporate/claims',
      '/corporate/reports',
      '/corporate/compliance',
      '/corporate/notifications',
      '/corporate/settings',
      '/corporate/support'
    ],
    tokenKey: 'corporateToken',
    loginPath: '/corporate/login',
    userType: 'corporate'
  },
  tpa: {
    allowedPaths: [
      '/tpa',
      '/tpa/login',
      '/tpa/dashboard',
      '/tpa/claims',
      '/tpa/network',
      '/tpa/policies',
      '/tpa/reports',
      '/tpa/settings'
    ],
    tokenKey: 'tpaToken',
    loginPath: '/tpa/login',
    userType: 'tpa'
  },
  psu: {
    allowedPaths: [
      '/psu',
      '/psu/login',
      '/psu/dashboard',
      '/psu/employees',
      '/psu/benefits',
      '/psu/claims',
      '/psu/reports',
      '/psu/settings'
    ],
    tokenKey: 'psuToken',
    loginPath: '/psu/login',
    userType: 'psu'
  },
  insurer: {
    allowedPaths: [
      '/insurer',
      '/insurer/login',
      '/insurer/dashboard',
      '/insurer/policies',
      '/insurer/claims',
      '/insurer/analytics',
      '/insurer/reports',
      '/insurer/settings'
    ],
    tokenKey: 'insurerToken',
    loginPath: '/insurer/login',
    userType: 'insurer'
  },
  ngo: {
    allowedPaths: [
      '/ngo',
      '/ngo/login',
      '/ngo/dashboard',
      '/ngo/programs',
      '/ngo/beneficiaries',
      '/ngo/reports',
      '/ngo/settings'
    ],
    tokenKey: 'ngoToken',
    loginPath: '/ngo/login',
    userType: 'ngo'
  },
  hospital: {
    allowedPaths: [
      '/hospital',
      '/hospital/login',
      '/hospital/dashboard',
      '/hospital/practice-management',
      '/hospital/insurance-billing',
      '/hospital/mrd',
      '/hospital/ehr',
      '/hospital/appointments',
      '/hospital/beds',
      '/hospital/patients',
      '/hospital/doctors',
      '/hospital/opd-ipd',
      '/hospital/pharmacy',
      '/hospital/lab-reports',
      '/hospital/billing',
      '/hospital/claims',
      '/hospital/staff',
      '/hospital/notifications',
      '/hospital/settings',
      '/hospital/support',
      '/hospital/qms',
      '/hospital/queue-console',
      '/hospital/os',
      '/kiosk/checkin',
      '/kiosk/register/:token',
      '/display/queue',
    ],
    tokenKey: 'hospitalToken',
    loginPath: '/hospital/login',
    userType: 'hospital'
  },
  clinic: {
    allowedPaths: [
      '/clinic',
      '/clinic/login',
      '/clinic/dashboard',
      '/clinic/appointments',
      '/clinic/patients',
      '/clinic/queue',
      '/clinic/doctors',
      '/clinic/consultations',
      '/clinic/prescriptions',
      '/clinic/pharmacy',
      '/clinic/lab-tests',
      '/clinic/billing',
      '/clinic/payments',
      '/clinic/reports',
      '/clinic/staff',
      '/clinic/notifications',
      '/clinic/settings',
      '/clinic/support'
    ],
    tokenKey: 'clinicToken',
    loginPath: '/clinic/login',
    userType: 'clinic'
  },
  lab: {
    allowedPaths: [
      '/lab',
      '/lab/login',
      '/lab/dashboard',
      '/lab/orders',
      '/lab/orders/new',
      '/lab/patients',
      '/lab/appointments',
      '/lab/queue',
      '/lab/qms',
      '/lab/home-collection',
      '/lab/samples',
      '/lab/processing',
      '/lab/results',
      '/lab/reports',
      '/lab/inventory',
      '/lab/billing',
      '/lab/billing-ops',
      '/lab/payments',
      '/lab/analytics',
      '/lab/staff',
      '/lab/notifications',
      '/lab/settings',
      '/lab/support'
    ],
    tokenKey: 'labToken',
    loginPath: '/lab/login',
    userType: 'lab'
  },
  pharmacy: {
    allowedPaths: [
      '/pharmacy',
      '/pharmacy/login',
      '/pharmacy/dashboard',
      '/pharmacy/pos',
      '/pharmacy/prescriptions',
      '/pharmacy/inventory',
      '/pharmacy/stock-alerts',
      '/pharmacy/batches',
      '/pharmacy/purchase-orders',
      '/pharmacy/customers',
      '/pharmacy/reports',
      '/pharmacy/invoices',
      '/pharmacy/expiry',
      '/pharmacy/analytics',
      '/pharmacy/settings',
      '/pharmacy/support'
    ],
    tokenKey: 'pharmacyToken',
    loginPath: '/pharmacy/login',
    userType: 'pharmacy'
  },
  ambulance: {
    allowedPaths: [
      '/ambulance',
      '/ambulance/login',
      '/ambulance/dashboard',
      '/ambulance/active-trips',
      '/ambulance/dispatch',
      '/ambulance/tracking',
      '/ambulance/history',
      '/ambulance/fleet',
      '/ambulance/staff',
      '/ambulance/maintenance',
      '/ambulance/schedule',
      '/ambulance/billing',
      '/ambulance/reports',
      '/ambulance/alerts',
      '/ambulance/settings',
      '/ambulance/support'
    ],
    tokenKey: 'ambulanceToken',
    loginPath: '/ambulance/login',
    userType: 'ambulance'
  },
  homecare: {
    allowedPaths: [
      '/homecare',
      '/homecare/login',
      '/homecare/dashboard'
    ],
    tokenKey: 'homecareToken',
    loginPath: '/homecare/login',
    userType: 'homecare'
  },
  crm: {
    allowedPaths: [
      '/crm',
      '/crm/login',
      '/crm/dashboard',
      '/crm/leads',
      '/crm/deals',
      '/crm/contacts',
      '/crm/activities',
      '/crm/pipeline',
      '/crm/reports',
      '/crm/settings',
      '/crm/rfqs',
      '/crm/rfqs/:id',
      '/crm/rfqs/:id/quote/:quoteId',
      '/crm/agents',
      '/crm/agencies',
      '/crm/commissions',
      '/crm/corporate-plans',
      '/rfq',
      '/rfq/login',
    ],
    tokenKey: 'crmToken',
    loginPath: '/crm/login',
    userType: 'crm'
  },
  hospital_insurance: {
    allowedPaths: [
      '/hospital-insurance',
      '/hospital-insurance/login',
      '/hospital-insurance/dashboard',
      '/hospital-insurance/claims',
      '/hospital-insurance/pre-auth',
      '/hospital-insurance/reconciliation',
      '/hospital-insurance/documents',
      '/hospital-insurance/hospital-profile',
      '/hospital-insurance/analytics',
      '/hospital-insurance/tasks',
      '/hospital-insurance/payer-management',
      '/hospital-insurance/courier',
      '/hospital-insurance/nhcx',
      '/hospital-insurance/abdm',
      '/hospital-insurance/calendar',
      '/hospital-insurance/inventory',
      '/hospital-insurance/bulk-upload',
      '/hospital-insurance/search',
      '/hospital-insurance/settings',
      '/hospital-insurance/notifications'
    ],
    tokenKey: 'hospitalInsuranceToken',
    loginPath: '/hospital-insurance/login',
    userType: 'hospital_insurance'
  }
};

const PUBLIC_PATHS = Array.from(new Set([
  ...CORE_PUBLIC_PATHS,
  ...Object.values(USER_TYPES).map((config) => config.loginPath),
  ...LEGACY_PUBLIC_PATHS
]));

const ROUTE_TO_LOGIN_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  Object.values(USER_TYPES).forEach((config) => {
    config.allowedPaths.forEach((path) => {
      if (!PUBLIC_PATHS.includes(path)) {
        map[path] = config.loginPath;
      }
    });
  });
  return map;
})();

export const useRingFencing = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [currentUserType, setCurrentUserType] = useState<string | null>(null);

  useEffect(() => {
    const checkAccess = () => {
      const currentPath = location.pathname;
      
      // Public paths that don't require authentication
      if (
        PUBLIC_PATHS.includes(currentPath) ||
        PUBLIC_PATH_PREFIXES.some((p) => currentPath === p.slice(0, -1) || currentPath.startsWith(p))
      ) {
        setIsChecking(false);
        return;
      }

      // Check which user is logged in
      let loggedInUserType: string | null = null;
      let loggedInToken: string | null = null;

      const tokenCandidates = Object.entries(USER_TYPES)
        .map(([userType, config]) => {
          const token = localStorage.getItem(config.tokenKey);
          return token ? { userType, config, token } : null;
        })
        .filter(Boolean) as { userType: string; config: PortalConfig; token: string }[];

      const candidateHasAccess = (candidate: { userType: string; config: PortalConfig; token: string }) => {
        return candidate.config.allowedPaths.some((allowedPath) => {
          return (
            currentPath === allowedPath ||
            currentPath.startsWith(allowedPath + "/") ||
            (allowedPath.includes("/:") && currentPath.startsWith(allowedPath.split("/:")[0]))
          );
        });
      };

      // Prefer the token that matches the route being accessed.
      const bestCandidate = tokenCandidates.find(candidateHasAccess);
      const selected = bestCandidate || tokenCandidates[0];
      if (selected) {
        loggedInUserType = selected.userType;
        loggedInToken = selected.token;
      }

      // If no user is logged in and trying to access protected route
      if (!loggedInUserType && !PUBLIC_PATHS.includes(currentPath)) {
        console.log('🚫 No user logged in, redirecting to login');

        // Find the best matching login page based on current path
        let targetLogin = '/login'; // Default fallback for user login
        
        // Try exact match first
        if (ROUTE_TO_LOGIN_MAP[currentPath]) {
          targetLogin = ROUTE_TO_LOGIN_MAP[currentPath];
        } else {
          // Try prefix match (e.g., /doctor/dashboard → /doctor/login)
          for (const [protectedPath, loginPath] of Object.entries(ROUTE_TO_LOGIN_MAP)) {
            if (currentPath.startsWith(protectedPath + '/')) {
              targetLogin = loginPath;
              break;
            }
            // Handle wildcard routes like /doctor/:id
            if (protectedPath.includes('/:') && currentPath.startsWith(protectedPath.split('/:')[0])) {
              targetLogin = loginPath;
              break;
            }
          }
        }

        navigate(targetLogin, { replace: true });
        setIsChecking(false);
        return;
      }

      // If user is logged in, check if they have access to current path
      if (loggedInUserType) {
        const userConfig = USER_TYPES[loggedInUserType];
        const hasAccess = userConfig.allowedPaths.some(allowedPath => {
          // Check for exact match or path starts with allowed path (for nested routes)
          return currentPath === allowedPath || 
                 currentPath.startsWith(allowedPath + '/') ||
                 (allowedPath.includes('/:') && currentPath.startsWith(allowedPath.split('/:')[0]));
        });

        if (!hasAccess) {
          console.log(`🚫 Ring-fencing: ${loggedInUserType} attempting to access unauthorized path: ${currentPath}`);
          console.log(`🔒 Redirecting to ${userConfig.allowedPaths[1] || userConfig.loginPath}`);
          
          // Clear all other tokens to prevent cross-contamination
          clearOtherTokens(loggedInUserType);
          
          // Redirect to their appropriate dashboard or first allowed path
          const redirectPath = userConfig.allowedPaths[1] || userConfig.loginPath;
          navigate(redirectPath, { replace: true });
          setIsChecking(false);
          return;
        }

        setCurrentUserType(loggedInUserType);
      }

      setIsChecking(false);
    };

    checkAccess();
  }, [location.pathname, navigate]);

  return { isChecking, currentUserType };
};

// Helper function to clear tokens of other user types
const clearOtherTokens = (currentUserType: string) => {
  const currentConfig = USER_TYPES[currentUserType];
  
  Object.entries(USER_TYPES).forEach(([userType, config]) => {
    if (userType !== currentUserType) {
      localStorage.removeItem(config.tokenKey);
      // Also remove associated data
      localStorage.removeItem(`${userType}Data`);
    }
  });
  
  console.log(`🧹 Cleared tokens for all user types except: ${currentUserType}`);
};

// Component to wrap routes that need ring-fencing
export const RingFencedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isChecking, currentUserType } = useRingFencing();

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Hook to check if user has specific privilege
export const usePrivilegeCheck = (requiredPath: string): boolean => {
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let loggedInUserType: string | null = null;

    for (const [userType, config] of Object.entries(USER_TYPES)) {
      const token = localStorage.getItem(config.tokenKey);
      if (token) {
        loggedInUserType = userType;
        break;
      }
    }

    if (loggedInUserType) {
      const userConfig = USER_TYPES[loggedInUserType];
      const hasPermission = userConfig.allowedPaths.some(allowedPath => {
        return requiredPath === allowedPath || requiredPath.startsWith(allowedPath + '/');
      });
      setHasAccess(hasPermission);
    }
  }, [requiredPath]);

  return hasAccess;
};

// Function to logout and clear all tokens
export const logoutAllSessions = () => {
  Object.entries(USER_TYPES).forEach(([userType, config]) => {
    localStorage.removeItem(config.tokenKey);
    localStorage.removeItem(`${userType}Data`);
  });
  
  // Also clear common tokens
  localStorage.removeItem('token');
  localStorage.removeItem('userType');
  localStorage.removeItem('userData');
  
  console.log('🚪 All sessions cleared');
};

export default useRingFencing;
