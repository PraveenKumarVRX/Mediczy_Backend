import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { BRAND } from "@/config/brand";
import { MediqzyLogo3D } from "@/components/ui/MediqzyLogo3D";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Chrome, Facebook, Calendar, Building2, User, CheckCircle2, Loader2 } from "lucide-react";
import "../index.css";
import { OTPInput } from "@/components/OTPInput";
import api from "@/utils/api";
// setAuthData intentionally omitted – users must log in after signup

// ─── Types ───────────────────────────────────────────────────────────────────
type MemberType = "individual" | "corporate" | null;

interface Corporate {
  id: number;
  name: string;
}

interface EmployeeInfo {
  dbId: number;
  employeeId: string;
  department: string | null;
  designation: string | null;
  corporateName: string;
  firstName: string | null;
  lastName: string | null;
}

interface SignupPayload {
  email: string;
  phoneNumber: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
}

const formSchema = z.object({
  email: z.string().email("Must be a valid email"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Must contain uppercase, lowercase and a number"
    ),
  firstName: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .max(20, "First name must not exceed 20 characters"),
  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .max(20, "Last name must not exceed 20 characters"),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  gender: z.enum(["Male", "Female", "Other"], {
    required_error: "Please select a gender",
  }),
});

// Minimal schema for corporate signup — name comes from employee record
const corpFormSchema = z.object({
  email: z.string().email("Must be a valid email"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Must contain uppercase, lowercase and a number"
    ),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number"),
});

// ─── Component ───────────────────────────────────────────────────────────────
const Register = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Member type ──
  const [memberType, setMemberType] = useState<MemberType>(null);

  // ── Corporate state ──
  const [corporates, setCorporates] = useState<Corporate[]>([]);
  const [corporatesLoading, setCorporatesLoading] = useState(false);
  const [corporateSearch, setCorporateSearch] = useState("");
  const [showCorporateList, setShowCorporateList] = useState(false);
  const [selectedCorporateId, setSelectedCorporateId] = useState<string>("");
  const [selectedCorporateName, setSelectedCorporateName] = useState("");
  const [employeeIdInput, setEmployeeIdInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);

  // ── OTP / registration state ──
  const [showPassword, setShowPassword] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [whatsappOtp, setWhatsappOtp] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [verifyingWhatsapp, setVerifyingWhatsapp] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [signupData, setSignupData] = useState<SignupPayload | null>(null);
  // Corporate name inputs (used when employee record has no name)
  const [corpFirstName, setCorpFirstName] = useState("");
  const [corpLastName, setCorpLastName] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
      dateOfBirth: "",
      gender: undefined,
    },
  });

  const corpForm = useForm<z.infer<typeof corpFormSchema>>({
    resolver: zodResolver(corpFormSchema),
    defaultValues: { email: "", password: "", phoneNumber: "" },
  });

  // Search corporates on typeahead (min 3 chars)
  useEffect(() => {
    if (memberType !== "corporate" || corporateSearch.length < 3) {
      setCorporates([]);
      setShowCorporateList(false);
      return;
    }
    setCorporatesLoading(true);
    setShowCorporateList(true);
    const timer = setTimeout(() => {
      api
        .get("/users/register/corporates", { skipAuth: true } as any)
        .then((res) => {
          const all: Corporate[] = res.data.corporates || [];
          const q = corporateSearch.toLowerCase();
          setCorporates(all.filter((c) => c.name.toLowerCase().includes(q)));
        })
        .catch(() =>
          toast({ variant: "destructive", title: "Error", description: "Could not search company list." })
        )
        .finally(() => setCorporatesLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [corporateSearch, memberType]);

  // Handle OAuth2 Signup
  const handleOAuthSignup = (provider: 'google' | 'facebook') => {
    const baseUrl =
      import.meta.env.VITE_API_BASE_URL ||
      (import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
        : window.location.origin);
    window.location.href = `${baseUrl}/api/auth/${provider}`;
  };

  // ── Corporate employee validation ──
  const handleValidateEmployee = async () => {
    if (!selectedCorporateId || !employeeIdInput.trim()) {
      toast({ variant: "destructive", title: "Required", description: "Select your company and enter your Employee ID." });
      return;
    }
    setValidating(true);
    try {
      const { data } = await api.post(
        "/users/register/validate-employee",
        { corporateId: parseInt(selectedCorporateId), employeeId: employeeIdInput.trim() },
        { skipAuth: true } as any
      );
      setEmployeeInfo(data.employee);
      toast({ title: "Employee verified", description: `Verified as employee of ${data.employee.corporateName}.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Validation failed", description: error?.response?.data?.message || "Employee ID not found." });
    } finally {
      setValidating(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setOtpSending(true);
    try {
      await api.post("/users/register/send-otp", {
        email: values.email,
        phoneNumber: values.phoneNumber,
        firstName: values.firstName,
      }, { skipAuth: true } as any);
      setSignupData(values);
      setOtpStep(true);
      setEmailOtp("");
      setWhatsappOtp("");
      setEmailVerified(false);
      setWhatsappVerified(false);
      toast({ title: "OTP sent", description: "Check your email and WhatsApp for the OTP codes." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error?.response?.data?.message || "Failed to send OTP" });
    } finally {
      setOtpSending(false);
    }
  };

  const onCorpSubmit = async (values: z.infer<typeof corpFormSchema>) => {
    const firstName = (employeeInfo?.firstName || corpFirstName).trim();
    const lastName = (employeeInfo?.lastName || corpLastName).trim();
    if (!firstName || !lastName) {
      toast({ variant: "destructive", title: "Name required", description: "Please enter your first and last name." });
      return;
    }
    setOtpSending(true);
    try {
      await api.post("/users/register/send-otp", {
        email: values.email,
        phoneNumber: values.phoneNumber,
        firstName,
      }, { skipAuth: true } as any);
      setSignupData({ ...values, firstName, lastName });
      setOtpStep(true);
      setEmailOtp("");
      setWhatsappOtp("");
      setEmailVerified(false);
      setWhatsappVerified(false);
      toast({ title: "OTP sent", description: "Check your email and WhatsApp for the OTP codes." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error?.response?.data?.message || "Failed to send OTP" });
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!signupData) return;
    if (emailOtp.length !== 6) {
      toast({ variant: "destructive", title: "Invalid OTP", description: "Email OTP must be 6 digits." });
      return;
    }
    setVerifyingEmail(true);
    try {
      await api.post("/users/register/verify-email-otp", {
        email: signupData.email,
        phoneNumber: signupData.phoneNumber,
        code: emailOtp,
      }, { skipAuth: true } as any);
      setEmailVerified(true);
      toast({ title: "Email verified", description: "Email OTP verified successfully." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Verification failed", description: error?.response?.data?.message || "Failed to verify email OTP" });
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleVerifyWhatsappOtp = async () => {
    if (!signupData) return;
    if (whatsappOtp.length !== 6) {
      toast({ variant: "destructive", title: "Invalid OTP", description: "WhatsApp OTP must be 6 digits." });
      return;
    }
    setVerifyingWhatsapp(true);
    try {
      await api.post("/users/register/verify-whatsapp-otp", {
        email: signupData.email,
        phoneNumber: signupData.phoneNumber,
        code: whatsappOtp,
      }, { skipAuth: true } as any);
      setWhatsappVerified(true);
      toast({ title: "WhatsApp verified", description: "WhatsApp OTP verified successfully." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Verification failed", description: error?.response?.data?.message || "Failed to verify WhatsApp OTP" });
    } finally {
      setVerifyingWhatsapp(false);
    }
  };

  const handleCompleteRegistration = async () => {
    if (!signupData) return;
    if (!emailVerified) {
      toast({ variant: "destructive", title: "Email verification required", description: "Please verify your email OTP to continue." });
      return;
    }
    setRegistering(true);
    try {
      await api.post(
        "/users/register/verify-otp",
        {
          ...signupData,
          memberType: memberType || "individual",
          corporateId: memberType === "corporate" ? parseInt(selectedCorporateId) : undefined,
          employeeDbId: memberType === "corporate" ? employeeInfo?.dbId : undefined,
        },
        { skipAuth: true } as any
      );
      toast({
        title: "Account created!",
        description:
          memberType === "individual"
            ? "You've been enrolled in the Free Basic plan. Please log in to get started."
            : "Your corporate account is ready. Please log in to get started.",
      });
      navigate("/login");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error?.response?.data?.message || "Failed to complete registration" });
    } finally {
      setRegistering(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left branding panel */}
      <div className="auth-Image relative hidden h-full flex-col bg-cover bg-center bg-muted p-10 text-white dark:border-r lg:flex">
        <div className="absolute inset-0" />
        <div className="relative z-20 flex items-center gap-2 text-lg font-bold">
          <MediqzyLogo3D size="lg" interactive float />
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "Join our healthcare platform and take control of your health journey today."
            </p>
            <footer className="text-sm">John Smith</footer>
          </blockquote>
        </div>
      </div>

      {/* Right form panel */}
      <div className="p-4 lg:p-8 h-full flex items-center overflow-y-auto">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
            <p className="text-sm text-muted-foreground">Choose how you'd like to sign up</p>
          </div>

          {/* ── Step 1: Member type selection ── */}
          {!memberType && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMemberType("individual")}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer text-center"
                >
                  <User className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-semibold">Individual</p>
                    <p className="text-xs text-muted-foreground mt-1">Free trial plan included</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMemberType("corporate")}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer text-center"
                >
                  <Building2 className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-semibold">Corporate</p>
                    <p className="text-xs text-muted-foreground mt-1">Sign up as an employee</p>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" onClick={() => handleOAuthSignup("google")} className="w-full">
                  <Chrome className="h-4 w-4 mr-2" />
                  Google
                </Button>
                <Button type="button" variant="outline" onClick={() => handleOAuthSignup("facebook")} className="w-full">
                  <Facebook className="h-4 w-4 mr-2" />
                  Facebook
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="underline underline-offset-4 hover:text-primary">Sign in</Link>
              </div>
            </>
          )}

          {/* ── Step 2 (corporate): employee validation ── */}
          {memberType === "corporate" && !employeeInfo && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <button type="button" onClick={() => setMemberType(null)} className="underline hover:text-primary">← Back</button>
                <span>·</span>
                <span className="flex items-center gap-1"><Building2 className="h-4 w-4" /> Corporate signup</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Your Company</label>
                <div className="relative">
                  <Input
                    placeholder="Type at least 3 characters to search..."
                    value={selectedCorporateId ? selectedCorporateName : corporateSearch}
                    onChange={(e) => {
                      if (selectedCorporateId) {
                        // Clear selection if user starts typing again
                        setSelectedCorporateId("");
                        setSelectedCorporateName("");
                      }
                      setCorporateSearch(e.target.value);
                    }}
                    autoComplete="off"
                  />
                  {corporatesLoading && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {selectedCorporateId && (
                    <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                  )}
                </div>
                {showCorporateList && !selectedCorporateId && (
                  <div className="border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                    {corporates.length === 0 && !corporatesLoading ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No companies found</p>
                    ) : (
                      corporates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                          onClick={() => {
                            setSelectedCorporateId(String(c.id));
                            setSelectedCorporateName(c.name);
                            setCorporateSearch("");
                            setShowCorporateList(false);
                          }}
                        >
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Employee ID</label>
                <Input
                  placeholder="Enter your employee ID"
                  value={employeeIdInput}
                  onChange={(e) => setEmployeeIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleValidateEmployee()}
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={handleValidateEmployee}
                disabled={validating || !selectedCorporateId || !employeeIdInput.trim()}
              >
                {validating ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Validating...</span>
                ) : (
                  "Validate Employee ID"
                )}
              </Button>
            </div>
          )}

          {/* ── Step 3a: Corporate personal details (email + phone + password only) ── */}
          {memberType === "corporate" && employeeInfo && (
            <div className="space-y-4">
              {!otpStep && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <button type="button" onClick={() => setEmployeeInfo(null)} className="underline hover:text-primary">← Back</button>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Building2 className="h-4 w-4" /> {employeeInfo.corporateName} · ID {employeeInfo.employeeId}</span>
                </div>
              )}

              {/* Verified employee identity badge */}
              {!otpStep && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span>
                    Verified at <strong>{employeeInfo.corporateName}</strong>
                    {employeeInfo.designation && ` · ${employeeInfo.designation}`}
                    {employeeInfo.department && ` · ${employeeInfo.department}`}
                  </span>
                </div>
              )}

              <Form {...corpForm}>
                <form onSubmit={corpForm.handleSubmit(onCorpSubmit)} className="space-y-3">
                  {/* Name: pre-filled from record OR ask if not available */}
                  {(employeeInfo.firstName && employeeInfo.lastName) ? (
                    <div className="rounded-md bg-muted px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Name: </span>
                      <span className="font-medium">{employeeInfo.firstName} {employeeInfo.lastName}</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium">First Name</label>
                        <Input
                          placeholder="John"
                          value={corpFirstName}
                          onChange={(e) => setCorpFirstName(e.target.value)}
                          disabled={otpStep}
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Last Name</label>
                        <Input
                          placeholder="Doe"
                          value={corpLastName}
                          onChange={(e) => setCorpLastName(e.target.value)}
                          disabled={otpStep}
                        />
                      </div>
                    </div>
                  )}

                  <FormField
                    control={corpForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="name@example.com" {...field} disabled={otpStep} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={corpForm.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+919876543210" {...field} disabled={otpStep} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={corpForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              {...field}
                              disabled={otpStep}
                            />
                          </FormControl>
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={otpSending || otpStep}>
                    {otpSending ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sending OTP...</span>
                    ) : (
                      "Send OTP"
                    )}
                  </Button>

                  {otpStep && (
                    <div className="space-y-4 rounded-lg border p-4">
                      <div className="space-y-2">
                        <FormLabel>Email OTP</FormLabel>
                        <OTPInput value={emailOtp} onChange={setEmailOtp} length={6} />
                        <Button type="button" className="w-full" variant={emailVerified ? "secondary" : "default"} onClick={handleVerifyEmailOtp} disabled={verifyingEmail || emailVerified}>
                          {emailVerified ? "Email Verified ✓" : verifyingEmail ? "Verifying..." : "Verify Email OTP"}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <FormLabel>WhatsApp OTP <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                        <OTPInput value={whatsappOtp} onChange={setWhatsappOtp} length={6} />
                        <Button type="button" className="w-full" variant={whatsappVerified ? "secondary" : "outline"} onClick={handleVerifyWhatsappOtp} disabled={verifyingWhatsapp || whatsappVerified}>
                          {whatsappVerified ? "WhatsApp Verified ✓" : verifyingWhatsapp ? "Verifying..." : "Verify WhatsApp OTP"}
                        </Button>
                      </div>
                      <Button type="button" className="w-full" onClick={handleCompleteRegistration} disabled={!emailVerified || registering}>
                        {registering ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</span> : "Complete Registration"}
                      </Button>
                    </div>
                  )}
                </form>
              </Form>

              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="underline underline-offset-4 hover:text-primary">Sign in</Link>
              </div>
            </div>
          )}

          {/* ── Step 3b: Individual — full personal details form ── */}
          {memberType === "individual" && (
            <div className="space-y-4">
              {!otpStep && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <button type="button" onClick={() => setMemberType(null)} className="underline hover:text-primary">← Back</button>
                  <span>·</span>
                  <span className="flex items-center gap-1"><User className="h-4 w-4" /> Individual — Free trial plan</span>
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John" {...field} autoFocus disabled={otpStep} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" {...field} disabled={otpStep} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="name@example.com" {...field} disabled={otpStep} />
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
                        <FormLabel>Password</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              {...field}
                              disabled={otpStep}
                            />
                          </FormControl>
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+919876543210" {...field} disabled={otpStep} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input type="date" {...field} className="pr-8" disabled={otpStep} />
                              <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={otpStep}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={otpSending || otpStep}>
                    {otpSending ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sending OTP...</span>
                    ) : (
                      "Send OTP"
                    )}
                  </Button>

                  {otpStep && (
                    <div className="space-y-4 rounded-lg border p-4">
                      <div className="space-y-2">
                        <FormLabel>Email OTP</FormLabel>
                        <OTPInput value={emailOtp} onChange={setEmailOtp} length={6} />
                        <Button type="button" className="w-full" variant={emailVerified ? "secondary" : "default"} onClick={handleVerifyEmailOtp} disabled={verifyingEmail || emailVerified}>
                          {emailVerified ? "Email Verified ✓" : verifyingEmail ? "Verifying..." : "Verify Email OTP"}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <FormLabel>WhatsApp OTP <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                        <OTPInput value={whatsappOtp} onChange={setWhatsappOtp} length={6} />
                        <Button type="button" className="w-full" variant={whatsappVerified ? "secondary" : "outline"} onClick={handleVerifyWhatsappOtp} disabled={verifyingWhatsapp || whatsappVerified}>
                          {whatsappVerified ? "WhatsApp Verified ✓" : verifyingWhatsapp ? "Verifying..." : "Verify WhatsApp OTP"}
                        </Button>
                      </div>
                      <Button type="button" className="w-full" onClick={handleCompleteRegistration} disabled={!emailVerified || registering}>
                        {registering ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</span> : "Complete Registration"}
                      </Button>
                    </div>
                  )}
                </form>
              </Form>

              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="underline underline-offset-4 hover:text-primary">Sign in</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;
