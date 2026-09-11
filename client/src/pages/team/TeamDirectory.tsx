import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import MainLayout from '@/components/layout/MainLayout';
import { 
  Users, 
  Search, 
  Mail, 
  Phone, 
  Building2, 
  Shield,
  ArrowLeft,
  Filter,
  UserCircle2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/utils/api';

const TeamDirectory = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleSendEmail = (email: string, name: string) => {
    const subject = encodeURIComponent('Hello from Mediczy Team');
    const body = encodeURIComponent(`Hi ${name},\n\n`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        const token = localStorage.getItem('teamToken');
        if (!token) {
          return;
        }

        const response = await api.get('/team/directory');
        const data = response.data;
        if (data?.success && Array.isArray(data?.members)) {
          const normalized = data.members
            .filter(Boolean)
            .map((raw: any) => {
              const id = raw.id || raw._id || raw.userId || raw.email || raw.emailAddress;
              const firstName = raw.firstName || raw.givenName || raw.name?.split?.(' ')?.[0] || '';
              const lastName = raw.lastName || raw.familyName || raw.name?.split?.(' ')?.slice?.(1)?.join?.(' ') || '';
              const email = raw.email || raw.emailAddress || raw.workEmail || raw.contactEmail || '';
              const phone = raw.phone || raw.mobile || raw.phoneNumber || raw.contactPhone || '';

              return {
                id: id ? String(id) : `${firstName}-${lastName}-${email}`,
                firstName,
                lastName,
                email,
                phone,
                department: raw.department || raw.team || raw.group || 'General',
                designation: raw.designation || raw.title || raw.position || 'Team Member',
                role: raw.role || raw.accessRole || raw.userRole || 'Member',
                isActive: typeof raw.isActive === 'boolean' ? raw.isActive : (typeof raw.active === 'boolean' ? raw.active : true),
                avatar: raw.avatar || null,
              };
            })
            .filter((m: any) => m.email || m.phone || (m.firstName || m.lastName));

          setTeamMembers(normalized);
        }
      } catch (err) {
        console.error('Error fetching team members:', err);
        setError('Failed to load team directory');
      } finally {
        setLoading(false);
      }
    };

    fetchTeamMembers();
  }, []);

  const displayMembers = teamMembers;
  const departments = ['all', ...new Set(displayMembers.map(m => m.department))];

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading team directory...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const filteredMembers = displayMembers.filter(member => {
    const matchesSearch = 
      member.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.department.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDepartment = filterDepartment === 'all' || member.department === filterDepartment;
    
    return matchesSearch && matchesDepartment;
  });

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
      case 'Manager':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'Team Lead':
        return 'bg-green-500/10 text-green-700 border-green-500/20';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
    }
  };

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
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
              <Users className="h-8 w-8 text-blue-500" />
              Team Directory
            </h1>
            <p className="text-muted-foreground">Browse and connect with team members</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/team/user-management">
              <Shield className="h-4 w-4 mr-2" />
              Manage Team &amp; Permissions
            </Link>
          </Button>
        </div>

        {/* Search and Filter */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="px-4 py-2 rounded-md border border-input bg-background"
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            Showing {filteredMembers.length} of {displayMembers.length} team members
          </p>
        </div>

        {/* Team Members Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMembers.map((member) => (
            <Card key={member.id} className="group hover:shadow-lg transition-all duration-300">
              <CardHeader>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                      <UserCircle2 className="h-8 w-8 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">
                        {member.firstName} {member.lastName}
                      </h3>
                      <p className="text-sm text-muted-foreground">{member.designation}</p>
                    </div>
                  </div>
                  {member.isActive ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-400" />
                  )}
                </div>
                
                <div className="space-y-2">
                  <Badge variant="outline" className={getRoleBadgeColor(member.role)}>
                    <Shield className="h-3 w-3 mr-1" />
                    {member.role}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">{member.department}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a 
                    href={`mailto:${member.email}`}
                    className="text-blue-600 hover:underline truncate"
                  >
                    {member.email}
                  </a>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a 
                    href={`tel:${member.phone}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {member.phone}
                  </a>
                </div>

                <div className="pt-3 flex gap-2">
                  {member.email ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      <a
                        href={`mailto:${member.email}?subject=${encodeURIComponent('Hello from Mediczy Team')}&body=${encodeURIComponent(`Hi ${`${member.firstName} ${member.lastName}`.trim() || 'there'},\n\n`)}`}
                      >
                        <Mail className="h-3 w-3 mr-1 inline" />
                        Email
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled
                    >
                      <Mail className="h-3 w-3 mr-1" />
                      Email
                    </Button>
                  )}
                  {member.phone ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      <a href={`tel:${member.phone}`}>
                        <Phone className="h-3 w-3 mr-1 inline" />
                        Call
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled
                    >
                      <Phone className="h-3 w-3 mr-1" />
                      Call
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredMembers.length === 0 && (
          <Card className="p-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">No team members found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};

export default TeamDirectory;
