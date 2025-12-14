import api from "@/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";
console.log("Auth Base URL:", BASE_URL);

const setAuthData = (
  token: string,
  userType: "user" | "doctor" | "corporate" | "nurse" | "assistant",
  userId?: string | number
) => {
  localStorage.setItem("token", token);
  localStorage.setItem("userType", userType); // Store user type separately
  
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
    | null;
};

// Function to get stored token
export const getToken = () => {
  // Check for different token types based on user role
  return (
    localStorage.getItem("adminToken") ||
    localStorage.getItem("teamToken") ||
    localStorage.getItem("doctorToken") ||
    localStorage.getItem("nurseToken") ||
    localStorage.getItem("assistantToken") ||
    localStorage.getItem("corporateToken") ||
    localStorage.getItem("hospitalToken") ||
    localStorage.getItem("clinicToken") ||
    localStorage.getItem("labToken") ||
    localStorage.getItem("pharmacyToken") ||
    localStorage.getItem("ambulanceToken") ||
    localStorage.getItem("homecareToken") ||
    localStorage.getItem("insuranceCompanyToken") ||
    localStorage.getItem("insuranceBrokerToken") ||
    localStorage.getItem("tpaToken") ||
    localStorage.getItem("token")
  );
};

// Register User & Store Token
const registerUser = async (userData: any) => {
  const { data } = await api.post(`/users/register`, userData);
  const userId = data.user?.id || data.user?.user_id;
  setAuthData(data.token, "user", userId);
  return data;
};

// 🔹 Dynamic Login Function (Supports User, Doctor, Corporate, Nurse, Assistant)
const login = async ({ credentials, loginType }) => {
  let endpoint = `/users/login`;

  if (loginType === "doctor") {
    endpoint = `/doctors/login`;
  } else if (loginType === "corporate") {
    endpoint = `/corporate/auth/login`;
  }

  const { data } = await api.post(endpoint, credentials);
  
  // Extract userId based on login type
  let userId: string | number | undefined;
  if (loginType === "doctor" && data.doctor) {
    userId = data.doctor.id || data.doctor.doctor_id;
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
    { token: string; user?: any; doctor?: any; corporate?: any },
    Error,
    {
      credentials: { email: string; password: string };
      loginType: "user" | "doctor" | "corporate" | "nurse" | "assistant";
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
      localStorage.removeItem("token");
      localStorage.removeItem("userType");
      localStorage.removeItem("userId");
      localStorage.removeItem("fcmToken");
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
