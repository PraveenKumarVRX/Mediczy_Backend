import { createContext, useContext, ReactNode, useState, useEffect } from "react";

interface AuthContextType {
  currentUser: any | null;
  currentDoctor: any | null;
  userType: "user" | "doctor" | null;
  isLoading: boolean;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const SimpleAuthProvider = ({ children }: AuthProviderProps) => {
  const [authData, setAuthData] = useState<AuthContextType>({
    currentUser: null,
    currentDoctor: null,
    userType: null,
    isLoading: true,
    refreshAuth: () => {}
  });

  const loadAuthData = () => {
    const token = localStorage.getItem("token");
    const userType = localStorage.getItem("userType") as "user" | "doctor" | "corporate" | "nurse" | "assistant" | null;
    const userData = localStorage.getItem("userData");
    const doctorData = localStorage.getItem("doctorData");

    if (token && userType) {
      const currentUser = (userType === "user" || userType === "corporate" || userType === "nurse" || userType === "assistant") && userData ? JSON.parse(userData) : null;
      const currentDoctor = userType === "doctor" && doctorData ? JSON.parse(doctorData) : null;
      
      setAuthData({
        currentUser,
        currentDoctor,
        userType: userType as "user" | "doctor",
        isLoading: false,
        refreshAuth: loadAuthData
      });
    } else {
      setAuthData({
        currentUser: null,
        currentDoctor: null,
        userType: null,
        isLoading: false,
        refreshAuth: loadAuthData
      });
    }
  };

  useEffect(() => {
    loadAuthData();

    // Listen for storage changes (login/logout in other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "token" || e.key === "userType" || e.key === "userData" || e.key === "doctorData") {
        loadAuthData();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return (
    <AuthContext.Provider value={authData}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};