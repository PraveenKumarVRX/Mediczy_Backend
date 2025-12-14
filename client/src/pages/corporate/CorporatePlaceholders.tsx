import { useLocation } from "react-router-dom";
import CorporateLayout from "@/components/corporate/CorporateLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  CalendarCheck, 
  Activity, 
  Building2, 
  FileText, 
  TrendingUp, 
  Shield, 
  Bell, 
  Settings, 
  HelpCircle,
  Construction
} from "lucide-react";

const pageMeta: Record<string, { title: string; icon: React.ElementType; description: string }> = {
  "/corporate/employees": {
    title: "Employee Management",
    icon: Users,
    description: "Manage employee health profiles, enrollments, and health status monitoring"
  },
  "/corporate/appointments": {
    title: "Appointments",
    icon: CalendarCheck,
    description: "Track and manage employee health checkup appointments and consultations"
  },
  "/corporate/analytics": {
    title: "Health Analytics",
    icon: Activity,
    description: "View comprehensive health analytics and trends for your organization"
  },
  "/corporate/risk-monitor": {
    title: "Risk Monitor",
    icon: Activity,
    description: "Monitor health risks and alerts across your organization"
  },
  "/corporate/departments": {
    title: "Departments",
    icon: Building2,
    description: "Manage department-wise health programs and allocations"
  },
  "/corporate/claims": {
    title: "Claims Management",
    icon: FileText,
    description: "Track and manage employee health claims and reimbursements"
  },
  "/corporate/reports": {
    title: "Reports",
    icon: TrendingUp,
    description: "Generate and download health reports for your organization"
  },
  "/corporate/compliance": {
    title: "Compliance",
    icon: Shield,
    description: "Track regulatory compliance and audit requirements"
  },
  "/corporate/notifications": {
    title: "Notifications",
    icon: Bell,
    description: "View and manage all alerts and notifications"
  },
  "/corporate/settings": {
    title: "Settings",
    icon: Settings,
    description: "Configure your corporate health portal settings"
  },
  "/corporate/support": {
    title: "Help & Support",
    icon: HelpCircle,
    description: "Get help and support for the corporate health portal"
  },
};

const CorporatePlaceholder = () => {
  const location = useLocation();
  const meta = pageMeta[location.pathname] || {
    title: "Coming Soon",
    icon: Construction,
    description: "This feature is under development"
  };

  const Icon = meta.icon;

  return (
    <CorporateLayout>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-none shadow-lg overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold">{meta.title}</CardTitle>
                  <p className="text-blue-100 mt-1">{meta.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="text-center py-12">
                <Construction className="w-20 h-20 text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Coming Soon</h3>
                <p className="text-slate-600 max-w-md mx-auto">
                  We're working hard to bring you this feature. Stay tuned for updates!
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </CorporateLayout>
  );
};

// Export individual components for each route
export const CorporateEmployees = CorporatePlaceholder;
export const CorporateAppointments = CorporatePlaceholder;
export const CorporateAnalytics = CorporatePlaceholder;
export const CorporateRiskMonitor = CorporatePlaceholder;
export const CorporateDepartments = CorporatePlaceholder;
export const CorporateClaims = CorporatePlaceholder;
export const CorporateReports = CorporatePlaceholder;
export const CorporateCompliance = CorporatePlaceholder;
export const CorporateNotifications = CorporatePlaceholder;
export const CorporateSettings = CorporatePlaceholder;
export const CorporateSupport = CorporatePlaceholder;

export default CorporatePlaceholder;
