import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MainLayout from '@/components/layout/MainLayout';
import { 
  Activity, 
  Users, 
  Calendar, 
  FileText,
  Settings,
  Shield,
  Database,
  Bell,
  ArrowLeft,
  MessageSquare,
  Stethoscope,
  Building2,
  Pill,
  TrendingUp,
  Heart
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const TeamTools = () => {
  const navigate = useNavigate();

  const tools = [
    {
      title: 'User Management',
      description: 'Manage users, profiles, and permissions',
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      link: '/admin/users',
      category: 'Management'
    },
    {
      title: 'Doctor Management',
      description: 'Manage doctor profiles and schedules',
      icon: Stethoscope,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      link: '/admin/doctors',
      category: 'Management'
    },
    {
      title: 'Appointments',
      description: 'View and manage all appointments',
      icon: Calendar,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      link: '/admin/appointments',
      category: 'Operations'
    },
    {
      title: 'Chat Dashboard',
      description: 'Monitor and manage customer chats',
      icon: MessageSquare,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      link: '/admin/chat',
      category: 'Support'
    },
    {
      title: 'Hospitals',
      description: 'Manage hospital network and facilities',
      icon: Building2,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
      link: '/admin/hospitals',
      category: 'Management'
    },
    {
      title: 'Pharmacies',
      description: 'Manage pharmacy partners and inventory',
      icon: Pill,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
      link: '/admin/pharmacies',
      category: 'Management'
    },
    {
      title: 'Health Plans',
      description: 'Manage subscription plans and packages',
      icon: Heart,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      link: '/admin/plans',
      category: 'Business'
    },
    {
      title: 'Analytics',
      description: 'View system analytics and insights',
      icon: TrendingUp,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
      link: '/team/reports',
      category: 'Analytics'
    },
    {
      title: 'Audit Logs',
      description: 'View system activity and audit trails',
      icon: Database,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      link: '/admin/activity-log',
      category: 'Security'
    },
    {
      title: 'Notifications',
      description: 'Manage system notifications',
      icon: Bell,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
      link: '/admin/email',
      category: 'Communication'
    },
    {
      title: 'System Settings',
      description: 'Configure system parameters',
      icon: Settings,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
      link: '/admin/system-test',
      category: 'Administration'
    },
    {
      title: 'Access Control',
      description: 'Manage roles and permissions',
      icon: Shield,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      link: '/admin/team',
      category: 'Security'
    }
  ];

  const categories = [...new Set(tools.map(t => t.category))];

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto animate-in fade-in duration-700">
        {/* Back Button */}
        <Link 
          to="/team/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
            <Activity className="h-8 w-8 text-orange-500" />
            Healthcare Management Tools
          </h1>
          <p className="text-muted-foreground">Access platform features and administrative tools</p>
        </div>

        {/* Tools by Category */}
        {categories.map((category) => (
          <div key={category} className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <div className="h-1 w-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
              {category}
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tools
                .filter(tool => tool.category === category)
                .map((tool, index) => (
                  <Card 
                    key={index}
                    className="group hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
                    onClick={() => navigate(tool.link)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`p-3 rounded-xl ${tool.bgColor} transition-transform duration-300 group-hover:scale-110`}>
                          <tool.icon className={`h-6 w-6 ${tool.color}`} />
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {tool.category}
                        </Badge>
                      </div>
                      
                      <h3 className="text-lg font-semibold mb-2 group-hover:text-blue-600 transition-colors">
                        {tool.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {tool.description}
                      </p>
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full group-hover:bg-blue-500 group-hover:text-white transition-all"
                      >
                        Open Tool
                      </Button>
                    </CardContent>
                  </Card>
              ))}
            </div>
          </div>
        ))}

        {/* Help Section */}
        <Card className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-500" />
              Need Help?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              If you need access to additional tools or have questions about using these features, 
              please contact your system administrator.
            </p>
            <div className="flex gap-3">
              <Button variant="outline">
                <MessageSquare className="h-4 w-4 mr-2" />
                Contact Support
              </Button>
              <Button variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Documentation
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default TeamTools;
