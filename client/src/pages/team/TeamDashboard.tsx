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
  Mail,
  Briefcase
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

// Maps each permission string to a display category.
// Strings that don't match any keyword fall into "Other".
const PERMISSION_CATEGORIES = {
  Management: (p: string) =>
    /management|user|doctor|corporate|hospital|clinic|lab|pharmacy|broker|medivac|ngo|psu/i.test(p),
  Analytics: (p: string) => /report|analytics|stats|metric|insight/i.test(p),
  System: (p: string) => /system|setting|backup|infrastructure|security|config/i.test(p),
  Access: (p: string) => /access|chat|dashboard|audit|log|content|communication/i.test(p),
};

const getPermissionsByCategory = (permissions: string[] = []) => {
  const result: Record<string, string[]> = { Management: [], Analytics: [], System: [], Access: [] };
  const other: string[] = [];
  for (const p of permissions) {
    let placed = false;
    for (const [cat, test] of Object.entries(PERMISSION_CATEGORIES)) {
      if (test(p)) { result[cat].push(p); placed = true; break; }
    }
    if (!placed) other.push(p);
  }
  if (other.length) result['Other'] = other;
  return result;
};

// Permission keyword → quick action title mapping used for visibility gating.
// A card is shown when the user has at least one permission matching its guard,
// or when no guard is specified (always-visible cards like Profile Settings).
const QUICK_ACTIONS = [
  {
    title: "Profile Settings",
    description: "Update your information",
    icon: Settings,
    color: "bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20",
    iconColor: "text-blue-500",
    link: "/team/profile",
    pattern: "radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)",
    permissionGuard: null, // always visible
  },
  {
    title: "Corporate Management",
    description: "Manage corporate accounts",
    icon: Building2,
    color: "bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border-indigo-500/20",
    iconColor: "text-indigo-500",
    link: "/team/corporate-management",
    pattern: "radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)",
    permissionGuard: /corporate/i,
  },
  {
    title: "Team Directory",
    description: "View team members",
    icon: Users,
    color: "bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20",
    iconColor: "text-green-500",
    link: "/team/directory",
    pattern: "radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)",
    permissionGuard: /user management|team/i,
  },
  {
    title: "WhatsApp Communication",
    description: "Manage customer conversations",
    icon: MessageCircle,
    color: "bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20",
    iconColor: "text-emerald-500",
    link: "/team/whatsapp",
    pattern: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.05) 0%, transparent 50%)",
    permissionGuard: /chat|communication|whatsapp/i,
  },
  {
    title: "WhatsApp Templates",
    description: "Create & manage message templates",
    icon: FileText,
    color: "bg-gradient-to-br from-green-500/10 to-teal-500/10 border-green-500/20",
    iconColor: "text-green-600",
    link: "/team/whatsapp-templates",
    pattern: "radial-gradient(circle at 50% 50%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)",
    permissionGuard: /chat|communication|whatsapp/i,
  },
  {
    title: "WhatsApp Inbox",
    description: "WATI-like inbox for WhatsApp customers",
    icon: MessageCircle,
    color: "bg-gradient-to-br from-green-600/10 to-emerald-600/10 border-green-600/20",
    iconColor: "text-green-700",
    link: "/team/whatsapp-inbox",
    pattern: "radial-gradient(circle at 0% 50%, rgba(22, 163, 74, 0.05) 0%, transparent 50%)",
    permissionGuard: /chat|communication|whatsapp/i,
  },
  {
    title: "RC Omnichannel",
    description: "Full RocketChat agent interface",
    icon: MessageSquare,
    color: "bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/20",
    iconColor: "text-red-600",
    link: "/team/rc-omnichannel",
    pattern: "radial-gradient(circle at 100% 50%, rgba(239, 68, 68, 0.05) 0%, transparent 50%)",
    permissionGuard: /chat|communication|omnichannel/i,
  },
  {
    title: "Reports & Analytics",
    description: "View performance data",
    icon: BarChart3,
    color: "bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/20",
    iconColor: "text-purple-500",
    link: "/team/reports",
    pattern: "radial-gradient(circle at 100% 0%, rgba(147, 51, 234, 0.05) 0%, transparent 50%)",
    permissionGuard: /report|analytics/i,
  },
  {
    title: "System Access",
    description: "Healthcare management tools",
    icon: Activity,
    color: "bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20",
    iconColor: "text-orange-500",
    link: "/team/tools",
    pattern: "radial-gradient(circle at 0% 100%, rgba(249, 115, 22, 0.05) 0%, transparent 50%)",
    permissionGuard: /system|setting/i,
  },
  {
    title: "Chat Analytics",
    description: "Monitor chat performance and analytics",
    icon: MessageSquare,
    color: "bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border-teal-500/20",
    iconColor: "text-teal-500",
    link: "/team/chat-analytics",
    pattern: "radial-gradient(circle at 50% 0%, rgba(20, 184, 166, 0.05) 0%, transparent 50%)",
    permissionGuard: /chat|analytics/i,
  },
  {
    title: "Support Tickets",
    description: "Manage customer support tickets",
    icon: Ticket,
    color: "bg-gradient-to-br from-pink-500/10 to-rose-500/10 border-pink-500/20",
    iconColor: "text-pink-500",
    link: "/team/support-tickets",
    pattern: "radial-gradient(circle at 100% 50%, rgba(236, 72, 153, 0.05) 0%, transparent 50%)",
    permissionGuard: /support|ticket/i,
  },
  {
    title: "Health Plans",
    description: "Create & configure membership plans",
    icon: Crown,
    color: "bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border-amber-500/20",
    iconColor: "text-amber-500",
    link: "/team/health-plans",
    pattern: "radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.05) 0%, transparent 50%)",
    permissionGuard: /health plan|plan/i,
  },
  {
    title: "Doctor Management",
    description: "Review registrations, verify documents, activate doctors",
    icon: Stethoscope,
    color: "bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20",
    iconColor: "text-blue-400",
    link: "/team/doctor-management",
    pattern: "radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.06) 0%, transparent 50%)",
    permissionGuard: /doctor/i,
  },
  {
    title: "Broker Management",
    description: "Manage intermediary & broker accounts",
    icon: Briefcase,
    color: "bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20",
    iconColor: "text-violet-500",
    link: "/team/broker-management",
    pattern: "radial-gradient(circle at 100% 0%, rgba(139, 92, 246, 0.05) 0%, transparent 50%)",
    permissionGuard: /broker/i,
  },
];

const TeamDashboard = ({ initialTab }: { initialTab?: 'dashboard' | 'emails' } = {}) => {
  const navigate = useNavigate();
  const [teamUser, setTeamUser] = useState<TeamUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'emails'>(initialTab ?? 'dashboard');

  useEffect(() => {
    const fetchTeamProfile = async () => {
      try {
        const token = localStorage.getItem('teamToken');

        if (!token) {
          navigate('/team/login');
          return;
        }

        try {
          const response = await api.get('/team/profile');
          const data = response.data;

          if (data.success && data.teamUser) {
            setTeamUser(data.teamUser);
            localStorage.setItem('teamUserData', JSON.stringify(data.teamUser));
          } else {
            const userData = localStorage.getItem('teamUserData');
            if (userData) {
              setTeamUser(JSON.parse(userData));
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
        const userData = localStorage.getItem('teamUserData');
        if (userData) {
          try {
            setTeamUser(JSON.parse(userData));
          } catch {
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

  if (!teamUser) return null;

  const permissions: string[] = teamUser.permissions ?? [];
  const permissionCount = permissions.length;
  const permissionCategories = getPermissionsByCategory(permissions);

  // Gate quick actions: show if no guard defined, or user has a matching permission
  const visibleActions = QUICK_ACTIONS.filter(({ permissionGuard }) => {
    if (!permissionGuard) return true;
    return permissions.some((p) => permissionGuard.test(p));
  });

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

        {activeTab === 'emails' && (
          <div className="mb-8">
            <EmailInbox />
          </div>
        )}

        {activeTab === 'dashboard' && (
          <>
            {/* Welcome Section */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-500/5 to-blue-500/5 border border-purple-500/20 p-8 mb-8 backdrop-blur-xl">
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

              <div className="absolute -right-16 -top-16 opacity-[0.02] pointer-events-none">
                <Plus className="w-48 h-48 text-purple-500 rotate-12" />
              </div>
              <div className="absolute -left-16 -bottom-16 opacity-[0.02] pointer-events-none">
                <Plus className="w-48 h-48 text-blue-500 -rotate-12" />
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {visibleActions.map((action, index) => (
                <Link key={index} to={action.link} className="group">
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
                    {permissionCount} permission{permissionCount !== 1 ? 's' : ''}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="relative">
                {permissionCount === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No permissions assigned yet. Contact your admin.</p>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {Object.entries(permissionCategories).map(([category, perms]) => (
                      perms.length > 0 && (
                        <div key={category} className="space-y-3">
                          <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                            {category === 'Management' && <Users className="h-4 w-4 text-blue-500" />}
                            {category === 'Analytics' && <BarChart3 className="h-4 w-4 text-green-500" />}
                            {category === 'System' && <Settings className="h-4 w-4 text-purple-500" />}
                            {category === 'Access' && <Shield className="h-4 w-4 text-indigo-500" />}
                            {category === 'Other' && <Activity className="h-4 w-4 text-orange-500" />}
                            {category}
                          </h4>
                          <div className="space-y-2">
                            {perms.map((permission) => (
                              <div key={permission} className="flex items-center gap-2">
                                <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                                <span className="text-xs text-muted-foreground">{permission}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default TeamDashboard;
