import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Building2, CheckCircle2, HeartPulse, Shield, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLogin } from "@/hooks/auth";
import { initializeFirebaseMessaging } from "@/lib/firebase-config";

/**
 * HR signs in with a username; the company account still signs in with its email.
 *
 * HR is also an employee, and users.email is UNIQUE -- while an HR person's work address is held
 * by their hr_staff row, that same person cannot also have an employee row. So the field takes
 * either: anything containing "@" is sent as `email`, anything else as `username`.
 */
const formSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or corporate email")
    .refine(
      (v) => (v.includes("@")
        ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
        : /^[a-zA-Z0-9._-]{3,100}$/.test(v)),
      "Enter a valid username, or a valid corporate email",
    ),
  password: z.string().min(1, "Password is required"),
});

const CorporateLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isPending, setIsPending] = useState(false);

  // Check if already authenticated
  useEffect(() => {
    // Clear any other role tokens that might interfere
    localStorage.removeItem('adminToken');
    localStorage.removeItem('teamToken');
    localStorage.removeItem('nurseToken');
    localStorage.removeItem('assistantToken');
    localStorage.removeItem('doctorToken');
    localStorage.removeItem('token');
    localStorage.removeItem('userType');

    const token = localStorage.getItem('corporateToken');
    if (token) {
      console.log('✅ Corporate already authenticated, redirecting...');
      navigate('/corporate/dashboard');
      return;
    }

    setIsCheckingAuth(false);
  }, [navigate]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const loginMutation = useLogin();

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // The server validator accepts `username` OR `email`; send whichever this is.
    const { identifier, password } = values;
    const credentials = identifier.includes("@")
      ? { email: identifier.toLowerCase(), password }
      : { username: identifier, password };
    loginMutation.mutate(
      { credentials, loginType: "corporate" },
      {
        onSuccess: (data) => {
          // Store corporate profile data for help/support ticket defaults.
          if (data?.corporate) {
            localStorage.setItem(
              'corporateData',
              JSON.stringify({
                id: data.corporate.id,
                email: data.corporate.email,
                name: data.corporate.companyName,
                companyName: data.corporate.companyName,
                contactPerson: data.corporate.contactPerson,
                type: data.corporate.packageType,
                packageType: data.corporate.packageType,
              })
            );
          }

          toast({
            title: "Welcome back",
            description: "Redirecting you to the corporate command center...",
          });
          
          // Initialize Firebase messaging after successful login
          setTimeout(() => {
            initializeFirebaseMessaging().catch(err => {
              console.log('Firebase messaging initialization skipped:', err.message);
            });
          }, 500);
          
          navigate("/corporate/dashboard");
        },
        onError: (error) => {
          if ((error as any)?.response?.data?.pending) { setIsPending(true); return; }
          toast({
            variant: "destructive",
            title: "Login failed",
            description:
              (error as any)?.response?.data?.message ||
              "We couldn't verify those credentials",
          });
        },
      }
    );
  };

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div
        className="relative hidden lg:flex flex-col gap-8 bg-cover bg-center text-white p-10"
        style={{ backgroundImage: 'url("../../aiH.jpg")' }}
      >
        <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <HeartPulse className="h-6 w-6" />
          Mediqzy Corporate Wellness
        </div>
        <div className="mt-auto space-y-5 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Data-rich insights for every employee cohort
          </h2>
          <div className="space-y-4">
            {[
              {
                title: "Smart eligibility & entitlements",
                copy: "Instant view of OPD balance, diagnostics usage, and onboarding status per employee",
              },
              {
                title: "Live risk heatmaps",
                copy: "Track chronic & lifestyle risks with proactive nudges and escalation flows",
              },
              {
                title: "Execution-ready playbooks",
                copy: "Deploy vaccination drives, health camps, and 1:1 care navigation in a click",
              },
            ].map((highlight) => (
              <div key={highlight.title} className="bg-white/10 rounded-xl p-4">
                <p className="text-sm uppercase tracking-wider text-gray-200">
                  {highlight.title}
                </p>
                <p className="text-base text-gray-100/90">{highlight.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center py-12 px-6 bg-background">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="space-y-3 text-center">
            <Badge variant="secondary" className="uppercase tracking-wide">
              Corporate Access
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">
              HR / Corporate Login
            </h1>
            <p className="text-muted-foreground text-sm">
              Authenticate with the credentials shared by the Mediqzy success team
            </p>
          </div>

          <Card className="shadow-lg">
            <CardContent className="pt-6">
              {isPending && (
                <div className="mb-4 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <Clock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800 text-sm">Account Under Review</p>
                    <p className="text-amber-700 text-xs mt-1">Your registration is being reviewed. You'll receive an email with login credentials once approved (24–48 hours).</p>
                  </div>
                </div>
              )}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="identifier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username or Corporate Email</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            autoComplete="username"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="your.username"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          HR accounts sign in with a username. Company accounts use their corporate email.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Secure Password</FormLabel>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                        <FormControl>
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Authenticating..." : "Enter Command Center"}
                  </Button>
                </form>
              </Form>

              <Separator className="my-6" />

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Shield className="h-4 w-4 mt-0.5" />
                  <p>Role-based security, audit logging, and SSO-ready architecture.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 mt-0.5" />
                  <p>Manage employees, dependents, and wellness programs from one pane.</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 mt-0.5" />
                  <p>Need access? Ask your Mediqzy account owner to provision a login.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground space-y-1">
            <p>
              Need help? Email <a className="underline" href="mailto:success@mediqzy.com">success@mediqzy.com</a>
            </p>
            <button type="button" onClick={() => navigate('/corporate/register')} className="w-full h-11 rounded-xl border-2 border-violet-500 text-violet-600 font-bold text-sm hover:bg-violet-50 active:scale-95 transition-all mt-1">
                New company? Register here
              </button>
            <p>
              Looking for the general login? <Link to="/login" className="text-primary underline">Return here</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CorporateLogin;
