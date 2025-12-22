import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./utils/theme.provider";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./auth/AuthProvider";
import { SocketProvider } from "@/context/SocketContext";
// import { initializeFirebaseMessaging } from "@/lib/firebase-config";
import AppRoutes from "@/routes";
import { useEffect } from "react";

const queryClient = new QueryClient();

const App = () => {
  // Firebase messaging disabled for production SSL compatibility
  // useEffect(() => {
  //   initializeFirebaseMessaging().catch(console.error);
  // }, []);

  return (
    <QueryClientProvider client={queryClient}>
    {import.meta.env.VITE_GOOGLE_CLIENT_ID && false ? (
    <GoogleOAuthProvider
      clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}
      onScriptLoadError={() => console.error("Google Script failed to load")}
    >
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <SocketProvider>
                <AppRoutes />
              </SocketProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
    ) : (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <SocketProvider>
                <AppRoutes />
              </SocketProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    )}
  </QueryClientProvider>
);
}

export default App;
