import api from "@/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const ROLE_TOKEN_KEYS: Record<string, string> = {
  user: "token",
  doctor: "doctorToken",
  corporate: "corporateToken",
  nurse: "nurseToken",
  assistant: "assistantToken",
  lab: "labToken",
  admin: "adminToken",
  team: "teamToken",
  hospital: "hospitalToken",
  clinic: "clinicToken",
  pharmacy: "pharmacyToken",
  ambulance: "ambulanceToken",
  homecare: "homecareToken",
  insuranceCompany: "insuranceCompanyToken",
  insuranceBroker: "insuranceBrokerToken",
  tpa: "tpaToken",
  psu: "psuToken",
  insurer: "insurerToken",
  ngo: "ngoToken",
  hospitalInsurance: "hospitalInsuranceToken",
  crm: "crmToken",
};

const ALL_TOKEN_KEYS = Array.from(
  new Set([...Object.values(ROLE_TOKEN_KEYS), "token"])
);

export const clearAuthTokens = () => {
  const keysToClear = new Set([
    ...ALL_TOKEN_KEYS,
    "userType",
    "userId",
    "userData",
    "fcmToken",
  ]);

  keysToClear.forEach((key) => localStorage.removeItem(key));
};

export const setAuthData = (
  token: string,
  userType:
    | "user"
    | "doctor"
    | "corporate"
    | "nurse"
    | "assistant"
    | "lab"
    | "admin"
    | "team"
    | "hospital"
    | "clinic"
    | "pharmacy"
    | "ambulance"
    | "homecare"
    | "insuranceCompany"
    | "insuranceBroker"
    | "tpa"
    | "psu"
    | "insurer"
    | "ngo",
  userId?: string | number
) => {
  clearAuthTokens();
  localStorage.setItem("token", token);
  localStorage.setItem("userType", userType); // Store user type separately

  const roleTokenKey = ROLE_TOKEN_KEYS[userType];
  if (roleTokenKey && roleTokenKey !== "token") {
    localStorage.setItem(roleTokenKey, token);
  }
  
  // Store userId if provided
  if (userId) {
    localStorage.setItem("userId", userId.toString());
  }
  
  // Dispatch custom event to notify AuthProvider of auth change
  window.dispatchEvent(new CustomEvent('authChange'));
};

// Function to get user type
export const getUserType = () => {
  return localStorage.getItem("userType") as
    | "user"
    | "doctor"
    | "corporate"
    | "nurse"
    | "assistant"
    | "admin"
    | "team"
    | "hospital"
    | "clinic"
    | "lab"
    | "pharmacy"
    | "ambulance"
    | "homecare"
    | "insuranceCompany"
    | "insuranceBroker"
    | "tpa"
    | "psu"
    | "insurer"
    | "ngo"
    | null;
};

// Function to get stored token
export const getToken = () => {
  const normalizeToken = (raw: string | null): string | null => {
    if (!raw) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();
    if (
      lower === 'undefined' ||
      lower === 'null' ||
      lower === 'nan' ||
      lower === 'false' ||
      lower === '[object object]'
    ) {
      return null;
    }

    const withoutBearer = trimmed.replace(/^bearer\s+/i, '').trim();
    const jwtParts = withoutBearer.split('.');
    if (jwtParts.length !== 3) return null;
    if (jwtParts.some((part) => !part || part.length < 2)) return null;

    return withoutBearer;
  };

  const userType = getUserType();
  if (userType) {
    const preferredKey = ROLE_TOKEN_KEYS[userType];
    if (preferredKey) {
      const preferredRawToken = localStorage.getItem(preferredKey);
      const preferredToken = normalizeToken(preferredRawToken);
      if (preferredToken) {
        return preferredToken;
      }
      if (preferredRawToken) {
        localStorage.removeItem(preferredKey);
      }
    }
  }

  for (const key of ALL_TOKEN_KEYS) {
    const rawToken = localStorage.getItem(key);
    const token = normalizeToken(rawToken);
    if (token) {
      return token;
    }
    if (rawToken) {
      localStorage.removeItem(key);
    }
  }

  return null;
};

// Register User & Store Token
const registerUser = async (userData: any) => {
  const { data } = await api.post(`/users/register`, userData);
  const userId = data.user?.id || data.user?.user_id;
  setAuthData(data.token, "user", userId);
  return data;
};

// 🔹 Dynamic Login Function (Supports all role-specific endpoints)
type ValidLoginType =
  | "user"
  | "doctor"
  | "corporate"
  | "nurse"
  | "assistant"
  | "lab"
  | "admin"
  | "team"
  | "hospital"
  | "clinic"
  | "pharmacy"
  | "ambulance"
  | "homecare"
  | "insuranceCompany"
  | "insuranceBroker"
  | "tpa"
  | "psu"
  | "insurer"
  | "ngo";

const LOGIN_ENDPOINTS: Record<ValidLoginType, string> = {
  user: "/users/login",
  doctor: "/doctors/login",
  corporate: "/corporate/login",
  nurse: "/nurse/login",
  assistant: "/assistant/login",
  lab: "/lab/login",
  admin: "/admin/login",
  team: "/team/login",
  hospital: "/hospital/login",
  clinic: "/clinic/login",
  pharmacy: "/pharmacy/login",
  ambulance: "/ambulance/login",
  homecare: "/homecare/login",
  insuranceCompany: "/insurance-company/login",
  insuranceBroker: "/insurance-broker/login",
  tpa: "/tpa/login",
  psu: "/psu/login",
  insurer: "/insurer/login",
  ngo: "/ngo/login"
};

const login = async ({ credentials, loginType }: { credentials: any; loginType: ValidLoginType }) => {
  if (!loginType) {
    throw new Error('loginType is required for login.');
  }

  const endpoint = LOGIN_ENDPOINTS[loginType];
  if (!endpoint) {
    throw new Error(`Unsupported loginType: ${loginType}`);
  }

  // Use skipAuth to prevent existing tokens from being sent with login requests
  const { data } = await api.post(endpoint, credentials, { skipAuth: true } as any);
  
  // Extract userId based on login type
  let userId: string | number | undefined;
  if (loginType === "doctor" && data.doctor) {
    userId = data.doctor.id || data.doctor.doctor_id;
  } else if (loginType === "tpa" && data.user) {
    // TPA returns data in 'user' field
    userId = data.user.id;
  } else if (loginType === "psu" && data.psu) {
    userId = data.psu.id;
  } else if (loginType === "insurer" && data.insurer) {
    userId = data.insurer.id;
  } else if (loginType === "ngo" && data.ngo) {
    userId = data.ngo.id;
  } else if (data.user) {
    userId = data.user.id || data.user.user_id;
  }
  
  setAuthData(data.token, loginType, userId);
  
  // Return data in a consistent format
  return {
    token: data.token,
    requirePasswordChange: data.requirePasswordChange === true,
    user:
      loginType === "user" ||
      loginType === "corporate" ||
      loginType === "nurse" ||
      loginType === "assistant"
        ? data.user
        : null,
    doctor: loginType === "doctor" ? data.doctor : null,
    corporate: loginType === "corporate" ? data.corporate : null,
  };
};

// 🔹 Updated useLogin Hook (Accepts loginType)
export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { token: string; requirePasswordChange?: boolean; user?: any; doctor?: any; corporate?: any; tpa?: any; psu?: any; insurer?: any; ngo?: any },
    Error,
    {
      credentials: { email: string; password: string };
      loginType: ValidLoginType;
    }
  >({
    mutationFn: ({ credentials, loginType }) =>
      login({ credentials, loginType }),
    onSuccess: (data, variables) => {
      // Set the appropriate data in React Query cache with token as part of query key
      if (variables.loginType === "doctor") {
        queryClient.setQueryData(["currentDoctor", data.token], data.doctor);
        queryClient.setQueryData(["currentUser", data.token], null);
        queryClient.setQueryData(["currentCorporate", data.token], null);
      } else if (variables.loginType === "corporate") {
        queryClient.setQueryData(["currentCorporate", data.token], data.corporate);
        queryClient.setQueryData(["currentUser", data.token], data.user);
        queryClient.setQueryData(["currentDoctor", data.token], null);
      } else {
        queryClient.setQueryData(["currentUser", data.token], data.user);
        queryClient.setQueryData(["currentDoctor", data.token], null);
        queryClient.setQueryData(["currentCorporate", data.token], null);
      }
      
      // Invalidate to trigger refetch with new token
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      queryClient.invalidateQueries({ queryKey: ["currentDoctor"] });
      queryClient.invalidateQueries({ queryKey: ["currentCorporate"] });
    },
  });
};

// useRegister (Remains the Same)
export const useRegister = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registerUser,
    onSuccess: (data) => {
      queryClient.setQueryData(["currentUser"], data.user);
    },
  });
};

// useLogout (Remains the Same)
export const useLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await Promise.resolve(); // Mimic async behavior
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent('authChange'));
      queryClient.setQueryData(["currentUser"], null);
      queryClient.setQueryData(["currentDoctor"], null);
    },
  });
};

// doctor register

const registerDoctor = async (userData) => {
  const formattedData = {
    ...userData,
    qualifications: (userData.qualifications || []).filter((q) => typeof q === 'string' && q.trim() !== ""),
    experience: parseInt(userData.experience, 10),
  };
  const { data } = await api.post(`/doctors/register`, formattedData);
  // Only set auth data if a token was issued (immediate activation).
  // For pending-activation accounts, no token is returned — skip setAuthData
  // to avoid corrupting auth state and triggering an unintended logout.
  if (data.token) {
    const doctorId = data.doctor?.id || data.doctor?.doctor_id;
    setAuthData(data.token, "doctor", doctorId);
  }
  return data;
};

export const useDocRegister = () => {
  const queryClient = useQueryClient();
  return useMutation<any>({
    mutationFn: registerDoctor,
    onSuccess: (data) => {
      queryClient.setQueryData(["currentDoctor"], data.doctor);
    },
  });
};
