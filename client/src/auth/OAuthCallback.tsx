import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

/**
 * OAuth Callback Handler
 * 
 * Handles OAuth2 callback from Google and Facebook
 * Exchanges authorization code for JWT token
 */
const OAuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // Get parameters from callback
        const token = searchParams.get('token');
        const userType = searchParams.get('userType');
        const provider = searchParams.get('provider');
        const error = searchParams.get('error');

        // Check for errors
        if (error) {
          console.error(`❌ OAuth error from ${provider}:`, error);
          toast({
            variant: "destructive",
            title: "Authentication Failed",
            description: `${provider} login failed. Please try again.`
          });
          navigate('/login', { replace: true });
          return;
        }

        // Validate token and userType
        if (!token || !userType) {
          console.error('❌ Invalid OAuth callback: missing token or userType');
          toast({
            variant: "destructive",
            title: "Invalid Response",
            description: "OAuth response missing required fields"
          });
          navigate('/login', { replace: true });
          return;
        }

        // Store authentication data based on user type
        console.log(`✅ OAuth successful via ${provider} for ${userType}`);
        
        if (userType === 'doctor') {
          localStorage.setItem('doctorToken', token);
          localStorage.setItem('userType', 'doctor');
        } else {
          localStorage.setItem('token', token);
          localStorage.setItem('userType', userType);
        }
        
        localStorage.setItem('oauthProvider', provider);

        // Dispatch auth change event
        window.dispatchEvent(new Event('authChange'));

        // Show success toast
        toast({
          title: "Success",
          description: `Logged in with ${provider}. Redirecting...`
        });

        // Redirect to appropriate dashboard
        setTimeout(() => {
          if (userType === 'doctor') {
            navigate('/doctor-dashboard', { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        }, 500);

      } catch (err) {
        console.error('Error handling OAuth callback:', err);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to process OAuth callback"
        });
        navigate('/login', { replace: true });
      } finally {
        setIsProcessing(false);
      }
    };

    handleOAuthCallback();
  }, [searchParams, navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        {isProcessing ? (
          <>
            <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-4 dark:border-blue-900 dark:border-t-blue-400"></div>
            <p className="text-slate-600 dark:text-slate-400">Processing OAuth callback...</p>
          </>
        ) : (
          <>
            <p className="text-slate-600 dark:text-slate-400">Redirecting...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
