import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Calendar,
  Video,
  User,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Settings,
  IndianRupee,
  MapPin,
  Plus,
  Trash2,
  Edit,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import SlotPreview from "@/components/doctor/SlotPreview";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface DaySchedule {
  isOff: boolean;
  online: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
  inPerson: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    locationId?: string; // Reference to practice location
  };
  blockedSlots?: string[]; // Array of blocked slot times
}

interface PracticeLocation {
  id: string;
  name: string;
  address: string;
  consultationFee: number;
}

interface WeeklySchedule {
  [key: string]: DaySchedule;
}

interface AppointmentConfig {
  slotDuration: number;
  weeklySchedule: WeeklySchedule;
  offDays: string[];
  onlineConsultationEnabled: boolean;
  inPersonConsultationEnabled: boolean;
  onlineConsultationFee: number;
  inPersonConsultationFee: number;
  practiceLocations?: PracticeLocation[];
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: { [key: string]: string } = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const TIME_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'
];

const DoctorAppointmentSettings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<AppointmentConfig | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<PracticeLocation | null>(null);
  const [newLocation, setNewLocation] = useState({ name: '', address: '', consultationFee: 0 });

  // Fetch current configuration
  const resolveDoctorToken = () =>
    localStorage.getItem('doctorToken') || localStorage.getItem('token');

  const { data, isLoading, error } = useQuery({
    queryKey: ["appointmentConfig"],
    queryFn: async () => {
      const token = resolveDoctorToken();
      const { data } = await api.get('/doctor-settings/appointment-config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return data.config;
    },
  });

  useEffect(() => {
    if (data) {
      setConfig(data);
    }
  }, [data]);

  // Save configuration mutation
  const saveMutation = useMutation({
    mutationFn: async (configData: Partial<AppointmentConfig>) => {
      const token = resolveDoctorToken();
      const { data } = await api.put('/doctor-settings/appointment-config', configData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return data;
    },
    onSuccess: (response) => {
      if (response?.config) {
        setConfig(response.config);
        queryClient.setQueryData(["appointmentConfig"], response.config);
      }
      toast({
        title: "Settings Saved",
        description: "Your appointment configuration has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["appointmentConfig"] });
      queryClient.removeQueries({ queryKey: ["doctorSlots"] });
      queryClient.invalidateQueries({ queryKey: ["doctorSlots"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const handleSlotDurationChange = (duration: string) => {
    if (config) {
      setConfig({ ...config, slotDuration: parseInt(duration) });
    }
  };

  const handleDayToggle = (day: string) => {
    if (config) {
      const updatedSchedule = { ...config.weeklySchedule };
      updatedSchedule[day] = {
        ...updatedSchedule[day],
        isOff: !updatedSchedule[day].isOff,
      };
      
      const updatedOffDays = updatedSchedule[day].isOff 
        ? [...config.offDays.filter(d => d !== day), day]
        : config.offDays.filter(d => d !== day);
      
      setConfig({ 
        ...config, 
        weeklySchedule: updatedSchedule,
        offDays: updatedOffDays 
      });
    }
  };

  const handleTimeChange = (day: string, type: 'online' | 'inPerson', field: 'startTime' | 'endTime', value: string) => {
    if (config) {
      const updatedSchedule = { ...config.weeklySchedule };
      updatedSchedule[day] = {
        ...updatedSchedule[day],
        [type]: {
          ...updatedSchedule[day][type],
          [field]: value,
        },
      };
      setConfig({ ...config, weeklySchedule: updatedSchedule });
    }
  };

  const handleLocationChange = (day: string, value: string) => {
    if (config) {
      const updatedSchedule = { ...config.weeklySchedule };
      updatedSchedule[day] = {
        ...updatedSchedule[day],
        inPerson: {
          ...updatedSchedule[day].inPerson,
          locationId: value,
        },
      };
      setConfig({ ...config, weeklySchedule: updatedSchedule });
    }
  };

  const handleAddLocation = () => {
    if (config && newLocation.name && newLocation.address) {
      const location: PracticeLocation = {
        id: Date.now().toString(),
        ...newLocation,
      };
      
      const updatedLocations = [...(config.practiceLocations || []), location];
      setConfig({ ...config, practiceLocations: updatedLocations });
      
      setNewLocation({ name: '', address: '', consultationFee: 0 });
      setShowLocationModal(false);
      
      toast({
        title: "Location Added",
        description: `${location.name} has been added to your practice locations.`,
      });
    }
  };

  const handleUpdateLocation = () => {
    if (config && editingLocation) {
      const updatedLocations = config.practiceLocations?.map(loc =>
        loc.id === editingLocation.id ? editingLocation : loc
      ) || [];
      
      setConfig({ ...config, practiceLocations: updatedLocations });
      setEditingLocation(null);
      
      toast({
        title: "Location Updated",
        description: "Location details have been updated.",
      });
    }
  };

  const handleDeleteLocation = (locationId: string) => {
    if (config) {
      const updatedLocations = config.practiceLocations?.filter(loc => loc.id !== locationId) || [];
      setConfig({ ...config, practiceLocations: updatedLocations });
      
      toast({
        title: "Location Removed",
        description: "Practice location has been removed.",
        variant: "destructive",
      });
    }
  };

  const getLocationById = (locationId?: string) => {
    if (!locationId || !config?.practiceLocations) return null;
    return config.practiceLocations.find(loc => loc.id === locationId);
  };

  const handleTypeToggle = (day: string, type: 'online' | 'inPerson') => {
    if (config) {
      const updatedSchedule = { ...config.weeklySchedule };
      updatedSchedule[day] = {
        ...updatedSchedule[day],
        [type]: {
          ...updatedSchedule[day][type],
          enabled: !updatedSchedule[day][type].enabled,
        },
      };
      setConfig({ ...config, weeklySchedule: updatedSchedule });
    }
  };

  const handleFeeChange = (type: 'online' | 'inPerson', value: string) => {
    if (config) {
      const key = type === 'online' ? 'onlineConsultationFee' : 'inPersonConsultationFee';
      setConfig({ ...config, [key]: parseFloat(value) || 0 });
    }
  };

  const handleBlockSlot = (day: string, slotTime: string, type: 'online' | 'inPerson') => {
    if (!config) return;
    const updatedSchedule = { ...config.weeklySchedule };
    const currentBlockedSlots = updatedSchedule[day].blockedSlots || [];

    if (currentBlockedSlots.includes(slotTime)) return;

    updatedSchedule[day] = {
      ...updatedSchedule[day],
      blockedSlots: [...currentBlockedSlots, slotTime],
    };
    const updatedConfig = { ...config, weeklySchedule: updatedSchedule };
    setConfig(updatedConfig);
    // Persist immediately — block/unblock must hit the server right away,
    // not wait for the separate "Save" button, otherwise a refetch (e.g. on
    // window focus) silently reverts the unsaved local change.
    saveMutation.mutate(updatedConfig);
  };

  const handleUnblockSlot = (day: string, slotTime: string, type: 'online' | 'inPerson') => {
    if (!config) return;
    const updatedSchedule = { ...config.weeklySchedule };
    const currentBlockedSlots = updatedSchedule[day].blockedSlots || [];

    updatedSchedule[day] = {
      ...updatedSchedule[day],
      blockedSlots: currentBlockedSlots.filter(slot => slot !== slotTime),
    };
    const updatedConfig = { ...config, weeklySchedule: updatedSchedule };
    setConfig(updatedConfig);
    saveMutation.mutate(updatedConfig);
  };

  const handleSave = () => {
    if (config) {
      saveMutation.mutate(config);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (error || !config) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Failed to load settings</h3>
            <p className="text-gray-600">Please try again later</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Appointment Settings</h1>
            <p className="text-gray-600 mt-1">Configure your appointment slots and availability</p>
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>

        {/* Slot Duration & Fees Card */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General Settings
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            {/* Slot Duration */}
            <div className="space-y-2">
              <Label htmlFor="slotDuration" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Slot Duration
              </Label>
              <Select 
                value={config.slotDuration.toString()} 
                onValueChange={handleSlotDurationChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes (1 hour)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Each appointment slot duration</p>
            </div>

            {/* Online Consultation Fee */}
            <div className="space-y-2">
              <Label htmlFor="onlineFee" className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                Online Consultation Fee
              </Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="onlineFee"
                  type="number"
                  value={config.onlineConsultationFee}
                  onChange={(e) => handleFeeChange('online', e.target.value)}
                  className="pl-10"
                  min="0"
                />
              </div>
            </div>

            {/* In-Person Consultation Fee */}
            <div className="space-y-2">
              <Label htmlFor="inPersonFee" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                In-Person Consultation Fee
              </Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="inPersonFee"
                  type="number"
                  value={config.inPersonConsultationFee}
                  onChange={(e) => handleFeeChange('inPerson', e.target.value)}
                  className="pl-10"
                  min="0"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Practice Locations Card */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Practice Locations
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage your clinics and hospitals with location-specific consultation fees
              </p>
            </div>
            <Button 
              onClick={() => setShowLocationModal(true)}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </div>

          {config.practiceLocations && config.practiceLocations.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {config.practiceLocations.map((location) => (
                <Card key={location.id} className="p-4 border-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-600" />
                        {location.name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">{location.address}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="default" className="bg-green-600">
                          <IndianRupee className="h-3 w-3 mr-1" />
                          ₹{location.consultationFee}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingLocation(location)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteLocation(location.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No practice locations added yet</p>
              <p className="text-sm text-gray-500">Add your clinic or hospital locations to get started</p>
            </div>
          )}
        </Card>

        {/* Weekly Schedule Card */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Weekly Schedule
          </h2>
          <p className="text-gray-600 mb-4">
            Configure your availability for each day. Set separate timings for online and in-person consultations.
          </p>
          
          {/* Scheduling Info */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Flexible Scheduling
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Online and in-person consultations can run simultaneously or sequentially</li>
              <li>✓ Each type has independent time slots - no interference</li>
              <li>✓ Specify location for in-person appointments (clinic/hospital)</li>
              <li>✓ Block specific slots when you're unavailable</li>
            </ul>
          </div>

          <Tabs defaultValue="monday" className="w-full">
            <TabsList className="grid grid-cols-7 w-full mb-6">
              {DAYS.map((day) => (
                <TabsTrigger 
                  key={day} 
                  value={day}
                  className={config.weeklySchedule[day]?.isOff ? 'text-red-500' : ''}
                >
                  {DAY_LABELS[day].slice(0, 3)}
                </TabsTrigger>
              ))}
            </TabsList>

            {DAYS.map((day) => (
              <TabsContent key={day} value={day} className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <h3 className="text-lg font-semibold">{DAY_LABELS[day]}</h3>
                    <p className="text-sm text-gray-500">
                      {config.weeklySchedule[day]?.isOff ? 'Day Off' : 'Working Day'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`${day}-off`}>Day Off</Label>
                    <Switch
                      id={`${day}-off`}
                      checked={config.weeklySchedule[day]?.isOff || false}
                      onCheckedChange={() => handleDayToggle(day)}
                    />
                  </div>
                </div>

                {!config.weeklySchedule[day]?.isOff && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Online Consultation */}
                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Video className="h-5 w-5 text-blue-500" />
                          <span className="font-medium">Online Consultation</span>
                        </div>
                        <Switch
                          checked={config.weeklySchedule[day]?.online?.enabled || false}
                          onCheckedChange={() => handleTypeToggle(day, 'online')}
                        />
                      </div>

                      {config.weeklySchedule[day]?.online?.enabled && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Start Time</Label>
                            <Select
                              value={config.weeklySchedule[day]?.online?.startTime || '09:00'}
                              onValueChange={(v) => handleTimeChange(day, 'online', 'startTime', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_OPTIONS.map((time) => (
                                  <SelectItem key={time} value={time}>{time}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>End Time</Label>
                            <Select
                              value={config.weeklySchedule[day]?.online?.endTime || '13:00'}
                              onValueChange={(v) => handleTimeChange(day, 'online', 'endTime', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_OPTIONS.map((time) => (
                                  <SelectItem key={time} value={time}>{time}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* In-Person Consultation */}
                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-5 w-5 text-green-500" />
                          <span className="font-medium">In-Person Consultation</span>
                        </div>
                        <Switch
                          checked={config.weeklySchedule[day]?.inPerson?.enabled || false}
                          onCheckedChange={() => handleTypeToggle(day, 'inPerson')}
                        />
                      </div>

                      {config.weeklySchedule[day]?.inPerson?.enabled && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Start Time</Label>
                              <Select
                                value={config.weeklySchedule[day]?.inPerson?.startTime || '14:00'}
                                onValueChange={(v) => handleTimeChange(day, 'inPerson', 'startTime', v)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIME_OPTIONS.map((time) => (
                                    <SelectItem key={time} value={time}>{time}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>End Time</Label>
                              <Select
                                value={config.weeklySchedule[day]?.inPerson?.endTime || '18:00'}
                                onValueChange={(v) => handleTimeChange(day, 'inPerson', 'endTime', v)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIME_OPTIONS.map((time) => (
                                    <SelectItem key={time} value={time}>{time}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Consultation Location</Label>
                            {config.practiceLocations && config.practiceLocations.length > 0 ? (
                              <>
                                <Select
                                  value={config.weeklySchedule[day]?.inPerson?.locationId || ''}
                                  onValueChange={(v) => handleLocationChange(day, v)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {config.practiceLocations.map((loc) => (
                                      <SelectItem key={loc.id} value={loc.id}>
                                        <div className="flex items-center gap-2">
                                          <MapPin className="h-3 w-3" />
                                          {loc.name} - ₹{loc.consultationFee}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {config.weeklySchedule[day]?.inPerson?.locationId && (
                                  <p className="text-xs text-gray-600">
                                    {getLocationById(config.weeklySchedule[day]?.inPerson?.locationId)?.address}
                                  </p>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-gray-500 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                Please add practice locations first
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Slot Preview */}
                <SlotPreview
                  dayName={DAY_LABELS[day]}
                  slotDuration={config.slotDuration}
                  onlineEnabled={config.weeklySchedule[day]?.online?.enabled || false}
                  onlineStart={config.weeklySchedule[day]?.online?.startTime || '09:00'}
                  onlineEnd={config.weeklySchedule[day]?.online?.endTime || '13:00'}
                  inPersonEnabled={config.weeklySchedule[day]?.inPerson?.enabled || false}
                  inPersonStart={config.weeklySchedule[day]?.inPerson?.startTime || '14:00'}
                  inPersonEnd={config.weeklySchedule[day]?.inPerson?.endTime || '18:00'}
                  inPersonLocation={getLocationById(config.weeklySchedule[day]?.inPerson?.locationId)?.name || ''}
                  blockedSlots={config.weeklySchedule[day]?.blockedSlots || []}
                  onBlockSlot={(slotTime, type) => handleBlockSlot(day, slotTime, type)}
                  onUnblockSlot={(slotTime, type) => handleUnblockSlot(day, slotTime, type)}
                />
              </TabsContent>
            ))}
          </Tabs>
        </Card>

        {/* Quick Off Days Overview */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Weekly Off Days</h2>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <Badge
                key={day}
                variant={config.weeklySchedule[day]?.isOff ? "destructive" : "outline"}
                className="cursor-pointer"
                onClick={() => handleDayToggle(day)}
              >
                {config.weeklySchedule[day]?.isOff ? (
                  <AlertCircle className="h-3 w-3 mr-1" />
                ) : (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                {DAY_LABELS[day]}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Click on a day to toggle it as an off day
          </p>
        </Card>

        {/* Save Button at bottom */}
        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save All Changes
          </Button>
        </div>

        {/* Add/Edit Location Dialog */}
        <Dialog open={showLocationModal} onOpenChange={setShowLocationModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Practice Location</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Location Name *</Label>
                <Input
                  placeholder="e.g., City Hospital, Main Clinic"
                  value={newLocation.name}
                  onChange={(e) => setNewLocation({...newLocation, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Address *</Label>
                <Input
                  placeholder="e.g., 123 Medical Street, City"
                  value={newLocation.address}
                  onChange={(e) => setNewLocation({...newLocation, address: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Consultation Fee *</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="number"
                    placeholder="500"
                    className="pl-10"
                    value={newLocation.consultationFee || ''}
                    onChange={(e) => setNewLocation({...newLocation, consultationFee: parseFloat(e.target.value) || 0})}
                    min="0"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLocationModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddLocation} disabled={!newLocation.name || !newLocation.address}>
                Add Location
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Location Dialog */}
        <Dialog open={!!editingLocation} onOpenChange={(open) => !open && setEditingLocation(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Practice Location</DialogTitle>
            </DialogHeader>
            {editingLocation && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Location Name *</Label>
                  <Input
                    placeholder="e.g., City Hospital, Main Clinic"
                    value={editingLocation.name}
                    onChange={(e) => setEditingLocation({...editingLocation, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address *</Label>
                  <Input
                    placeholder="e.g., 123 Medical Street, City"
                    value={editingLocation.address}
                    onChange={(e) => setEditingLocation({...editingLocation, address: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Consultation Fee *</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="number"
                      placeholder="500"
                      className="pl-10"
                      value={editingLocation.consultationFee || ''}
                      onChange={(e) => setEditingLocation({...editingLocation, consultationFee: parseFloat(e.target.value) || 0})}
                      min="0"
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingLocation(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateLocation} disabled={!editingLocation?.name || !editingLocation?.address}>
                Update Location
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default DoctorAppointmentSettings;
