import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Mail, Phone, MessageSquare, ArrowLeft, CheckCircle, AlertCircle, Loader2, Shield, Stethoscope, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { OTPInput } from "@/components/OTPInput";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";

type Step = "request" | "verify" | "reset";
type AccountType = "user" | "doctor" | "team";

interface ForgotPasswordProps {
  initialUserType?: AccountType;
  lockUserType?: boolean;
}

interface DeliveryStatus {
  email?: "success" | "failed";
  sms?: "success" | "failed";
  whatsapp?: "success" | "failed";
}

const toDeliveryState = (sent?: boolean): "success" | "failed" => (sent ? "success" : "failed");

const parseDeliveryStatus = (responseData: any): DeliveryStatus => {
  const status: DeliveryStatus = {};

  if (Array.isArray(responseData?.deliveryStatus)) {
    responseData.deliveryStatus.forEach((result: any) => {
      if (result.channel === "email") status.email = result.success ? "success" : "failed";
      if (result.channel === "sms") status.sms = result.success ? "success" : "failed";
      if (result.channel === "whatsapp") status.whatsapp = result.success ? "success" : "failed";
    });
  }

  const channels = responseData?.data?.deliveryChannels || responseData?.deliveryChannels;
  if (channels) {
    if (channels.email) status.email = toDeliveryState(channels.email.sent);
    if (channels.sms) status.sms = toDeliveryState(channels.sms.sent);
    if (channels.whatsapp) status.whatsapp = toDeliveryState(channels.whatsapp.sent);
  }

  return status;
};

const getResetTokenFromResponse = (responseData: any): string | undefined => {
  return responseData?.resetToken || responseData?.data?.resetToken;
};

const normalizeAccountType = (value?: string | null): AccountType | null => {
  if (value === "doctor" || value === "team" || value === "user") return value;
  return null;
};

const getLoginRoute = (userType: AccountType) => {
  if (userType === "doctor") return "/doctor/login";
  if (userType === "team") return "/team/login";
  return "/login";
};

const ACCOUNT_META: Record<AccountType, { title: string; subtitle: string }> = {
  user: {
    title: "User Account Recovery",
    subtitle: "Reset access to your Mediqzy user app with secure OTP verification.",
  },
  doctor: {
    title: "Doctor Portal Recovery",
    subtitle: "Restore access to your doctor workspace with a clinically secure OTP reset flow.",
  },
  team: {
    title: "Team Portal Recovery",
    subtitle: "Recover team operations access quickly with trusted OTP verification.",
  },
};

const PORTAL_COPY: Record<
  AccountType,
  {
    requestHeading: string;
    securityTitle: string;
    securityDescription: string;
    emailLabel: string;
    emailPlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    phoneHint: string;
    sendOtpCta: string;
    sendingOtpCta: string;
    backToLoginCta: string;
    otpHeading: string;
    otpDeliveryText: string;
    otpInputLabel: string;
    verifyOtpCta: string;
    verifyingOtpCta: string;
    resendOtpCta: string;
    changeContactCta: string;
    otpVerifiedText: string;
    resetHeading: string;
    resetDescription: string;
    newPasswordLabel: string;
    newPasswordPlaceholder: string;
    confirmPasswordLabel: string;
    confirmPasswordPlaceholder: string;
    passwordHint: string;
    resetPasswordCta: string;
    resettingPasswordCta: string;
    otpSentToast: string;
    otpResentToast: string;
    resetSuccessToast: string;
  }
> = {
  user: {
    requestHeading: "Forgot Password?",
    securityTitle: "Multi-Channel Security",
    securityDescription: "We'll send your OTP via Email, SMS, and WhatsApp for secure and convenient account recovery.",
    emailLabel: "Email Address",
    emailPlaceholder: "your.email@example.com",
    phoneLabel: "Phone Number (Optional)",
    phonePlaceholder: "+1234567890",
    phoneHint: "Include country code for SMS/WhatsApp delivery",
    sendOtpCta: "Send OTP",
    sendingOtpCta: "Sending OTP...",
    backToLoginCta: "Back to User Login",
    otpHeading: "Verify Your OTP",
    otpDeliveryText: "We've sent a 6-digit code to your",
    otpInputLabel: "Enter 6-Digit OTP",
    verifyOtpCta: "Verify OTP",
    verifyingOtpCta: "Verifying...",
    resendOtpCta: "Didn't receive the code? Resend OTP",
    changeContactCta: "Change Email/Phone",
    otpVerifiedText: "OTP verified. Set your new password.",
    resetHeading: "Create New Password",
    resetDescription: "You're verified. Create a new password to get back into your user app account.",
    newPasswordLabel: "New Password",
    newPasswordPlaceholder: "Enter new password",
    confirmPasswordLabel: "Confirm Password",
    confirmPasswordPlaceholder: "Confirm new password",
    passwordHint: "Must be at least 6 characters long",
    resetPasswordCta: "Reset Password",
    resettingPasswordCta: "Resetting Password...",
    otpSentToast: "Check your email, SMS, and WhatsApp for the OTP code.",
    otpResentToast: "A fresh OTP has been sent to your email, SMS, and WhatsApp.",
    resetSuccessToast: "Your password has been reset. Redirecting to login...",
  },
  doctor: {
    requestHeading: "Reset Doctor Access",
    securityTitle: "Clinical-Grade Verification",
    securityDescription: "Your OTP is delivered across Email, SMS, and WhatsApp to protect your professional access.",
    emailLabel: "Registered Email",
    emailPlaceholder: "doctor@hospital.com",
    phoneLabel: "Registered Mobile (Optional)",
    phonePlaceholder: "+91XXXXXXXXXX",
    phoneHint: "Add country code for SMS/WhatsApp delivery",
    sendOtpCta: "Send Verification OTP",
    sendingOtpCta: "Sending Verification OTP...",
    backToLoginCta: "Back to Doctor Login",
    otpHeading: "Confirm Security Code",
    otpDeliveryText: "We've sent a 6-digit verification code to your",
    otpInputLabel: "Enter 6-Digit Verification Code",
    verifyOtpCta: "Verify Security Code",
    verifyingOtpCta: "Verifying Code...",
    resendOtpCta: "Didn't receive the code? Resend verification OTP",
    changeContactCta: "Change Email/Mobile",
    otpVerifiedText: "Verification complete. Set a new doctor portal password.",
    resetHeading: "Set New Doctor Password",
    resetDescription: "Identity confirmed. Set a new password to resume your doctor portal workflow.",
    newPasswordLabel: "New Doctor Password",
    newPasswordPlaceholder: "Enter new doctor password",
    confirmPasswordLabel: "Confirm Doctor Password",
    confirmPasswordPlaceholder: "Confirm new doctor password",
    passwordHint: "Use at least 6 characters",
    resetPasswordCta: "Reset Doctor Password",
    resettingPasswordCta: "Resetting Doctor Password...",
    otpSentToast: "Your doctor portal OTP has been sent via email, SMS, and WhatsApp.",
    otpResentToast: "A new doctor portal OTP has been sent to all selected channels.",
    resetSuccessToast: "Doctor password reset complete. Redirecting to login...",
  },
  team: {
    requestHeading: "Recover Team Access",
    securityTitle: "Ops-Safe Recovery",
    securityDescription: "We'll deliver OTP via Email, SMS, and WhatsApp so your team can recover access with confidence.",
    emailLabel: "Work Email",
    emailPlaceholder: "team.member@company.com",
    phoneLabel: "Work Mobile (Optional)",
    phonePlaceholder: "+91XXXXXXXXXX",
    phoneHint: "Include country code for SMS/WhatsApp delivery",
    sendOtpCta: "Send Team OTP",
    sendingOtpCta: "Sending Team OTP...",
    backToLoginCta: "Back to Team Login",
    otpHeading: "Validate OTP",
    otpDeliveryText: "We've sent a 6-digit team recovery code to your",
    otpInputLabel: "Enter 6-Digit Team OTP",
    verifyOtpCta: "Validate OTP",
    verifyingOtpCta: "Validating...",
    resendOtpCta: "Didn't receive the code? Resend team OTP",
    changeContactCta: "Change Email/Mobile",
    otpVerifiedText: "Code accepted. Create your new team portal password.",
    resetHeading: "Create Team Password",
    resetDescription: "Access verified. Set a new password to continue team operations.",
    newPasswordLabel: "New Team Password",
    newPasswordPlaceholder: "Enter new team password",
    confirmPasswordLabel: "Confirm Team Password",
    confirmPasswordPlaceholder: "Confirm new team password",
    passwordHint: "Must be at least 6 characters",
    resetPasswordCta: "Reset Team Password",
    resettingPasswordCta: "Resetting Team Password...",
    otpSentToast: "Your team recovery OTP has been sent via email, SMS, and WhatsApp.",
    otpResentToast: "A new team recovery OTP has been sent to your selected channels.",
    resetSuccessToast: "Team password reset complete. Redirecting to login...",
  },
};

const PORTAL_BRANDING: Record<
  AccountType,
  {
    shell: string;
    ambience: string;
    card: string;
    iconContainer: string;
    iconColor: string;
    heading: string;
    subtitle: string;
    input: string;
    infoCard: string;
    infoTitle: string;
    infoText: string;
    primaryButton: string;
    lockPanel: string;
    lockTitle: string;
    lockText: string;
    channelSuccess: string;
    channelFailed: string;
    portalIcon: typeof Shield;
  }
> = {
  user: {
    shell:
      "min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top_right,#dbeafe_0%,#eff6ff_35%,#f8fafc_70%,#ffffff_100%)] p-3 sm:p-4 [font-family:'Manrope',ui-sans-serif]",
    ambience: "absolute inset-0 bg-[linear-gradient(140deg,rgba(59,130,246,0.08),transparent_45%,rgba(6,182,212,0.08))]",
    card: "relative w-full max-w-md space-y-5 sm:space-y-6 rounded-2xl border border-blue-100/80 bg-white/95 p-5 sm:p-8 shadow-[0_20px_80px_-40px_rgba(37,99,235,0.55)] backdrop-blur-sm",
    iconContainer: "mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-blue-100",
    iconColor: "h-7 w-7 sm:h-8 sm:w-8 text-blue-700",
    heading: "text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900",
    subtitle: "text-[13px] sm:text-sm leading-relaxed text-slate-600",
    input: "h-11 sm:h-12 border-slate-200 bg-white/90 text-sm focus-visible:border-blue-400 focus-visible:ring-blue-300",
    infoCard: "rounded-xl border border-blue-200 bg-blue-50/80 p-4",
    infoTitle: "text-sm font-semibold text-blue-900",
    infoText: "text-xs text-blue-800",
    primaryButton: "h-11 sm:h-12 w-full rounded-xl bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700",
    lockPanel: "rounded-xl border border-blue-200 bg-blue-50 p-4",
    lockTitle: "text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-blue-700",
    lockText: "mt-1 text-sm font-semibold text-blue-900",
    channelSuccess: "bg-blue-50 text-blue-700",
    channelFailed: "bg-red-50 text-red-700",
    portalIcon: Shield,
  },
  doctor: {
    shell:
      "min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top_left,#dcfce7_0%,#ecfdf5_30%,#f8fafc_65%,#ffffff_100%)] p-3 sm:p-4 [font-family:'Plus Jakarta Sans',ui-sans-serif]",
    ambience: "absolute inset-0 bg-[linear-gradient(160deg,rgba(21,128,61,0.12),transparent_42%,rgba(6,78,59,0.10))]",
    card: "relative w-full max-w-md space-y-5 sm:space-y-6 rounded-2xl border border-emerald-100/90 bg-white/95 p-5 sm:p-8 shadow-[0_24px_90px_-46px_rgba(16,185,129,0.55)]",
    iconContainer: "mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-emerald-100",
    iconColor: "h-7 w-7 sm:h-8 sm:w-8 text-emerald-700",
    heading: "text-xl sm:text-2xl font-bold tracking-tight text-emerald-950",
    subtitle: "text-[13px] sm:text-sm leading-relaxed text-emerald-800/80",
    input: "h-11 sm:h-12 border-emerald-200 bg-white text-sm focus-visible:border-emerald-400 focus-visible:ring-emerald-300",
    infoCard: "rounded-xl border border-emerald-200 bg-emerald-50 p-4",
    infoTitle: "text-sm font-semibold text-emerald-900",
    infoText: "text-xs text-emerald-800",
    primaryButton: "h-11 sm:h-12 w-full rounded-xl bg-emerald-700 text-[15px] font-semibold text-white hover:bg-emerald-800",
    lockPanel: "rounded-xl border border-emerald-200 bg-emerald-50 p-4",
    lockTitle: "text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-emerald-700",
    lockText: "mt-1 text-sm font-semibold text-emerald-900",
    channelSuccess: "bg-emerald-50 text-emerald-700",
    channelFailed: "bg-rose-50 text-rose-700",
    portalIcon: Stethoscope,
  },
  team: {
    shell:
      "min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_bottom_left,#fef3c7_0%,#fff7ed_30%,#f8fafc_68%,#ffffff_100%)] p-3 sm:p-4 [font-family:'Outfit',ui-sans-serif]",
    ambience: "absolute inset-0 bg-[linear-gradient(130deg,rgba(245,158,11,0.13),transparent_40%,rgba(251,146,60,0.10))]",
    card: "relative w-full max-w-md space-y-5 sm:space-y-6 rounded-3xl border border-amber-100/90 bg-white p-5 sm:p-8 shadow-[0_24px_95px_-46px_rgba(245,158,11,0.55)]",
    iconContainer: "mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-amber-100",
    iconColor: "h-7 w-7 sm:h-8 sm:w-8 text-amber-700",
    heading: "text-xl sm:text-2xl font-semibold tracking-tight text-amber-950",
    subtitle: "text-[13px] sm:text-sm leading-relaxed text-amber-900/75",
    input: "h-11 sm:h-12 border-amber-200 bg-white/95 text-sm focus-visible:border-amber-400 focus-visible:ring-amber-300",
    infoCard: "rounded-xl border border-amber-200 bg-amber-50 p-4",
    infoTitle: "text-sm font-semibold text-amber-900",
    infoText: "text-xs text-amber-800",
    primaryButton: "h-11 sm:h-12 w-full rounded-xl bg-amber-600 text-[15px] font-semibold text-white hover:bg-amber-700",
    lockPanel: "rounded-xl border border-amber-200 bg-amber-50 p-4",
    lockTitle: "text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-amber-700",
    lockText: "mt-1 text-sm font-semibold text-amber-900",
    channelSuccess: "bg-amber-50 text-amber-700",
    channelFailed: "bg-red-50 text-red-700",
    portalIcon: Users,
  },
};

const ForgotPassword = ({ initialUserType, lockUserType = false }: ForgotPasswordProps) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const typeFromUrl = normalizeAccountType(searchParams.get("type"));
  const seededType = normalizeAccountType(initialUserType || null);
  const resolvedUserType: AccountType = seededType || typeFromUrl || "user";
  const isUserTypeLocked = lockUserType || Boolean(seededType) || Boolean(typeFromUrl);
  
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [userType, setUserType] = useState<AccountType>(resolvedUserType);
  const [isLoading, setIsLoading] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>({});
  const [otpError, setOtpError] = useState(false);
  const { toast } = useToast();
  const accountMeta = ACCOUNT_META[userType];
  const brand = PORTAL_BRANDING[userType];
  const copy = PORTAL_COPY[userType];
  const PortalIcon = brand.portalIcon;

  // Step 1: Request OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email && !phone) {
      toast({
        title: "Missing Information",
        description: "Please provide either an email or phone number.",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        toast({
          title: "Invalid email",
          description: "Please enter a valid email address",
          variant: "destructive",
        });
        return;
      }
    }

    setIsLoading(true);

    try {
      const { data } = await api.post("/password-reset/request", {
        email: email || undefined,
        phone: phone || undefined,
        userType,
      }, {
        skipAuth: true,
      } as any);

      if (data?.success === false) {
        throw new Error(data?.message || "Failed to send OTP. Please try again.");
      }

      setDeliveryStatus(parseDeliveryStatus(data));

      toast({
        title: "OTP Sent",
        description: data.message || copy.otpSentToast,
      });

      setStep("verify");
    } catch (error: any) {
      console.error("Request OTP error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to send OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      setOtpError(true);
      toast({
        title: "Invalid OTP",
        description: "Please enter the complete 6-digit OTP code.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setOtpError(false);

    try {
      const { data } = await api.post("/password-reset/verify-otp", {
        email: email || undefined,
        phone: phone || undefined,
        code: otp,
        userType,
      }, {
        skipAuth: true,
      } as any);

      if (data?.success === false) {
        throw new Error(data?.message || "OTP verification failed");
      }

      const verifiedResetToken = getResetTokenFromResponse(data);
      if (!verifiedResetToken) {
        throw new Error("Reset token missing from OTP verification response");
      }

      setResetToken(verifiedResetToken);
      
      toast({
        title: "OTP Verified",
        description: copy.otpVerifiedText,
      });

      setStep("reset");
    } catch (error: any) {
      console.error("Verify OTP error:", error);
      setOtpError(true);
      toast({
        title: "Invalid OTP",
        description: error.response?.data?.message || "The OTP code is incorrect or expired. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendOTP = async () => {
    setOtp("");
    setOtpError(false);
    setIsLoading(true);

    try {
      const { data } = await api.post("/password-reset/request", {
        email: email || undefined,
        phone: phone || undefined,
        userType,
      }, {
        skipAuth: true,
      } as any);

      if (data?.success === false) {
        throw new Error(data?.message || "Failed to resend OTP. Please try again.");
      }

      setDeliveryStatus(parseDeliveryStatus(data));

      toast({
        title: "OTP Resent",
        description: copy.otpResentToast,
      });
    } catch (error: any) {
      console.error("Resend OTP error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to resend OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure both passwords are identical.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await api.post("/password-reset/reset", {
        resetToken,
        newPassword,
        userType,
      }, {
        skipAuth: true,
      } as any);

      if (data?.success === false) {
        throw new Error(data?.message || "Failed to reset password. Please try again.");
      }

      toast({
        title: "Password Reset Successful",
        description: data.message || copy.resetSuccessToast,
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate(getLoginRoute(userType));
      }, 2000);
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to reset password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Render Step 1: Request OTP
  if (step === "request") {
    return (
      <div className={brand.shell}>
        <div className={brand.ambience} aria-hidden="true" />
        <Card className={brand.card}>
          <div className="text-center space-y-2 sm:space-y-2.5">
            <div className={brand.iconContainer}>
              <PortalIcon className={brand.iconColor} />
            </div>
            <h1 className={brand.heading}>{copy.requestHeading}</h1>
            <p className={brand.subtitle}>{accountMeta.subtitle}</p>
          </div>

          <form onSubmit={handleRequestOTP} className="space-y-5 sm:space-y-6">
            {!isUserTypeLocked && (
              <div className="space-y-2">
                <Label htmlFor="userType" className="text-sm">Account Type</Label>
                <RadioGroup value={userType} onValueChange={(value: AccountType) => setUserType(value)}>
                  <div className="flex items-center space-x-2 p-2.5 sm:p-3 border rounded-lg">
                    <RadioGroupItem value="user" id="user" />
                    <Label htmlFor="user" className="cursor-pointer flex-1 text-sm">
                      User Account
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-2.5 sm:p-3 border rounded-lg">
                    <RadioGroupItem value="team" id="team" />
                    <Label htmlFor="team" className="cursor-pointer flex-1 text-sm">
                      Team Member Account
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-2.5 sm:p-3 border rounded-lg">
                    <RadioGroupItem value="doctor" id="doctor" />
                    <Label htmlFor="doctor" className="cursor-pointer flex-1 text-sm">
                      Doctor Account
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {isUserTypeLocked && (
              <div className={brand.lockPanel}>
                <p className={brand.lockTitle}>Resetting For</p>
                <p className={brand.lockText}>{accountMeta.title}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm">{copy.emailLabel}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`pl-10 ${brand.input}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm">{copy.phoneLabel}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder={copy.phonePlaceholder}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`pl-10 ${brand.input}`}
                />
              </div>
              <p className="text-xs text-slate-500">
                {copy.phoneHint}
              </p>
            </div>

            <div className={brand.infoCard}>
              <p className={`${brand.infoTitle} mb-2`}>
                🔒 {copy.securityTitle}
              </p>
              <p className={brand.infoText}>
                {copy.securityDescription}
              </p>
            </div>

            <Button
              type="submit"
              className={brand.primaryButton}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {copy.sendingOtpCta}
                </>
              ) : (
                copy.sendOtpCta
              )}
            </Button>

            <Link to={getLoginRoute(userType)}>
              <Button variant="ghost" className="h-11 sm:h-12 w-full rounded-xl text-[15px]">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {copy.backToLoginCta}
              </Button>
            </Link>
          </form>
        </Card>
      </div>
    );
  }

  // Render Step 2: Verify OTP
  if (step === "verify") {
    return (
      <div className={brand.shell}>
        <div className={brand.ambience} aria-hidden="true" />
        <Card className={brand.card}>
          <div className="text-center space-y-2 sm:space-y-2.5">
            <div className={brand.iconContainer}>
              <PortalIcon className={brand.iconColor} />
            </div>
            <h1 className={brand.heading}>{copy.otpHeading}</h1>
            <p className={brand.subtitle}>
              {copy.otpDeliveryText} {email && "email"}
              {email && phone && ", "}
              {phone && "phone"}
            </p>
          </div>

          {/* Delivery Status Indicators */}
          {Object.keys(deliveryStatus).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Delivery Status:</p>
              <div className="grid gap-2">
                {deliveryStatus.email && (
                  <div className={`flex items-center gap-2 p-2 rounded-lg ${
                    deliveryStatus.email === "success" ? brand.channelSuccess : brand.channelFailed
                  }`}>
                    <Mail className="h-4 w-4" />
                    <span className="text-sm">Email</span>
                    {deliveryStatus.email === "success" ? (
                      <CheckCircle className="h-4 w-4 ml-auto" />
                    ) : (
                      <AlertCircle className="h-4 w-4 ml-auto" />
                    )}
                  </div>
                )}
                {deliveryStatus.sms && (
                  <div className={`flex items-center gap-2 p-2 rounded-lg ${
                    deliveryStatus.sms === "success" ? brand.channelSuccess : brand.channelFailed
                  }`}>
                    <Phone className="h-4 w-4" />
                    <span className="text-sm">SMS</span>
                    {deliveryStatus.sms === "success" ? (
                      <CheckCircle className="h-4 w-4 ml-auto" />
                    ) : (
                      <AlertCircle className="h-4 w-4 ml-auto" />
                    )}
                  </div>
                )}
                {deliveryStatus.whatsapp && (
                  <div className={`flex items-center gap-2 p-2 rounded-lg ${
                    deliveryStatus.whatsapp === "success" ? brand.channelSuccess : brand.channelFailed
                  }`}>
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-sm">WhatsApp</span>
                    {deliveryStatus.whatsapp === "success" ? (
                      <CheckCircle className="h-4 w-4 ml-auto" />
                    ) : (
                      <AlertCircle className="h-4 w-4 ml-auto" />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleVerifyOTP} className="space-y-5 sm:space-y-6">
            <div className="space-y-4">
              <Label className="text-center block text-sm">{copy.otpInputLabel}</Label>
              <OTPInput
                length={6}
                value={otp}
                onChange={setOtp}
                disabled={isLoading}
                error={otpError}
              />
              {otpError && (
                <p className="text-sm text-red-600 text-center">
                  Invalid or expired OTP code
                </p>
              )}
            </div>

            <Button
              type="submit"
              className={brand.primaryButton}
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {copy.verifyingOtpCta}
                </>
              ) : (
                copy.verifyOtpCta
              )}
            </Button>

            <div className="text-center space-y-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleResendOTP}
                disabled={isLoading}
                className="h-10 sm:h-11 text-sm"
              >
                {copy.resendOtpCta}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep("request");
                  setOtp("");
                  setOtpError(false);
                }}
                className="h-11 sm:h-12 w-full rounded-xl text-[15px]"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {copy.changeContactCta}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // Render Step 3: Reset Password
  return (
    <div className={brand.shell}>
      <div className={brand.ambience} aria-hidden="true" />
      <Card className={brand.card}>
        <div className="text-center space-y-2 sm:space-y-2.5">
          <div className={brand.iconContainer}>
            <CheckCircle className={brand.iconColor} />
          </div>
          <h1 className={brand.heading}>{copy.resetHeading}</h1>
          <p className={brand.subtitle}>
            {copy.resetDescription}
          </p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-5 sm:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-sm">{copy.newPasswordLabel}</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder={copy.newPasswordPlaceholder}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={brand.input}
              required
              minLength={6}
            />
            <p className="text-xs text-gray-500">
              {copy.passwordHint}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm">{copy.confirmPasswordLabel}</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder={copy.confirmPasswordPlaceholder}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={brand.input}
              required
              minLength={6}
            />
          </div>

          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="text-sm text-red-600">
              Passwords do not match
            </p>
          )}

          <Button
            type="submit"
            className={brand.primaryButton}
            disabled={isLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {copy.resettingPasswordCta}
              </>
            ) : (
              copy.resetPasswordCta
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default ForgotPassword;
