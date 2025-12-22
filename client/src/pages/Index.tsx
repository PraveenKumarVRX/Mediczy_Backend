import { useState, useEffect } from "react";
import {
  Activity,
  Stethoscope,
  Apple,
  Pill,
  Bot,
  HeartPulse,
  Leaf,
  AlertCircle,
  Info,
  Bell,
  Calendar,
  CheckCircle2,
  Phone,
  ArrowRight,
  Video,
  Clock,
  Shield,
  Brain,
  Sparkles,
  Heart,
  Plus,
  TrendingUp,
  Droplets,
  Footprints,
  Moon,
  Zap,
  CalendarCheck,
  User,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import MainLayout from "@/components/layout/MainLayout";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import { getToken } from "@/hooks/auth";

const Index = () => {
  const { currentUser, currentDoctor, userType } = useAuth();
  const userName = currentUser?.firstName || currentDoctor?.firstName || "Guest";
  const [healthStats, setHealthStats] = useState({
    steps: 6542,
    stepsGoal: 10000,
    heartRate: 72,
    sleep: 7.2,
    water: 5,
    waterGoal: 8,
    calories: 1850,
    caloriesGoal: 2200,
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [currentUser, userType]);

  const fetchDashboardData = async () => {
    try {
      const token = getToken();
      const isPatient = userType === "user" && !!currentUser;

      if (token && isPatient) {
        // Try to fetch real appointments for authenticated patients
        const appointmentsRes = await api.get('/appointments/my-appointments').catch(() => null);
        if (appointmentsRes?.data) {
          setUpcomingAppointments(appointmentsRes.data.slice(0, 3));
        } else {
          setUpcomingAppointments(getSampleAppointments());
        }
      } else {
        // Unauthenticated visitors see sample content without hitting protected APIs
        setUpcomingAppointments(getSampleAppointments());
      }

      setRecentActivities([
        { id: 1, type: "checkup", message: "Health metrics updated", time: "2 hours ago", icon: Activity },
        { id: 2, type: "prescription", message: "New prescription added", time: "Yesterday", icon: Pill },
        { id: 3, type: "appointment", message: "Appointment confirmed", time: "2 days ago", icon: CalendarCheck },
      ]);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getSampleAppointments = () => [
    {
      id: 1,
      doctorName: "Dr. Sarah Johnson",
      specialty: "Cardiologist",
      date: new Date(Date.now() + 86400000 * 2).toISOString(),
      time: "10:30 AM",
      type: "Video Consultation",
    },
  ];

  // Health stat cards
  const healthMetrics = [
    {
      title: "Steps",
      value: healthStats.steps.toLocaleString(),
      goal: healthStats.stepsGoal.toLocaleString(),
      progress: (healthStats.steps / healthStats.stepsGoal) * 100,
      icon: Footprints,
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/20",
    },
    {
      title: "Heart Rate",
      value: `${healthStats.heartRate}`,
      unit: "bpm",
      icon: Heart,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/20",
      status: "Normal",
    },
    {
      title: "Sleep",
      value: healthStats.sleep.toString(),
      unit: "hours",
      icon: Moon,
      color: "text-info",
      bgColor: "bg-info/10",
      borderColor: "border-info/20",
    },
    {
      title: "Water",
      value: `${healthStats.water}/${healthStats.waterGoal}`,
      unit: "glasses",
      progress: (healthStats.water / healthStats.waterGoal) * 100,
      icon: Droplets,
      color: "text-info",
      bgColor: "bg-info/10",
      borderColor: "border-info/20",
    },
  ];

  // Feature sections
  const features = [
    {
      title: "Health Monitoring",
      description: "Track your vital signs and health metrics in real-time",
      icon: HeartPulse,
      color: "primary-gradient",
      borderColor: "border-primary/20",
      iconColor: "text-primary",
      link: "/health-tracker",
      highlights: ["Real-time vitals", "Health trends", "Personalized insights"],
    },
    {
      title: "Doctor Consultations",
      description: "Connect with healthcare professionals instantly",
      icon: Stethoscope,
      color: "info-gradient",
      borderColor: "border-info/20",
      iconColor: "text-info",
      link: "/consultation",
      highlights: ["Video calls", "Chat support", "Appointment booking"],
    },
    {
      title: "AI Health Assistant",
      description: "Get instant health insights powered by AI",
      icon: Brain,
      color: "secondary-gradient",
      borderColor: "border-secondary/20",
      iconColor: "text-secondary",
      link: "/ai-doctor",
      highlights: ["Symptom analysis", "Health recommendations", "24/7 availability"],
    },
    {
      title: "Diet & Nutrition",
      description: "Personalized meal plans and nutrition tracking",
      icon: Apple,
      color: "success-gradient",
      borderColor: "border-success/20",
      iconColor: "text-success",
      link: "/diet",
      highlights: ["Meal planning", "Nutritional analysis", "Diet tracking"],
    }
  ];

  const quickActions = [
    {
      title: "Emergency",
      icon: AlertCircle,
      color: "warning-gradient",
      border: "border-warning/20",
      iconColor: "text-warning",
      link: "/emergency",
      action: handleEmergencyCall,
      description: "24/7 Emergency Support",
      badge: "Call 112",
    },
    {
      title: "Book Appointment",
      icon: Calendar,
      color: "primary-gradient",
      border: "border-primary/20",
      iconColor: "text-primary",
      link: "/doctors",
      description: "Schedule Your Visit",
      badge: "Available 24/7",
    },
    {
      title: "My Bookings",
      icon: CalendarCheck,
      color: "success-gradient",
      border: "border-success/20",
      iconColor: "text-success",
      link: "/my-bookings",
      description: "View Appointments",
      badge: upcomingAppointments.length > 0 ? `${upcomingAppointments.length} upcoming` : null,
    }
  ];

  function handleEmergencyCall() {
    window.location.href = "tel:112";
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
        {/* Welcome Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 md:p-8 text-white">
          <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.5))]" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
                  <HeartPulse className="w-6 h-6" />
                </div>
                <Badge variant="secondary" className="bg-white/20 text-white border-0">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">
                Welcome back, {userName}!
              </h1>
              <p className="text-blue-100">
                Your health journey continues. Let's make today count.
              </p>
            </div>
            <div className="flex gap-3">
              <Link to="/profile">
                <Button variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0">
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Button>
              </Link>
              <Link to="/health-tracker">
                <Button className="bg-white text-blue-600 hover:bg-blue-50">
                  <Activity className="w-4 h-4 mr-2" />
                  Track Health
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Health Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {healthMetrics.map((metric, index) => (
            <Card key={index} className={`${metric.bgColor} border ${metric.borderColor} overflow-hidden`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                    <metric.icon className={`w-5 h-5 ${metric.color}`} />
                  </div>
                  {metric.status && (
                    <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">
                      {metric.status}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{metric.title}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold">{metric.value}</span>
                    {metric.unit && <span className="text-xs text-muted-foreground">{metric.unit}</span>}
                  </div>
                  {metric.goal && (
                    <p className="text-xs text-muted-foreground mt-1">Goal: {metric.goal}</p>
                  )}
                  {metric.progress !== undefined && (
                    <Progress value={metric.progress} className="h-1.5 mt-2" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4">
          {quickActions.map((action, index) => (
            <Link 
              key={index} 
              to={action.link}
              onClick={action.action}
              className="group"
            >
              <Card className={`
                h-full transition-all duration-300
                hover:shadow-lg ${action.color} border ${action.border}
                relative overflow-hidden hover:-translate-y-1
              `}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2.5 rounded-xl ${action.color} border ${action.border} transition-transform group-hover:scale-110`}>
                      <action.icon className={`w-6 h-6 ${action.iconColor}`} />
                    </div>
                    {action.badge && (
                      <Badge variant="outline" className={`text-xs ${action.iconColor} ${action.border}`}>
                        {action.badge}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{action.title}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                  <ArrowRight className={`w-4 h-4 ${action.iconColor} mt-3 transition-transform group-hover:translate-x-2`} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Upcoming Appointments */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Upcoming Appointments
              </CardTitle>
              <Link to="/my-bookings">
                <Button variant="ghost" size="sm" className="text-primary">
                  View All
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {upcomingAppointments.length > 0 ? (
                <div className="space-y-3">
                  {upcomingAppointments.map((apt, index) => (
                    <div key={apt.id || index} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="p-2 rounded-lg bg-primary/10">
                        {apt.type === "Video Consultation" ? (
                          <Video className="w-5 h-5 text-primary" />
                        ) : (
                          <Stethoscope className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{apt.doctorName || apt.doctor?.name || "Doctor"}</p>
                        <p className="text-sm text-muted-foreground">{apt.specialty || apt.doctor?.specialty || "Specialist"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {new Date(apt.date || apt.appointmentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-xs text-muted-foreground">{apt.time || apt.appointmentTime}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground mb-3">No upcoming appointments</p>
                  <Link to="/doctors">
                    <Button size="sm">Book Now</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5 text-success" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-muted">
                      <activity.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{activity.message}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Features Grid */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Explore Services</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, index) => (
              <Link 
                key={index}
                to={feature.link}
                className="group"
              >
                <Card className={`
                  h-full transition-all duration-300
                  hover:shadow-lg ${feature.color} border ${feature.borderColor}
                  relative overflow-hidden hover:-translate-y-1
                `}>
                  <CardContent className="p-5">
                    <div className={`p-2.5 rounded-xl ${feature.color} border ${feature.borderColor} w-fit mb-4 transition-transform group-hover:scale-110`}>
                      <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
                    </div>
                    <h3 className="font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{feature.description}</p>
                    <div className="space-y-1.5">
                      {feature.highlights.slice(0, 2).map((highlight, idx) => (
                        <div key={idx} className="flex items-center text-xs text-muted-foreground">
                          <CheckCircle2 className={`w-3 h-3 mr-1.5 ${feature.iconColor}`} />
                          {highlight}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Index;
