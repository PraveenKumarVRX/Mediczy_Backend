import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MainLayout from '@/components/layout/MainLayout';
import { 
  Users, 
  Shield, 
  Clock, 
  Calendar, 
  Settings, 
  Bell, 
  Activity,
  CheckCircle2,
  HeartPulse,
  Crown,
  Plus,
  BarChart3,
  FileText,
  LogOut,
  ArrowRight,
  Building2,
  Stethoscope,
  MessageSquare,
  Ticket,
  MessageCircle,
  Mail
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import EmailInbox from '@/components/team/EmailInbox';

interface TeamUser {
  id: number | string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  designation?: string;
  role: string;
  permissions?: string[];
  lastLogin?: string;
  isActive: boolean;
}

const TeamDashboard = () => {
  const navigate = useNavigate();
  const [teamUser, setTeamUser] = useState<TeamUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'emails'>('dashboard');

  useEffect(() => {
    const fetchTeamProfile = async () => {
      try {
        const token = localStorage.getItem('teamToken');
        
        if (!token) {
          navigate('/team/login');
          return;
        }

        // Handle development token
        if (token === 'dev-team-token') {
          const defaultTeamUser = {
            id: 999,
            firstName: 'Team',
            lastName: 'Developer',
            email: 'team@mediczy.com',
            department: 'Development',
            designation: 'Team Lead',
            role: 'Team Lead',
            permissions: [
              'User Management', 'Doctor Management', 'Appointment Management',
              'Patient Reports', 'System Settings', 'Content Management', 
              'Analytics Reports', 'Audit Logs', 'Chat Dashboard Access',
              'Hospital Management', 'Clinic Management', 'Lab Management',
              'Pharmacy Management', 'Health Plans Access',
              'Email Management', 'Team Directory Access', 'Backup Management'
            ],
            modules: [
              'users', 'doctors', 'appointments', 'chat', 'hospitals', 'clinics', 'labs',
              'pharmacies', 'plans', 'reports', 'team_directory', 'profile', 'notifications'
            ],
            lastLogin: new Date().toISOString(),
            isActive: true
          };
          setTeamUser(defaultTeamUser);
          localStorage.setItem('teamUserData', JSON.stringify(defaultTeamUser));
          setLoading(false);
          return;
        }

        // Fetch profile from API to ensure data is fresh
        try {
          const response = await api.get('/team/profile');
          const data = response.data;

          if (data.success && data.teamUser) {
            setTeamUser(data.teamUser);
            localStorage.setItem('teamUserData', JSON.stringify(data.teamUser));
          } else {
            // Fallback to localStorage if API fails
            const userData = localStorage.getItem('teamUserData');
            if (userData) {
              const parsedUser = JSON.parse(userData);
              setTeamUser(parsedUser);
            } else {
              navigate('/team/login');
              return;
            }
          }
        } catch (error: any) {
          const status = error?.response?.status;
          if (status === 401 || status === 403) {
            localStorage.removeItem('teamToken');
            localStorage.removeItem('teamUserData');
            navigate('/team/login');
            return;
          }
        }
      } catch (error) {
        console.error('Error fetching team profile:', error);
        // Try to use cached data
        const userData = localStorage.getItem('teamUserData');
        if (userData) {
          try {
            const parsedUser = JSON.parse(userData);
            setTeamUser(parsedUser);
          } catch (parseError) {
            console.error('Invalid cached team data:', parseError);
            localStorage.removeItem('teamToken');
            localStorage.removeItem('teamUserData');
            navigate('/team/login');
            return;
          }
        } else {
          navigate('/team/login');
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTeamProfile();
  }, [navigate]);

  const getPermissionsByCategory = (permissions: string[] = []) => {
    const categories = {
      'Management': permissions.filter(p => p.includes('Management') || p.includes('User')),
      'Reports': permissions.filter(p => p.includes('Reports') || p.includes('Analytics')),
      'System': permissions.filter(p => p.includes('System') || p.includes('Settings') || p.includes('Backup')),
      'Content': permissions.filter(p => p.includes('Content') || p.includes('Audit'))
    };
    return categories;
  };

  // Quick actions with proper theming
  const quickActions = [
    {
      title: "Profile Settings",
      description: "Update your information",
      icon: Settings,
      color: "bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20",
      iconColor: "text-blue-500",
      link: "/team/profile",
      pattern: "radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Corporate Management",
      description: "Manage corporate accounts",
      icon: Building2,
      color: "bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border-indigo-500/20",
      iconColor: "text-indigo-500",
      link: "/team/corporate-management",
      pattern: "radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Team Directory",
      description: "View team members",
      icon: Users,
      color: "bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20",
      iconColor: "text-green-500",
      link: "/team/directory",
      pattern: "radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)",
    },
    {
      title: "WhatsApp Communication",
      description: "Manage customer conversations",
      icon: MessageCircle,
      color: "bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20",
      iconColor: "text-emerald-500",
      link: "/team/whatsapp",
      pattern: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Reports & Analytics",
      description: "View performance data",
      icon: BarChart3,
      color: "bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/20",
      iconColor: "text-purple-500",
      link: "/team/reports",
      pattern: "radial-gradient(circle at 100% 0%, rgba(147, 51, 234, 0.05) 0%, transparent 50%)",
    },
    {
      title: "System Access",
      description: "Healthcare management tools",
      icon: Activity,
      color: "bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20",
      iconColor: "text-orange-500",
      link: "/team/tools",
      pattern: "radial-gradient(circle at 0% 100%, rgba(249, 115, 22, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Chat Analytics",
      description: "Monitor chat performance and analytics",
      icon: MessageSquare,
      color: "bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border-teal-500/20",
      iconColor: "text-teal-500",
      link: "/team/chat-analytics",
      pattern: "radial-gradient(circle at 50% 0%, rgba(20, 184, 166, 0.05) 0%, transparent 50%)",
    },
    {
      title: "Support Tickets",
      description: "Manage customer support tickets",
      icon: Ticket,
      color: "bg-gradient-to-br from-pink-500/10 to-rose-500/10 border-pink-500/20",
      iconColor: "text-pink-500",
      link: "/team/support-tickets",
      pattern: "radial-gradient(circle at 100% 50%, rgba(236, 72, 153, 0.05) 0%, transparent 50%)",
    }
  ];

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading team dashboard...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!teamUser) {
    return null;
  }

  const permissionCategories = getPermissionsByCategory(teamUser?.permissions || []);

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto animate-in fade-in duration-700">
        {/* Dashboard vs Email Tabs */}
        <div className="flex gap-2 mb-8">
          <Button
            onClick={() => setActiveTab('dashboard')}
            variant={activeTab === 'dashboard' ? 'default' : 'outline'}
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </Button>
          <Button
            onClick={() => setActiveTab('emails')}
            variant={activeTab === 'emails' ? 'default' : 'outline'}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            Email Inbox
          </Button>
        </div>

        {/* Email Inbox Tab */}
        {activeTab === 'emails' && (
          <div className="mb-8">
            <EmailInbox />
          </div>
        )}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <>
        {/* Welcome Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-500/5 to-blue-500/5 border border-purple-500/20 p-8 mb-8 backdrop-blur-xl">
          {/* Subtle background pattern */}
          <div className="absolute inset-0">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 50% 50%, rgba(147, 51, 234, 0.03) 0%, transparent 25%)`,
              backgroundSize: '40px 40px',
              backgroundPosition: '0 0, 20px 20px'
            }} />
          </div>

          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                    <Shield className="w-8 h-8 text-purple-500" />
                  </div>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-foreground mb-1">
                    Welcome back, {teamUser.firstName}!
                  </h1>
                  <p className="text-muted-foreground text-lg">
                    {teamUser.designation} • {teamUser.department}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge 
                      variant="outline" 
                      className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20 text-purple-700"
                    >
                      <Crown className="w-3 h-3 mr-1" />
                      {teamUser.role}
                    </Badge>
                    {teamUser.isActive && (
                      <Badge 
                        variant="outline" 
                        className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20 text-green-700"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              {(teamUser.role === 'Super Admin' || teamUser.role === 'Admin') && (
                <Link 
                  to="/admin"
                  className="group flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 text-amber-700 hover:from-amber-500/20 hover:to-orange-500/20 transition-all duration-300"
                >
                  <Crown className="h-5 w-5" />
                  <span className="font-medium">Admin Panel</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              )}
            </div>
            
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Employee ID:</span>
                <span className="text-muted-foreground">{teamUser.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Last Login:</span>
                <span className="text-muted-foreground">
                  {teamUser.lastLogin ? new Date(teamUser.lastLogin).toLocaleDateString() : 'First login'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Decorative elements */}
          <div className="absolute -right-16 -top-16 opacity-[0.02] pointer-events-none">
            <Plus className="w-48 h-48 text-purple-500 rotate-12" />
          </div>
          <div className="absolute -left-16 -bottom-16 opacity-[0.02] pointer-events-none">
            <Plus className="w-48 h-48 text-blue-500 -rotate-12" />
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {quickActions.map((action, index) => (
            <Link 
              key={index} 
              to={action.link}
              className="group"
            >
              <Card className={`
                h-full transition-all duration-500
                hover:shadow-xl ${action.color}
                backdrop-blur-xl relative overflow-hidden
                transform hover:-translate-y-1
              `}>
                <div className="absolute inset-0" style={{ background: action.pattern }} />
                <CardContent className="p-6 relative">
                  <div className="flex items-start justify-between mb-6">
                    <div className={`
                      p-3 rounded-xl ${action.color}
                      transform transition-transform duration-300
                      group-hover:scale-110 group-hover:rotate-3
                    `}>
                      <action.icon className={`w-8 h-8 ${action.iconColor}`} />
                    </div>
                    <ArrowRight className={`w-5 h-5 ${action.iconColor} transition-transform duration-300 group-hover:translate-x-2`} />
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-2">{action.title}</h3>
                  <p className="text-muted-foreground">{action.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Permissions Overview */}
        <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 border border-indigo-500/20 backdrop-blur-xl relative overflow-hidden transform hover:-translate-y-1">
          <div className="absolute inset-0" style={{ 
            background: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)' 
          }} />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-indigo-500" />
              Your Access Permissions
              <Badge variant="outline" className="ml-2">
                {teamUser.permissions.length} permissions
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.entries(permissionCategories).map(([category, perms]) => (
                <div key={category} className="space-y-3">
                  <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    {category === 'Management' && <Users className="h-4 w-4 text-blue-500" />}
                    {category === 'Reports' && <BarChart3 className="h-4 w-4 text-green-500" />}
                    {category === 'System' && <Settings className="h-4 w-4 text-purple-500" />}
                    {category === 'Content' && <FileText className="h-4 w-4 text-orange-500" />}
                    {category}
                  </h4>
                  <div className="space-y-2">
                    {perms.length > 0 ? (
                      perms.map((permission) => (
                        <div key={permission} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                          <span className="text-xs text-muted-foreground">{permission}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No permissions</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </>
        )}
      </div>

      <style>{`
        @keyframes slide {
          0% { background-position: 0 0; }
          100% { background-position: 56.57px 56.57px; }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </MainLayout>
  );
};

export default TeamDashboard;