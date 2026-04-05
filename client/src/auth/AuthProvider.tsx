import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import api from "@/utils/api";
import { getToken, getUserType } from "@/hooks/auth";
import { profileProps, doctorProfileProps } from "@/lib/user.type";
import "@/App.css";

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
    staleTime: Infinity, // Don't refetch unless token changes
    retry: false,
    refetchOnWindowFocus: false,
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
    staleTime: Infinity, // Don't refetch unless token changes
    retry: false,
    refetchOnWindowFocus: false,
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
    const adminToken = localStorage.getItem('adminToken');
    const teamToken = localStorage.getItem('teamToken');
    
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
    const isDoctorRoute = normalizedPath === '/doctor' || (
      normalizedPath.startsWith('/doctor/') && !normalizedPath.startsWith('/doctors')
    );
    
    // Admin portal routes use their own token (adminToken) and must not fall back to user login.
    if (isAdminRoute) {
      const isAdminLoginRoute = location.pathname === '/admin/login';

      if (!isAdminLoginRoute && !adminToken && !teamToken) {
        console.log('🚫 Admin route without admin/team token, redirecting to admin login');
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
      const teamToken = localStorage.getItem('teamToken');
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
      const nurseToken = localStorage.getItem('nurseToken');
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
      const assistantToken = localStorage.getItem('assistantToken');
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
      const insuranceToken = localStorage.getItem('hospitalInsuranceToken');
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
      const hospitalToken = localStorage.getItem('hospitalToken');
      if (!hospitalToken && location.pathname !== '/hospital/login') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/hospital/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isClinicRoute) {
      const clinicToken = localStorage.getItem('clinicToken');
      if (!clinicToken && location.pathname !== '/clinic/login' && location.pathname !== '/clinic/register') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/clinic/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isLabRoute) {
      const labToken = localStorage.getItem('labToken');
      if (!labToken && location.pathname !== '/lab/login' && location.pathname !== '/lab/register') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/lab/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isPharmacyRoute) {
      const pharmacyToken = localStorage.getItem('pharmacyToken');
      if (!pharmacyToken && location.pathname !== '/pharmacy/login' && location.pathname !== '/pharmacy/register') {
        setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
        navigate("/pharmacy/login", { replace: true });
        return;
      }
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      return;
    }
    
    if (isAmbulanceRoute) {
      const ambulanceToken = localStorage.getItem('ambulanceToken');
      if (!ambulanceToken && location.pathname !== '/ambulance/login') {
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
      const homecareToken = localStorage.getItem('homecareToken');
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
    
    // Check doctor routes - require doctorToken
    if (isDoctorRoute) {
      const doctorToken = localStorage.getItem('doctorToken');
      if (!doctorToken && location.pathname !== '/doctor/login') {
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
      '/it-edp/', '/ot/', '/icu/', '/quality/', '/security/'
    ];
    const deptLoginPaths = [
      '/accounts/login', '/mrd/login', '/insurance-desk/login', '/hr/login',
      '/it-edp/login', '/ot/login', '/icu/login', '/quality/login', '/security/login'
    ];
    const isDeptPortalRoute = deptPortalPrefixes.some(p => location.pathname.startsWith(p));
    if (isDeptPortalRoute) {
      // Allow login pages through; for all other dept pages require deptKey token
      const loginPath = deptPortalPrefixes
        .filter(p => location.pathname.startsWith(p))
        .map(p => `${p.slice(0, -1)}/login`)[0];
      if (!deptLoginPaths.includes(location.pathname)) {
        const deptKey = loginPath?.replace('/', '').replace('/login', '');
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
      "/register", 
      "/doc-register",
      "/doctor-login",
      "/doctor/login",
      "/hospital/login",
      "/clinic/login",
      "/clinic/register",
      "/lab/login",
      "/lab/register",
      "/pharmacy/login",
      "/pharmacy/register",
      "/ambulance/login",
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
    ].includes(location.pathname);
    
    if (!authState.token && !isPublicRoute) {
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      navigate("/login", { replace: true });
    } else if (authState.token && isAuthenticated && isPublicRoute && location.pathname !== "/choose-plan") {
      setAuthState(prev => ({ ...prev, hasCheckedAuth: true }));
      // Redirect authenticated users away from login pages to their dashboard
      let redirectPath = "/";
      if (authState.userType === "doctor") {
        redirectPath = "/doctor-dashboard";
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
      {children}
    </AuthContext.Provider>
  );
};

export { useAuth } from "@/hooks/useAuth";
