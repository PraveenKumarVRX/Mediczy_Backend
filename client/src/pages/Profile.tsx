import type { Variants } from 'framer-motion';
import { useState, useEffect, useMemo } from "react";
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
import { MapPin, Wifi, WifiOff, Calendar, User, Shield, Phone, Mail, Edit3, Save, X, Heart, Activity, Users, Cigarette, Ruler, Weight, Droplets, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "@radix-ui/react-switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  // Physical
  height: z.string().optional(),
  weight: z.string().optional(),
  bloodType: z.string().optional(),
  // Medical
  allergies: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  chronicConditions: z.array(z.string()).optional(),
  // Family History
  familyHistory: z.object({
    diabetes: z.boolean().optional(),
    hypertension: z.boolean().optional(),
    heartDisease: z.boolean().optional(),
    cancer: z.boolean().optional(),
    stroke: z.boolean().optional(),
    asthma: z.boolean().optional(),
    thyroid: z.boolean().optional(),
    mentalHealth: z.boolean().optional(),
    kidney: z.boolean().optional(),
    details: z.string().optional(),
  }).optional(),
  // Personal/Lifestyle
  personalHistory: z.object({
    smoking: z.string().optional(),
    alcohol: z.string().optional(),
    exercise: z.string().optional(),
    diet: z.string().optional(),
    sleep: z.string().optional(),
    occupation: z.string().optional(),
    stressLevel: z.string().optional(),
  }).optional(),
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
  const [activeTab, setActiveTab] = useState("personal");
  const [newAllergy, setNewAllergy] = useState("");
  const [newMedication, setNewMedication] = useState("");
  const [newCondition, setNewCondition] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ family: false, lifestyle: false });
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

  // Helper to safely read user health data
  const userData = userType === "user" ? currentUser : currentDoctor;

  useEffect(() => {
    if (userType === "user" && currentUser) {
      setIsOnline(currentUser.isOnline || false);
    } else if (userType === "doctor" && currentDoctor) {
      setIsOnline(currentDoctor.isOnline || false);
    }
    if (userType === "user" && currentUser?.location?.coordinates) {
      setLocation({ longitude: currentUser.location.coordinates[0], latitude: currentUser.location.coordinates[1] });
    } else if (userType === "doctor" && currentDoctor?.location?.coordinates) {
      setLocation({ longitude: currentDoctor.location.coordinates[0], latitude: currentDoctor.location.coordinates[1] });
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
      height: userData?.height ? String(userData.height) : "",
      weight: userData?.weight ? String(userData.weight) : "",
      bloodType: userData?.bloodType || "",
      allergies: userData?.allergies || [],
      medications: userData?.medications || [],
      chronicConditions: userData?.chronicConditions || [],
      familyHistory: {
        diabetes: userData?.familyHistory?.diabetes || false,
        hypertension: userData?.familyHistory?.hypertension || false,
        heartDisease: userData?.familyHistory?.heartDisease || false,
        cancer: userData?.familyHistory?.cancer || false,
        stroke: userData?.familyHistory?.stroke || false,
        asthma: userData?.familyHistory?.asthma || false,
        thyroid: userData?.familyHistory?.thyroid || false,
        mentalHealth: userData?.familyHistory?.mentalHealth || false,
        kidney: userData?.familyHistory?.kidney || false,
        details: userData?.familyHistory?.details || "",
      },
      personalHistory: {
        smoking: userData?.personalHistory?.smoking || "never",
        alcohol: userData?.personalHistory?.alcohol || "never",
        exercise: userData?.personalHistory?.exercise || "sedentary",
        diet: userData?.personalHistory?.diet || "mixed",
        sleep: userData?.personalHistory?.sleep || "6-8",
        occupation: userData?.personalHistory?.occupation || "",
        stressLevel: userData?.personalHistory?.stressLevel || "moderate",
      },
    },
  });

  const bmi = useMemo(() => {
    const h = parseFloat(form.watch("height") || "0");
    const w = parseFloat(form.watch("weight") || "0");
    if (h > 0 && w > 0) return (w / ((h / 100) ** 2)).toFixed(1);
    return null;
  }, [form.watch("height"), form.watch("weight")]);

  const bmiCategory = useMemo(() => {
    if (!bmi) return null;
    const v = parseFloat(bmi);
    if (v < 18.5) return { label: "Underweight", color: "text-blue-500" };
    if (v < 25) return { label: "Normal", color: "text-emerald-500" };
    if (v < 30) return { label: "Overweight", color: "text-amber-500" };
    return { label: "Obese", color: "text-red-500" };
  }, [bmi]);

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    try {
      const payload: any = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phoneNumber: values.phoneNumber,
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        bloodType: values.bloodType || null,
        height: values.height ? parseFloat(values.height) : null,
        weight: values.weight ? parseFloat(values.weight) : null,
        allergies: values.allergies || [],
        medications: values.medications || [],
        chronicConditions: values.chronicConditions || [],
        familyHistory: values.familyHistory || {},
        personalHistory: values.personalHistory || {},
      };
      const response = await api.put('/users/profile', payload);
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully",
      });
      setIsEditing(false);
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

  // Helper for tag-based array fields
  const addToArray = (fieldName: "allergies" | "medications" | "chronicConditions", value: string, setter: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = form.getValues(fieldName) || [];
    if (!current.includes(trimmed)) {
      form.setValue(fieldName, [...current, trimmed]);
    }
    setter("");
  };

  const removeFromArray = (fieldName: "allergies" | "medications" | "chronicConditions", index: number) => {
    const current = form.getValues(fieldName) || [];
    form.setValue(fieldName, current.filter((_, i) => i !== index));
  };

  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const inputCls = "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white focus:border-teal-500 focus:ring-teal-500";
  const labelCls = "text-sm font-medium text-slate-700 dark:text-slate-300";
  const selectCls = "flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-white ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2";

  const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  const FAMILY_CONDITIONS = [
    { key: "diabetes" as const, label: "Diabetes" },
    { key: "hypertension" as const, label: "Hypertension" },
    { key: "heartDisease" as const, label: "Heart Disease" },
    { key: "cancer" as const, label: "Cancer" },
    { key: "stroke" as const, label: "Stroke" },
    { key: "asthma" as const, label: "Asthma / COPD" },
    { key: "thyroid" as const, label: "Thyroid Disorder" },
    { key: "mentalHealth" as const, label: "Mental Health" },
    { key: "kidney" as const, label: "Kidney Disease" },
  ];

  return (
      <motion.div variants={container as unknown as Variants} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Hero Header */}
        <motion.div variants={item as unknown as Variants} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-6">
            <Avatar className="h-24 w-24 ring-4 ring-white/20 ring-offset-4 ring-offset-slate-900 shadow-2xl">
              <AvatarImage src={userData?.profileImage} />
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-teal-600 text-white text-2xl font-bold">
                {(form.getValues("firstName")?.[0] || "")}{(form.getValues("lastName")?.[0] || "")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                  {userType === "doctor" ? "Healthcare Provider" : "Patient Profile"}
                </Badge>
                <Badge className={`${isOnline ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-slate-500/20 text-slate-300 border-slate-400/30'}`}>
                  {isOnline ? "Online" : "Offline"}
                </Badge>
                {bmi && <Badge className={`bg-white/10 border-white/20 font-medium ${bmiCategory?.color}`}>BMI {bmi} · {bmiCategory?.label}</Badge>}
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

        {/* Tabbed Content */}
        <motion.div variants={item as unknown as Variants}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 h-auto">
              {[
                { value: "personal", icon: User, label: "Personal" },
                { value: "physical", icon: Ruler, label: "Physical" },
                { value: "medical", icon: Heart, label: "Medical" },
                { value: "family", icon: Users, label: "Family" },
                { value: "lifestyle", icon: Activity, label: "Lifestyle" },
              ].map(tab => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1.5 text-xs sm:text-sm py-2.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-teal-600 dark:data-[state=active]:text-teal-400 data-[state=active]:shadow-sm rounded-lg">
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>

            {/* ── Personal Information ── */}
            <TabsContent value="personal" className="mt-4">
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600"><User className="h-4 w-4 text-white" /></div>
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField control={form.control} name="firstName" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>First Name</FormLabel><FormControl><Input {...field} className={inputCls} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="lastName" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Last Name</FormLabel><FormControl><Input {...field} className={inputCls} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem><FormLabel className={labelCls}>Email</FormLabel><FormControl><Input type="email" {...field} className={inputCls} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                        <FormItem><FormLabel className={labelCls}>Phone</FormLabel><FormControl><Input type="tel" placeholder="+91 98765 43210" {...field} className={inputCls} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Date of Birth</FormLabel><FormControl><div className="relative"><Input type="date" {...field} className={`pr-10 ${inputCls}`} /><Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" /></div></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="gender" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Gender</FormLabel><FormControl>
                            <select {...field} className={selectCls}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select>
                          </FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white"><Save className="h-4 w-4 mr-2" />Save All Changes</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div><Label className={labelCls}>First Name</Label><p className="mt-1 text-base text-slate-800 dark:text-slate-300">{form.getValues("firstName")}</p></div>
                        <div><Label className={labelCls}>Last Name</Label><p className="mt-1 text-base text-slate-800 dark:text-slate-300">{form.getValues("lastName")}</p></div>
                      </div>
                      <div><Label className={labelCls}>Email</Label><p className="mt-1 text-base text-slate-800 dark:text-slate-300">{form.getValues("email")}</p></div>
                      <div><Label className={labelCls}>Phone</Label><p className="mt-1 text-base text-slate-800 dark:text-slate-300">{form.getValues("phoneNumber")}</p></div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div><Label className={labelCls}>Date of Birth</Label><p className="mt-1 text-base text-slate-800 dark:text-slate-300">{form.getValues("dateOfBirth") ? new Date(form.getValues("dateOfBirth") || "").toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "Not provided"}</p></div>
                        <div><Label className={labelCls}>Age</Label><p className="mt-1 text-base text-slate-800 dark:text-slate-300">{form.getValues("dateOfBirth") ? (() => { const b = new Date(form.getValues("dateOfBirth") || ""); const t = new Date(); let a = t.getFullYear() - b.getFullYear(); const m = t.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--; return `${a} years`; })() : "N/A"}</p></div>
                        <div><Label className={labelCls}>Gender</Label><p className="mt-1 text-base text-slate-800 dark:text-slate-300">{form.getValues("gender") || "Not provided"}</p></div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Physical Measurements ── */}
            <TabsContent value="physical" className="mt-4">
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"><Ruler className="h-4 w-4 text-white" /></div>
                    Physical Measurements
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <FormField control={form.control} name="height" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Height (cm)</FormLabel><FormControl><Input type="number" min="50" max="250" step="0.1" placeholder="e.g. 170" {...field} className={inputCls} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="weight" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Weight (kg)</FormLabel><FormControl><Input type="number" min="10" max="300" step="0.1" placeholder="e.g. 70" {...field} className={inputCls} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="bloodType" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Blood Group</FormLabel><FormControl>
                            <select {...field} className={selectCls}><option value="">Select blood group</option>{BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}</select>
                          </FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      {bmi && (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600"><Activity className="h-5 w-5 text-white" /></div>
                            <div>
                              <p className="text-sm text-slate-500 dark:text-slate-400">Body Mass Index (BMI)</p>
                              <p className={`text-2xl font-bold ${bmiCategory?.color}`}>{bmi} <span className="text-sm font-medium">· {bmiCategory?.label}</span></p>
                            </div>
                          </div>
                        </div>
                      )}
                      <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white"><Save className="h-4 w-4 mr-2" />Save All Changes</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                          <Ruler className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                          <p className="text-xs text-slate-500 dark:text-slate-400">Height</p>
                          <p className="text-xl font-bold text-slate-800 dark:text-white">{form.getValues("height") ? `${form.getValues("height")} cm` : "—"}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                          <Weight className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                          <p className="text-xs text-slate-500 dark:text-slate-400">Weight</p>
                          <p className="text-xl font-bold text-slate-800 dark:text-white">{form.getValues("weight") ? `${form.getValues("weight")} kg` : "—"}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                          <Droplets className="h-5 w-5 mx-auto text-red-500 mb-1" />
                          <p className="text-xs text-slate-500 dark:text-slate-400">Blood Group</p>
                          <p className="text-xl font-bold text-slate-800 dark:text-white">{form.getValues("bloodType") || "—"}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                          <Activity className="h-5 w-5 mx-auto text-violet-500 mb-1" />
                          <p className="text-xs text-slate-500 dark:text-slate-400">BMI</p>
                          <p className={`text-xl font-bold ${bmiCategory?.color || 'text-slate-800 dark:text-white'}`}>{bmi || "—"}</p>
                          {bmiCategory && <p className={`text-xs ${bmiCategory.color}`}>{bmiCategory.label}</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Medical History ── */}
            <TabsContent value="medical" className="mt-4 space-y-4">
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600"><Heart className="h-4 w-4 text-white" /></div>
                    Medical History
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Allergies */}
                  <div>
                    <Label className={`${labelCls} mb-2 block`}>Allergies</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(form.watch("allergies") || []).map((a, i) => (
                        <Badge key={i} variant="secondary" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 gap-1 pl-3 pr-1.5 py-1">
                          {a}
                          {isEditing && <button type="button" onClick={() => removeFromArray("allergies", i)} className="ml-1 hover:text-red-900"><X className="h-3 w-3" /></button>}
                        </Badge>
                      ))}
                      {(form.watch("allergies") || []).length === 0 && !isEditing && <span className="text-sm text-slate-400">No known allergies</span>}
                    </div>
                    {isEditing && (
                      <div className="flex gap-2">
                        <Input placeholder="e.g. Penicillin, Peanuts, Dust" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addToArray("allergies", newAllergy, setNewAllergy); }}} className={`flex-1 ${inputCls}`} />
                        <Button type="button" variant="outline" size="sm" onClick={() => addToArray("allergies", newAllergy, setNewAllergy)} className="border-red-300 text-red-600 hover:bg-red-50"><Plus className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                  {/* Chronic Conditions */}
                  <div>
                    <Label className={`${labelCls} mb-2 block`}>Chronic Conditions</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(form.watch("chronicConditions") || []).map((c, i) => (
                        <Badge key={i} variant="secondary" className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 gap-1 pl-3 pr-1.5 py-1">
                          {c}
                          {isEditing && <button type="button" onClick={() => removeFromArray("chronicConditions", i)} className="ml-1 hover:text-amber-900"><X className="h-3 w-3" /></button>}
                        </Badge>
                      ))}
                      {(form.watch("chronicConditions") || []).length === 0 && !isEditing && <span className="text-sm text-slate-400">None reported</span>}
                    </div>
                    {isEditing && (
                      <div className="flex gap-2">
                        <Input placeholder="e.g. Diabetes, Asthma, Hypertension" value={newCondition} onChange={e => setNewCondition(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addToArray("chronicConditions", newCondition, setNewCondition); }}} className={`flex-1 ${inputCls}`} />
                        <Button type="button" variant="outline" size="sm" onClick={() => addToArray("chronicConditions", newCondition, setNewCondition)} className="border-amber-300 text-amber-600 hover:bg-amber-50"><Plus className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                  {/* Current Medications */}
                  <div>
                    <Label className={`${labelCls} mb-2 block`}>Current Medications</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(form.watch("medications") || []).map((m, i) => (
                        <Badge key={i} variant="secondary" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 gap-1 pl-3 pr-1.5 py-1">
                          {m}
                          {isEditing && <button type="button" onClick={() => removeFromArray("medications", i)} className="ml-1 hover:text-blue-900"><X className="h-3 w-3" /></button>}
                        </Badge>
                      ))}
                      {(form.watch("medications") || []).length === 0 && !isEditing && <span className="text-sm text-slate-400">None</span>}
                    </div>
                    {isEditing && (
                      <div className="flex gap-2">
                        <Input placeholder="e.g. Metformin 500mg, Aspirin" value={newMedication} onChange={e => setNewMedication(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addToArray("medications", newMedication, setNewMedication); }}} className={`flex-1 ${inputCls}`} />
                        <Button type="button" variant="outline" size="sm" onClick={() => addToArray("medications", newMedication, setNewMedication)} className="border-blue-300 text-blue-600 hover:bg-blue-50"><Plus className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                  {isEditing && <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white"><Save className="h-4 w-4 mr-2" />Save All Changes</Button>}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Family History ── */}
            <TabsContent value="family" className="mt-4">
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600"><Users className="h-4 w-4 text-white" /></div>
                    Family Medical History
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Select conditions that run in your family (parents, siblings, grandparents)</p>
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                        {FAMILY_CONDITIONS.map(fc => (
                          <FormField key={fc.key} control={form.control} name={`familyHistory.${fc.key}`} render={({ field }) => (
                            <FormItem className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 transition-colors">
                              <FormControl>
                                <Checkbox checked={field.value || false} onCheckedChange={field.onChange} className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600" />
                              </FormControl>
                              <FormLabel className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer !mt-0">{fc.label}</FormLabel>
                            </FormItem>
                          )} />
                        ))}
                      </div>
                      <FormField control={form.control} name="familyHistory.details" render={({ field }) => (
                        <FormItem>
                          <FormLabel className={labelCls}>Additional Details</FormLabel>
                          <FormControl><Textarea placeholder="e.g. Father had Type 2 diabetes, maternal grandmother had breast cancer..." {...field} rows={3} className={inputCls} /></FormControl>
                        </FormItem>
                      )} />
                      <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white"><Save className="h-4 w-4 mr-2" />Save All Changes</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {FAMILY_CONDITIONS.filter(fc => form.getValues(`familyHistory.${fc.key}`)).map(fc => (
                          <Badge key={fc.key} variant="secondary" className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 py-1 px-3">{fc.label}</Badge>
                        ))}
                        {FAMILY_CONDITIONS.filter(fc => form.getValues(`familyHistory.${fc.key}`)).length === 0 && <span className="text-sm text-slate-400">No family conditions reported</span>}
                      </div>
                      {form.getValues("familyHistory.details") && (
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                          <p className="text-sm text-slate-600 dark:text-slate-300">{form.getValues("familyHistory.details")}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Personal / Lifestyle History ── */}
            <TabsContent value="lifestyle" className="mt-4">
              <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600"><Activity className="h-4 w-4 text-white" /></div>
                    Lifestyle & Personal History
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="personalHistory.smoking" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Smoking</FormLabel><FormControl>
                            <select {...field} className={selectCls}><option value="never">Never</option><option value="former">Former Smoker</option><option value="occasional">Occasional</option><option value="regular">Regular</option></select>
                          </FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="personalHistory.alcohol" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Alcohol</FormLabel><FormControl>
                            <select {...field} className={selectCls}><option value="never">Never</option><option value="social">Social / Occasional</option><option value="moderate">Moderate</option><option value="heavy">Heavy</option></select>
                          </FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="personalHistory.exercise" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Exercise</FormLabel><FormControl>
                            <select {...field} className={selectCls}><option value="sedentary">Sedentary</option><option value="light">Light (1-2 days/week)</option><option value="moderate">Moderate (3-4 days/week)</option><option value="active">Active (5+ days/week)</option></select>
                          </FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="personalHistory.diet" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Diet</FormLabel><FormControl>
                            <select {...field} className={selectCls}><option value="vegetarian">Vegetarian</option><option value="vegan">Vegan</option><option value="mixed">Mixed / Non-Veg</option><option value="eggetarian">Eggetarian</option></select>
                          </FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="personalHistory.sleep" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Sleep (hours/night)</FormLabel><FormControl>
                            <select {...field} className={selectCls}><option value="<5">Less than 5 hours</option><option value="5-6">5-6 hours</option><option value="6-8">6-8 hours</option><option value="8+">8+ hours</option></select>
                          </FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="personalHistory.stressLevel" render={({ field }) => (
                          <FormItem><FormLabel className={labelCls}>Stress Level</FormLabel><FormControl>
                            <select {...field} className={selectCls}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="very_high">Very High</option></select>
                          </FormControl></FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name="personalHistory.occupation" render={({ field }) => (
                        <FormItem><FormLabel className={labelCls}>Occupation</FormLabel><FormControl><Input placeholder="e.g. Software Engineer, Teacher, Homemaker" {...field} className={inputCls} /></FormControl></FormItem>
                      )} />
                      <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white"><Save className="h-4 w-4 mr-2" />Save All Changes</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[
                        { label: "Smoking", value: form.getValues("personalHistory.smoking"), icon: "🚬" },
                        { label: "Alcohol", value: form.getValues("personalHistory.alcohol"), icon: "🍷" },
                        { label: "Exercise", value: form.getValues("personalHistory.exercise"), icon: "🏃" },
                        { label: "Diet", value: form.getValues("personalHistory.diet"), icon: "🥗" },
                        { label: "Sleep", value: form.getValues("personalHistory.sleep"), icon: "😴" },
                        { label: "Stress", value: form.getValues("personalHistory.stressLevel"), icon: "🧘" },
                        { label: "Occupation", value: form.getValues("personalHistory.occupation"), icon: "💼" },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">
                          <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">{row.icon} {row.label}</span>
                          <span className="text-sm font-medium text-slate-800 dark:text-white capitalize">{row.value || "Not set"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            </form>
          </Form>
          </Tabs>
        </motion.div>

        {/* Emergency Contacts */}
        <motion.div variants={item as unknown as Variants}>
        <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600"><Shield className="h-4 w-4 text-white" /></div>
              Emergency Contacts
            </CardTitle>
            <Button variant="outline" onClick={() => setIsAddingContact(!isAddingContact)} className="border-teal-500 text-teal-600 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-400 dark:hover:bg-teal-900/20">
              {isAddingContact ? "Cancel" : <><Plus className="h-4 w-4 mr-1" />Add</>}
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            {isAddingContact && (
              <div className="mb-6 space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div><Label className={labelCls}>Name</Label><Input value={newContact.name} onChange={e => setNewContact({...newContact, name: e.target.value})} placeholder="Contact Name" className={inputCls} /></div>
                  <div><Label className={labelCls}>Phone</Label><Input value={newContact.phoneNumber} onChange={e => setNewContact({...newContact, phoneNumber: e.target.value})} placeholder="+91 98765 43210" className={inputCls} /></div>
                  <div><Label className={labelCls}>Relationship</Label><Input value={newContact.relationship} onChange={e => setNewContact({...newContact, relationship: e.target.value})} placeholder="e.g. Spouse" className={inputCls} /></div>
                </div>
                <Button onClick={addEmergencyContact} className="w-full bg-teal-600 hover:bg-teal-700 text-white">Add Emergency Contact</Button>
              </div>
            )}
            <div className="space-y-3">
              {emergencyContacts.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-slate-400 py-4">No emergency contacts added yet.</p>
              ) : emergencyContacts.map((contact: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800/30">
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white">{contact.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{contact.phoneNumber} · {contact.relationship}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeEmergencyContact(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </motion.div>

        {/* Availability & Location */}
        <motion.div variants={item as unknown as Variants}>
        <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600"><MapPin className="h-4 w-4 text-white" /></div>
              Availability & Location
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-800 dark:text-white">Online Status</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Toggle your online availability</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="online-status">{isOnline ? <span className="flex items-center text-teal-500"><Wifi className="mr-1 h-4 w-4" /> Online</span> : <span className="flex items-center text-slate-500"><WifiOff className="mr-1 h-4 w-4" /> Offline</span>}</Label>
                  <Switch id="online-status" checked={isOnline} onCheckedChange={toggleOnlineStatus} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800 dark:text-white">Your Location</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Used to find nearby services</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={getCurrentLocation} disabled={isLocating} className="border-teal-500 text-teal-600 hover:bg-teal-50">
                    <MapPin className="mr-2 h-4 w-4" />{isLocating ? "Getting..." : "Update Location"}
                  </Button>
                </div>
                <div className="rounded-md bg-slate-100 dark:bg-slate-800 p-3 text-sm border border-slate-200 dark:border-slate-700">
                  {location.latitude && location.longitude ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-slate-700 dark:text-slate-300"><span className="font-medium">Lat:</span> {(location.latitude as number).toFixed(6)}</div>
                      <div className="text-slate-700 dark:text-slate-300"><span className="font-medium">Lng:</span> {(location.longitude as number).toFixed(6)}</div>
                    </div>
                  ) : <p className="text-slate-600 dark:text-slate-400">No location data. Click "Update Location".</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </motion.div>
  );
};

export default Profile;
