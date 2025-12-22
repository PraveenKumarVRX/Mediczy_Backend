import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Users, 
  UserPlus, 
  Search,
  Settings,
  Mail,
  Phone,
  Shield,
  Stethoscope
} from 'lucide-react';
import AssistantDoctorManager from '@/components/AssistantDoctorManager';
import axios from 'axios';

interface Assistant {
  id: string;
  name: string;
  email: string;
  phone?: string;
  linkedDoctorIds: string[];
  primaryDoctorId?: string;
  linkedFacilityId?: string;
  linkedFacilityType?: 'clinic' | 'hospital';
  linkedFacilityName?: string;
  linkedDoctors?: Array<{
    id: string;
    name: string;
    specialty?: string;
  }>;
  status: 'active' | 'inactive';
}

const AdminManageAssistants = () => {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAssistants();
  }, []);

  const fetchAssistants = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Mock assistants data - in production, fetch from /api/admin/assistants
      const mockAssistants: Assistant[] = [
        {
          id: 'asst_001',
          name: 'Jane Smith',
          email: 'jane@hospital.com',
          phone: '+1234567890',
          linkedDoctorIds: ['doc_001', 'doc_002'],
          primaryDoctorId: 'doc_001',
          linkedFacilityId: 'hospital_001',
          linkedFacilityType: 'hospital',
          linkedFacilityName: 'City General Hospital',
          linkedDoctors: [
            { id: 'doc_001', name: 'Dr. John Doe', specialty: 'Cardiology' },
            { id: 'doc_002', name: 'Dr. Sarah Johnson', specialty: 'Neurology' }
          ],
          status: 'active'
        },
        {
          id: 'asst_002',
          name: 'Michael Chen',
          email: 'michael@hospital.com',
          phone: '+1234567891',
          linkedDoctorIds: ['doc_003'],
          primaryDoctorId: 'doc_003',
          linkedDoctors: [
            { id: 'doc_003', name: 'Dr. Emily White', specialty: 'Pediatrics' }
          ],
          status: 'active'
        },
        {
          id: 'asst_003',
          name: 'Sarah Williams',
          email: 'sarah@hospital.com',
          phone: '+1234567892',
          linkedDoctorIds: [],
          linkedDoctors: [],
          status: 'inactive'
        }
      ];
      
      setAssistants(mockAssistants);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching assistants:', err);
      setError(err.response?.data?.message || 'Failed to load assistants');
      setLoading(false);
    }
  };

  const filteredAssistants = assistants.filter(assistant =>
    assistant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assistant.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Manage Assistants</h1>
          <p className="text-muted-foreground">
            Assign and manage doctor assistants
          </p>
        </div>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Assistant
        </Button>
      </div>

      {selectedAssistant ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">{selectedAssistant.name}</h2>
              <p className="text-muted-foreground">{selectedAssistant.email}</p>
            </div>
            <Button variant="outline" onClick={() => setSelectedAssistant(null)}>
              Back to List
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Assistant Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{selectedAssistant.email}</span>
              </div>
              {selectedAssistant.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedAssistant.phone}</span>
                </div>
              )}
              {selectedAssistant.linkedFacilityName && (
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-blue-500" />
                  <span>{selectedAssistant.linkedFacilityName}</span>
                  <Badge variant="outline" className="text-xs">
                    {selectedAssistant.linkedFacilityType}
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <Badge variant={selectedAssistant.status === 'active' ? 'default' : 'secondary'}>
                  {selectedAssistant.status}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <AssistantDoctorManager 
            assistantId={selectedAssistant.id} 
            role="admin"
          />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search assistants by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading assistants...</p>
            ) : error ? (
              <p className="text-center py-8 text-destructive">{error}</p>
            ) : filteredAssistants.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No assistants found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Linked Doctors</TableHead>
                    <TableHead>Primary Doctor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssistants.map((assistant) => (
                    <TableRow key={assistant.id}>
                      <TableCell className="font-medium">{assistant.name}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {assistant.email}
                          </div>
                          {assistant.phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {assistant.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {assistant.linkedFacilityName ? (
                          <div className="flex items-center gap-1">
                            <Stethoscope className="h-3 w-3 text-blue-500" />
                            <div>
                              <div className="text-sm font-medium">{assistant.linkedFacilityName}</div>
                              <div className="text-xs text-muted-foreground capitalize">
                                {assistant.linkedFacilityType}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {assistant.linkedDoctorIds.length} / 5
                          </Badge>
                          {assistant.linkedDoctors && assistant.linkedDoctors.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              {assistant.linkedDoctors.slice(0, 2).map(d => d.name.split(' ')[1]).join(', ')}
                              {assistant.linkedDoctors.length > 2 && ` +${assistant.linkedDoctors.length - 2}`}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {assistant.primaryDoctorId ? (
                          <div className="flex items-center gap-1">
                            <Stethoscope className="h-3 w-3 text-blue-500" />
                            <span className="text-sm">
                              {assistant.linkedDoctors?.find(d => d.id === assistant.primaryDoctorId)?.name || 'Set'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={assistant.status === 'active' ? 'default' : 'secondary'}>
                          {assistant.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAssistant(assistant)}
                        >
                          <Settings className="h-3 w-3 mr-1" />
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminManageAssistants;
