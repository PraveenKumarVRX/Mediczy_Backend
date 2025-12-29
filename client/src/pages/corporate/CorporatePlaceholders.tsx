import { useLocation } from "react-router-dom";
import CorporateLayout from "@/components/corporate/CorporateLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CorporatePageHeader from "@/components/corporate/CorporatePageHeader";
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
  Construction,
  Sparkles
} from "lucide-react";

const pageMeta: Record<string, { title: string; icon: React.ElementType; description: string; gradient: string }> = {
  "/corporate/employees": {
    title: "Employee Management",
    icon: Users,
    description: "Manage employee health profiles, enrollments, and health status monitoring",
    gradient: "from-teal-600 to-teal-800"
  },
  "/corporate/appointments": {
    title: "Appointments",
    icon: CalendarCheck,
    description: "Track and manage employee health checkup appointments and consultations",
    gradient: "from-purple-600 to-purple-800"
  },
  "/corporate/analytics": {
    title: "Health Analytics",
    icon: Activity,
    description: "View comprehensive health analytics and trends for your organization",
    gradient: "from-rose-600 to-rose-800"
  },
  "/corporate/risk-monitor": {
    title: "Risk Monitor",
    icon: Activity,
    description: "Monitor health risks and alerts across your organization",
    gradient: "from-amber-600 to-amber-800"
  },
  "/corporate/departments": {
    title: "Departments",
    icon: Building2,
    description: "Manage department-wise health programs and allocations",
    gradient: "from-indigo-600 to-indigo-800"
  },
  "/corporate/claims": {
    title: "Claims Management",
    icon: FileText,
    description: "Track and manage employee health claims and reimbursements",
    gradient: "from-cyan-600 to-cyan-800"
  },
  "/corporate/reports": {
    title: "Reports",
    icon: TrendingUp,
    description: "Generate and download health reports for your organization",
    gradient: "from-violet-600 to-violet-800"
  },
  "/corporate/compliance": {
    title: "Compliance",
    icon: Shield,
    description: "Track regulatory compliance and audit requirements",
    gradient: "from-slate-600 to-slate-800"
  },
  "/corporate/notifications": {
    title: "Notifications",
    icon: Bell,
    description: "View and manage all alerts and notifications",
    gradient: "from-pink-600 to-pink-800"
  },
  "/corporate/settings": {
    title: "Settings",
    icon: Settings,
    description: "Configure your corporate health portal settings",
    gradient: "from-gray-600 to-gray-800"
  },
  "/corporate/support": {
    title: "Help & Support",
    icon: HelpCircle,
    description: "Get help and support for the corporate health portal",
    gradient: "from-sky-600 to-sky-800"
  },
};

const CorporatePlaceholder = () => {
  const location = useLocation();
  const meta = pageMeta[location.pathname] || {
    title: "Coming Soon",
    icon: Construction,
    description: "This feature is under development",
    gradient: "from-slate-600 to-slate-800"
  };

  const IconComponent = meta.icon;

  return (
    <CorporateLayout>
      <div className="min-h-screen bg-gray-50/50">
        <div className="container mx-auto p-6">
          <CorporatePageHeader
            icon={IconComponent}
            title={meta.title}
            description={meta.description}
            gradient={meta.gradient}
            badge={{ text: "Coming Soon", variant: "amber" }}
          />

          <Card className="border-none shadow-lg overflow-hidden">
            <CardContent className="p-8">
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Construction className="w-12 h-12 text-amber-600" />
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full mb-4">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Under Development</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Feature Coming Soon</h3>
                <p className="text-slate-600 max-w-md mx-auto leading-relaxed">
                  We're working hard to bring you this feature. Stay tuned for updates and new capabilities!
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
