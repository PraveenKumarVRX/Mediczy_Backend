import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ThemeProvider } from "./utils/theme.provider";
import { AuthProvider } from "./auth/AuthProvider";
import { SocketProvider } from "@/context/SocketContext";
import { DebugProvider } from "@/contexts/DebugContext";
import { VideoCallProvider } from "@/context/VideoCallContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppRoutes from "@/routes";
import { queryClient } from "@/lib/queryClient";

const OptionalGoogleProvider = ({ children }: {children: React.ReactNode}) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return clientId ? <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider> : <>{children}</>;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <OptionalGoogleProvider>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              {import.meta.env.DEV ? (
                <DebugProvider>
                  <AuthProvider>
                    <SocketProvider>
                      <VideoCallProvider>
                        <AppRoutes />
                      </VideoCallProvider>
                    </SocketProvider>
                  </AuthProvider>
                </DebugProvider>
              ) : (
                <AuthProvider>
                  <SocketProvider>
                    <VideoCallProvider>
                      <AppRoutes />
                    </VideoCallProvider>
                  </SocketProvider>
                </AuthProvider>
              )}
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </OptionalGoogleProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
