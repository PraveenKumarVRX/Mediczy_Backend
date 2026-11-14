import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { redeemOAuthCode } from './oauthPkce';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
    : typeof window !== 'undefined' ? window.location.origin : '');

/**
 * OAuth Callback Handler
 * 
 * Handles OAuth2 callback from Google and Facebook.
 *
 * PKCE flow (audit M20): the URL carries a one-time `code` and our `state`;
 * the code is redeemed with the verifier this browser kept (oauthPkce.ts).
 * Legacy flow: the URL carries `token` — only for pages started before the
 * PKCE release, and refused by the server once OAUTH_REQUIRE_PKCE is on.
 */
const OAuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);
  // A one-time code may be redeemed once; React may run this effect twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const handleOAuthCallback = async () => {
      try {
        // Get parameters from callback
        const code = searchParams.get('code');
        let token = searchParams.get('token');
        let userType = searchParams.get('userType');
        let provider = searchParams.get('provider');
        let refreshToken: string | undefined;
        const error = searchParams.get('error');

        // Remove the code/token from the address bar and history right away.
        if (code || token) window.history.replaceState(null, '', window.location.pathname);

        if (code && !error) {
          try {
            const tokens = await redeemOAuthCode(API_BASE_URL, code, searchParams.get('state'));
            token = tokens.token;
            userType = tokens.userType;
            provider = tokens.provider || provider;
            refreshToken = tokens.refreshToken;
          } catch (exchangeError) {
            toast({
              variant: "destructive",
              title: "Sign-in not completed",
              description: exchangeError instanceof Error ? exchangeError.message : 'Please sign in again.'
            });
            navigate('/login', { replace: true });
            return;
          }
        }

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
          if (refreshToken) localStorage.setItem('doctorRefreshToken', refreshToken);
        } else {
          localStorage.setItem('token', token);
          localStorage.setItem('userType', userType);
          if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        }
        
        if (provider) localStorage.setItem('oauthProvider', provider);

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
