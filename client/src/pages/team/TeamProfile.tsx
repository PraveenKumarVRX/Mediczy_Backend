import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MainLayout from '@/components/layout/MainLayout';
import { 
  User, 
  Mail, 
  Shield, 
  Building2, 
  Calendar, 
  Clock,
  Edit,
  Save,
  X,
  CheckCircle2,
  ArrowLeft
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/utils/api';

const TeamProfile = () => {
  const navigate = useNavigate();
  const [teamUser, setTeamUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
    designation: ''
  });

  useEffect(() => {
    const token = localStorage.getItem('teamToken');
    const userData = localStorage.getItem('teamUserData');

    if (!token) {
      navigate('/team/login');
      return;
    }

    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setTeamUser(parsedUser);
        setFormData({
          firstName: parsedUser.firstName || '',
          lastName: parsedUser.lastName || '',
          email: parsedUser.email || '',
          department: parsedUser.department || '',
          designation: parsedUser.designation || ''
        });
      } catch (error) {
        console.error('Invalid team user data:', error);
        navigate('/team/login');
        return;
      }
    }

    setLoading(false);
  }, [navigate]);

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('teamToken');
      if (!token) {
        navigate('/team/login');
        return;
      }

      // Update profile on server
      try {
        const response = await api.put('/team/profile', formData);
        const data = response.data;
        if (data?.success && data?.teamUser) {
          setTeamUser(data.teamUser);
          localStorage.setItem('teamUserData', JSON.stringify(data.teamUser));
        }
      } catch (error) {
        console.error('Error saving profile (API):', error);
      }

      // Update locally even if API fails
      const updatedUser = { ...teamUser, ...formData };
      setTeamUser(updatedUser);
      localStorage.setItem('teamUserData', JSON.stringify(updatedUser));
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      // Still save locally
      const updatedUser = { ...teamUser, ...formData };
      setTeamUser(updatedUser);
      localStorage.setItem('teamUserData', JSON.stringify(updatedUser));
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      firstName: teamUser.firstName || '',
      lastName: teamUser.lastName || '',
      email: teamUser.email || '',
      department: teamUser.department || '',
      designation: teamUser.designation || ''
    });
    setIsEditing(false);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto animate-in fade-in duration-700">
        {/* Back Button */}
        <Link 
          to="/team/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Profile Header */}
        <Card className="mb-6 bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="h-6 w-6 text-blue-500" />
                Team Profile
              </CardTitle>
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} size="sm" className="gap-2">
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={handleSave} size="sm" className="gap-2">
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                  <Button onClick={handleCancel} size="sm" variant="outline" className="gap-2">
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <Label>First Name</Label>
                {isEditing ? (
                  <Input
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="text-lg font-medium mt-1">{teamUser?.firstName}</p>
                )}
              </div>

              <div>
                <Label>Last Name</Label>
                {isEditing ? (
                  <Input
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="text-lg font-medium mt-1">{teamUser?.lastName}</p>
                )}
              </div>

              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <p className="text-lg">{teamUser?.email}</p>
                </div>
              </div>

              <div>
                <Label>Department</Label>
                {isEditing ? (
                  <Input
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-lg">{teamUser?.department}</p>
                  </div>
                )}
              </div>

              <div>
                <Label>Designation</Label>
                {isEditing ? (
                  <Input
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="text-lg font-medium mt-1">{teamUser?.designation}</p>
                )}
              </div>

              <div>
                <Label>Role</Label>
                <Badge className="mt-1" variant="outline">
                  <Shield className="h-3 w-3 mr-1" />
                  {teamUser?.role}
                </Badge>
              </div>

              <div>
                <Label>Employee ID</Label>
                <p className="text-lg font-mono mt-1">{teamUser?.id}</p>
              </div>

              <div>
                <Label>Status</Label>
                <Badge className="mt-1" variant={teamUser?.isActive ? "default" : "secondary"}>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {teamUser?.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {teamUser?.lastLogin && (
                <div className="md:col-span-2">
                  <Label>Last Login</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-lg">{new Date(teamUser.lastLogin).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Permissions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-purple-500" />
              Access Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {teamUser?.permissions?.map((permission: string) => (
                <div key={permission} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{permission}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default TeamProfile;
