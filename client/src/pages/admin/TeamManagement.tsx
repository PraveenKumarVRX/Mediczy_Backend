import { useState, useRef, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, Plus, Users, Shield, Briefcase, Eye, Edit, Trash2, LayoutGrid, List, Mail, Phone, Calendar } from 'lucide-react';
import api from '@/utils/api';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface TeamUser {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phoneNumber: string;
  employeeId: string;
  department: string;
  designation: string;
  role: string;
  permissions: string[];
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  joiningDate: string;
  isActive: boolean;
  canLogin: boolean;
  lastLogin?: string;
  profileImage?: string;
}

const departments = [
  'Administration', 'Human Resources', 'Finance', 'IT Support', 'Marketing',
  'Operations', 'Customer Service', 'Quality Assurance', 'Legal', 'Compliance',
  'Business Development', 'Medical Affairs', 'Research & Development'
];

const designations = [
  'CEO', 'CTO', 'CFO', 'VP', 'Director', 'Manager', 'Assistant Manager',
  'Team Lead', 'Senior Executive', 'Executive', 'Associate', 'Junior Associate',
  'Intern', 'Consultant', 'Specialist', 'Coordinator', 'Administrator'
];

const roles = [
  'Super Admin', 'Admin', 'Manager', 'Supervisor', 'Executive', 'Support Staff',
  'Data Analyst', 'Content Manager', 'System Administrator', 'User Support'
];

const permissions = [
  'Dashboard Access', 'User Management', 'Doctor Management', 'Hospital Management',
  'Appointment Management', 'Insurance Management', 'Plan Management', 'Reports Access',
  'Settings Management', 'Audit Logs', 'Backup Management', 'System Configuration',
  'Financial Reports', 'User Analytics', 'Content Management', 'Support Tickets'
];

const TeamManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [viewingUser, setViewingUser] = useState<TeamUser | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const token = localStorage.getItem('adminToken');

  const [newUser, setNewUser] = useState<TeamUser>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
    employeeId: '',
    department: '',
    designation: '',
    role: '',
    permissions: [],
    address: { street: '', city: '', state: '', pincode: '' },
    emergencyContact: { name: '', relationship: '', phone: '' },
    joiningDate: new Date().toISOString().split('T')[0],
    isActive: true,
    canLogin: true
  });

  useEffect(() => {
    fetchTeamUsers();
  }, []);

  const fetchTeamUsers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/team', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setTeamUsers((data as any).teamUsers || data || []);
    } catch (err: any) {
      console.error('Failed to fetch team users:', err);
      setTeamUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSingleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const endpoint = editingUser ? `/admin/team/${editingUser.id}` : '/admin/team';
      const method = editingUser ? api.put : api.post;

      const { data } = await method(endpoint,
        { user: newUser },
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      
      setResult(data);
      resetForm();
      fetchTeamUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${editingUser ? 'update' : 'create'} team user`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this team user?')) return;
    
    try {
      setLoading(true);
      await api.delete(`/admin/team/${userId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setResult({ message: 'Team user deleted successfully' });
      fetchTeamUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete team user');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUpload = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const users = JSON.parse(jsonInput);
      const { data } = await api.post('/admin/team/bulk',
        { users: Array.isArray(users) ? users : [users] },
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
      );
      
      setResult(data);
      setJsonInput('');
      fetchTeamUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'JSON upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = (permission: string) => {
    setNewUser(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  const resetForm = () => {
    setNewUser({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phoneNumber: '',
      employeeId: '',
      department: '',
      designation: '',
      role: '',
      permissions: [],
      address: { street: '', city: '', state: '', pincode: '' },
      emergencyContact: { name: '', relationship: '', phone: '' },
      joiningDate: new Date().toISOString().split('T')[0],
      isActive: true,
      canLogin: true
    });
    setEditingUser(null);
  };

  const startEditUser = (user: TeamUser) => {
    setNewUser({ ...user });
    setEditingUser(user);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              Team Management
            </h2>
            <p className="text-muted-foreground">Manage team members, roles, and access permissions</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Total: {teamUsers.length} team members
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Team</p>
                  <p className="text-3xl font-bold">{teamUsers.length}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Users</p>
                  <p className="text-3xl font-bold">{teamUsers.filter(u => u.isActive).length}</p>
                </div>
                <Shield className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Login Enabled</p>
                  <p className="text-3xl font-bold">{teamUsers.filter(u => u.canLogin).length}</p>
                </div>
                <Shield className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Departments</p>
                  <p className="text-3xl font-bold">{new Set(teamUsers.map(u => u.department)).size}</p>
                </div>
                <Briefcase className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            {result.message} {result.count !== undefined && `(${result.count} records)`}
          </div>
        )}

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="list">Team List</TabsTrigger>
            <TabsTrigger value="create">{editingUser ? 'Edit User' : 'Add User'}</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {teamUsers.length} team member{teamUsers.length !== 1 ? 's' : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant={viewMode === 'grid' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="h-4 w-4 mr-2" />
                      Grid
                    </Button>
                    <Button 
                      variant={viewMode === 'table' ? 'default' : 'outline'} 
                      size="sm" 
                      onClick={() => setViewMode('table')}
                    >
                      <List className="h-4 w-4 mr-2" />
                      Table
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="text-center py-8">Loading team members...</div>
            ) : teamUsers.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No team members found. Add your first team member to get started.</p>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {teamUsers.map((user) => (
                  <Card key={user.id}>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold">{user.firstName} {user.lastName}</h3>
                            <p className="text-sm text-muted-foreground">{user.designation}</p>
                            <p className="text-sm text-muted-foreground">{user.department}</p>
                            <p className="text-xs text-muted-foreground">ID: {user.employeeId}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className={`px-2 py-1 rounded-full text-xs ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </div>
                            {user.canLogin && (
                              <div className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                Login Enabled
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="text-sm font-medium">Role:</span>
                            <span className="ml-2 text-sm">{user.role}</span>
                          </div>
                          <div>
                            <span className="text-sm font-medium">Email:</span>
                            <span className="ml-2 text-sm">{user.email}</span>
                          </div>
                          <div>
                            <span className="text-sm font-medium">Phone:</span>
                            <span className="ml-2 text-sm">{user.phoneNumber}</span>
                          </div>
                          <div>
                            <span className="text-sm font-medium">Joined:</span>
                            <span className="ml-2 text-sm">{new Date(user.joiningDate).toLocaleDateString()}</span>
                          </div>
                          {user.lastLogin && (
                            <div>
                              <span className="text-sm font-medium">Last Login:</span>
                              <span className="ml-2 text-sm">{new Date(user.lastLogin).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">Permissions ({user.permissions.length}):</p>
                          <div className="flex flex-wrap gap-1">
                            {user.permissions.slice(0, 3).map((permission) => (
                              <span key={permission} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                {permission}
                              </span>
                            ))}
                            {user.permissions.length > 3 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                +{user.permissions.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setViewingUser(user)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>{user.firstName} {user.lastName} - Details</DialogTitle>
                              </DialogHeader>
                              {viewingUser && (
                                <div className="space-y-4">
                                  <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="font-semibold">Employee ID</Label>
                                      <p>{viewingUser.employeeId}</p>
                                    </div>
                                    <div>
                                      <Label className="font-semibold">Department</Label>
                                      <p>{viewingUser.department}</p>
                                    </div>
                                    <div>
                                      <Label className="font-semibold">Designation</Label>
                                      <p>{viewingUser.designation}</p>
                                    </div>
                                    <div>
                                      <Label className="font-semibold">Role</Label>
                                      <p>{viewingUser.role}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="font-semibold">Address</Label>
                                    <p>{viewingUser.address.street}, {viewingUser.address.city}, {viewingUser.address.state} - {viewingUser.address.pincode}</p>
                                  </div>
                                  <div>
                                    <Label className="font-semibold">Emergency Contact</Label>
                                    <p>{viewingUser.emergencyContact.name} ({viewingUser.emergencyContact.relationship}) - {viewingUser.emergencyContact.phone}</p>
                                  </div>
                                  <div>
                                    <Label className="font-semibold">All Permissions</Label>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {viewingUser.permissions.map((permission) => (
                                        <span key={permission} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                          {permission}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          
                          <Button variant="outline" size="sm" onClick={() => startEditUser(user)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id!)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-4 font-medium">Name & ID</th>
                          <th className="text-left p-4 font-medium">Dept & Designation</th>
                          <th className="text-left p-4 font-medium">Role</th>
                          <th className="text-left p-4 font-medium">Contact</th>
                          <th className="text-left p-4 font-medium">Permissions</th>
                          <th className="text-left p-4 font-medium">Joining Date</th>
                          <th className="text-left p-4 font-medium">Status</th>
                          <th className="text-left p-4 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamUsers.map((user, index) => (
                          <tr key={user.id} className={`border-b hover:bg-muted/50 ${index % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}>
                            <td className="p-4">
                              <div>
                                <p className="font-medium">{user.firstName} {user.lastName}</p>
                                <p className="text-sm text-muted-foreground">ID: {user.employeeId}</p>
                              </div>
                            </td>
                            <td className="p-4">
                              <div>
                                <p className="font-medium">{user.department}</p>
                                <p className="text-sm text-muted-foreground">{user.designation}</p>
                              </div>
                            </td>
                            <td className="p-4">
                              <Badge variant="secondary">{user.role}</Badge>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1 text-sm">
                                  <Mail className="h-3 w-3" />
                                  <span className="truncate max-w-[150px]">{user.email}</span>
                                </div>
                                <div className="flex items-center gap-1 text-sm">
                                  <Phone className="h-3 w-3" />
                                  <span>{user.phoneNumber}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-wrap gap-1">
                                {user.permissions.slice(0, 2).map((permission) => (
                                  <Badge key={permission} variant="outline" className="text-xs">
                                    {permission}
                                  </Badge>
                                ))}
                                {user.permissions.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{user.permissions.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1 text-sm">
                                <Calendar className="h-3 w-3" />
                                <span>{new Date(user.joiningDate).toLocaleDateString()}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                <Badge variant={user.isActive ? 'default' : 'secondary'}>
                                  {user.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                                {user.canLogin && (
                                  <Badge variant="outline" className="text-xs">
                                    Login Enabled
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => setViewingUser(user)}>
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>{user.firstName} {user.lastName} - Details</DialogTitle>
                                    </DialogHeader>
                                    {viewingUser && (
                                      <div className="space-y-4">
                                        <div className="grid md:grid-cols-2 gap-4">
                                          <div>
                                            <Label className="font-semibold">Employee ID</Label>
                                            <p>{viewingUser.employeeId}</p>
                                          </div>
                                          <div>
                                            <Label className="font-semibold">Department</Label>
                                            <p>{viewingUser.department}</p>
                                          </div>
                                          <div>
                                            <Label className="font-semibold">Designation</Label>
                                            <p>{viewingUser.designation}</p>
                                          </div>
                                          <div>
                                            <Label className="font-semibold">Role</Label>
                                            <p>{viewingUser.role}</p>
                                          </div>
                                        </div>
                                        <div>
                                          <Label className="font-semibold">Address</Label>
                                          <p>{viewingUser.address.street}, {viewingUser.address.city}, {viewingUser.address.state} - {viewingUser.address.pincode}</p>
                                        </div>
                                        <div>
                                          <Label className="font-semibold">Emergency Contact</Label>
                                          <p>{viewingUser.emergencyContact.name} ({viewingUser.emergencyContact.relationship}) - {viewingUser.emergencyContact.phone}</p>
                                        </div>
                                        <div>
                                          <Label className="font-semibold">All Permissions</Label>
                                          <div className="flex flex-wrap gap-1 mt-2">
                                            {viewingUser.permissions.map((permission) => (
                                              <span key={permission} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                                {permission}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </DialogContent>
                                </Dialog>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => startEditUser(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDeleteUser(user.id!)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>{editingUser ? 'Edit Team Member' : 'Add New Team Member'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSingleUserSubmit} className="space-y-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Basic Information</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>First Name *</Label>
                        <Input
                          required
                          value={newUser.firstName}
                          onChange={(e) => setNewUser({...newUser, firstName: e.target.value})}
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <Label>Last Name *</Label>
                        <Input
                          required
                          value={newUser.lastName}
                          onChange={(e) => setNewUser({...newUser, lastName: e.target.value})}
                          placeholder="Doe"
                        />
                      </div>
                      <div>
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          required
                          value={newUser.email}
                          onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                          placeholder="john.doe@company.com"
                        />
                      </div>
                      <div>
                        <Label>Password {!editingUser && '*'}</Label>
                        <Input
                          type="password"
                          required={!editingUser}
                          value={newUser.password || ''}
                          onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                          placeholder={editingUser ? "Leave blank to keep current" : "Password"}
                        />
                      </div>
                      <div>
                        <Label>Phone Number *</Label>
                        <Input
                          required
                          value={newUser.phoneNumber}
                          onChange={(e) => setNewUser({...newUser, phoneNumber: e.target.value})}
                          placeholder="+91-9876543210"
                        />
                      </div>
                      <div>
                        <Label>Employee ID *</Label>
                        <Input
                          required
                          value={newUser.employeeId}
                          onChange={(e) => setNewUser({...newUser, employeeId: e.target.value})}
                          placeholder="EMP001"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Work Information */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Work Information</Label>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <Label>Department *</Label>
                        <Select value={newUser.department} onValueChange={(val) => setNewUser({...newUser, department: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Designation *</Label>
                        <Select value={newUser.designation} onValueChange={(val) => setNewUser({...newUser, designation: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select designation" />
                          </SelectTrigger>
                          <SelectContent>
                            {designations.map((designation) => (
                              <SelectItem key={designation} value={designation}>{designation}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Role *</Label>
                        <Select value={newUser.role} onValueChange={(val) => setNewUser({...newUser, role: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((role) => (
                              <SelectItem key={role} value={role}>{role}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Joining Date *</Label>
                        <Input
                          type="date"
                          required
                          value={newUser.joiningDate}
                          onChange={(e) => setNewUser({...newUser, joiningDate: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Address</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Street Address</Label>
                        <Input
                          value={newUser.address.street}
                          onChange={(e) => setNewUser({...newUser, address: {...newUser.address, street: e.target.value}})}
                          placeholder="123 Main Street"
                        />
                      </div>
                      <div>
                        <Label>City</Label>
                        <Input
                          value={newUser.address.city}
                          onChange={(e) => setNewUser({...newUser, address: {...newUser.address, city: e.target.value}})}
                          placeholder="Mumbai"
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={newUser.address.state}
                          onChange={(e) => setNewUser({...newUser, address: {...newUser.address, state: e.target.value}})}
                          placeholder="Maharashtra"
                        />
                      </div>
                      <div>
                        <Label>Pincode</Label>
                        <Input
                          value={newUser.address.pincode}
                          onChange={(e) => setNewUser({...newUser, address: {...newUser.address, pincode: e.target.value}})}
                          placeholder="400001"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Emergency Contact</Label>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <Label>Contact Name</Label>
                        <Input
                          value={newUser.emergencyContact.name}
                          onChange={(e) => setNewUser({...newUser, emergencyContact: {...newUser.emergencyContact, name: e.target.value}})}
                          placeholder="Jane Doe"
                        />
                      </div>
                      <div>
                        <Label>Relationship</Label>
                        <Input
                          value={newUser.emergencyContact.relationship}
                          onChange={(e) => setNewUser({...newUser, emergencyContact: {...newUser.emergencyContact, relationship: e.target.value}})}
                          placeholder="Spouse"
                        />
                      </div>
                      <div>
                        <Label>Phone Number</Label>
                        <Input
                          value={newUser.emergencyContact.phone}
                          onChange={(e) => setNewUser({...newUser, emergencyContact: {...newUser.emergencyContact, phone: e.target.value}})}
                          placeholder="+91-9876543210"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Permissions */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Permissions</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {permissions.map((permission) => (
                        <div key={permission} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={newUser.permissions.includes(permission)}
                            onChange={() => handlePermissionToggle(permission)}
                            className="rounded"
                          />
                          <span className="text-sm">{permission}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Access Settings */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newUser.canLogin}
                        onCheckedChange={(checked) => setNewUser({...newUser, canLogin: checked})}
                      />
                      <Label>Can Login to System</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newUser.isActive}
                        onCheckedChange={(checked) => setNewUser({...newUser, isActive: checked})}
                      />
                      <Label>Active User</Label>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button type="submit" disabled={loading} className="flex-1">
                      <Plus className="mr-2 h-4 w-4" />
                      {loading ? (editingUser ? 'Updating...' : 'Adding...') : (editingUser ? 'Update User' : 'Add User')}
                    </Button>
                    {editingUser && (
                      <Button type="button" variant="outline" onClick={resetForm}>
                        Cancel Edit
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Import Team Members</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste JSON array of user objects with required fields: firstName, lastName, email, employeeId, department, designation, role
                </p>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='[{"firstName":"John","lastName":"Doe","email":"john@company.com","employeeId":"EMP001","department":"IT Support","designation":"Manager","role":"Admin","phoneNumber":"+91-9876543210","permissions":["Dashboard Access","User Management"]}]'
                  className="h-64 font-mono text-sm"
                />
                <Button onClick={handleJsonUpload} disabled={loading}>
                  <Upload className="mr-2 h-4 w-4" />
                  {loading ? 'Uploading...' : 'Upload JSON'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default TeamManagement;