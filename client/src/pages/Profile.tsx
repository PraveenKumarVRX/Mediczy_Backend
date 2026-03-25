import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { profileProps, UserProps } from "@/lib/user.type";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayout";
import { MapPin, Wifi, WifiOff, Calendar, User, Shield, Phone, Mail, Edit3, Save, X } from "lucide-react";
import { Switch } from "@radix-ui/react-switch";
import axios from "axios";
import api from "@/utils/api";
import { useSocket } from "@/context/SocketContext";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

const profileSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phoneNumber: z
    .string()
    .min(10, "Phone number must be at least 10 characters"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
});

// Add emergency contact schema
const emergencyContactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 characters"),
  relationship: z.string().min(2, "Relationship must be at least 2 characters"),
});

const Profile = () => {
  const { socket } = useSocket();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState({ longitude: null, latitude: null });
  const [isLocating, setIsLocating] = useState(false);
  const [emergencyContacts, setEmergencyContacts] = useState(() => {
    const saved = localStorage.getItem('emergencyContacts');
    return saved ? JSON.parse(saved) : [];
  });
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    phoneNumber: '',
    relationship: ''
  });

  const { currentDoctor, currentUser, isLoading, userType } = useAuth();
  const currentId = userType === "user" ? currentUser?._id : currentDoctor?._id;

  useEffect(() => {
    // Initialize online status from user data
    if (userType === "user" && currentUser) {
      setIsOnline(currentUser.isOnline || false);
    } else if (userType === "doctor" && currentDoctor) {
      setIsOnline(currentDoctor.isOnline || false);
    }

    // Initialize location if available
    if (userType === "user" && currentUser?.location?.coordinates) {
      setLocation({
        longitude: currentUser.location.coordinates[0],
        latitude: currentUser.location.coordinates[1],
      });
    } else if (userType === "doctor" && currentDoctor?.location?.coordinates) {
      setLocation({
        longitude: currentDoctor.location.coordinates[0],
        latitude: currentDoctor.location.coordinates[1],
      });
    }
  }, [currentUser, currentDoctor, userType]);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName:
        userType === "user" ? currentUser?.firstName : currentDoctor?.firstName,
      lastName:
        userType === "user" ? currentUser?.lastName : currentDoctor?.lastName,
      email: userType === "user" ? currentUser?.email : currentDoctor?.email,
      phoneNumber:
        userType === "user"
          ? currentUser?.phoneNumber
          : currentDoctor?.phoneNumber,
      dateOfBirth: userType === "user" ? (currentUser?.dateOfBirth ? new Date(currentUser.dateOfBirth).toISOString().split('T')[0] : "") : "",
      gender: userType === "user" ? currentUser?.gender : undefined,
    },
  });

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    try {
      const response = await api.put('/users/profile', values);
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully",
      });
      setIsEditing(false);
      // Refresh user data
      window.location.reload();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to update profile",
      });
    }
  };

  // Function to get current location
  const getCurrentLocation = () => {
    setIsLocating(true);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            longitude: position.coords.longitude,
            latitude: position.coords.latitude,
          };
          setLocation(newLocation);

          // Update location in backend
          updateLocationInBackend(newLocation);
          setIsLocating(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          toast({
            title: "Location Error",
            description: "Unable to get your current location.",
            variant: "destructive",
          });
          setIsLocating(false);
        }
      );
    } else {
      toast({
        title: "Geolocation Not Supported",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
      setIsLocating(false);
    }
  };

  // Function to update location in backend
  const updateLocationInBackend = async (locationData) => {
    try {
      const endpoint =
        userType === "user" ? "/users/location" : "/doctors/location";
      const response = await api.put(endpoint, {
        location: {
          type: "Point",
          coordinates: [locationData.longitude, locationData.latitude],
        },
      });
      console.log(response,'location data');

      if (response.status === 200) {
        toast({
          title: "Location Updated",
          description: "Your location has been updated successfully.",
        });
      }
    } catch (error) {
      console.error("Error updating location:", error);
      toast({
        title: "Update Failed",
        description: "Failed to update your location.",
        variant: "destructive",
      });
    }
  };

  // Function to toggle online status
  const toggleOnlineStatus = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);

    try {
      const endpoint =
        userType === "user" ? "/users/status" : "/doctors/status";
      const response = await api.put(endpoint, {
        isOnline: newStatus,
        lastActive: new Date(),
      });
      console.log(response, "status data");

      if (response.status === 200) {
        // Emit socket event for real-time status update
        if (socket && currentId) {
          socket.emit("user-status-change", {
            userId: currentId,
            isOnline: newStatus
          });
        }

        toast({
          title: `Status: ${newStatus ? "Online" : "Offline"}`,
          description: `You are now ${newStatus ? "online" : "offline"}.`,
        });
      }
    } catch (error) {
      console.error("Error updating online status:", error);
      // Revert UI state if update fails
      setIsOnline(!newStatus);
      toast({
        title: "Status Update Failed",
        description: "Failed to update your online status.",
        variant: "destructive",
      });
    }
  };

  // Function to validate Indian phone number
  const validateIndianPhoneNumber = (phone: string) => {
    const phoneRegex = /^(\+91[-\s]?)?[0]?(91)?[6789]\d{9}$/;
    return phoneRegex.test(phone.replace(/[-\s]/g, ''));
  };

  // Function to add emergency contact
  const addEmergencyContact = () => {
    try {
      // Validate the new contact
      emergencyContactSchema.parse(newContact);
      
      // Validate Indian phone number
      if (!validateIndianPhoneNumber(newContact.phoneNumber)) {
        throw new Error("Please enter a valid Indian phone number");
      }

      const updatedContacts = [...emergencyContacts, newContact];
      setEmergencyContacts(updatedContacts);
      localStorage.setItem('emergencyContacts', JSON.stringify(updatedContacts));
      
      setNewContact({ name: '', phoneNumber: '', relationship: '' });
      setIsAddingContact(false);
      
      toast({
        title: "Contact Added",
        description: `${newContact.name} has been added to your emergency contacts.`,
      });
    } catch (error) {
      toast({
        title: "Validation Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Function to remove emergency contact
  const removeEmergencyContact = (index: number) => {
    const updatedContacts = emergencyContacts.filter((_, i) => i !== index);
    setEmergencyContacts(updatedContacts);
    localStorage.setItem('emergencyContacts', JSON.stringify(updatedContacts));
    
    toast({
      title: "Contact Removed",
      description: "Emergency contact has been removed.",
    });
  };

  return (
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Premium Hero Header */}
        <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-6">
            <Avatar className="h-24 w-24 ring-4 ring-white/20 ring-offset-4 ring-offset-slate-900 shadow-2xl">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-2xl font-bold">
                {(form.getValues("firstName")?.[0] || "")}{(form.getValues("lastName")?.[0] || "")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                  <User className="w-5 h-5" />
                </div>
                <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                  {userType === "doctor" ? "Healthcare Provider" : "Patient Profile"}
                </Badge>
                <Badge className={`${isOnline ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-slate-500/20 text-slate-300 border-slate-400/30'}`}>
                  {isOnline ? "Online" : "Offline"}
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">
                {form.getValues("firstName")} {form.getValues("lastName")}
              </h1>
              <p className="text-slate-300 text-sm">{form.getValues("email")}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsEditing(!isEditing)}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 self-start"
            >
              {isEditing ? <><X className="h-4 w-4 mr-2" />Cancel</> : <><Edit3 className="h-4 w-4 mr-2" />Edit Profile</>}
            </Button>
          </div>
        </motion.div>

        <div className="grid gap-6">
          {/* Personal Information Card */}
          <motion.div variants={item}>
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600">
                  <User className="h-4 w-4 text-white" />
                </div>
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">

              {isEditing ? (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <div className="grid gap-6 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                              First Name
                            </FormLabel>
                            <FormControl>
                              <Input {...field} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white focus:border-teal-500 focus:ring-teal-500" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                              Last Name
                            </FormLabel>
                            <FormControl>
                              <Input {...field} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white focus:border-teal-500 focus:ring-teal-500" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                            Email
                          </FormLabel>
                          <FormControl>
                            <Input type="email" {...field} className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white focus:border-teal-500 focus:ring-teal-500" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                            Phone
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="Enter your phone number"
                              {...field}
                              className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-teal-500 focus:ring-teal-500"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-6 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="dateOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                              Date of Birth
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input 
                                  type="date" 
                                  {...field}
                                  className="pr-10 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white focus:border-teal-500 focus:ring-teal-500"
                                  placeholder="DD/MM/YYYY"
                                />
                                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                              Gender
                            </FormLabel>
                            <FormControl>
                              <select
                                {...field}
                                className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="">Select gender</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600">Save Changes</Button>
                  </form>
                </Form>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <Label className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                        First Name
                      </Label>
                      <p className="mt-1 text-base text-slate-800 dark:text-slate-300">
                        {form.getValues("firstName")}
                      </p>
                    </div>
                    <div>
                      <Label className="text-lg font-semibold text-slate-700 dark:text-slate-200">Last Name</Label>
                      <p className="mt-1 text-base text-slate-800 dark:text-slate-300">
                        {form.getValues("lastName")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-lg font-semibold text-slate-700 dark:text-slate-200">Email</Label>
                    <p className="mt-1 text-base text-slate-800 dark:text-slate-300">{form.getValues("email")}</p>
                  </div>
                  <div>
                    <Label className="text-lg font-semibold text-slate-700 dark:text-slate-200">Phone</Label>
                    <p className="mt-1 text-base text-slate-800 dark:text-slate-300">
                      {form.getValues("phoneNumber")}
                    </p>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <Label className="text-lg font-semibold text-slate-700 dark:text-slate-200">Date of Birth</Label>
                      <p className="mt-1 text-base text-slate-800 dark:text-slate-300">
                        {form.getValues("dateOfBirth") 
                          ? new Date(form.getValues("dateOfBirth") || "").toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
                          : "Not provided"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-lg font-semibold text-slate-700 dark:text-slate-200">Age</Label>
                      <p className="mt-1 text-base text-slate-800 dark:text-slate-300">
                        {form.getValues("dateOfBirth") ? (() => {
                          const birthDate = new Date(form.getValues("dateOfBirth") || "");
                          const today = new Date();
                          let age = today.getFullYear() - birthDate.getFullYear();
                          const monthDiff = today.getMonth() - birthDate.getMonth();
                          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                            age--;
                          }
                          return age;
                        })() : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-lg font-semibold text-slate-700 dark:text-slate-200">Gender</Label>
                    <p className="mt-1 text-base text-slate-800 dark:text-slate-300">
                      {form.getValues("gender") || "Not provided"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </motion.div>

          {/* Emergency Contacts Card */}
          <motion.div variants={item}>
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                Emergency Contacts
              </CardTitle>
              <Button
                variant="outline"
                onClick={() => setIsAddingContact(!isAddingContact)}
                className="border-teal-500 text-teal-600 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-400 dark:hover:bg-teal-900/20"
              >
                {isAddingContact ? "Cancel" : "Add Contact"}
              </Button>
            </CardHeader>
            <CardContent className="pt-6">
              {isAddingContact && (
                <div className="mb-6 space-y-4">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="name" className="text-slate-700 dark:text-slate-200">Name</Label>
                      <Input
                        id="name"
                        value={newContact.name}
                        onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                        placeholder="Contact Name"
                        className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-teal-500 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phoneNumber" className="text-slate-700 dark:text-slate-200">Phone Number</Label>
                      <Input
                        id="phoneNumber"
                        value={newContact.phoneNumber}
                        onChange={(e) => setNewContact({ ...newContact, phoneNumber: e.target.value })}
                        placeholder="Phone Number (e.g., +91 98765 43210)"
                        className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-teal-500 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="relationship" className="text-slate-700 dark:text-slate-200">Relationship</Label>
                      <Input
                        id="relationship"
                        value={newContact.relationship}
                        onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                        placeholder="Relationship (e.g., Parent, Spouse)"
                        className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-teal-500 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                  <Button onClick={addEmergencyContact} className="w-full bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-500 dark:hover:bg-teal-600">
                    Add Emergency Contact
                  </Button>
                </div>
              )}

              <div className="space-y-4">
                {emergencyContacts.length === 0 ? (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-4">
                    No emergency contacts added yet.
                  </p>
                ) : (
                  emergencyContacts.map((contact, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800/30"
                    >
                      <div>
                        <h3 className="font-semibold text-slate-800 dark:text-white">{contact.name}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{contact.phoneNumber}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{contact.relationship}</p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeEmergencyContact(index)}
                        className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
          </motion.div>

          {/* New Card for Location and Online Status */}
          <motion.div variants={item}>
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="border-b border-slate-200 dark:border-slate-700">
              <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600">
                  <MapPin className="h-4 w-4 text-white" />
                </div>
                Availability & Location
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {/* Online/Offline Status */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Online Status</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Toggle your online availability
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="online-status">
                      {isOnline ? (
                        <span className="flex items-center text-teal-500 dark:text-teal-400">
                          <Wifi className="mr-1 h-4 w-4" /> Online
                        </span>
                      ) : (
                        <span className="flex items-center text-slate-500 dark:text-slate-400">
                          <WifiOff className="mr-1 h-4 w-4" /> Offline
                        </span>
                      )}
                    </Label>
                    <Switch
                      id="online-status"
                      checked={isOnline}
                      onCheckedChange={toggleOnlineStatus}
                    />
                  </div>
                </div>

                {/* Geolocation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Your Location</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Used to find nearby services
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={getCurrentLocation}
                      disabled={isLocating}
                      className="border-teal-500 text-teal-600 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-400 dark:hover:bg-teal-900/20"
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      {isLocating ? "Getting Location..." : "Update Location"}
                    </Button>
                  </div>

                  <div className="rounded-md bg-slate-100 dark:bg-slate-800 p-3 text-sm border border-slate-200 dark:border-slate-700">
                    {location.latitude && location.longitude ? (
                      <div className="space-y-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-slate-700 dark:text-slate-300">
                            <span className="font-medium text-slate-800 dark:text-white">Latitude:</span>{" "}
                            {location.latitude.toFixed(6)}
                          </div>
                          <div className="text-slate-700 dark:text-slate-300">
                            <span className="font-medium text-slate-800 dark:text-white">Longitude:</span>{" "}
                            {location.longitude.toFixed(6)}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Last updated: {new Date().toLocaleString()}
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-600 dark:text-slate-400">
                        No location data available. Please update your location.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-slate-50 dark:bg-slate-800/30">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Your location is only used to find nearby services and will be
                updated only when you click "Update Location".
                {userType === "doctor" &&
                  " When online, patients can see your availability for consultations."}
              </p>
            </CardFooter>
          </Card>
          </motion.div>
        </div>
      </motion.div>
  );
};

export default Profile;
