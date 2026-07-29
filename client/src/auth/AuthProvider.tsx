import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import api from "@/utils/api";
import { getToken, getUserType, hasHospitalPortalSession } from "@/hooks/auth";
import { profileProps, doctorProfileProps } from "@/lib/user.type";
import "@/App.css";

/**
 * Decode a JWT and check whether its `exp` claim is in the past.
 * Does NOT verify the signature — that is the server's responsibility.
 * Returns true when the token is missing, malformed, or expired.
 */
const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload?.exp) return true; // no expiry claim — treat as expired/invalid (fail closed)
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true; // malformed token
  }
};

/**
 * Validate a portal token from localStorage.
 * Removes it from storage and returns null if it is expired or absent.
 */
const getValidPortalToken = (key: string): string | null => {
  const token = localStorage.getItem(key);
  if (!token) return null;
  if (isTokenExpired(token)) {
    localStorage.removeItem(key);
    return null;
  }
  return token;
};

interface AuthContextType {
  currentUser: profileProps | null;
  currentDoctor: doctorProfileProps | null;
  currentCorporate: any | null;
  userType: "user" | "doctor" | "corporate" | null;
  isLoading: boolean;
  refreshAuth: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState({
    token: getToken(),
    userType: getUserType(),
    hasCheckedAuth: false
  });

  // Function to refresh auth state from localStorage
  const refreshAuth = useCallback(() => {
    const newToken = getToken();
    const newUserType = getUserType();
    setAuthState({
      token: newToken,
      userType: newUserType,
      hasCheckedAuth: false
    });
  }, []);

  // Listen for storage changes (for multi-tab sync) and custom auth events
  useEffect(() => {
    const handleStorageChange = () => {
      refreshAuth();
    };

    // Custom event for same-tab auth updates
    const handleAuthChange = () => {
      refreshAuth();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('authChange', handleAuthChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('authChange', handleAuthChange);
    };
  }, [refreshAuth]);

  // Only fetch user data if we have a token and haven't checked auth yet
  const { data: currentUser, isLoading: isUserLoading } = useQuery({
    queryKey: ["currentUser", authState.token],
    queryFn: async () => {
      if (!authState.token || authState.userType !== "user") return null;
      const { data } = await api.get("/users/profile");
      return data;
    },
    enabled: !!authState.token && authState.userType === "user",
    staleTime: 5 * 60 * 1000, // 5 minutes — reflects plan upgrades and account changes
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
  });

  const { data: currentDoctor, isLoading: isDoctorLoading } = useQuery({
    queryKey: ["currentDoctor", authState.token],
    queryFn: async () => {
      if (!authState.token || authState.userType !== "doctor") return null;
      const { data } = await api.get("/doctors/profile");
      // Handle both wrapped {success, doctor} and unwrapped {id, ...} responses
      return data?.doctor || data;
    },
    enabled: !!authState.token && authState.userType === "doctor",
    staleTime: 5 * 60 * 1000, // 5 minutes — reflects plan upgrades and account changes
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
  });

  // Corporate user - use cached data from login, no separate profile endpoint needed
  const currentCorporate = authState.userType === "corporate" ? { authenticated: true } : null;

  const isLoading = isUserLoading || isDoctorLoading;
  const isAuthenticated = !!(currentUser || currentDoctor || (authState.userType === "corporate" && authState.token));

  // Handle route protection - only run once per route change
  useEffect(() => {
    // Skip if still loading or already checked
    if (isLoading || authState.hasCheckedAuth) {
      return;
    }

    // Check if it's an admin route - admin routes bypass normal auth
    const isAdminRoute = location.pathname.startsWith('/admin');
    
    // Preload common tokens so we can reroute before generic login redirects
    const adminToken = getValidPortalToken('adminToken');
    const teamToken = getValidPortalToken('teamToken');
    
    // If an admin or team member is already authenticated and clicks a generic
    // appointments link, send them to their portal instead of the patient login.
    if (!isAdminRoute && location.pathname === '/appointments') {
      if (adminToken) {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate('/admin/appointments', { replace: true });
        return;
      }
      if (teamToken) {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate('/team/appointments', { replace: true });
        return;
      }
    }
    
    // Check if it's a corporate route - corporate routes have their own auth flow
    const isCorporateRoute = location.pathname.startsWith('/corporate');
    
    // Check if it's a team route - team routes have their own auth flow
    const isTeamRoute = location.pathname.startsWith('/team');
    
    // Check if it's a nurse route - nurse routes have their own auth flow
    const isNurseRoute = location.pathname.startsWith('/nurse');
    
    // Public hospital OS surfaces — kiosks & waiting-room displays (no login)
    const isHospitalOsPublicRoute =
      location.pathname.startsWith('/kiosk/') ||
      location.pathname.startsWith('/display/');

    if (isHospitalOsPublicRoute) {
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    // Check if it's an assistant route - assistant routes have their own auth flow
    const isAssistantRoute = location.pathname.startsWith('/assistant');
    
    // Check for portal-specific routes that have their own auth
    // Matches: /hospital-insurance/* AND /hospital/:slug/insurance/*
    const isHospitalInsuranceRoute =
      location.pathname.startsWith('/hospital-insurance') ||
      /^\/hospital\/[^/]+\/insurance(\/|$)/.test(location.pathname);
    const isHospitalRoute = location.pathname.startsWith('/hospital') && !isHospitalInsuranceRoute;
    const isClinicRoute = location.pathname.startsWith('/clinic');
    const isLabRoute = location.pathname.startsWith('/lab');
    const isPharmacyRoute = location.pathname.startsWith('/pharmacy');
    const isAmbulanceRoute = location.pathname.startsWith('/ambulance');
    const isTPARoute = location.pathname.startsWith('/tpa');
    const normalizedPath = location.pathname.toLowerCase();
    const isHomecareRoute = normalizedPath.startsWith('/homecare');
    // Doctor portal routes (exclude /doctors which is for patients to browse doctors)
    const isDoctorRoute = normalizedPath === '/doctor' ||
      normalizedPath === '/doctor-dashboard' ||
      (normalizedPath.startsWith('/doctor/') && !normalizedPath.startsWith('/doctors'));
    
    // Admin portal routes use their own token (adminToken) and must not fall back to user login.
    if (isAdminRoute) {
      const isAdminLoginRoute = location.pathname === '/admin/login';

      if (!isAdminLoginRoute && !adminToken) {
        console.log('🚫 Admin route without admin token, redirecting to admin login');
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate('/admin/login', { replace: true });
        return;
      }

      console.log('✅ Admin route access granted');
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    // Skip auth checks for corporate routes if user is corporate type
    if (isCorporateRoute && authState.userType === "corporate" && authState.token) {
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    // Check team routes - require teamToken
    if (isTeamRoute) {
      const teamToken = getValidPortalToken('teamToken');
      if (!teamToken && location.pathname !== '/team/login' && location.pathname !== '/team-login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/team/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    // Check nurse routes - require nurseToken
    if (isNurseRoute) {
      const nurseToken = getValidPortalToken('nurseToken');
      if (!nurseToken && location.pathname !== '/nurse/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/nurse/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    // Check assistant routes - require assistantToken
    if (isAssistantRoute) {
      const assistantToken = getValidPortalToken('assistantToken');
      if (!assistantToken && location.pathname !== '/assistant/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/assistant/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    // Check hospital insurance portal routes - require hospitalInsuranceToken
    if (isHospitalInsuranceRoute) {
      const insuranceToken = getValidPortalToken('hospitalInsuranceToken');
      if (!insuranceToken && location.pathname !== '/hospital-insurance/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/hospital-insurance/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    // Check portal routes - require respective tokens
    if (isHospitalRoute) {
      if (!hasHospitalPortalSession() && location.pathname !== '/hospital/login' && location.pathname !== '/hospital/register') {
        const next = encodeURIComponent(location.pathname + location.search);
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate(`/hospital/login?next=${next}`, { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isClinicRoute) {
      const clinicToken = getValidPortalToken('clinicToken');
      if (!clinicToken && location.pathname !== '/clinic/login' && location.pathname !== '/clinic/register') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/clinic/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isLabRoute) {
      const labToken = getValidPortalToken('labToken');
      if (!labToken && location.pathname !== '/lab/login' && location.pathname !== '/lab/register') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/lab/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isPharmacyRoute) {
      const pharmacyToken = getValidPortalToken('pharmacyToken');
      if (!pharmacyToken && location.pathname !== '/pharmacy/login' && location.pathname !== '/pharmacy/register') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/pharmacy/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isAmbulanceRoute) {
      const ambulanceToken = getValidPortalToken('ambulanceToken');
      if (!ambulanceToken && location.pathname !== '/ambulance/login' && location.pathname !== '/ambulance/register') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/ambulance/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isTPARoute) {
      // Always allow TPA login page
      if (location.pathname === '/tpa/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        return;
      }
      
      // For other TPA routes, check for token
      const tpaToken = localStorage.getItem('tpaToken');
      
      if (!tpaToken) {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/tpa/login", { replace: true });
        return;
      }
      
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isHomecareRoute) {
      const homecareToken = getValidPortalToken('homecareToken');
      if (!homecareToken && location.pathname !== '/homecare/login' && location.pathname !== '/homecare/register') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/homecare/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }

    // Check insurance broker routes - require insuranceBrokerToken
    const isBrokerRoute = location.pathname.startsWith('/insurance-broker');
    if (isBrokerRoute) {
      const brokerToken = localStorage.getItem('insuranceBrokerToken');
      if (!brokerToken && location.pathname !== '/insurance-broker/login' && location.pathname !== '/intermediary/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/intermediary/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }

    // Check aggregator routes - require aggregatorToken
    const isAggregatorRoute = location.pathname.startsWith('/aggregator');
    if (isAggregatorRoute) {
      const aggregatorToken = localStorage.getItem('aggregatorToken');
      if (!aggregatorToken && location.pathname !== '/aggregator/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/aggregator/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }

    // Check CRM routes - require crmToken
    const isCRMRoute = location.pathname.startsWith('/crm') || location.pathname.startsWith('/rfq');
    if (isCRMRoute) {
      const crmToken = getValidPortalToken('crmToken');
      if (!crmToken && location.pathname !== '/crm/login' && location.pathname !== '/rfq/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/crm/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }

    // Check doctor routes - require an active doctor session. This prevents
    // other portal sessions, such as lab, from reaching doctor teleconsults
    // even if a stale doctorToken is still present in localStorage.
    if (isDoctorRoute) {
      const doctorToken = getValidPortalToken('doctorToken');
      if ((!doctorToken || authState.userType !== "doctor") && location.pathname !== '/doctor/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/doctor/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }

    // Hospital department portal prefix guards (accounts, mrd, hr, etc.)
    const deptPortalPrefixes = [
      '/accounts/', '/mrd/', '/insurance-desk/', '/hr/',
      '/it-edp/', '/ot/', '/icu/', '/quality/', '/security/',
      '/asset/', '/biomedical/', '/blood-bank/', '/consent/', '/cssd/',
      '/dietary/', '/finance/', '/infection-control/', '/mortuary/',
      '/procurement/', '/scm/', '/queue/'
    ];
    const deptLoginPaths = [
      '/accounts/login', '/mrd/login', '/insurance-desk/login', '/hr/login',
      '/it-edp/login', '/ot/login', '/icu/login', '/quality/login', '/security/login',
      '/asset/login', '/biomedical/login', '/blood-bank/login', '/consent/login',
      '/cssd/login', '/dietary/login', '/finance/login', '/infection-control/login',
      '/mortuary/login', '/procurement/login', '/scm/login', '/queue/login'
    ];
    const deptPublicPaths = ['/queue/kiosk'];
    const isDeptPortalRoute = deptPortalPrefixes.some(p => location.pathname.startsWith(p));
    // Dedicated hospital-scoped dept login URLs: /hr/:slug/login, /accounts/:slug/login, etc.
    const isSlugScopedDeptLogin = /^\/(accounts|mrd|insurance-desk|hr|it-edp|ot|icu|quality|security)\/[^/]+\/login$/.test(location.pathname)
      || /^\/hospital\/[^/]+\/hr\/login$/.test(location.pathname);
    if (isDeptPortalRoute || isSlugScopedDeptLogin) {
      // Allow login pages through; for all other dept pages require deptKey token
      const loginPath = isSlugScopedDeptLogin
        ? location.pathname
        : deptPortalPrefixes
            .filter(p => location.pathname.startsWith(p))
            .map(p => `${p.slice(0, -1)}/login`)[0];
      if (
        !deptLoginPaths.includes(location.pathname)
        && !deptPublicPaths.includes(location.pathname)
        && !isSlugScopedDeptLogin
      ) {
        const deptKey = (loginPath || '').replace(/^\//, '').split('/')[0];
        const deptToken = deptKey ? localStorage.getItem(`${deptKey}Token`) : null;
        if (!deptToken) {
          setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
          navigate(loginPath || '/login', { replace: true });
          return;
        }
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }

    const isPublicRoute = [
      "/login", 
      "/forgot-password",
      "/user/forgot-password",
      "/doctor/forgot-password",
      "/team/forgot-password",
      "/reset-password",
      "/oauth-callback",
      "/register", 
      "/doc-register",
      "/doctor-login",
      "/doctor/login",
      "/hospital/login",
      "/hospital/register",
      "/clinic/login",
      "/clinic/register",
      "/lab/login",
      "/lab/register",
      "/pharmacy/login",
      "/pharmacy/register",
      "/ambulance/login",
      "/ambulance/register",
      "/homecare/login",
      "/homecare/register",
      "/corporate/register",
      "/team-login",
      "/team/login",
      "/nurse/login",
      "/assistant/login",
      "/admin/login",
      "/corporate/login",
      "/tpa/login",
      "/psu/login",
      "/insurer/login",
      "/ngo/login",
      "/intermediary/login",
      "/insurance-broker/login",
      "/aggregator/login",
      "/crm/login",
      "/rfq/login",
      "/choose-plan",
      // Hospital department login pages
      "/accounts/login",
      "/mrd/login",
      "/insurance-desk/login",
      "/hr/login",
      "/it-edp/login",
      "/ot/login",
      "/icu/login",
      "/quality/login",
      "/security/login"
    ].includes(location.pathname)
      || /^\/hr\/[^/]+\/login$/.test(location.pathname)
      || /^\/hospital\/[^/]+\/hr\/login$/.test(location.pathname);
    
    if (!authState.token && !isPublicRoute) {
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      navigate("/login", { replace: true });
    } else if (authState.token && isAuthenticated && isPublicRoute && location.pathname !== "/choose-plan") {
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      // Redirect authenticated users away from login pages to their dashboard
      let redirectPath = "/";
      if (authState.userType === "doctor") {
        redirectPath = "/doctor/dashboard";
      } else if (authState.userType === "corporate") {
        redirectPath = "/corporate/dashboard";
      } else if (authState.userType === "user") {
        redirectPath = "/";
      }
      navigate(redirectPath, { replace: true });
    } else {
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
    }
  }, [authState.token, authState.userType, authState.hasCheckedAuth, isAuthenticated, isLoading, location.pathname, navigate]);

  // Reset auth check when location changes
  useEffect(() => {
    setAuthState(prev => ({ ...prev, hasCheckedAuth: false }));
  }, [location.pathname]);

  // ── Proactive session expiry warning ────────────────────────────────────
  const [sessionWarning, setSessionWarning] = useState<"warn" | "dismissed" | null>(null);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = authState.token;
    if (!token || authState.userType !== "user") return;

    // Clear previous timer
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    setSessionWarning(null);

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return;
      const msUntilExpiry = payload.exp * 1000 - Date.now();
      const msUntilWarn   = msUntilExpiry - 5 * 60 * 1000; // warn 5 min before
      if (msUntilWarn <= 0) return;
      expiryTimerRef.current = setTimeout(() => setSessionWarning("warn"), msUntilWarn);
    } catch {}

    return () => { if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current); };
  }, [authState.token, authState.userType]);

  const handleStaySignedIn = async () => {
    setRefreshingSession(true);
    try {
      const refreshToken = localStorage.getItem("refreshToken");
      const { data } = await api.post("/auth/refresh", { refreshToken }, { skipAuth: true } as any);
      if (data.success && data.accessToken) {
        localStorage.setItem("token", data.accessToken);
        if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
        refreshAuth();
        setSessionWarning("dismissed");
      }
    } catch {
      // Refresh failed — let the natural 401 flow handle it
    } finally {
      setRefreshingSession(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-screen h-[100vh]">
        <span className="loader"></span>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentDoctor,
        currentCorporate,
        userType: authState.userType,
        isLoading,
        refreshAuth
      }}
    >
      {/* Session expiry warning — sticky bottom bar, patient portal only */}
      {sessionWarning === "warn" && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-amber-600 text-white px-4 py-3 shadow-lg text-sm"
        >
          <span className="font-medium">🔒 Your session expires in 5 minutes.</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleStaySignedIn}
              disabled={refreshingSession}
              className="bg-white text-amber-700 hover:bg-amber-50 font-semibold px-3 py-1 rounded-lg text-xs transition-colors disabled:opacity-60"
            >
              {refreshingSession ? "Refreshing…" : "Stay signed in"}
            </button>
            <button
              onClick={() => setSessionWarning("dismissed")}
              aria-label="Dismiss session warning"
              className="text-amber-200 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export { useAuth } from "@/hooks/useAuth";
