import React, { useState, useRef, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Upload, Download, Plus, Users, UserPlus, Activity, Eye, Edit, Trash2, Mail, Phone, Calendar, MapPin, LayoutGrid, List } from 'lucide-react';
import api from '@/utils/api';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';

interface MemberUser {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phoneNumber: string;
  dateOfBirth: string;
  gender: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  membershipType?: string;
  isActive?: boolean;
  verified?: boolean;
  lastLogin?: string;
  createdAt: string;
  profileImage?: string;
}

const membershipTypes = [
  'Free', 'Basic', 'Premium', 'Gold', 'Platinum', 'Family', 'Corporate'
];

const UsersManagement = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberUsers, setMemberUsers] = useState<MemberUser[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const [editingUser, setEditingUser] = useState<MemberUser | null>(null);
  const [viewingUser, setViewingUser] = useState<MemberUser | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const token = localStorage.getItem('adminToken');

  const [newUser, setNewUser] = useState<MemberUser>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
    dateOfBirth: '',
    gender: 'Other',
    address: { street: '', city: '', state: '', pincode: '' },
    emergencyContact: { name: '', relationship: '', phone: '' },
    membershipType: 'Free',
    isActive: true,
    verified: false,
    createdAt: new Date().toISOString()
  });

  useEffect(() => {
    fetchMemberUsers();
  }, []);

  const fetchMemberUsers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setMemberUsers((data as any).data || data || []);
    } catch (err: any) {
      console.error('Failed to fetch member users:', err);
      setMemberUsers([]);
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

      const endpoint = editingUser ? `/admin/users/${editingUser.id}` : '/admin/users';
      const method = editingUser ? api.put : api.post;

      const { data } = await method(endpoint, { user: newUser }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      
      setResult(data);
      resetForm();
      fetchMemberUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${editingUser ? 'update' : 'create'} member user`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this member?')) return;
    
    try {
      setLoading(true);
      await api.delete(`/admin/users/${userId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setResult({ message: 'Member deleted successfully' });
      fetchMemberUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete member');
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
      const { data } = await api.post('/admin/users/bulk',
        { users: Array.isArray(users) ? users : [users] },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      
      setResult(data);
      setJsonInput('');
      fetchMemberUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'JSON upload failed');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewUser({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phoneNumber: '',
      dateOfBirth: '',
      gender: 'Other',
      address: { street: '', city: '', state: '', pincode: '' },
      emergencyContact: { name: '', relationship: '', phone: '' },
      membershipType: 'Free',
      isActive: true,
      verified: false,
      createdAt: new Date().toISOString()
    });
    setEditingUser(null);
  };

  const startEditUser = (user: MemberUser) => {
    setNewUser({ ...user });
    setEditingUser(user);
  };

  const activeUsers = memberUsers.filter(u => u.isActive);
  const verifiedUsers = memberUsers.filter(u => u.verified);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              Members Management
            </h2>
            <p className="text-muted-foreground">Manage platform members and user accounts</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Total: {memberUsers.length} members
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Members</p>
                  <p className="text-3xl font-bold">{memberUsers.length}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Members</p>
                  <p className="text-3xl font-bold">{activeUsers.length}</p>
                </div>
                <Activity className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Verified Users</p>
                  <p className="text-3xl font-bold">{verifiedUsers.length}</p>
                </div>
                <UserPlus className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">New This Month</p>
                  <p className="text-3xl font-bold">
                    {memberUsers.filter(u => {
                      const created = new Date(u.createdAt);
                      const now = new Date();
                      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
                    }).length}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-amber-500" />
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
            <TabsTrigger value="list">Members List</TabsTrigger>
            <TabsTrigger value="create">{editingUser ? 'Edit Member' : 'Add Member'}</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* View Mode Toggle */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {memberUsers.length} member{memberUsers.length !== 1 ? 's' : ''}
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
              <div className="text-center py-8">Loading members...</div>
            ) : memberUsers.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No members found. Add your first member to get started.</p>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {memberUsers.map((user) => (
                  <Card key={user.id}>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold">{user.firstName} {user.lastName}</h3>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                            <p className="text-xs text-muted-foreground mt-1">ID: {user.id}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant={user.isActive ? 'default' : 'secondary'} 
                                   className={user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            {user.verified && (
                              <Badge className="bg-blue-100 text-blue-700 text-xs">
                                Verified
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">{user.phoneNumber}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">DOB: {new Date(user.dateOfBirth).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Gender: {user.gender}</span>
                          </div>
                          {user.membershipType && (
                            <div className="mt-2">
                              <Badge variant="outline" className="bg-purple-500/10 border-purple-500/20 text-purple-700">
                                {user.membershipType} Member
                              </Badge>
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Joined: {new Date(user.createdAt).toLocaleDateString()}
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
                                      <Label className="font-semibold">Email</Label>
                                      <p>{viewingUser.email}</p>
                                    </div>
                                    <div>
                                      <Label className="font-semibold">Phone</Label>
                                      <p>{viewingUser.phoneNumber}</p>
                                    </div>
                                    <div>
                                      <Label className="font-semibold">Date of Birth</Label>
                                      <p>{new Date(viewingUser.dateOfBirth).toLocaleDateString()}</p>
                                    </div>
                                    <div>
                                      <Label className="font-semibold">Gender</Label>
                                      <p>{viewingUser.gender}</p>
                                    </div>
                                    <div>
                                      <Label className="font-semibold">Membership Type</Label>
                                      <p>{viewingUser.membershipType || 'Free'}</p>
                                    </div>
                                    <div>
                                      <Label className="font-semibold">Status</Label>
                                      <p>{viewingUser.isActive ? 'Active' : 'Inactive'}</p>
                                    </div>
                                  </div>
                                  {viewingUser.address && (
                                    <div>
                                      <Label className="font-semibold">Address</Label>
                                      <p>
                                        {viewingUser.address.street && `${viewingUser.address.street}, `}
                                        {viewingUser.address.city && `${viewingUser.address.city}, `}
                                        {viewingUser.address.state && `${viewingUser.address.state} `}
                                        {viewingUser.address.pincode && `- ${viewingUser.address.pincode}`}
                                      </p>
                                    </div>
                                  )}
                                  {viewingUser.emergencyContact && viewingUser.emergencyContact.name && (
                                    <div>
                                      <Label className="font-semibold">Emergency Contact</Label>
                                      <p>{viewingUser.emergencyContact.name} ({viewingUser.emergencyContact.relationship}) - {viewingUser.emergencyContact.phone}</p>
                                    </div>
                                  )}
                                  {viewingUser.lastLogin && (
                                    <div>
                                      <Label className="font-semibold">Last Login</Label>
                                      <p>{new Date(viewingUser.lastLogin).toLocaleString()}</p>
                                    </div>
                                  )}
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
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="p-4 text-left font-semibold">Name</th>
                          <th className="p-4 text-left font-semibold">Contact</th>
                          <th className="p-4 text-left font-semibold">Membership</th>
                          <th className="p-4 text-left font-semibold">Gender</th>
                          <th className="p-4 text-left font-semibold">Status</th>
                          <th className="p-4 text-left font-semibold">Joined</th>
                          <th className="p-4 text-left font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memberUsers.map((user, index) => (
                          <tr key={user.id} className={`border-b hover:bg-muted/30 transition-colors ${index % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                            <td className="p-4">
                              <div className="font-semibold">{user.firstName} {user.lastName}</div>
                              <div className="text-xs text-muted-foreground">ID: {user.id}</div>
                            </td>
                            <td className="p-4 text-sm">
                              <div className="flex items-center gap-1 mb-1">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate max-w-[200px]">{user.email}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <span>{user.phoneNumber}</span>
                              </div>
                            </td>
                            <td className="p-4 text-sm">
                              <Badge variant="outline" className="bg-purple-500/10 border-purple-500/20 text-purple-700">
                                {user.membershipType || 'Free'}
                              </Badge>
                            </td>
                            <td className="p-4 text-sm">{user.gender}</td>
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                <Badge variant={user.isActive ? 'default' : 'secondary'} 
                                       className={user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                                  {user.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                                {user.verified && (
                                  <Badge className="bg-blue-100 text-blue-700 text-xs">
                                    Verified
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-sm">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                DOB: {new Date(user.dateOfBirth).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-1">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" onClick={() => setViewingUser(user)}>
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>{user.firstName} {user.lastName} - Details</DialogTitle>
                                    </DialogHeader>
                                    {viewingUser && (
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                          <div>
                                            <p className="text-sm font-medium text-muted-foreground">Email</p>
                                            <p className="text-sm">{viewingUser.email}</p>
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-muted-foreground">Phone</p>
                                            <p className="text-sm">{viewingUser.phoneNumber}</p>
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-muted-foreground">Date of Birth</p>
                                            <p className="text-sm">{new Date(viewingUser.dateOfBirth).toLocaleDateString()}</p>
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-muted-foreground">Gender</p>
                                            <p className="text-sm">{viewingUser.gender}</p>
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-muted-foreground">Membership Type</p>
                                            <p className="text-sm">{viewingUser.membershipType}</p>
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-muted-foreground">Status</p>
                                            <p className="text-sm">{viewingUser.isActive ? 'Active' : 'Inactive'}</p>
                                          </div>
                                        </div>
                                        {viewingUser.address && (
                                          <div>
                                            <p className="text-sm font-medium text-muted-foreground mb-2">Address</p>
                                            <p className="text-sm">
                                              {viewingUser.address.street && `${viewingUser.address.street}, `}
                                              {viewingUser.address.city && `${viewingUser.address.city}, `}
                                              {viewingUser.address.state && `${viewingUser.address.state} `}
                                              {viewingUser.address.pincode}
                                            </p>
                                          </div>
                                        )}
                                        {viewingUser.emergencyContact && (
                                          <div>
                                            <p className="text-sm font-medium text-muted-foreground mb-2">Emergency Contact</p>
                                            <div className="space-y-1">
                                              <p className="text-sm">Name: {viewingUser.emergencyContact.name}</p>
                                              <p className="text-sm">Relationship: {viewingUser.emergencyContact.relationship}</p>
                                              <p className="text-sm">Phone: {viewingUser.emergencyContact.phone}</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </DialogContent>
                                </Dialog>
                                <Button variant="outline" size="sm" onClick={() => startEditUser(user)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id!)}>
                                  <Trash2 className="h-4 w-4" />
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
                <CardTitle>{editingUser ? 'Edit Member' : 'Add New Member'}</CardTitle>
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
                          placeholder="john.doe@example.com"
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
                        <Label>Date of Birth *</Label>
                        <Input
                          type="date"
                          required
                          value={newUser.dateOfBirth}
                          onChange={(e) => setNewUser({...newUser, dateOfBirth: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Gender *</Label>
                        <Select value={newUser.gender} onValueChange={(val) => setNewUser({...newUser, gender: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Membership Type</Label>
                        <Select value={newUser.membershipType} onValueChange={(val) => setNewUser({...newUser, membershipType: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select membership" />
                          </SelectTrigger>
                          <SelectContent>
                            {membershipTypes.map((type) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Address (Optional)</Label>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label>Street Address</Label>
                        <Input
                          value={newUser.address?.street || ''}
                          onChange={(e) => setNewUser({...newUser, address: {...(newUser.address || {}), street: e.target.value}})}
                          placeholder="123 Main Street"
                        />
                      </div>
                      <div>
                        <Label>City</Label>
                        <Input
                          value={newUser.address?.city || ''}
                          onChange={(e) => setNewUser({...newUser, address: {...(newUser.address || {}), city: e.target.value}})}
                          placeholder="Mumbai"
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={newUser.address?.state || ''}
                          onChange={(e) => setNewUser({...newUser, address: {...(newUser.address || {}), state: e.target.value}})}
                          placeholder="Maharashtra"
                        />
                      </div>
                      <div>
                        <Label>Pincode</Label>
                        <Input
                          value={newUser.address?.pincode || ''}
                          onChange={(e) => setNewUser({...newUser, address: {...(newUser.address || {}), pincode: e.target.value}})}
                          placeholder="400001"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Emergency Contact (Optional)</Label>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <Label>Contact Name</Label>
                        <Input
                          value={newUser.emergencyContact?.name || ''}
                          onChange={(e) => setNewUser({...newUser, emergencyContact: {...(newUser.emergencyContact || {}), name: e.target.value}})}
                          placeholder="Jane Doe"
                        />
                      </div>
                      <div>
                        <Label>Relationship</Label>
                        <Input
                          value={newUser.emergencyContact?.relationship || ''}
                          onChange={(e) => setNewUser({...newUser, emergencyContact: {...(newUser.emergencyContact || {}), relationship: e.target.value}})}
                          placeholder="Spouse"
                        />
                      </div>
                      <div>
                        <Label>Phone Number</Label>
                        <Input
                          value={newUser.emergencyContact?.phone || ''}
                          onChange={(e) => setNewUser({...newUser, emergencyContact: {...(newUser.emergencyContact || {}), phone: e.target.value}})}
                          placeholder="+91-9876543210"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Status Settings */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newUser.verified || false}
                        onCheckedChange={(checked) => setNewUser({...newUser, verified: checked})}
                      />
                      <Label>Email Verified</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newUser.isActive ?? true}
                        onCheckedChange={(checked) => setNewUser({...newUser, isActive: checked})}
                      />
                      <Label>Active User</Label>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button type="submit" disabled={loading} className="flex-1">
                      <Plus className="mr-2 h-4 w-4" />
                      {loading ? (editingUser ? 'Updating...' : 'Adding...') : (editingUser ? 'Update Member' : 'Add Member')}
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
                <CardTitle>Bulk Import Members</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste JSON array of user objects with required fields: firstName, lastName, email, phoneNumber, dateOfBirth, gender
                </p>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='[{"firstName":"John","lastName":"Doe","email":"john@example.com","phoneNumber":"+91-9876543210","dateOfBirth":"1990-01-01","gender":"Male","membershipType":"Free"}]'
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

export default UsersManagement;
