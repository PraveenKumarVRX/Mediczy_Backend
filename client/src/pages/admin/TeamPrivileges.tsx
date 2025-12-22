import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users, 
  Shield, 
  Edit, 
  Trash2,
  Save,
  X,
  Eye,
  Lock,
  Unlock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TeamPrivileges = () => {
  const { toast } = useToast();
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [editableModules, setEditableModules] = useState<string[]>([]);
  const [deletableModules, setDeletableModules] = useState<string[]>([]);

  const teamMembers = [
    {
      id: 'team_001',
      name: 'Team Member',
      email: 'team@mediczy.com',
      role: 'Team Member',
      department: 'Healthcare Operations'
    },
    {
      id: 'team_002',
      name: 'Sarah Johnson',
      email: 'sarah@mediczy.com',
      role: 'Team Lead',
      department: 'Medical'
    },
    {
      id: 'team_003',
      name: 'John Smith',
      email: 'john@mediczy.com',
      role: 'Executive',
      department: 'Operations'
    }
  ];

  const modules = [
    { id: 'users', name: 'User Management', description: 'Manage user accounts and profiles' },
    { id: 'doctors', name: 'Doctor Management', description: 'Manage doctor profiles and schedules' },
    { id: 'appointments', name: 'Appointments', description: 'View and manage appointments' },
    { id: 'chat', name: 'Chat Dashboard', description: 'Monitor and manage customer chats' },
    { id: 'hospitals', name: 'Hospitals', description: 'Manage hospital network' },
    { id: 'pharmacies', name: 'Pharmacies', description: 'Manage pharmacy partners' },
    { id: 'plans', name: 'Health Plans', description: 'Manage subscription plans' },
    { id: 'reports', name: 'Reports & Analytics', description: 'View and generate reports' },
    { id: 'team_directory', name: 'Team Directory', description: 'View team members' },
    { id: 'notifications', name: 'Notifications', description: 'Manage notifications' }
  ];

  const handleSelectMember = (member: any) => {
    setSelectedMember(member);
    // In production, fetch current privileges from API
    setEditableModules([]);
    setDeletableModules([]);
  };

  const toggleEditAccess = (moduleId: string) => {
    setEditableModules(prev => 
      prev.includes(moduleId) 
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const toggleDeleteAccess = (moduleId: string) => {
    setDeletableModules(prev => 
      prev.includes(moduleId) 
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const handleSave = async () => {
    try {
      // In production, call API to update privileges
      toast({
        title: 'Privileges Updated',
        description: `Access rights for ${selectedMember?.name} have been updated successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update privileges',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    setSelectedMember(null);
    setEditableModules([]);
    setDeletableModules([]);
  };

  const grantAllEdit = () => {
    setEditableModules(modules.map(m => m.id));
  };

  const revokeAllEdit = () => {
    setEditableModules([]);
  };

  const grantAllDelete = () => {
    setDeletableModules(modules.map(m => m.id));
  };

  const revokeAllDelete = () => {
    setDeletableModules([]);
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-blue-500" />
          Team Member Privileges
        </h1>
        <p className="text-muted-foreground">
          Manage view, edit, and delete permissions for team members
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Team Members List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              Select a member to configure their access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => handleSelectMember(member)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedMember?.id === member.id
                    ? 'bg-blue-50 border-blue-500 dark:bg-blue-950'
                    : 'hover:bg-muted'
                }`}
              >
                <div className="font-semibold">{member.name}</div>
                <div className="text-xs text-muted-foreground">{member.email}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {member.role}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Module Privileges */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Module Access Rights
                </CardTitle>
                {selectedMember && (
                  <CardDescription className="mt-2">
                    Configuring access for: <strong>{selectedMember.name}</strong>
                  </CardDescription>
                )}
              </div>
              {selectedMember && (
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
            {!selectedMember ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a team member to configure their access rights</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Default Access Notice */}
                <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950">
                  <Eye className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Default Access:</strong> All team members have <strong>view-only</strong> access to all modules. 
                    Grant edit and delete permissions below as needed.
                  </AlertDescription>
                </Alert>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={grantAllEdit} size="sm" variant="outline">
                    <Unlock className="h-3 w-3 mr-1" />
                    Grant All Edit
                  </Button>
                  <Button onClick={revokeAllEdit} size="sm" variant="outline">
                    <Lock className="h-3 w-3 mr-1" />
                    Revoke All Edit
                  </Button>
                  <Button onClick={grantAllDelete} size="sm" variant="outline">
                    <Unlock className="h-3 w-3 mr-1" />
                    Grant All Delete
                  </Button>
                  <Button onClick={revokeAllDelete} size="sm" variant="outline">
                    <Lock className="h-3 w-3 mr-1" />
                    Revoke All Delete
                  </Button>
                </div>

                {/* Module Access Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3 font-semibold">Module</th>
                        <th className="text-center p-3 font-semibold">View</th>
                        <th className="text-center p-3 font-semibold">Edit</th>
                        <th className="text-center p-3 font-semibold">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modules.map((module) => (
                        <tr key={module.id} className="border-t hover:bg-muted/50">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">{module.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {module.description}
                              </div>
                            </div>
                          </td>
                          <td className="text-center p-3">
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                              <Eye className="h-3 w-3 mr-1" />
                              Always
                            </Badge>
                          </td>
                          <td className="text-center p-3">
                            <Checkbox
                              checked={editableModules.includes(module.id)}
                              onCheckedChange={() => toggleEditAccess(module.id)}
                            />
                          </td>
                          <td className="text-center p-3">
                            <Checkbox
                              checked={deletableModules.includes(module.id)}
                              onCheckedChange={() => toggleDeleteAccess(module.id)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Access Summary</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">View Access</div>
                      <div className="text-2xl font-bold text-green-600">{modules.length}</div>
                      <div className="text-xs text-muted-foreground">All modules</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Edit Access</div>
                      <div className="text-2xl font-bold text-blue-600">{editableModules.length}</div>
                      <div className="text-xs text-muted-foreground">Selected modules</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Delete Access</div>
                      <div className="text-2xl font-bold text-orange-600">{deletableModules.length}</div>
                      <div className="text-xs text-muted-foreground">Selected modules</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeamPrivileges;
