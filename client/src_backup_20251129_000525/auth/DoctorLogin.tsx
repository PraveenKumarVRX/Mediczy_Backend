import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, HeartPulse, Stethoscope } from "lucide-react";
import "../index.css";
import { useLogin } from "../hooks/auth";

const formSchema = z.object({
  email: z.string().email("Must be a valid email"),
  password: z.string().min(1, "Password is required"),
});

const DoctorLogin = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useLogin();

  const onSubmit = (values: { email: string; password: string }) => {
    loginMutation.mutate(
      { credentials: values, loginType: "doctor" },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: "Logged in successfully. Redirecting...",
          });
          navigate("/doctor-dashboard");
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Error",
            description:
              (error as any)?.response?.data.message || "Login failed",
          });
        },
      }
    );
  };

  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left Side with Background */}
      <div
        style={{ backgroundImage: `url("../../aiH.jpg")` }}
        className="relative hidden h-full bg-cover bg-center flex-col bg-muted p-10 text-white dark:border-r lg:flex"
      >
        <div className="relative z-20 flex items-center gap-2 text-lg font-bold primary-grad">
          <HeartPulse className="h-6 w-6" />
          Mediqzy
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "Mediqzy streamlines my practice workflow and improves patient
              care outcomes significantly."
            </p>
            <footer className="text-sm">Dr. Michael Chen</footer>
          </blockquote>
        </div>
      </div>

      {/* Right Side Login Form */}
      <div className="p-4 lg:p-8 h-full flex items-center">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          {/* Header */}
          <div className="flex flex-col space-y-2 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <Stethoscope className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Doctor Login
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access your practice dashboard
            </p>
          </div>

          {/* Login Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Email Field */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="doctor@hospital.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password Field */}
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
                          className="placeholder:text-gray-300"
                          {...field}
                          autoComplete="current-password"
                        />
                      </FormControl>
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>

          {/* Links */}
          <div className="space-y-2 text-center text-sm">
            <div className="text-muted-foreground">
              Don't have an account?{" "}
              <Link
                to="/doc-register"
                className="underline underline-offset-4 hover:text-primary font-medium"
              >
                Register as a doctor
              </Link>
            </div>
            <div className="text-muted-foreground">
              Are you a user?{" "}
              <Link
                to="/login"
                className="underline underline-offset-4 hover:text-primary font-medium"
              >
                Login here
              </Link>
            </div>
            <div className="text-muted-foreground">
              Team member?{" "}
              <Link
                to="/team/login"
                className="underline underline-offset-4 hover:text-purple-600 font-medium text-purple-600"
              >
                Team Login
              </Link>
              {" "}•{" "}
              <Link
                to="/admin/login"
                className="underline underline-offset-4 hover:text-amber-600 font-medium text-amber-600"
              >
                Admin Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorLogin;
