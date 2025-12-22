import api from "@/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
console.log("Auth Base URL:", BASE_URL);

const setAuthData = (
  token: string,
  userType: "user" | "doctor" | "corporate" | "nurse" | "assistant"
) => {
  localStorage.setItem("token", token);
  localStorage.setItem("userType", userType); // Store user type separately
};

// Function to get user type
export const getUserType = () => {
  return localStorage.getItem("userType") as
    | "user"
    | "doctor"
    | "corporate"
    | "nurse"
    | "assistant"
    | null;
};

// Function to get stored token
export const getToken = () => {
  // Check for different token types based on user role
  return localStorage.getItem("token") || 
         localStorage.getItem("nurseToken") || 
         localStorage.getItem("assistantToken");
};

// Register User & Store Token
const registerUser = async (userData: any) => {
  const { data } = await api.post(`/users/register`, userData);
  setAuthData(data.token, "user");
  return data;
};

// 🔹 Dynamic Login Function (Supports User, Doctor, Corporate, Nurse, Assistant)
const login = async ({ credentials, loginType }) => {
  const endpoint =
    loginType === "doctor" ? `/doctors/login` : `/users/login`;

  const { data } = await api.post(endpoint, credentials);
  setAuthData(data.token, loginType);
  
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
  };
};

// 🔹 Updated useLogin Hook (Accepts loginType)
export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { token: string; user?: any; doctor?: any },
    Error,
    {
      credentials: { email: string; password: string };
      loginType: "user" | "doctor" | "corporate" | "nurse" | "assistant";
    }
  >({
    mutationFn: ({ credentials, loginType }) =>
      login({ credentials, loginType }),
    onSuccess: (data, variables) => {
      // Clear both user and doctor data first
      queryClient.setQueryData(["currentUser"], null);
      queryClient.setQueryData(["currentDoctor"], null);
      
      // Then set the appropriate data
      if (variables.loginType === "doctor") {
        queryClient.setQueryData(["currentDoctor"], data.doctor);
      } else {
        queryClient.setQueryData(["currentUser"], data.user);
      }
      
      // Force a refetch of the profile
      if (variables.loginType === "doctor") {
        queryClient.invalidateQueries({ queryKey: ["currentDoctor"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      }
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
  setAuthData(data.token, "doctor");

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
