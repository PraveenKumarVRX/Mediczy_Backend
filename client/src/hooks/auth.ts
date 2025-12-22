import api from "@/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";
console.log("Auth Base URL:", BASE_URL);

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

const setAuthData = (
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
  const userType = getUserType();
  if (userType) {
    const preferredKey = ROLE_TOKEN_KEYS[userType];
    if (preferredKey) {
      const preferredToken = localStorage.getItem(preferredKey);
      if (preferredToken) {
        return preferredToken;
      }
    }
  }

  for (const key of ALL_TOKEN_KEYS) {
    const token = localStorage.getItem(key);
    if (token) {
      return token;
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

// 🔹 Dynamic Login Function (Supports User, Doctor, Corporate, Nurse, Assistant, TPA, PSU, Insurer, NGO)
const login = async ({ credentials, loginType }) => {
  let endpoint = `/users/login`;

  if (loginType === "doctor") {
    endpoint = `/doctors/login`;
  } else if (loginType === "corporate") {
    endpoint = `/corporate/login`;
  } else if (loginType === "tpa") {
    endpoint = `/tpa/login`;
  } else if (loginType === "psu") {
    endpoint = `/psu/login`;
  } else if (loginType === "insurer") {
    endpoint = `/insurer/login`;
  } else if (loginType === "ngo") {
    endpoint = `/ngo/login`;
  }

  const { data } = await api.post(endpoint, credentials);
  
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
    { token: string; user?: any; doctor?: any; corporate?: any; tpa?: any; psu?: any; insurer?: any; ngo?: any },
    Error,
    {
      credentials: { email: string; password: string };
      loginType: "user" | "doctor" | "corporate" | "nurse" | "assistant" | "lab" | "tpa" | "psu" | "insurer" | "ngo";
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
    qualifications: userData.qualifications.filter((q) => q.trim() !== ""),
    experience: parseInt(userData.experience, 10),
  };
  console.log(formattedData, "ahhah");
  const { data } = await api.post(`/doctors/register`, formattedData);
  const doctorId = data.doctor?.id || data.doctor?.doctor_id;
  setAuthData(data.token, "doctor", doctorId);

  return data;
};

export const useDocRegister = () => {
  const queryClient = useQueryClient();
  return useMutation<any>({
    mutationFn: registerDoctor,
    onSuccess: (data) => {
      console.log(data, "success");

      queryClient.setQueryData(["currentDoctor"], data.doctor);
    },
  });
};
