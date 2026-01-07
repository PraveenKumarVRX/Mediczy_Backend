import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  FlaskConical, 
  Pill, 
  Building2, 
  BarChart3, 
  Settings as SettingsIcon,
  Plus,
  Search,
  Filter,
  Download,
  Bell,
  Shield,
  Clock,
  CheckCircle,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Mail,
  Phone,
  ArrowRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MODULE_COLORS, getModuleColors } from '@/constants/admin-branding';
import CRMPage from './CRMPage';

interface PlaceholderProps {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  moduleKey?: keyof typeof MODULE_COLORS;
  stats?: { label: string; value: string | number; trend?: string; icon?: React.ComponentType<any> }[];
  actions?: { label: string; icon: React.ComponentType<any>; primary?: boolean; onClick?: () => void }[];
  features?: string[];
}

const AdminPlaceholder = ({ title, description, icon: Icon, moduleKey = 'dashboard', stats, actions, features }: PlaceholderProps) => {
  const colors = getModuleColors(moduleKey);
  
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header - Standardized */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={cn(
              "p-3 rounded-xl bg-gradient-to-br border shadow-sm",
              colors.bg,
              colors.border
            )}>
              <Icon className={cn("h-6 w-6", colors.text)} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
              <p className="text-muted-foreground text-sm md:text-base">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actions?.map((action, i) => (
              <Button 
                key={i} 
                variant={action.primary ? "default" : "outline"} 
                size="sm" 
                className={cn(
                  "gap-2",
                  action.primary && "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                )}
                onClick={action.onClick}
              >
                <action.icon className="h-4 w-4" />
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Search and Filter - Standardized */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={`Search ${title.toLowerCase()}...`} className="pl-9 bg-background" />
          </div>
          <Button variant="outline" size="default" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Button 
            variant="outline" 
            size="default" 
            className="gap-2"
            onClick={() => alert('Export functionality coming soon...')}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Stats - Standardized */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, i) => {
              const StatIcon = stat.icon || CheckCircle;
              return (
                <Card key={i} className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className={cn("p-2 rounded-lg", colors.bg)}>
                        <StatIcon className={cn("h-4 w-4", colors.text)} />
                      </div>
                      {stat.trend && (
                        <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {stat.trend}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3">
                      <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Coming Soon Card - Standardized */}
        <Card className="border-dashed border-2 border-border/50">
          <CardHeader className="text-center pb-2">
            <div className={cn(
              "mx-auto p-4 rounded-full mb-4",
              colors.bg
            )}>
              <Clock className={cn("h-8 w-8", colors.text)} />
            </div>
            <CardTitle className="text-xl text-foreground">Under Development</CardTitle>
            <CardDescription>
              This module is being enhanced with new features.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {features && features.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium mb-3 text-foreground">Upcoming Features:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {features.map((feature, i) => (
                    <Badge key={i} variant="outline" className="text-xs border-border/50">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-center gap-3">
              <Button variant="outline" size="sm" className="gap-2">
                <Bell className="h-4 w-4" />
                Notify Me
              </Button>
              <Button size="sm" className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700">
                <ArrowRight className="h-4 w-4" />
                Learn More
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export const UsersManagementPlaceholder = () => (
  <AdminPlaceholder 
    title="Users Management" 
    description="Manage platform users and their access permissions"
    icon={Users}
    moduleKey="users"
    stats={[
      { label: 'Total Users', value: '2,458', trend: '+12%', icon: Users },
      { label: 'Active Today', value: '892', icon: CheckCircle },
      { label: 'New This Week', value: '47', trend: '+8%', icon: TrendingUp },
      { label: 'Pending Approval', value: '12', icon: AlertTriangle },
    ]}
    actions={[
      { label: 'Add User', icon: Plus, primary: true },
      { label: 'Bulk Import', icon: Download },
    ]}
    features={['Role-Based Access Control', 'SSO Integration', 'Activity Tracking', 'Bulk Operations']}
  />
);

export const LabsManagementPlaceholder = () => (
  <AdminPlaceholder 
    title="Labs Management" 
    description="Manage diagnostic laboratories and test catalogs"
    icon={FlaskConical}
    moduleKey="labs"
    stats={[
      { label: 'Partner Labs', value: '45', icon: FlaskConical },
      { label: 'Tests Available', value: '1,250+', icon: CheckCircle },
      { label: 'Pending Reports', value: '28', icon: Clock },
      { label: 'This Month Orders', value: '3,420', trend: '+15%', icon: TrendingUp },
    ]}
    actions={[
      { label: 'Add Lab', icon: Plus, primary: true },
      { label: 'Test Catalog', icon: Search },
    ]}
    features={['Lab Integration API', 'Report Management', 'Price Comparison', 'Home Collection']}
  />
);

export const PharmaciesManagementPlaceholder = () => (
  <AdminPlaceholder 
    title="Pharmacies Management" 
    description="Manage pharmacy network and medicine inventory"
    icon={Pill}
    moduleKey="pharmacies"
    stats={[
      { label: 'Partner Pharmacies', value: '127', icon: Pill },
      { label: 'Active Orders', value: '89', icon: CheckCircle },
      { label: 'Medicines Listed', value: '15K+', icon: Shield },
      { label: 'Monthly Revenue', value: '₹4.5L', trend: '+22%', icon: TrendingUp },
    ]}
    actions={[
      { label: 'Add Pharmacy', icon: Plus, primary: true },
      { label: 'Medicine Catalog', icon: Search },
    ]}
    features={['Inventory Sync', 'E-Prescription', 'Delivery Tracking', 'Generic Alternatives']}
  />
);

export const CorporatesManagementPlaceholder = () => (
  <AdminPlaceholder 
    title="Corporates Management" 
    description="Manage corporate clients and employee health programs"
    icon={Building2}
    moduleKey="corporates"
    stats={[
      { label: 'Corporate Clients', value: '32', icon: Building2 },
      { label: 'Total Employees', value: '8,450', icon: Users },
      { label: 'Active Programs', value: '18', icon: CheckCircle },
      { label: 'Monthly Bookings', value: '1,240', trend: '+18%', icon: Calendar },
    ]}
    actions={[
      { label: 'Add Corporate', icon: Plus, primary: true },
      { label: 'Health Programs', icon: Shield },
    ]}
    features={['Employee Onboarding', 'Health Analytics', 'Wellness Programs', 'Custom Plans']}
  />
);

export const ReportsPage = () => {
  const handleNewReport = () => {
    alert('Creating new report... This feature is under development.');
  };

  const handleSchedule = () => {
    alert('Scheduling report... This feature is under development.');
  };

  return (
    <AdminPlaceholder 
      title="Reports & Analytics" 
      description="Comprehensive business intelligence and reporting"
      icon={BarChart3}
      moduleKey="reports"
      stats={[
        { label: 'Reports Generated', value: '156', icon: BarChart3 },
        { label: 'Scheduled Reports', value: '12', icon: Calendar },
        { label: 'Custom Dashboards', value: '8', icon: CheckCircle },
        { label: 'Data Sources', value: '15', icon: Shield },
      ]}
      actions={[
        { label: 'New Report', icon: Plus, primary: true, onClick: handleNewReport },
        { label: 'Schedule', icon: Calendar, onClick: handleSchedule },
      ]}
      features={['Custom Dashboards', 'Scheduled Reports', 'Export to Excel/PDF', 'Real-time Analytics']}
    />
  );
};

export { CRMPage };

export const SettingsPagePlaceholder = () => (
  <AdminPlaceholder 
    title="System Settings" 
    description="Configure platform settings and preferences"
    icon={SettingsIcon}
    moduleKey="settings"
    stats={[
      { label: 'Active Integrations', value: '12', icon: Shield },
      { label: 'API Keys', value: '8', icon: CheckCircle },
      { label: 'Notifications', value: '24', icon: Bell },
      { label: 'Last Backup', value: '2h ago', icon: Clock },
    ]}
    actions={[
      { label: 'Save Changes', icon: CheckCircle, primary: true },
      { label: 'Reset', icon: AlertTriangle },
    ]}
    features={['Email Configuration', 'Payment Gateway', 'Notification Rules', 'Security Settings']}
  />
);
