import { useState, useEffect } from "react";
import HospitalLayout from "@/components/hospital/HospitalLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";
import {
  UserPlus,
  Search,
  Filter,
  MoreVertical,
  Phone,
  Mail,
  Calendar,
  Clock,
  User,
  Stethoscope,
  GraduationCap,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Edit,
  Trash2,
  Eye,
  UserCheck,
  RefreshCw,
  Plus,
  Users
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Specialization categories for organized display
const SPECIALIZATION_CATEGORIES = {
  "Primary Care": ["General Practitioner", "Family Medicine", "Internal Medicine"],
  "Cardiology & Vascular": ["Cardiologist", "Cardio Thoracic Surgeon", "Cardio Vascular Surgeon", "Vascular Surgeon"],
  "Neurology & Psychiatry": ["Neurologist", "Neuro Surgeon", "Psychiatrist", "Psychologist"],
  "Surgery": ["General Surgeon", "Gastro Surgeon", "Proctologist"],
  "Orthopedics & Physical": ["Orthopedist", "Physiotherapist", "Occupational Therapist", "Podiatrician"],
  "Women's Health": ["Gynecologist", "Obstetrician"],
  "Pediatrics": ["Pediatrician", "Neonatologist"],
  "Eye, Ear, Nose & Throat": ["Ophthalmologist", "ENT Specialist"],
  "Skin & Aesthetics": ["Dermatologist", "Cosmetologist"],
  "Internal Specialties": ["Gastroenterologist", "Pulmonologist", "Rheumatologist", "Nephrologist", "Endocrinologist", "Diabetologist"],
  "Urology": ["Urologist", "Andrologist"],
  "Oncology": ["Oncologist", "Radiation Oncologist", "Surgical Oncologist"],
  "Critical Care": ["Intensivist", "Emergency Medicine"],
  "Nutrition & Diet": ["Nutritionist", "Dietician"],
  "Dental": ["Dentist", "Orthodontist", "Periodontist"],
  "Others": ["Homeopathy", "Ayurveda", "Naturopathy"]
};

// Flatten all specializations for dropdown
const ALL_SPECIALIZATIONS = Object.values(SPECIALIZATION_CATEGORIES).flat();

interface Doctor {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  specialization: string;
  department?: string;
  qualification?: string;
  experience?: number;
  registrationNumber?: string;
  status: 'active' | 'on-leave' | 'inactive';
  shift?: string;
  consultationFee?: number;
  availableDays?: string[];
  joiningDate?: string;
}

interface DoctorFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: string;
  department: string;
  qualification: string;
  experience: string;
  registrationNumber: string;
  consultationFee: string;
  shift: string;
  password: string;
}

const initialFormData: DoctorFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  specialization: "",
  department: "",
  qualification: "",
  experience: "",
  registrationNumber: "",
  consultationFee: "",
  shift: "Morning",
  password: ""
};

const HospitalDoctorsManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [formData, setFormData] = useState<DoctorFormData>(initialFormData);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSpecialization, setFilterSpecialization] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("all");

  // Fetch doctors
  const { data: doctorsData, isLoading, refetch } = useQuery({
    queryKey: ['hospital-doctors', filterSpecialization, filterStatus],
    queryFn: async () => {
      try {
        const params: Record<string, string> = {};
        if (filterSpecialization !== "all") params.specialization = filterSpecialization;
        if (filterStatus !== "all") params.status = filterStatus;
        
        const response = await api.get('/hospital/practice/doctors', { params });
        return response.data.data || response.data.doctors || [];
      } catch (err: any) {
        // Fallback to staff endpoint with role=Doctor filter
        try {
          const response = await api.get('/hospital/practice/staff', { 
            params: { role: 'Doctor' } 
          });
          return response.data.data || [];
        } catch {
          return [];
        }
      }
    },
  });

  // Add doctor mutation
  const addDoctorMutation = useMutation({
    mutationFn: async (data: DoctorFormData) => {
      const payload = {
        name: `Dr. ${data.firstName} ${data.lastName}`,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        phoneNumber: data.phone,
        specialization: data.specialization,
        department: data.department || data.specialization,
        qualification: data.qualification,
        experience: parseInt(data.experience) || 0,
        registrationNumber: data.registrationNumber,
        consultationFee: parseFloat(data.consultationFee) || 500,
        shift: data.shift,
        role: 'Doctor',
        status: 'On-Duty',
        password: data.password || 'Doctor@123'
      };
      
      // Try dedicated doctors endpoint first
      try {
        const response = await api.post('/hospital/practice/doctors', payload);
        return response.data;
      } catch {
        // Fallback to staff endpoint
        const response = await api.post('/hospital/practice/staff', payload);
        return response.data;
      }
    },
    onSuccess: () => {
      toast({
        title: "✅ Doctor Added",
        description: "Doctor has been added to your hospital successfully.",
      });
      setShowAddDialog(false);
      setFormData(initialFormData);
      queryClient.invalidateQueries({ queryKey: ['hospital-doctors'] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Add Doctor",
        description: error.response?.data?.message || "Please try again.",
      });
    }
  });

  // Update doctor mutation
  const updateDoctorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DoctorFormData> }) => {
      try {
        const response = await api.patch(`/hospital/practice/doctors/${id}`, data);
        return response.data;
      } catch {
        const response = await api.patch(`/hospital/practice/staff/${id}`, data);
        return response.data;
      }
    },
    onSuccess: () => {
      toast({
        title: "✅ Doctor Updated",
        description: "Doctor details have been updated.",
      });
      setShowEditDialog(false);
      setSelectedDoctor(null);
      queryClient.invalidateQueries({ queryKey: ['hospital-doctors'] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.response?.data?.message || "Please try again.",
      });
    }
  });

  // Delete doctor mutation
  const deleteDoctorMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        const response = await api.delete(`/hospital/practice/doctors/${id}`);
        return response.data;
      } catch {
        const response = await api.delete(`/hospital/practice/staff/${id}`);
        return response.data;
      }
    },
    onSuccess: () => {
      toast({
        title: "Doctor Removed",
        description: "Doctor has been removed from your hospital.",
      });
      queryClient.invalidateQueries({ queryKey: ['hospital-doctors'] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.response?.data?.message || "Please try again.",
      });
    }
  });

  // Filter doctors
  const doctors = (doctorsData || []) as Doctor[];
  const filteredDoctors = doctors.filter(doc => {
    const matchesSearch = !searchQuery || 
      doc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.specialization?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTab = activeTab === "all" || 
      (activeTab === "active" && doc.status === "active") ||
      (activeTab === "on-leave" && doc.status === "on-leave");
    
    return matchesSearch && matchesTab;
  });

  // Group doctors by specialization
  const doctorsBySpecialization = filteredDoctors.reduce((acc, doc) => {
    const spec = doc.specialization || "Other";
    if (!acc[spec]) acc[spec] = [];
    acc[spec].push(doc);
    return acc;
  }, {} as Record<string, Doctor[]>);

  // Stats
  const stats = {
    total: doctors.length,
    active: doctors.filter(d => d.status === 'active' || d.status === 'On-Duty').length,
    onLeave: doctors.filter(d => d.status === 'on-leave').length,
    specializations: new Set(doctors.map(d => d.specialization)).size
  };

  const handleAddDoctor = () => {
    if (!formData.firstName || !formData.lastName || !formData.phone || !formData.specialization) {
      toast({
        variant: "destructive",
        title: "Required Fields Missing",
        description: "Please fill in name, phone, and specialization.",
      });
      return;
    }
    addDoctorMutation.mutate(formData);
  };

  const handleEditDoctor = () => {
    if (!selectedDoctor) return;
    updateDoctorMutation.mutate({
      id: selectedDoctor.id,
      data: formData
    });
  };

  const openEditDialog = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setFormData({
      firstName: doctor.firstName || doctor.name?.replace('Dr. ', '').split(' ')[0] || '',
      lastName: doctor.lastName || doctor.name?.replace('Dr. ', '').split(' ').slice(1).join(' ') || '',
      email: doctor.email || '',
      phone: doctor.phone || '',
      specialization: doctor.specialization || '',
      department: doctor.department || '',
      qualification: doctor.qualification || '',
      experience: doctor.experience?.toString() || '',
      registrationNumber: doctor.registrationNumber || '',
      consultationFee: doctor.consultationFee?.toString() || '',
      shift: doctor.shift || 'Morning',
      password: ''
    });
    setShowEditDialog(true);
  };

  return (
    <HospitalLayout 
      title="Doctors Management" 
      subtitle="Add, manage, and organize your hospital's medical staff"
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total Doctors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-green-500" />
                Active / On Duty
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                On Leave
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600">{stats.onLeave}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-blue-500" />
                Specializations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{stats.specializations}</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex flex-1 gap-4 items-center w-full md:w-auto">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search doctors by name, email, specialization..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterSpecialization} onValueChange={setFilterSpecialization}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by Specialty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Specializations</SelectItem>
                    {ALL_SPECIALIZATIONS.map(spec => (
                      <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button onClick={() => setShowAddDialog(true)} className="bg-teal-600 hover:bg-teal-700">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Doctor
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs & Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All Doctors ({doctors.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
            <TabsTrigger value="specialty">By Specialty</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <DoctorsTable 
              doctors={filteredDoctors}
              isLoading={isLoading}
              onView={(doc) => { setSelectedDoctor(doc); setShowViewDialog(true); }}
              onEdit={openEditDialog}
              onDelete={(doc) => deleteDoctorMutation.mutate(doc.id)}
            />
          </TabsContent>

          <TabsContent value="active" className="mt-4">
            <DoctorsTable 
              doctors={filteredDoctors.filter(d => d.status === 'active' || d.status === 'On-Duty')}
              isLoading={isLoading}
              onView={(doc) => { setSelectedDoctor(doc); setShowViewDialog(true); }}
              onEdit={openEditDialog}
              onDelete={(doc) => deleteDoctorMutation.mutate(doc.id)}
            />
          </TabsContent>

          <TabsContent value="specialty" className="mt-4">
            <div className="space-y-6">
              {Object.entries(SPECIALIZATION_CATEGORIES).map(([category, specializations]) => {
                const categoryDoctors = filteredDoctors.filter(d => 
                  specializations.includes(d.specialization)
                );
                if (categoryDoctors.length === 0) return null;
                
                return (
                  <Card key={category}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Stethoscope className="h-5 w-5 text-teal-600" />
                        {category}
                        <Badge variant="secondary" className="ml-2">{categoryDoctors.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {categoryDoctors.map(doctor => (
                          <DoctorCard 
                            key={doctor.id} 
                            doctor={doctor}
                            onView={() => { setSelectedDoctor(doctor); setShowViewDialog(true); }}
                            onEdit={() => openEditDialog(doctor)}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              
              {filteredDoctors.length === 0 && !isLoading && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Stethoscope className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Doctors Found</h3>
                    <p className="text-muted-foreground mt-2">Add your first doctor to get started.</p>
                    <Button onClick={() => setShowAddDialog(true)} className="mt-4">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Doctor
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Add Doctor Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-teal-600" />
                Add New Doctor
              </DialogTitle>
              <DialogDescription>
                Add a doctor to your hospital. They will be able to see appointments and manage patients.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Enter last name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="doctor@hospital.com"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="specialization">Specialization *</Label>
                  <Select 
                    value={formData.specialization} 
                    onValueChange={(value) => setFormData({ ...formData, specialization: value, department: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select specialization" />
                    </SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-[300px]">
                        {Object.entries(SPECIALIZATION_CATEGORIES).map(([category, specs]) => (
                          <div key={category}>
                            <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground bg-muted">
                              {category}
                            </div>
                            {specs.map(spec => (
                              <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                            ))}
                          </div>
                        ))}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="E.g., Cardiology, General Medicine"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="qualification">Qualification</Label>
                  <Input
                    id="qualification"
                    value={formData.qualification}
                    onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                    placeholder="MBBS, MD, MS, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="experience">Experience (Years)</Label>
                  <Input
                    id="experience"
                    type="number"
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    placeholder="Years of experience"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="registrationNumber">Registration Number</Label>
                  <Input
                    id="registrationNumber"
                    value={formData.registrationNumber}
                    onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                    placeholder="Medical council registration"
                  />
                </div>
                <div>
                  <Label htmlFor="consultationFee">Consultation Fee (₹)</Label>
                  <Input
                    id="consultationFee"
                    type="number"
                    value={formData.consultationFee}
                    onChange={(e) => setFormData({ ...formData, consultationFee: e.target.value })}
                    placeholder="500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="shift">Default Shift</Label>
                  <Select value={formData.shift} onValueChange={(value) => setFormData({ ...formData, shift: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning (8 AM - 2 PM)</SelectItem>
                      <SelectItem value="Afternoon">Afternoon (2 PM - 8 PM)</SelectItem>
                      <SelectItem value="Evening">Evening (4 PM - 10 PM)</SelectItem>
                      <SelectItem value="Night">Night (8 PM - 8 AM)</SelectItem>
                      <SelectItem value="Flexible">Flexible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="password">Initial Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Leave blank for default"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Default: Doctor@123</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button 
                onClick={handleAddDoctor} 
                disabled={addDoctorMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {addDoctorMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Doctor
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Doctor Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-600" />
                Edit Doctor
              </DialogTitle>
              <DialogDescription>
                Update doctor information.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-firstName">First Name *</Label>
                  <Input
                    id="edit-firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-lastName">Last Name *</Label>
                  <Input
                    id="edit-lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-phone">Phone Number</Label>
                  <Input
                    id="edit-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-specialization">Specialization</Label>
                  <Select 
                    value={formData.specialization} 
                    onValueChange={(value) => setFormData({ ...formData, specialization: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select specialization" />
                    </SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-[300px]">
                        {ALL_SPECIALIZATIONS.map(spec => (
                          <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                        ))}
                      </ScrollArea>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-department">Department</Label>
                  <Input
                    id="edit-department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-qualification">Qualification</Label>
                  <Input
                    id="edit-qualification"
                    value={formData.qualification}
                    onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-consultationFee">Consultation Fee (₹)</Label>
                  <Input
                    id="edit-consultationFee"
                    type="number"
                    value={formData.consultationFee}
                    onChange={(e) => setFormData({ ...formData, consultationFee: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button 
                onClick={handleEditDoctor} 
                disabled={updateDoctorMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateDoctorMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Doctor Dialog */}
        <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-teal-600" />
                Doctor Details
              </DialogTitle>
            </DialogHeader>
            
            {selectedDoctor && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-teal-100 flex items-center justify-center">
                    <Stethoscope className="h-8 w-8 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{selectedDoctor.name}</h3>
                    <p className="text-muted-foreground">{selectedDoctor.specialization}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedDoctor.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedDoctor.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Department</p>
                    <p className="font-medium">{selectedDoctor.department || selectedDoctor.specialization}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Experience</p>
                    <p className="font-medium">{selectedDoctor.experience ? `${selectedDoctor.experience} years` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Qualification</p>
                    <p className="font-medium">{selectedDoctor.qualification || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Registration #</p>
                    <p className="font-medium">{selectedDoctor.registrationNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Consultation Fee</p>
                    <p className="font-medium">₹{selectedDoctor.consultationFee || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={selectedDoctor.status === 'active' || selectedDoctor.status === 'On-Duty' ? 'default' : 'secondary'}>
                      {selectedDoctor.status}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewDialog(false)}>Close</Button>
              <Button onClick={() => { setShowViewDialog(false); if(selectedDoctor) openEditDialog(selectedDoctor); }}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </HospitalLayout>
  );
};

// Doctor Table Component
const DoctorsTable = ({ 
  doctors, 
  isLoading, 
  onView, 
  onEdit, 
  onDelete 
}: { 
  doctors: Doctor[];
  isLoading: boolean;
  onView: (doc: Doctor) => void;
  onEdit: (doc: Doctor) => void;
  onDelete: (doc: Doctor) => void;
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
          <p className="text-muted-foreground mt-2">Loading doctors...</p>
        </CardContent>
      </Card>
    );
  }

  if (doctors.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Stethoscope className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No Doctors Found</h3>
          <p className="text-muted-foreground mt-2">Add doctors to your hospital to see them here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Doctor</TableHead>
            <TableHead>Specialization</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Shift</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {doctors.map((doctor) => (
            <TableRow key={doctor.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-medium">{doctor.name}</p>
                    <p className="text-xs text-muted-foreground">{doctor.qualification || 'MBBS'}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-normal">
                  {doctor.specialization || 'General'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <p className="text-sm flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {doctor.phone || 'N/A'}
                  </p>
                  {doctor.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {doctor.email}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge 
                  variant={doctor.status === 'active' || doctor.status === 'On-Duty' ? 'default' : 'secondary'}
                  className={doctor.status === 'active' || doctor.status === 'On-Duty' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                >
                  {doctor.status || 'Active'}
                </Badge>
              </TableCell>
              <TableCell>{doctor.shift || 'Morning'}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(doctor)}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(doctor)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onDelete(doctor)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

// Doctor Card Component (for specialty view)
const DoctorCard = ({ 
  doctor, 
  onView, 
  onEdit 
}: { 
  doctor: Doctor;
  onView: () => void;
  onEdit: () => void;
}) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-teal-100 flex items-center justify-center">
            <User className="h-6 w-6 text-teal-600" />
          </div>
          <div>
            <h4 className="font-medium">{doctor.name}</h4>
            <p className="text-sm text-muted-foreground">{doctor.qualification || 'MBBS'}</p>
          </div>
        </div>
        <Badge 
          variant={doctor.status === 'active' || doctor.status === 'On-Duty' ? 'default' : 'secondary'}
          className="text-xs"
        >
          {doctor.status || 'Active'}
        </Badge>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-sm flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          {doctor.phone || 'N/A'}
        </p>
        {doctor.experience && (
          <p className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {doctor.experience} years experience
          </p>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onView}>
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-1" />
          Edit
        </Button>
      </div>
    </CardContent>
  </Card>
);

export default HospitalDoctorsManagement;
