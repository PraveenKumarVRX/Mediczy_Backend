import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera, Plus, Edit, Trash2, Users, Shield, Settings, User, Heart,
  Lock, LogOut, Globe, Bell, Moon, Eye, EyeOff, ChevronRight,
  AlertTriangle, CheckCircle, Clock, Smartphone, Upload, Link,
  Activity, Droplets, Ruler, Weight, Cigarette, Info, Crown,
  Key, Monitor, Trash, RefreshCw, Image,
} from "lucide-react";
import api from "@/utils/api";
import { MalwareWarningDialog, parseMalwareError } from "@/components/MalwareWarningDialog";
import { FamilyMemberDialog } from "@/components/profile/FamilyMemberDialog";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FamilyMember {
  id: number;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth?: string;
  gender: string;
  phoneNumber?: string;
  email?: string;
  bloodType?: string;
  abhaHealthId?: string;
  metadata?: {
    aiInference?: {
      relationshipInferred?: boolean;
      genderInferred?: boolean;
      confidence?: number;
    };
  };
}
interface FamilyLimits {
  membershipType: string;
  planSlug?: string | null;
  planName?: string | null;
  source?: string;
  componentBenefits?: {
    insurance?: {
      enabled?: boolean;
      maxMembers?: number;
      allowedRelations?: string[];
    };
    opWellness?: {
      enabled?: boolean;
      maxMembers?: number;
      allowedRelations?: string[];
    };
  } | null;
  maxMembers: number;
  currentCount?: number;
  currentMembers?: number;
  remaining?: number;
  canAddMore: boolean;
  allowedRelations: string[];
}
interface UserSettings {
  notifications: Record<string, boolean>;
  language: string;
  timezone: string;
  theme: string;
  privacy: Record<string, boolean>;
  accessibility: { font_size: string; high_contrast: boolean };
}
interface SecurityInfo {
  last_login_at: string | null;
  last_login_ip: string | null;
  mfa_enabled: boolean;
  password_changed_at: string | null;
  account_created_at: string;
  connected_accounts: { google: boolean; facebook: boolean; apple: boolean };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const calcAge = (dob?: string) => {
  if (!dob) return null;
  const b = new Date(dob), t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age;
};

const profileFields: { key: string; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phoneNumber", label: "Phone" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "gender", label: "Gender" },
  { key: "bloodType", label: "Blood type" },
  { key: "abhaHealthId", label: "ABHA ID" },
];

const LANGUAGES = [
  { code: "en", label: "English" }, { code: "hi", label: "हिंदी (Hindi)" },
  { code: "ta", label: "தமிழ் (Tamil)" }, { code: "te", label: "తెలుగు (Telugu)" },
  { code: "kn", label: "ಕನ್ನಡ (Kannada)" }, { code: "mr", label: "मराठी (Marathi)" },
  { code: "bn", label: "বাংলা (Bengali)" }, { code: "gu", label: "ગુજરાતી (Gujarati)" },
  { code: "ar", label: "العربية (Arabic)" }, { code: "fr", label: "Français (French)" },
];

const NOTIFICATION_LABELS: Record<string, string> = {
  email: "Email notifications",
  sms: "SMS notifications",
  push: "Push notifications",
  whatsapp: "WhatsApp messages",
  appointment_reminders: "Appointment reminders",
  lab_results: "Lab results ready",
  prescription_ready: "Prescription ready",
  health_tips: "Daily health tips",
  billing_alerts: "Billing & payment alerts",
  ai_insights: "AI health insights",
};

const MEMBERSHIP_BADGE_COLORS: Record<string, string> = {
  individual: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  couple: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  family: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  corporate: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200",
};

// ─── Component ────────────────────────────────────────────────────────────────
const ProfileEnhanced = () => {
  const { toast } = useToast();
  const { currentUser, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Tab
  const [activeTab, setActiveTab] = useState("profile");

  // ── Profile state
  const [profileData, setProfileData] = useState({
    firstName: "", lastName: "", email: "", phoneNumber: "",
    dateOfBirth: "", gender: "", bloodType: "", abhaHealthId: "",
    height: "", weight: "", allergies: [] as string[], medications: [] as string[],
    chronicConditions: [] as string[],
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [malwareWarning, setMalwareWarning] = useState<{ open: boolean; threat?: string; fileName?: string }>({ open: false });
  const [socialUrlDialog, setSocialUrlDialog] = useState(false);
  const [socialUrl, setSocialUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);

  // ── Family state
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [familyLimits, setFamilyLimits] = useState<FamilyLimits | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(false);
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | undefined>();

  // ── Settings state
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Security state
  const [securityInfo, setSecurityInfo] = useState<SecurityInfo | null>(null);
  const [loadingSecurity, setLoadingSecurity] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [changingPw, setChangingPw] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  // ─────────────────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (currentUser) {
      const u = currentUser as any;
      setProfileData({
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        email: u.email || "",
        phoneNumber: u.phoneNumber || "",
        dateOfBirth: u.dateOfBirth ? u.dateOfBirth.split("T")[0] : "",
        gender: u.gender || "",
        bloodType: u.bloodType || "",
        abhaHealthId: u.abhaHealthId || "",
        height: u.height ? String(u.height) : "",
        weight: u.weight ? String(u.weight) : "",
        allergies: u.allergies || [],
        medications: u.medications || [],
        chronicConditions: u.chronicConditions || [],
      });
      if (u.profileImage) setProfileImage(u.profileImage);
    }
  }, [currentUser]);

  useEffect(() => { fetchFamilyMembers(); }, []);

  const fetchFamilyMembers = async () => {
    setLoadingFamily(true);
    try {
      const [membersRes, limitsRes] = await Promise.all([
        api.get("/family-members"),
        api.get("/family-members/limits"),
      ]);
      setFamilyMembers(membersRes.data.data || []);
      setFamilyLimits(limitsRes.data.limits || null);
    } catch { /* silent */ }
    finally { setLoadingFamily(false); }
  };

  const loadSettings = async () => {
    if (settings) return;
    setLoadingSettings(true);
    try {
      const res = await api.get("/users/settings");
      setSettings(res.data.settings);
    } catch { /* silent */ }
    finally { setLoadingSettings(false); }
  };

  const loadSecurity = async () => {
    if (securityInfo) return;
    setLoadingSecurity(true);
    try {
      const res = await api.get("/users/security");
      setSecurityInfo(res.data.security);
    } catch { /* silent */ }
    finally { setLoadingSecurity(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Profile completion score
  // ─────────────────────────────────────────────────────────────────────────
  const completionScore = (() => {
    const filled = profileFields.filter(f => {
      const v = (profileData as any)[f.key];
      return v && String(v).trim() !== "";
    });
    return Math.round((filled.length / profileFields.length) * 100);
  })();

  const missingFields = profileFields.filter(f => {
    const v = (profileData as any)[f.key];
    return !v || String(v).trim() === "";
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Photo handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setUploadingImage(true);
    const formData = new FormData();
    formData.append("profilePicture", file);
    try {
      const res = await api.post("/users/profile-picture", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setProfileImage(res.data.profileImage);
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      toast({ title: "Photo updated" });
    } catch (err: any) {
      const malware = parseMalwareError(err);
      if (malware.isMalware) { setMalwareWarning({ open: true, threat: malware.threat, fileName: file.name }); }
      else toast({ title: "Upload failed", description: err.response?.data?.message || "Error", variant: "destructive" });
    } finally { setUploadingImage(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleImportFromUrl = async () => {
    if (!socialUrl) return;
    setImportingUrl(true);
    try {
      const res = await api.post("/users/profile-picture/from-url", { imageUrl: socialUrl });
      setProfileImage(res.data.profileImage);
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      toast({ title: "Photo imported", description: "Your profile photo has been updated" });
      setSocialUrlDialog(false);
      setSocialUrl("");
    } catch (err: any) {
      toast({ title: "Import failed", description: err.response?.data?.message || "Could not import photo", variant: "destructive" });
    } finally { setImportingUrl(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Profile save
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await api.put("/users/profile", profileData);
      const u = res.data?.user || res.data;
      if (u) setProfileData(prev => ({ ...prev, ...u }));
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      toast({ title: "Profile saved" });
      setIsEditing(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.response?.data?.message || "Error", variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Settings save
  // ─────────────────────────────────────────────────────────────────────────
  const handleSaveSettings = async (partial: Partial<UserSettings>) => {
    setSavingSettings(true);
    try {
      const res = await api.put("/users/settings", partial);
      setSettings(prev => prev ? { ...prev, ...res.data.settings } : res.data.settings);
      toast({ title: "Settings saved" });
    } catch { toast({ title: "Failed to save settings", variant: "destructive" }); }
    finally { setSavingSettings(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Password change
  // ─────────────────────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (pwForm.next !== pwForm.confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" }); return;
    }
    setChangingPw(true);
    try {
      await api.post("/users/change-password", {
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
        confirmPassword: pwForm.confirm,
      });
      toast({ title: "Password changed successfully" });
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      const msgs = err.response?.data?.errors?.map((e: any) => e.msg).join(". ");
      toast({ title: "Failed", description: msgs || err.response?.data?.message || "Error", variant: "destructive" });
    } finally { setChangingPw(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Revoke sessions
  // ─────────────────────────────────────────────────────────────────────────
  const handleRevokeSessions = async () => {
    try {
      await api.post("/users/security/revoke-sessions");
      toast({ title: "All sessions signed out", description: "You will need to log in again on other devices." });
      setRevokeDialogOpen(false);
      setTimeout(() => { localStorage.removeItem("token"); window.location.href = "/login"; }, 1500);
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Delete account
  // ─────────────────────────────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    try {
      await api.delete("/users/account", { data: { confirmText: "DELETE", reason: deleteReason } });
      toast({ title: "Deletion scheduled", description: "Your account will be deleted in 30 days." });
      setDeleteDialogOpen(false);
      setTimeout(() => { localStorage.removeItem("token"); window.location.href = "/"; }, 2000);
    } catch (err: any) {
      toast({ title: "Failed", description: err.response?.data?.message || "Error", variant: "destructive" });
    }
  };

  const avatarSrc = profileImage
    ? (profileImage.startsWith("http") ? profileImage : `${import.meta.env.VITE_API_URL || ""}${profileImage}`)
    : undefined;

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Skeleton className="h-10 w-48 mb-6" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* ── Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">My Account</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Manage your profile, health data, family, and settings</p>
          </div>
          {(currentUser as any)?.membershipType && (
            <Badge className={`capitalize ${MEMBERSHIP_BADGE_COLORS[(currentUser as any).membershipType] || MEMBERSHIP_BADGE_COLORS.individual}`}>
              <Crown className="w-3 h-3 mr-1" />
              {(currentUser as any).membershipType} Plan
            </Badge>
          )}
        </div>

        {/* ── Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v);
          if (v === "settings") loadSettings();
          if (v === "security") loadSecurity();
        }}>
          <TabsList className="grid w-full grid-cols-5 mb-6 h-auto bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {[
              { value: "profile",  icon: User,     label: "Profile"   },
              { value: "health",   icon: Heart,    label: "Health"    },
              { value: "family",   icon: Users,    label: "Family"    },
              { value: "settings", icon: Settings, label: "Settings"  },
              { value: "security", icon: Shield,   label: "Security"  },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value}
                className="flex items-center gap-1.5 text-xs sm:text-sm py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-teal-600 dark:data-[state=active]:text-teal-400 data-[state=active]:shadow-sm rounded-lg">
                <t.icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ══════════════════════════════════════════
              TAB 1 — PROFILE
          ══════════════════════════════════════════ */}
          <TabsContent value="profile" className="space-y-6">
            {/* Profile completion */}
            {completionScore < 100 && (
              <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-300">
                  Profile {completionScore}% complete.
                  {missingFields.length > 0 && <> Missing: <span className="font-medium">{missingFields.map(f => f.label).join(", ")}</span>.</>}
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Profile Photo</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingImage ? "Uploading…" : "Upload"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSocialUrlDialog(true)}>
                      <Image className="w-4 h-4 mr-2" />
                      Import
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="relative shrink-0">
                    <Avatar className="w-24 h-24 ring-2 ring-teal-200 dark:ring-teal-800">
                      <AvatarImage src={avatarSrc} alt={`${profileData.firstName} ${profileData.lastName}`} />
                      <AvatarFallback className="text-2xl font-bold bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200">
                        {profileData.firstName?.charAt(0)}{profileData.lastName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 bg-teal-500 hover:bg-teal-600 text-white rounded-full p-1.5 shadow-md transition-colors">
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {profileData.firstName} {profileData.lastName}
                    </p>
                    <p className="text-sm text-slate-500">{profileData.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Progress value={completionScore} className="w-32 h-2" />
                      <span className="text-xs text-slate-500">{completionScore}% complete</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Upload from device or import your Google / Facebook / LinkedIn profile photo</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Personal Information</CardTitle>
                  {!isEditing
                    ? <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}><Edit className="w-4 h-4 mr-2" />Edit</Button>
                    : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveProfile} disabled={saving}>
                          {saving ? "Saving…" : "Save Changes"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                      </div>
                    )
                  }
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>First Name</Label>
                    <Input value={profileData.firstName} disabled={!isEditing}
                      onChange={e => setProfileData(p => ({ ...p, firstName: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Name</Label>
                    <Input value={profileData.lastName} disabled={!isEditing}
                      onChange={e => setProfileData(p => ({ ...p, lastName: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email <span className="text-xs text-slate-400">(cannot change)</span></Label>
                    <Input value={profileData.email} disabled className="bg-slate-50 dark:bg-slate-800/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone Number</Label>
                    <Input value={profileData.phoneNumber} disabled={!isEditing}
                      onChange={e => setProfileData(p => ({ ...p, phoneNumber: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={profileData.dateOfBirth} disabled={!isEditing}
                      onChange={e => setProfileData(p => ({ ...p, dateOfBirth: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Gender</Label>
                    {isEditing
                      ? (
                        <Select value={profileData.gender} onValueChange={v => setProfileData(p => ({ ...p, gender: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                          <SelectContent>
                            {["Male", "Female", "Other"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )
                      : <Input value={profileData.gender} disabled />
                    }
                  </div>
                  <div className="space-y-1.5">
                    <Label>Blood Type</Label>
                    {isEditing
                      ? (
                        <Select value={profileData.bloodType} onValueChange={v => setProfileData(p => ({ ...p, bloodType: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select blood type" /></SelectTrigger>
                          <SelectContent>
                            {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(bt => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )
                      : <Input value={profileData.bloodType} disabled />
                    }
                  </div>
                  <div className="space-y-1.5">
                    <Label>ABHA Health ID <span className="text-xs text-slate-400">(14 digits)</span></Label>
                    <Input value={profileData.abhaHealthId} disabled={!isEditing} maxLength={14} placeholder="e.g. 1234-5678-9012-34"
                      onChange={e => setProfileData(p => ({ ...p, abhaHealthId: e.target.value }))} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════
              TAB 2 — HEALTH
          ══════════════════════════════════════════ */}
          <TabsContent value="health" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Physical Measurements</CardTitle>
                  {!isEditing
                    ? <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}><Edit className="w-4 h-4 mr-2" />Edit</Button>
                    : <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveProfile} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                        <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                      </div>
                  }
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { key: "height", label: "Height", unit: "cm", icon: Ruler },
                    { key: "weight", label: "Weight", unit: "kg", icon: Weight },
                  ].map(({ key, label, unit, icon: Icon }) => (
                    <div key={key} className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <Icon className="w-5 h-5 text-teal-500 shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 mb-1">{label}</p>
                        {isEditing
                          ? <Input type="number" value={(profileData as any)[key]} className="h-8 text-sm"
                              onChange={e => setProfileData(p => ({ ...p, [key]: e.target.value }))} />
                          : <p className="font-semibold">{(profileData as any)[key] || "–"} <span className="text-xs text-slate-400">{unit}</span></p>
                        }
                      </div>
                    </div>
                  ))}
                  {profileData.height && profileData.weight && (() => {
                    const h = parseFloat(profileData.height) / 100;
                    const w = parseFloat(profileData.weight);
                    const bmi = h > 0 ? (w / (h * h)).toFixed(1) : null;
                    const category = bmi ? (parseFloat(bmi) < 18.5 ? "Underweight" : parseFloat(bmi) < 25 ? "Normal" : parseFloat(bmi) < 30 ? "Overweight" : "Obese") : null;
                    return bmi ? (
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700">
                        <Activity className="w-5 h-5 text-teal-500" />
                        <div>
                          <p className="text-xs text-slate-500 mb-1">BMI</p>
                          <p className="font-semibold text-teal-700 dark:text-teal-300">{bmi} <span className="text-xs font-normal">({category})</span></p>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Medical conditions */}
            {[
              { key: "allergies",         label: "Allergies",            color: "red"    },
              { key: "medications",       label: "Current Medications",  color: "blue"   },
              { key: "chronicConditions", label: "Chronic Conditions",   color: "amber"  },
            ].map(({ key, label, color }) => (
              <Card key={key}>
                <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {((profileData as any)[key] as string[]).length === 0
                      ? <p className="text-sm text-slate-400">None recorded</p>
                      : ((profileData as any)[key] as string[]).map((v: string, i: number) => (
                          <Badge key={i} variant="secondary" className="pr-1.5">
                            {v}
                            {isEditing && (
                              <button className="ml-1 hover:text-red-500" onClick={() =>
                                setProfileData(p => ({ ...p, [key]: (p as any)[key].filter((_: string, j: number) => j !== i) }))
                              }>×</button>
                            )}
                          </Badge>
                        ))
                    }
                    {isEditing && (
                      <AddTagInput onAdd={(v) =>
                        setProfileData(p => ({ ...p, [key]: [...(p as any)[key], v] }))
                      } placeholder={`Add ${label.toLowerCase()}…`} />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ══════════════════════════════════════════
              TAB 3 — FAMILY
          ══════════════════════════════════════════ */}
          <TabsContent value="family" className="space-y-6">
            {/* Plan limits banner */}
            {familyLimits && (
              (() => {
                const usedCount = familyLimits.currentCount ?? familyLimits.currentMembers ?? 0;
                const remainingSlots = familyLimits.remaining ?? Math.max(0, familyLimits.maxMembers - usedCount);
                return (
              <Card className="border-0 bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-950/30 dark:to-blue-950/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-800 flex items-center justify-center">
                        <Crown className="w-5 h-5 text-teal-600 dark:text-teal-300" />
                      </div>
                      <div>
                        <p className="font-semibold capitalize">{familyLimits.planName || familyLimits.membershipType} Plan</p>
                        <p className="text-sm text-slate-500">
                          {usedCount} / {familyLimits.maxMembers === 0 ? "0 (upgrade needed)" : familyLimits.maxMembers} members used
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="flex gap-1 mb-1">
                          {Array.from({ length: Math.max(familyLimits.maxMembers, 1) }).map((_, i) => (
                            <div key={i} className={`w-4 h-4 rounded-full ${i < usedCount ? "bg-teal-500" : "bg-slate-200 dark:bg-slate-700"}`} />
                          ))}
                        </div>
                        <p className="text-xs text-slate-400">
                          {familyLimits.maxMembers === 0 ? "Upgrade to Family plan for family members" : `${remainingSlots} slots remaining`}
                        </p>
                      </div>
                      {familyLimits.maxMembers === 0 && (
                        <Button size="sm" variant="outline" className="border-teal-300 text-teal-700" onClick={() => window.location.href = "/my-plans"}>
                          Upgrade Plan
                        </Button>
                      )}
                    </div>
                  </div>
                  {familyLimits.allowedRelations.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500">Allowed:</span>
                      {familyLimits.allowedRelations.map(r => (
                        <Badge key={r} variant="outline" className="capitalize text-xs">{r}</Badge>
                      ))}
                    </div>
                  )}

                  {(familyLimits.componentBenefits?.insurance?.enabled || familyLimits.componentBenefits?.opWellness?.enabled) && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500">Corporate components:</span>
                      {familyLimits.componentBenefits?.insurance?.enabled && (
                        <Badge variant="secondary" className="text-xs bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                          Insurance
                        </Badge>
                      )}
                      {familyLimits.componentBenefits?.opWellness?.enabled && (
                        <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                          OP + Wellness
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
                );
              })()
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Family Members</CardTitle>
                    <CardDescription>Manage health profiles for your family</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => { setEditingMember(undefined); setFamilyDialogOpen(true); }}
                    disabled={familyLimits ? !familyLimits.canAddMore : false}>
                    <Plus className="w-4 h-4 mr-2" />Add Member
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingFamily ? (
                  <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
                ) : familyMembers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="font-medium text-slate-600 dark:text-slate-400 mb-1">No family members yet</p>
                    <p className="text-sm text-slate-400 mb-4">Add family members to book appointments and manage their health</p>
                    {familyLimits && familyLimits.maxMembers > 0 && (
                      <Button variant="outline" onClick={() => { setEditingMember(undefined); setFamilyDialogOpen(true); }}>
                        <Plus className="w-4 h-4 mr-2" />Add First Member
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {familyMembers.map(member => (
                      <div key={member.id} className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-teal-200 dark:hover:border-teal-800 transition-colors">
                        <Avatar className="w-10 h-10 bg-slate-100 dark:bg-slate-800">
                          <AvatarFallback className="text-sm font-medium">
                            {member.firstName.charAt(0)}{member.lastName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{member.firstName} {member.lastName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="capitalize text-xs">{member.relationship}</Badge>
                            {(member.metadata?.aiInference?.relationshipInferred || member.metadata?.aiInference?.genderInferred) && (
                              <Badge className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200" variant="secondary">
                                AI inferred
                              </Badge>
                            )}
                            {member.dateOfBirth && <span className="text-xs text-slate-400">{calcAge(member.dateOfBirth)} yrs</span>}
                            {member.bloodType && <span className="text-xs text-red-500 font-medium">{member.bloodType}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingMember(member); setFamilyDialogOpen(true); }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            if (!confirm(`Remove ${member.firstName} from your family profile?`)) return;
                            try {
                              await api.delete(`/family-members/${member.id}`);
                              fetchFamilyMembers();
                              toast({ title: "Family member removed" });
                            } catch { toast({ title: "Failed to remove", variant: "destructive" }); }
                          }}>
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════
              TAB 4 — SETTINGS
          ══════════════════════════════════════════ */}
          <TabsContent value="settings" className="space-y-6">
            {loadingSettings ? (
              <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
            ) : !settings ? (
              <div className="text-center py-12 text-slate-400">Could not load settings</div>
            ) : (
              <>
                {/* Notifications */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-teal-500" />
                      <CardTitle>Notifications</CardTitle>
                    </div>
                    <CardDescription>Choose what you want to be notified about</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {Object.entries(NOTIFICATION_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                        <Switch
                          checked={settings.notifications[key] ?? false}
                          disabled={savingSettings}
                          onCheckedChange={v => {
                            const updated = { ...settings.notifications, [key]: v };
                            setSettings(s => s ? { ...s, notifications: updated } : s);
                            handleSaveSettings({ notifications: updated });
                          }}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Language & Region */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-teal-500" />
                      <CardTitle>Language & Region</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">App Language</p>
                        <p className="text-xs text-slate-400">Choose your preferred language</p>
                      </div>
                      <Select value={settings.language} onValueChange={v => {
                        setSettings(s => s ? { ...s, language: v } : s);
                        handleSaveSettings({ language: v });
                      }}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Timezone</p>
                        <p className="text-xs text-slate-400">Used for appointment scheduling</p>
                      </div>
                      <Select value={settings.timezone} onValueChange={v => {
                        setSettings(s => s ? { ...s, timezone: v } : s);
                        handleSaveSettings({ timezone: v });
                      }}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"].map(tz => (
                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Appearance */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4 text-teal-500" />
                      <CardTitle>Appearance</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Theme</p>
                        <p className="text-xs text-slate-400">Light, dark, or system default</p>
                      </div>
                      <Select value={settings.theme} onValueChange={v => {
                        setSettings(s => s ? { ...s, theme: v } : s);
                        handleSaveSettings({ theme: v });
                      }}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system">System</SelectItem>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Privacy */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-teal-500" />
                      <CardTitle>Privacy</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {[
                      { key: "show_online_status",      label: "Show online status to doctors",    desc: "Doctors can see when you're active" },
                      { key: "allow_doctor_notes",       label: "Allow doctors to add notes",       desc: "Doctors can annotate your profile" },
                      { key: "share_data_for_research",  label: "Share anonymised data for research", desc: "Helps improve AI health models (no personal data)" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                          <p className="text-xs text-slate-400">{desc}</p>
                        </div>
                        <Switch
                          checked={settings.privacy[key] ?? false}
                          disabled={savingSettings}
                          onCheckedChange={v => {
                            const updated = { ...settings.privacy, [key]: v };
                            setSettings(s => s ? { ...s, privacy: updated } : s);
                            handleSaveSettings({ privacy: updated });
                          }}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════
              TAB 5 — SECURITY
          ══════════════════════════════════════════ */}
          <TabsContent value="security" className="space-y-6">
            {/* Last login info */}
            {!loadingSecurity && securityInfo && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { icon: Clock,    label: "Last login",       value: securityInfo.last_login_at ? new Date(securityInfo.last_login_at).toLocaleString() : "Unknown" },
                  { icon: Monitor,  label: "Last login IP",    value: securityInfo.last_login_ip || "Unknown" },
                  { icon: Key,      label: "Password changed", value: securityInfo.password_changed_at ? new Date(securityInfo.password_changed_at).toLocaleDateString() : "Never" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <Icon className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="text-sm font-medium truncate">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Change password */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-teal-500" />
                  <CardTitle>Change Password</CardTitle>
                </div>
                <CardDescription>Use a strong, unique password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "current", label: "Current Password",  ph: "Enter current password"  },
                  { key: "next",    label: "New Password",       ph: "Min 8 chars, upper+lower+number+symbol" },
                  { key: "confirm", label: "Confirm New Password", ph: "Re-enter new password" },
                ].map(({ key, label, ph }) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{label}</Label>
                    <div className="relative">
                      <Input
                        type={(showPw as any)[key] ? "text" : "password"}
                        placeholder={ph}
                        value={(pwForm as any)[key]}
                        onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                        className="pr-10"
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        onClick={() => setShowPw(p => ({ ...p, [key]: !(p as any)[key] }))}>
                        {(showPw as any)[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
                {pwForm.next && pwForm.confirm && pwForm.next !== pwForm.confirm && (
                  <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Passwords do not match</p>
                )}
                <Button onClick={handleChangePassword} disabled={changingPw || !pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}>
                  {changingPw ? "Changing…" : "Change Password"}
                </Button>
              </CardContent>
            </Card>

            {/* Connected accounts */}
            {securityInfo && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Link className="w-4 h-4 text-teal-500" />
                    <CardTitle>Connected Accounts</CardTitle>
                  </div>
                  <CardDescription>Social accounts linked to your profile</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: "google",   label: "Google",   color: "text-red-500"   },
                    { key: "facebook", label: "Facebook", color: "text-blue-600"  },
                    { key: "apple",    label: "Apple",    color: "text-slate-800 dark:text-slate-200" },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <span className={`font-medium text-sm ${color}`}>{label}</span>
                      {(securityInfo.connected_accounts as any)[key]
                        ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="w-3 h-3 mr-1" />Connected</Badge>
                        : <Badge variant="outline" className="text-slate-400">Not connected</Badge>
                      }
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Session management */}
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-500" />
                  <CardTitle>Session Management</CardTitle>
                </div>
                <CardDescription>Sign out from all other devices and browsers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Signing out of all sessions will invalidate all active tokens.
                      You will be logged out from this device too and need to log in again.
                    </p>
                  </div>
                  <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 shrink-0"
                    onClick={() => setRevokeDialogOpen(true)}>
                    <LogOut className="w-4 h-4 mr-2" />Sign Out All
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Delete account */}
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trash className="w-4 h-4 text-red-500" />
                  <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Delete Account</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Permanently delete your account and all associated data. This is irreversible after 30 days.
                    </p>
                  </div>
                  <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                    onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2 className="w-4 h-4 mr-2" />Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Social photo import dialog */}
      <Dialog open={socialUrlDialog} onOpenChange={setSocialUrlDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Profile Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-500">
              Paste your profile photo URL from Google, Facebook, LinkedIn, or GitHub.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { name: "Google",   bg: "bg-red-50 dark:bg-red-950/30",   text: "G",  color: "text-red-600"  },
                { name: "Facebook", bg: "bg-blue-50 dark:bg-blue-950/30", text: "f",  color: "text-blue-600" },
                { name: "LinkedIn", bg: "bg-sky-50 dark:bg-sky-950/30",   text: "in", color: "text-sky-600"  },
                { name: "GitHub",   bg: "bg-slate-100 dark:bg-slate-800", text: "⌥",  color: "text-slate-700" },
              ].map(({ name, bg, text, color }) => (
                <div key={name} className={`${bg} rounded-lg p-3 text-center`}>
                  <span className={`font-bold text-lg ${color}`}>{text}</span>
                  <p className="text-xs text-slate-500 mt-1">{name}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Photo URL</Label>
              <Input placeholder="https://lh3.googleusercontent.com/…" value={socialUrl}
                onChange={e => setSocialUrl(e.target.value)} />
              <p className="text-xs text-slate-400">Only HTTPS URLs from trusted providers are accepted</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSocialUrlDialog(false)}>Cancel</Button>
            <Button onClick={handleImportFromUrl} disabled={!socialUrl || importingUrl}>
              {importingUrl ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Importing…</> : "Import Photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke sessions dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" />Sign Out All Devices?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">This will immediately invalidate all active sessions. You'll be redirected to the login page.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRevokeSessions}>Yes, Sign Out All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete account dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="w-5 h-5" />Delete Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Alert className="border-red-200 bg-red-50 dark:bg-red-950/30">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700 dark:text-red-300 text-sm">
                Your account will be scheduled for deletion in <strong>30 days</strong>. You can cancel by logging in again before then. After 30 days, all data is permanently erased.
              </AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea placeholder="Why are you deleting your account?" value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Type <strong>DELETE</strong> to confirm</Label>
              <Input placeholder="DELETE" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirm !== "DELETE"} onClick={handleDeleteAccount}>Delete My Account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FamilyMemberDialog
        open={familyDialogOpen}
        onOpenChange={setFamilyDialogOpen}
        member={editingMember}
        onSuccess={fetchFamilyMembers}
        allowedRelations={familyLimits?.allowedRelations || []}
        canAddMore={familyLimits?.canAddMore ?? true}
      />
      <MalwareWarningDialog open={malwareWarning.open} onClose={() => setMalwareWarning({ open: false })} threat={malwareWarning.threat} fileName={malwareWarning.fileName} />
    </>
  );
};

// ─── Inline helper: add-tag input ─────────────────────────────────────────────
const AddTagInput = ({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder?: string }) => {
  const [val, setVal] = useState("");
  const submit = () => { const t = val.trim(); if (t) { onAdd(t); setVal(""); } };
  return (
    <div className="flex gap-1">
      <Input value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} className="h-7 text-xs w-40"
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={submit}>Add</Button>
    </div>
  );
};

export default ProfileEnhanced
