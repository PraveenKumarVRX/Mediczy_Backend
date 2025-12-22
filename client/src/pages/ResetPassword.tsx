import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const token = searchParams.get("token");
  const userType = searchParams.get("type") || "user";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      toast({
        title: "Invalid Link",
        description: "No reset token found. Please request a new password reset link.",
        variant: "destructive",
      });
      navigate("/forgot-password");
    }
  }, [token, navigate, toast]);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 6) {
      return "Password must be at least 6 characters long";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    const passwordError = validatePassword(password);
    if (passwordError) {
      toast({
        title: "Invalid Password",
        description: passwordError,
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);

      const { data } = await api.post("/users/reset-password", {
        token,
        password,
        userType,
      });

      if (data.success) {
        setIsSuccess(true);
        toast({
          title: "Success",
          description: "Your password has been reset successfully!",
        });

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate(userType === "doctor" ? "/doctor/login" : "/login");
        }, 3000);
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to reset password",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = (pwd: string) => {
    if (!pwd) return { strength: 0, label: "", color: "" };
    
    let strength = 0;
    if (pwd.length >= 6) strength++;
    if (pwd.length >= 8) strength++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[^a-zA-Z0-9]/.test(pwd)) strength++;

    if (strength <= 1) return { strength, label: "Weak", color: "text-red-600" };
    if (strength <= 3) return { strength, label: "Medium", color: "text-yellow-600" };
    return { strength, label: "Strong", color: "text-green-600" };
  };

  const strength = passwordStrength(password);

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="w-full max-w-md p-8 space-y-6 shadow-lg">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Password Reset Successful!
            </h1>
            <p className="text-gray-600">
              Your password has been reset successfully. You can now login with your new password.
            </p>
            <div className="text-sm text-gray-500">
              Redirecting to login page in 3 seconds...
            </div>
          </div>

          <Link to={userType === "doctor" ? "/doctor/login" : "/login"}>
            <Button className="w-full">
              Go to Login
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md p-8 space-y-6 shadow-lg">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
          <p className="text-gray-600">
            Enter your new password below
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {password && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        strength.strength <= 1
                          ? "bg-red-500 w-1/3"
                          : strength.strength <= 3
                          ? "bg-yellow-500 w-2/3"
                          : "bg-green-500 w-full"
                      }`}
                    />
                  </div>
                  <span className={`text-xs font-medium ${strength.color}`}>
                    {strength.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Password must be at least 6 characters
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Passwords do not match
              </p>
            )}
            {confirmPassword && password === confirmPassword && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Passwords match
              </p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-900 font-medium mb-1">
              Password Tips:
            </p>
            <ul className="text-xs text-blue-800 space-y-1 pl-5 list-disc">
              <li>Use at least 6 characters</li>
              <li>Mix uppercase and lowercase letters</li>
              <li>Include numbers and special characters</li>
              <li>Avoid common words or patterns</li>
            </ul>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || password !== confirmPassword || !password}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting Password...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Reset Password
              </>
            )}
          </Button>

          <Link to="/forgot-password">
            <Button variant="ghost" className="w-full">
              Request New Reset Link
            </Button>
          </Link>
        </form>
      </Card>
    </div>
  );
};

export default ResetPassword;
