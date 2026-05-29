import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./utils/theme.provider";
import { AuthProvider } from "./auth/AuthProvider";
import { SocketProvider } from "@/context/SocketContext";
import { DebugProvider } from "@/contexts/DebugContext";
import { VideoCallProvider } from "@/context/VideoCallContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppRoutes from "@/routes";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <GoogleOAuthProvider
        clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}
        onScriptLoadError={() => {
          if (process.env.NODE_ENV === 'development') {
            console.error("Google Script failed to load");
          }
        }}
      >
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <DebugProvider>
                <AuthProvider>
                  <SocketProvider>
                    <VideoCallProvider>
                      <AppRoutes />
                    </VideoCallProvider>
                  </SocketProvider>
                </AuthProvider>
              </DebugProvider>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </GoogleOAuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
