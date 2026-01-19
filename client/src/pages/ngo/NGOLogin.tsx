import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Shield, CheckCircle2, HeartPulse, Heart, Users } from "lucide-react";
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

const formSchema = z.object({
  email: z.string().email("Enter a valid NGO email"),
  password: z.string().min(1, "Password is required"),
});

const NGOLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if already authenticated
  useEffect(() => {
    // Clear any other role tokens that might interfere
    localStorage.removeItem('adminToken');
    localStorage.removeItem('teamToken');
    localStorage.removeItem('nurseToken');
    localStorage.removeItem('assistantToken');
    localStorage.removeItem('doctorToken');
    localStorage.removeItem('token');
    localStorage.removeItem('corporateToken');
    localStorage.removeItem('userType');

    const token = localStorage.getItem('ngoToken');
    if (token) {
      console.log('✅ NGO already authenticated, redirecting...');
      navigate('/ngo/dashboard');
      return;
    }

    setIsCheckingAuth(false);
  }, [navigate]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useLogin();

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    loginMutation.mutate(
      { credentials: values, loginType: "ngo" },
      {
        onSuccess: (data) => {
          // Store NGO profile data
          if (data?.ngo) {
            localStorage.setItem(
              'ngoData',
              JSON.stringify({
                id: data.ngo.id,
                email: data.ngo.email,
                name: data.ngo.organizationName,
                registrationNumber: data.ngo.registrationNumber,
              })
            );
          }

          toast({
            title: "Welcome back",
            description: "Redirecting you to NGO dashboard...",
          });
          
          // Initialize Firebase messaging after successful login
          setTimeout(() => {
            initializeFirebaseMessaging().catch(err => {
              console.log('Firebase messaging initialization skipped:', err.message);
            });
          }, 500);
          
          navigate("/ngo/dashboard");
        },
        onError: (error) => {
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
          Mediqzy NGO Portal
        </div>
        <div className="mt-auto space-y-5 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Empowering community health programs and outreach
          </h2>
          <div className="space-y-4">
            {[
              {
                title: "Community Health Programs",
                copy: "Manage health camps, vaccination drives, and preventive care initiatives",
              },
              {
                title: "Beneficiary Management",
                copy: "Track beneficiaries, services delivered, and health outcomes",
              },
              {
                title: "Impact Analytics",
                copy: "Monitor program effectiveness, reach, and community health improvements",
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
              NGO Access
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">
              Non-Governmental Organization Login
            </h1>
            <p className="text-muted-foreground text-sm">
              Access your NGO dashboard for community health program management
            </p>
          </div>

          <Card className="shadow-lg">
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NGO Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="admin@ngo.org" {...field} />
                        </FormControl>
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
                    {loginMutation.isPending ? "Authenticating..." : "Access NGO Dashboard"}
                  </Button>
                </form>
              </Form>

              <Separator className="my-6" />

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Heart className="h-4 w-4 mt-0.5" />
                  <p>Platform designed for community health and social impact programs.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 mt-0.5" />
                  <p>Track beneficiaries, services, and measure program effectiveness.</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 mt-0.5" />
                  <p>Coordinate health camps, screenings, and outreach activities.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground space-y-1">
            <p>
              Need help? Email <a className="underline" href="mailto:support@mediqzy.com">support@mediqzy.com</a>
            </p>
            <p>
              Looking for the general login? <Link to="/login" className="text-primary underline">Return here</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NGOLogin;
