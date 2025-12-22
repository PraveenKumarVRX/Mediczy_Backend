import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import TPASidebar from '@/components/tpa/TPASidebar';
import { FileText, Building2, Users, Calendar, DollarSign } from 'lucide-react';

interface TPAPlaceholderProps {
  title: string;
  description: string;
  icon?: any;
}

const TPAPlaceholder = ({ title, description, icon: Icon = FileText }: TPAPlaceholderProps) => {
  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
            <p className="text-gray-600 mt-1">{description}</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-6 w-6 text-blue-600" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Icon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Coming Soon</h3>
                <p className="text-gray-500">This feature is currently under development.</p>
                <p className="text-sm text-gray-400 mt-2">Contact support for more information.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Export individual components for each route
export const TPAPolicies = () => (
  <TPAPlaceholder 
    title="Policies Management" 
    description="Manage insurance policies and coverage"
    icon={FileText}
  />
);

export const TPAPreAuth = () => (
  <TPAPlaceholder 
    title="Pre-Authorization" 
    description="Process pre-authorization requests"
    icon={Calendar}
  />
);

export const TPAAnalytics = () => (
  <TPAPlaceholder 
    title="Analytics" 
    description="View TPA performance analytics and insights"
    icon={Building2}
  />
);

export const TPAReports = () => (
  <TPAPlaceholder 
    title="Reports" 
    description="Generate and download TPA reports"
    icon={FileText}
  />
);

export const TPASettings = () => (
  <TPAPlaceholder 
    title="Settings" 
    description="Configure TPA account settings"
    icon={Users}
  />
);

export const TPASupport = () => (
  <TPAPlaceholder 
    title="Support" 
    description="Get help and submit support tickets"
    icon={Users}
  />
);

export const TPACorporates = () => (
  <TPAPlaceholder 
    title="Corporates Management" 
    description="Manage corporate clients and their policies"
    icon={Building2}
  />
);

export const TPAProfile = () => (
  <TPAPlaceholder 
    title="TPA Profile" 
    description="View and update your TPA profile information"
    icon={Users}
  />
);

export default TPAPlaceholder;
