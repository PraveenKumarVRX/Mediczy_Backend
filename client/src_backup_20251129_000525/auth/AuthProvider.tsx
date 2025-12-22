import { createContext, useContext, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom"; // 🔹 Added `useLocation`
import api from "@/utils/api";
import { getToken, getUserType } from "@/hooks/auth";
import { profileProps, doctorProfileProps } from "@/lib/user.type";
import { LoaderIcon } from "lucide-react";
import "@/App.css";

interface AuthContextType {
  currentUser: profileProps | null;
  currentDoctor: doctorProfileProps | null;
  userType: "user" | "doctor" | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const token = getToken();
  const userType = getUserType();

  // 🔹 Fetch User Profile (For Users)
  const { data: currentUser, isLoading: isUserLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      if (!token || userType !== "user") return null;
      try {
        const { data } = await api.get("/users/profile");
        return data;
      } catch (error) {
        console.error("Error fetching user profile:", error);
        localStorage.removeItem("token");
        localStorage.removeItem("userType");
        return null;
      }
    },
    enabled: !!token && userType === "user",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // 🔹 Fetch Doctor Profile (For Doctors)
  const { data: currentDoctor, isLoading: isDoctorLoading } = useQuery({
    queryKey: ["currentDoctor"],
    queryFn: async () => {
      if (!token || userType !== "doctor") return null;
      try {
        const { data } = await api.get("/doctors/profile");
        return data;
      } catch (error) {
        console.error("Error fetching doctor profile:", error);
        localStorage.removeItem("token");
        localStorage.removeItem("userType");
        return null;
      }
    },
    enabled: !!token && userType === "doctor",
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // 🔹 Compute Authentication State
  const isLoading = (!!token && (isUserLoading || isDoctorLoading));
  const isAuthenticated = useMemo(
    () => !!(currentUser || currentDoctor),
    [currentUser, currentDoctor]
  );

  // 🔹 Handle Authentication and Redirection
  useEffect(() => {
    console.log("Auth state:", {
      isLoading,
      isAuthenticated,
      token,
      userType,
      currentUser,
      currentDoctor,
    });

    if (!isLoading) {
      const isPublicRoute = ["/login", "/doctor-login", "/register", "/doc-register", "/admin/login", "/team/login", "/nurse/login", "/assistant/login", "/video-test", "/video-test-basic"].includes(
        location.pathname
      );
      
      const isAdminRoute = location.pathname.startsWith('/admin');
      const isTeamRoute = location.pathname.startsWith('/team');
      const isNurseRoute = location.pathname.startsWith('/nurse');
      const isAssistantRoute = location.pathname.startsWith('/assistant');
      const isDoctorRoute = location.pathname.startsWith('/doctor');
      const hasAdminToken = localStorage.getItem('adminToken');
      const hasTeamToken = localStorage.getItem('teamToken');
      const hasNurseToken = localStorage.getItem('nurseToken');
      const hasAssistantToken = localStorage.getItem('assistantToken');

      // For admin routes, verify admin token with backend and guard access (PRIORITIZE admin)
      if (isAdminRoute) {
        if (!hasAdminToken && location.pathname !== '/admin/login') {
          navigate("/admin/login");
          return;
        }
        if (hasAdminToken) {
          console.log('Admin token found, skipping AuthProvider validation');
        }
        return; // Short-circuit for admin routes
      }

      // If user has admin token, skip all team/nurse/assistant redirects entirely
      if (hasAdminToken) {
        console.log('Admin token present, bypassing team/nurse/assistant redirects');
        // Continue to regular auth logic but don't redirect based on team/nurse/assistant tokens
      } else {
        // Check if it's a specialized route (team, nurse, assistant, doctor)
        const isSpecializedRoute = isTeamRoute || isNurseRoute || isAssistantRoute || isDoctorRoute;

        // If user has team token but trying to access non-team AND non-user routes, redirect to team dashboard
        if (hasTeamToken && !isTeamRoute && !isPublicRoute && isSpecializedRoute) {
          console.log('Team member trying to access other specialized route, redirecting to team dashboard');
          navigate("/team/dashboard", { replace: true });
          return;
        }

        // If user has nurse token but trying to access non-nurse AND non-user routes, redirect to nurse dashboard
        if (hasNurseToken && !isNurseRoute && !isPublicRoute && isSpecializedRoute) {
          console.log('Nurse trying to access other specialized route, redirecting to nurse dashboard');
          navigate("/nurse/dashboard", { replace: true });
          return;
        }

        // If user has assistant token but trying to access non-assistant AND non-user routes, redirect to assistant dashboard
        if (hasAssistantToken && !isAssistantRoute && !isPublicRoute && isSpecializedRoute) {
          console.log('Assistant trying to access other specialized route, redirecting to assistant dashboard');
          navigate("/assistant/dashboard", { replace: true });
          return;
        }
      }

      // For team routes, verify team token and guard access
      if (isTeamRoute) {
        if (!hasTeamToken && location.pathname !== '/team/login') {
          navigate("/team/login");
          return;
        }
        // Skip team token validation - let team pages handle their own auth
        if (hasTeamToken) {
          console.log('Team token found, skipping AuthProvider validation');
        }
        return; // Don't apply regular auth logic to team routes
      }

      // For nurse routes, verify nurse token and guard access
      if (isNurseRoute) {
        if (!hasNurseToken && location.pathname !== '/nurse/login') {
          navigate("/nurse/login");
          return;
        }
        // Skip nurse token validation - let nurse pages handle their own auth
        if (hasNurseToken) {
          console.log('Nurse token found, skipping AuthProvider validation');
        }
        return; // Don't apply regular auth logic to nurse routes
      }

      // For assistant routes, verify assistant token and guard access
      if (isAssistantRoute) {
        if (!hasAssistantToken && location.pathname !== '/assistant/login') {
          navigate("/assistant/login");
          return;
        }
        // Skip assistant token validation - let assistant pages handle their own auth
        if (hasAssistantToken) {
          console.log('Assistant token found, skipping AuthProvider validation');
        }
        return; // Don't apply regular auth logic to assistant routes
      }

      // If no token, redirect unauthenticated users to login
      if (!token && !isPublicRoute) {
        navigate("/login");
      }
      // ✅ FIXED: Only redirect if we have a token, finished loading, and have no user data
      // Don't redirect if we're still on a public route (like after just logging in)
      else if (token && !isAuthenticated && !isLoading && !isPublicRoute) {
        // Clear invalid token and redirect
        localStorage.removeItem("token");
        localStorage.removeItem("userType");
        navigate("/login");
      }
    }
  }, [isLoading, isAuthenticated, navigate, token, location.pathname, userType, queryClient]);

  // 🔹 Show Loading While Fetching Initial Data
  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-screen h-[100vh]">
        <span className="loader"></span>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ currentUser, currentDoctor, userType, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Hook to access auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
