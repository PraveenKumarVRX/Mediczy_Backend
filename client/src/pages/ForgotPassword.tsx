import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Mail, Phone, MessageSquare, ArrowLeft, CheckCircle, AlertCircle, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { OTPInput } from "@/components/OTPInput";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";

type Step = "request" | "verify" | "reset";

interface DeliveryStatus {
  email?: "success" | "failed";
  sms?: "success" | "failed";
  whatsapp?: "success" | "failed";
}

const ForgotPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const typeFromUrl = searchParams.get("type") || "user";
  
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [userType, setUserType] = useState<"user" | "doctor">(
    typeFromUrl === "doctor" ? "doctor" : "user"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>({});
  const [otpError, setOtpError] = useState(false);
  const { toast } = useToast();

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

      // Parse delivery status from response
      const status: DeliveryStatus = {};
      if (data.deliveryStatus) {
        data.deliveryStatus.forEach((result: any) => {
          if (result.channel === "email") status.email = result.success ? "success" : "failed";
          if (result.channel === "sms") status.sms = result.success ? "success" : "failed";
          if (result.channel === "whatsapp") status.whatsapp = result.success ? "success" : "failed";
        });
      }
      setDeliveryStatus(status);

      toast({
        title: "OTP Sent",
        description: data.message || "Please check your email, SMS, and WhatsApp for the OTP code.",
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

      setResetToken(data.resetToken);
      
      toast({
        title: "OTP Verified",
        description: "Please enter your new password.",
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

      const status: DeliveryStatus = {};
      if (data.deliveryStatus) {
        data.deliveryStatus.forEach((result: any) => {
          if (result.channel === "email") status.email = result.success ? "success" : "failed";
          if (result.channel === "sms") status.sms = result.success ? "success" : "failed";
          if (result.channel === "whatsapp") status.whatsapp = result.success ? "success" : "failed";
        });
      }
      setDeliveryStatus(status);

      toast({
        title: "OTP Resent",
        description: "A new OTP code has been sent to your email, SMS, and WhatsApp.",
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
      }, {
        skipAuth: true,
      } as any);

      toast({
        title: "Password Reset Successful",
        description: data.message || "Your password has been reset. Redirecting to login...",
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate(userType === "doctor" ? "/doctor/login" : "/login");
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md p-8 space-y-6 shadow-lg">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Forgot Password?</h1>
            <p className="text-gray-600">
              We'll send you a secure OTP code to reset your password.
            </p>
          </div>

          <form onSubmit={handleRequestOTP} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="userType">Account Type</Label>
              <RadioGroup value={userType} onValueChange={(value: any) => setUserType(value)}>
                <div className="flex items-center space-x-2 p-3 border rounded-lg">
                  <RadioGroupItem value="user" id="user" />
                  <Label htmlFor="user" className="cursor-pointer flex-1">
                    Patient Account
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg">
                  <RadioGroupItem value="doctor" id="doctor" />
                  <Label htmlFor="doctor" className="cursor-pointer flex-1">
                    Doctor Account
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number (Optional)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-gray-500">
                Include country code for SMS/WhatsApp delivery
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-2">
                🔒 Multi-Channel Security
              </p>
              <p className="text-xs text-blue-800">
                We'll send your OTP via Email, SMS, and WhatsApp for maximum security and convenience.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending OTP...
                </>
              ) : (
                "Send OTP"
              )}
            </Button>

            <Link to={userType === "doctor" ? "/doctor/login" : "/login"}>
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Login
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md p-8 space-y-6 shadow-lg">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Enter OTP Code</h1>
            <p className="text-gray-600">
              We've sent a 6-digit code to your {email && "email"}
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
                    deliveryStatus.email === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
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
                    deliveryStatus.sms === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
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
                    deliveryStatus.whatsapp === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
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

          <form onSubmit={handleVerifyOTP} className="space-y-6">
            <div className="space-y-4">
              <Label className="text-center block">Enter 6-Digit OTP</Label>
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
              className="w-full"
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify OTP"
              )}
            </Button>

            <div className="text-center space-y-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleResendOTP}
                disabled={isLoading}
                className="text-sm"
              >
                Didn't receive the code? Resend OTP
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep("request");
                  setOtp("");
                  setOtpError(false);
                }}
                className="w-full"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Change Email/Phone
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // Render Step 3: Reset Password
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md p-8 space-y-6 shadow-lg">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Password</h1>
          <p className="text-gray-600">
            Your identity has been verified. Set your new password.
          </p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            <p className="text-xs text-gray-500">
              Must be at least 6 characters long
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            className="w-full"
            disabled={isLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting Password...
              </>
            ) : (
              "Reset Password"
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default ForgotPassword;
