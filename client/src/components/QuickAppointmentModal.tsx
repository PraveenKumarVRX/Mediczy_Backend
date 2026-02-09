import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Search, Star, Clock, ArrowRight, Info, Stethoscope, Heart, FlaskConical, MapPin, Video, Building, Home, Syringe, TestTube } from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/hooks/use-toast";

interface Doctor {
  _id: string;
  id?: string;
  doctor_id?: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  specialization: string;
  experience: number;
  averageRating?: number;
  serviceTiers?: any[];
}

interface Nurse {
  _id: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  specialization?: string;
  experience?: number;
  rating?: number;
  availability?: string;
}

interface Lab {
  _id: string;
  name: string;
  logo?: string;
  type?: string;
  services?: string[];
  rating?: number;
  location?: string;
  operatingHours?: string;
}

interface HomecareService {
  _id: string;
  name: string;
  type: 'doctor' | 'nurse' | 'lab';
  description?: string;
  rating?: number;
  availability?: string;
}

interface QuickAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProviderType = "doctors" | "nurses" | "labs" | "homecare";
type ConsultationType = "online" | "offline";
type LabServiceType = "checkup" | "diagnostic";
type HomecareServiceType = "doctor" | "nurse" | "lab";

const SPECIALIZATIONS = [
  "Cardiology",
  "Dermatology",
  "Neurology",
  "Pediatrics",
  "Orthopedics",
  "General Medicine",
  "Psychiatry",
  "ENT",
  "Gynecology",
  "Ophthalmology",
];

export default function QuickAppointmentModal({
  open,
  onOpenChange,
}: QuickAppointmentModalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userType } = useAuth();
  const { toast } = useToast();
  const normalizedPath = location.pathname.toLowerCase();
  const [providerType, setProviderType] = useState<ProviderType>("doctors");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("all");
  const [consultationType, setConsultationType] = useState<ConsultationType>("online");
  const [labServiceType, setLabServiceType] = useState<LabServiceType>("checkup");
  const [homecareServiceType, setHomecareServiceType] = useState<HomecareServiceType>("doctor");

  // Determine user context
  const isDoctorPortal = normalizedPath === "/doctor" || normalizedPath.startsWith("/doctor/");
  const isNursePortal = normalizedPath === "/nurse" || normalizedPath.startsWith("/nurse/");
  const isAssistantPortal = normalizedPath === "/assistant" || normalizedPath.startsWith("/assistant/");
  const isLabPortal = normalizedPath === "/lab" || normalizedPath.startsWith("/lab/");
  const isHomecarePortal = normalizedPath === "/homecare" || normalizedPath.startsWith("/homecare/");
  const isStaffBooking = isDoctorPortal || isNursePortal || isAssistantPortal || isLabPortal || isHomecarePortal;

  const resolveDoctorId = (doctor: Doctor) => doctor._id || doctor.id || doctor.doctor_id || "";

  // Fetch doctors
  const { data: doctors = [], isLoading: isDoctorsLoading } = useQuery({
    queryKey: ["doctors", searchTerm, selectedSpecialty],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (selectedSpecialty && selectedSpecialty !== "all") {
        params.append("specialization", selectedSpecialty);
      }
      const { data } = await api.get(`/doctors?${params.toString()}`);
      return (data?.doctors || data || []).slice(0, 6);
    },
    enabled: open && providerType === "doctors",
  });

  // Fetch nurses
  const { data: nurses = [], isLoading: isNursesLoading } = useQuery({
    queryKey: ["nurses", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      const { data } = await api.get(`/nurses?${params.toString()}`);
      return (data?.nurses || data || []).slice(0, 6);
    },
    enabled: open && providerType === "nurses",
  });

  // Fetch labs
  const { data: labs = [], isLoading: isLabsLoading } = useQuery({
    queryKey: ["labs-list", searchTerm, labServiceType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      params.append("serviceType", labServiceType);
      const { data } = await api.get(`/labs?${params.toString()}`);
      return (data?.labs || data || []).slice(0, 6);
    },
    enabled: open && providerType === "labs",
  });

  // Fetch homecare services
  const { data: homecareServices = [], isLoading: isHomecareLoading } = useQuery({
    queryKey: ["homecare-services", searchTerm, homecareServiceType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      params.append("type", homecareServiceType);
      const { data } = await api.get(`/homecare/services?${params.toString()}`);
      return (data?.services || data || []).slice(0, 6);
    },
    enabled: open && providerType === "homecare",
  });

  const isLoading = isDoctorsLoading || isNursesLoading || isLabsLoading || isHomecareLoading;

  const handleProviderSelect = (providerId: string) => {
    onOpenChange(false);
    if (providerType === "doctors") {
      navigate(`/consultation/${providerId}?type=${consultationType}`);
    } else if (providerType === "nurses") {
      navigate(`/nurse-booking/${providerId}`);
    } else if (providerType === "labs") {
      navigate(`/lab-booking/${providerId}?serviceType=${labServiceType}`);
    } else if (providerType === "homecare") {
      navigate(`/homecare-booking/${providerId}?type=${homecareServiceType}`);
    }
  };

  const handleViewAll = () => {
    onOpenChange(false);
    if (providerType === "doctors") {
      navigate("/consultation", {
        state: { specialty: selectedSpecialty, search: searchTerm, type: consultationType },
      });
    } else if (providerType === "nurses") {
      navigate("/nurses", { state: { search: searchTerm } });
    } else if (providerType === "labs") {
      navigate("/labs", { state: { search: searchTerm, serviceType: labServiceType } });
    } else if (providerType === "homecare") {
      navigate("/homecare", { state: { search: searchTerm, type: homecareServiceType } });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold primary-grad">
            Book New Appointment
          </DialogTitle>
          <DialogDescription>
            {isStaffBooking 
              ? "Book appointments with doctors, nurses, labs, or homecare services for your patients"
              : "Choose a provider type and service to get started"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Staff Booking Notice */}
          {isStaffBooking && (
            <Alert className="border-[#00FFF3]/30 bg-[#00FFF3]/5">
              <Info className="h-4 w-4 text-[#00FFF3]" />
              <AlertDescription className="text-sm text-gray-300">
                {isDoctorPortal && "Booking appointment on behalf of your patient"}
                {isNursePortal && "Booking appointment for patient care coordination"}
                {isAssistantPortal && "Scheduling appointment as doctor's assistant"}
                {isLabPortal && "Booking follow-up appointment for lab results"}
                {isHomecarePortal && "Scheduling appointment for homecare patient"}
              </AlertDescription>
            </Alert>
          )}

          {/* Provider Type Tabs */}
          <Tabs value={providerType} onValueChange={(value) => setProviderType(value as ProviderType)}>
            <TabsList className="grid w-full grid-cols-4 bg-[#1A2333]">
              <TabsTrigger value="doctors" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                <Stethoscope className="h-4 w-4 mr-2" />
                Doctors
              </TabsTrigger>
              <TabsTrigger value="labs" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                <FlaskConical className="h-4 w-4 mr-2" />
                Labs
              </TabsTrigger>
              <TabsTrigger value="homecare" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                <Home className="h-4 w-4 mr-2" />
                Homecare
              </TabsTrigger>
              <TabsTrigger value="nurses" className="data-[state=active]:bg-[#00FFF3] data-[state=active]:text-[#0B1120]">
                <Heart className="h-4 w-4 mr-2" />
                Nurses
              </TabsTrigger>
            </TabsList>

            {/* Service Type Selection */}
            {providerType === "doctors" && (
              <div className="space-y-3 mt-6">
                <Label className="text-sm font-medium">Consultation Type</Label>
                <RadioGroup value={consultationType} onValueChange={(value) => setConsultationType(value as ConsultationType)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="online" id="online" />
                    <Label htmlFor="online" className="flex items-center gap-2 cursor-pointer">
                      <Video className="h-4 w-4 text-[#00FFF3]" />
                      Online Consultation
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="offline" id="offline" />
                    <Label htmlFor="offline" className="flex items-center gap-2 cursor-pointer">
                      <Building className="h-4 w-4 text-[#00FFF3]" />
                      Offline Consultation
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {providerType === "labs" && (
              <div className="space-y-3 mt-6">
                <Label className="text-sm font-medium">Service Type</Label>
                <RadioGroup value={labServiceType} onValueChange={(value) => setLabServiceType(value as LabServiceType)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="checkup" id="checkup" />
                    <Label htmlFor="checkup" className="flex items-center gap-2 cursor-pointer">
                      <Heart className="h-4 w-4 text-[#00FFF3]" />
                      Health Checkup
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="diagnostic" id="diagnostic" />
                    <Label htmlFor="diagnostic" className="flex items-center gap-2 cursor-pointer">
                      <TestTube className="h-4 w-4 text-[#00FFF3]" />
                      Diagnostic Test
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {providerType === "homecare" && (
              <div className="space-y-3 mt-6">
                <Label className="text-sm font-medium">Homecare Service Type</Label>
                <RadioGroup value={homecareServiceType} onValueChange={(value) => setHomecareServiceType(value as HomecareServiceType)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="doctor" id="hc-doctor" />
                    <Label htmlFor="hc-doctor" className="flex items-center gap-2 cursor-pointer">
                      <Stethoscope className="h-4 w-4 text-[#00FFF3]" />
                      Doctor Visit
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="nurse" id="hc-nurse" />
                    <Label htmlFor="hc-nurse" className="flex items-center gap-2 cursor-pointer">
                      <Heart className="h-4 w-4 text-[#00FFF3]" />
                      Nurse Visit
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="lab" id="hc-lab" />
                    <Label htmlFor="hc-lab" className="flex items-center gap-2 cursor-pointer">
                      <Syringe className="h-4 w-4 text-[#00FFF3]" />
                      Lab Sample Collection
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Search and Filter */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={
                    providerType === "doctors" ? "Search doctors by name..." :
                    providerType === "nurses" ? "Search nurses by name..." :
                    providerType === "labs" ? "Search labs by name..." :
                    "Search homecare services..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              {providerType === "doctors" && (
                <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Specialty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Specialties</SelectItem>
                    {SPECIALIZATIONS.map((spec) => (
                      <SelectItem key={spec} value={spec}>
                        {spec}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Results */}
            <TabsContent value="doctors" className="mt-6">
              {isDoctorsLoading ? (
                <div className="text-center py-8 text-gray-400">Loading doctors...</div>
              ) : doctors.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No doctors found</p>
                  <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3]">
                    Browse All Doctors
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {doctors.map((doctor: Doctor) => (
                      <Card
                        key={doctor._id || doctor.id || doctor.doctor_id || `${doctor.firstName}-${doctor.lastName}-${doctor.specialization}`}
                        className="p-4 hover:border-[#00FFF3]/40 transition-all cursor-pointer"
                        onClick={() => {
                          const doctorId = resolveDoctorId(doctor);
                          if (!doctorId) {
                            console.warn("Selected doctor is missing an id.", doctor);
                            toast({
                              title: "Unable to open doctor",
                              description: "This doctor profile is missing an id. Please choose another doctor.",
                              variant: "destructive",
                            });
                            return;
                          }
                          handleProviderSelect(doctorId);
                        }}
                      >
                        <div className="flex gap-4">
                          <img src={doctor.profileImage || "/default-doctor.png"} alt={`${doctor.firstName} ${doctor.lastName}`} className="w-16 h-16 rounded-full object-cover" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">Dr. {doctor.firstName} {doctor.lastName}</h3>
                            <Badge variant="outline" className="mb-2 text-[#00FFF3] border-[#00FFF3]/30">{doctor.specialization}</Badge>
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>{doctor.averageRating?.toFixed(1) || "4.5"}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{doctor.experience || 5}+ years</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {consultationType === "online" ? <Video className="h-3 w-3 mr-1" /> : <Building className="h-3 w-3 mr-1" />}
                                {consultationType === "online" ? "Online" : "Offline"}
                              </Badge>
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-[#00FFF3] self-center" />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10">
                      View All Doctors <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="nurses" className="mt-6">
              {isNursesLoading ? (
                <div className="text-center py-8 text-gray-400">Loading nurses...</div>
              ) : nurses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No nurses found</p>
                  <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3]">
                    Browse All Nurses
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {nurses.map((nurse: Nurse) => (
                      <Card key={nurse._id} className="p-4 hover:border-[#00FFF3]/40 transition-all cursor-pointer" onClick={() => handleProviderSelect(nurse._id)}>
                        <div className="flex gap-4">
                          <img src={nurse.profileImage || "/default-doctor.png"} alt={`${nurse.firstName} ${nurse.lastName}`} className="w-16 h-16 rounded-full object-cover" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">{nurse.firstName} {nurse.lastName}</h3>
                            {nurse.specialization && (
                              <Badge variant="outline" className="mb-2 text-[#00FFF3] border-[#00FFF3]/30">{nurse.specialization}</Badge>
                            )}
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>{nurse.rating?.toFixed(1) || "4.5"}</span>
                              </div>
                              {nurse.experience && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{nurse.experience}+ years</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-[#00FFF3] self-center" />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10">
                      View All Nurses <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="labs" className="mt-6">
              {isLabsLoading ? (
                <div className="text-center py-8 text-gray-400">Loading labs...</div>
              ) : labs.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No labs found</p>
                  <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3]">
                    Browse All Labs
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {labs.map((lab: Lab) => (
                      <Card key={lab._id} className="p-4 hover:border-[#00FFF3]/40 transition-all cursor-pointer" onClick={() => handleProviderSelect(lab._id)}>
                        <div className="flex gap-4">
                          <div className="w-16 h-16 rounded-lg bg-[#1A2333] flex items-center justify-center">
                            {lab.logo ? (
                              <img src={lab.logo} alt={lab.name} className="w-12 h-12 object-contain" />
                            ) : (
                              <FlaskConical className="h-8 w-8 text-[#00FFF3]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">{lab.name}</h3>
                            <div className="flex gap-2 mb-2">
                              {lab.type && (
                                <Badge variant="outline" className="text-[#00FFF3] border-[#00FFF3]/30">{lab.type}</Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {labServiceType === "checkup" ? <Heart className="h-3 w-3 mr-1" /> : <TestTube className="h-3 w-3 mr-1" />}
                                {labServiceType === "checkup" ? "Checkup" : "Diagnostic"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>{lab.rating?.toFixed(1) || "4.5"}</span>
                              </div>
                              {lab.location && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate text-xs">{lab.location}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-[#00FFF3] self-center" />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10">
                      View All Labs <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="homecare" className="mt-6">
              {isHomecareLoading ? (
                <div className="text-center py-8 text-gray-400">Loading homecare services...</div>
              ) : homecareServices.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No homecare services found</p>
                  <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3]">
                    Browse All Homecare Services
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {homecareServices.map((service: HomecareService) => (
                      <Card key={service._id} className="p-4 hover:border-[#00FFF3]/40 transition-all cursor-pointer" onClick={() => handleProviderSelect(service._id)}>
                        <div className="flex gap-4">
                          <div className="w-16 h-16 rounded-lg bg-[#1A2333] flex items-center justify-center">
                            {service.type === 'doctor' ? (
                              <Stethoscope className="h-8 w-8 text-[#00FFF3]" />
                            ) : service.type === 'nurse' ? (
                              <Heart className="h-8 w-8 text-[#00FFF3]" />
                            ) : (
                              <Syringe className="h-8 w-8 text-[#00FFF3]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">{service.name}</h3>
                            <Badge variant="outline" className="mb-2 text-[#00FFF3] border-[#00FFF3]/30">
                              <Home className="h-3 w-3 mr-1" />
                              {service.type === 'doctor' ? 'Doctor Visit' : service.type === 'nurse' ? 'Nurse Visit' : 'Lab Collection'}
                            </Badge>
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>{service.rating?.toFixed(1) || "4.5"}</span>
                              </div>
                              {service.availability && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span className="truncate text-xs">{service.availability}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-[#00FFF3] self-center" />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleViewAll} className="border-[#00FFF3]/30 text-[#00FFF3] hover:bg-[#00FFF3]/10">
                      View All Homecare Services <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
