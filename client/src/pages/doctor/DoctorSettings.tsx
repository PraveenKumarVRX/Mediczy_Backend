import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Settings, User, Bell, Shield, Clock, Loader2, Save, CheckCircle, FileSignature, Stamp, Upload, X, RefreshCw, Building2, Plus, Trash2, Share2, Youtube, Instagram, Facebook } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { DoctorSealGenerator, generateDoctorSeal } from "@/components/doctor/DoctorSealGenerator";

const DoctorSettings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentDoctor } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const settingsTab = searchParams.get('tab') || 'profile';

  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    specialization: '',
    experience: 0,
    qualifications: '',
    bio: '',
    profileImage: '' as string | undefined,
    socialLinks: { facebook: '', instagram: '', youtube: '' } as { facebook: string; instagram: string; youtube: string }
  });
  const [socialImportLoading, setSocialImportLoading] = useState<string | null>(null);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  const [practice, setPractice] = useState({
    consultationFee: 500,
    slotDuration: 30,
    isAvailable: true,
    offersSecondOpinion: false,
    secondOpinionFee: null as number | null,
    offersHomeVisits: false,
    homeVisitFee: null as number | null,
    homeVisitRadiusKm: 10,
    practiceLocations: [] as Array<{
      id: string;
      name: string;
      type: 'hospital' | 'clinic';
      address: string;
      city: string;
      pincode: string;
      phone: string;
      consultationFee: number | null;
    }>
  });

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: true
  });

  const [documents, setDocuments] = useState({
    signature: '',
    seal: '',
    registrationNumber: ''
  });

  const signatureInputRef = useRef<HTMLInputElement>(null);
  const sealCanvasRef = useRef<HTMLCanvasElement>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['doctor-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/settings');
        return response.data.settings;
      } catch (err) {
        console.warn('Failed to fetch settings:', err);
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch doctor profile for service settings
  const { data: doctorProfile } = useQuery({
    queryKey: ['doctor-profile'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/profile');
        // Handle both wrapped and unwrapped responses
        return response.data.doctor || response.data;
      } catch (err) {
        console.warn('Failed to fetch doctor profile:', err);
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch template settings for signature/seal
  const { data: templateSettings } = useQuery({
    queryKey: ['doctor-template-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/template-settings');
        return response.data.settings;
      } catch (err) {
        console.warn('Failed to fetch template settings:', err);
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (templateSettings) {
      const doctorWithExtra = currentDoctor as any; // Extended properties may exist on runtime
      setDocuments(prev => ({
        ...prev,
        signature: templateSettings.signature || '',
        seal: templateSettings.seal || '',
        registrationNumber: templateSettings.registrationNumber || doctorWithExtra?.registrationNumber || ''
      }));
    }
  }, [templateSettings, currentDoctor]);

  useEffect(() => {
    const doctorWithExtra = currentDoctor as any; // Extended properties may exist on runtime
    if (settings) {
      setProfile(prev => ({
        ...prev,
        ...(settings.profile || {}),
        socialLinks: settings.profile?.socialLinks || { facebook: '', instagram: '', youtube: '' }
      }));
      setPractice(prev => ({
        ...prev,
        ...(settings.practice || {})
      }));
      setNotifications(settings.notifications || {});
    } else if (currentDoctor) {
      setProfile(prev => ({
        ...prev,
        firstName: currentDoctor.firstName || '',
        lastName: currentDoctor.lastName || '',
        email: currentDoctor.email || '',
        phoneNumber: currentDoctor.phoneNumber || '',
        specialization: currentDoctor.specialization || '',
        experience: currentDoctor.experience || 0,
        qualifications: doctorWithExtra?.qualifications || '',
        bio: doctorWithExtra?.bio || '',
        profileImage: (currentDoctor as any).profileImage || '',
        socialLinks: (currentDoctor as any).socialLinks || { facebook: '', instagram: '', youtube: '' }
      }));
    }
  }, [settings, currentDoctor]);

  // Populate service settings from doctor profile
  useEffect(() => {
    if (doctorProfile) {
      setPractice(prev => ({
        ...prev,
        offersSecondOpinion: doctorProfile.offersSecondOpinion || false,
        secondOpinionFee: doctorProfile.secondOpinionFee || null,
        offersHomeVisits: doctorProfile.offersHomeVisits || false,
        homeVisitFee: doctorProfile.homeVisitFee || null,
        homeVisitRadiusKm: doctorProfile.homeVisitRadiusKm || 10,
        practiceLocations: doctorProfile.practiceLocations || []
      }));
    }
  }, [doctorProfile]);

  const updateSettings = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.put('/doctors/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-settings'] });
      toast({
        title: "Settings Saved",
        description: "Your settings have been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to save settings",
      });
    }
  });

  // Mutation for template settings (signature/seal)
  const updateTemplateSettings = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.put('/doctors/template-settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-template-settings'] });
      toast({
        title: "Documents Saved",
        description: "Your signature and seal have been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to save documents",
      });
    }
  });

  const handleImportSocialAvatar = async (platform: 'facebook' | 'instagram' | 'youtube') => {
    const url = profile.socialLinks?.[platform];
    if (!url?.trim()) {
      toast({ variant: 'destructive', title: 'Enter a URL first', description: `Paste your ${platform} page URL above, then click Import.` });
      return;
    }
    setSocialImportLoading(platform);
    try {
      const resp = await api.post('/doctors/fetch-social-avatar', { url: url.trim(), platform });
      const imageUrl: string = resp.data?.imageUrl;
      if (imageUrl) {
        setProfile(prev => ({ ...prev, profileImage: imageUrl }));
        // Save the profile image immediately
        await api.put('/doctors/settings', { profile: { profileImage: imageUrl } });
        queryClient.invalidateQueries({ queryKey: ['doctor-settings'] });
        toast({ title: 'Photo imported!', description: `Profile picture updated from ${platform}.` });
      } else {
        toast({ variant: 'destructive', title: 'No image found', description: 'Could not find a profile picture on that page.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Import failed', description: err.response?.data?.message || 'Could not fetch profile image from that URL.' });
    } finally {
      setSocialImportLoading(null);
    }
  };

  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Profile photo must be under 5MB.' });
      return;
    }

    setUploadingProfileImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await api.post('/doctors/upload/profilePicture', formData);
      const imageUrl = resp.data?.url || resp.data?.profileImage;
      if (!imageUrl) {
        throw new Error('Upload succeeded but no image URL was returned');
      }
      setProfile((prev) => ({ ...prev, profileImage: imageUrl }));
      queryClient.invalidateQueries({ queryKey: ['doctor-settings'] });
      queryClient.invalidateQueries({ queryKey: ['currentDoctor'] });
      toast({ title: 'Photo updated', description: 'Your profile picture has been uploaded.' });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err.response?.data?.message || 'Could not upload profile picture.',
      });
    } finally {
      setUploadingProfileImage(false);
      if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = '';
    }
  };

  const handleSaveProfile = () => {
    updateSettings.mutate({ profile });
  };

  const handleSavePractice = async () => {
    // Save practice settings including practice locations
    updateSettings.mutate({ 
      practice: {
        ...practice,
        practiceLocations: practice.practiceLocations
      }
    });
    // Also save service settings and practice locations separately
    try {
      await api.put('/doctors/services', {
        offersSecondOpinion: practice.offersSecondOpinion,
        secondOpinionFee: practice.secondOpinionFee,
        offersHomeVisits: practice.offersHomeVisits,
        homeVisitFee: practice.homeVisitFee,
        homeVisitRadiusKm: practice.homeVisitRadiusKm,
        practiceLocations: practice.practiceLocations
      });
      // Invalidate doctor profile to reflect new service settings
      queryClient.invalidateQueries({ queryKey: ['doctor-profile'] });
    } catch (err) {
      console.error('Failed to save service settings:', err);
    }
  };

  const addPracticeLocation = () => {
    setPractice(prev => ({
      ...prev,
      practiceLocations: [
        ...prev.practiceLocations,
        {
          id: `loc_${Date.now()}`,
          name: '',
          type: 'clinic' as const,
          address: '',
          city: '',
          pincode: '',
          phone: '',
          consultationFee: null
        }
      ]
    }));
  };

  const updatePracticeLocation = (index: number, field: string, value: any) => {
    setPractice(prev => ({
      ...prev,
      practiceLocations: prev.practiceLocations.map((loc, i) =>
        i === index ? { ...loc, [field]: value } : loc
      )
    }));
  };

  const removePracticeLocation = (index: number) => {
    setPractice(prev => ({
      ...prev,
      practiceLocations: prev.practiceLocations.filter((_, i) => i !== index)
    }));
  };

  const handleSaveNotifications = () => {
    updateSettings.mutate({ notifications });
  };

  const handleSaveDocuments = () => {
    updateTemplateSettings.mutate({
      ...templateSettings,
      signature: documents.signature,
      seal: documents.seal,
      registrationNumber: documents.registrationNumber
    });
  };

  // Handle signature file upload
  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Signature image must be less than 2MB"
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setDocuments(prev => ({ ...prev, signature: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Generate seal using canvas
  const handleGenerateSeal = useCallback(() => {
    const canvas = document.createElement('canvas');
    const doctorWithExtra = currentDoctor as any;
    const doctorName = `${profile.firstName || currentDoctor?.firstName || ''} ${profile.lastName || currentDoctor?.lastName || ''}`.trim();
    const qualifications = profile.qualifications || doctorWithExtra?.qualifications || 'MBBS';
    const regNo = documents.registrationNumber || doctorWithExtra?.registrationNumber || 'XXXXXX';
    const specialization = profile.specialization || currentDoctor?.specialization || '';

    if (!doctorName) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill in your name to generate a seal"
      });
      return;
    }

    const sealDataUrl = generateDoctorSeal(
      canvas,
      doctorName,
      qualifications,
      regNo,
      specialization,
      200
    );
    
    setDocuments(prev => ({ ...prev, seal: sealDataUrl }));
    toast({
      title: "Seal Generated",
      description: "Your digital seal has been created. Click Save to apply it."
    });
  }, [profile, currentDoctor, documents.registrationNumber, toast]);

  const handleRemoveSignature = () => {
    setDocuments(prev => ({ ...prev, signature: '' }));
  };

  const handleRemoveSeal = () => {
    setDocuments(prev => ({ ...prev, seal: '' }));
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>

        <Tabs value={settingsTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="practice" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Practice</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal and professional details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profile.firstName}
                      onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profile.lastName}
                      onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      value={profile.phoneNumber}
                      onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="specialization">Specialization</Label>
                    <Input
                      id="specialization"
                      value={profile.specialization}
                      onChange={(e) => setProfile({ ...profile, specialization: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="experience">Years of Experience</Label>
                    <Input
                      id="experience"
                      type="number"
                      value={profile.experience}
                      onChange={(e) => setProfile({ ...profile, experience: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualifications">Qualifications</Label>
                  <Input
                    id="qualifications"
                    value={profile.qualifications}
                    onChange={(e) => setProfile({ ...profile, qualifications: e.target.value })}
                    placeholder="MBBS, MD, etc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="Tell patients about yourself..."
                    rows={4}
                  />
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900/40">
                  <Label>Profile Photo</Label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Upload a photo from your device. JPEG, PNG, GIF, or WebP up to 5MB.
                  </p>
                  <div className="flex items-center gap-4">
                    {profile.profileImage ? (
                      <img
                        src={profile.profileImage}
                        alt="Profile"
                        className="h-16 w-16 rounded-full object-cover border-2 border-slate-200"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploadingProfileImage}
                        onClick={() => profilePhotoInputRef.current?.click()}
                      >
                        {uploadingProfileImage ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Upload Photo
                      </Button>
                      {profile.profileImage && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => setProfile((prev) => ({ ...prev, profileImage: '' }))}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <input
                      ref={profilePhotoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={handleProfileImageUpload}
                    />
                  </div>
                </div>

                {/* Social Media Links */}
                <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
                    <Share2 className="h-4 w-4" />
                    Social Media &amp; Profile Photo Import
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Add your social media page links. Use &ldquo;Import Photo&rdquo; to pull your profile picture directly from that page.
                  </p>

                  {/* Facebook */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-[#1877F2]">
                      <Facebook className="h-4 w-4" /> Facebook Page URL
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={profile.socialLinks?.facebook || ''}
                        onChange={(e) => setProfile({ ...profile, socialLinks: { ...(profile.socialLinks || {}), facebook: e.target.value, instagram: profile.socialLinks?.instagram || '', youtube: profile.socialLinks?.youtube || '' } })}
                        placeholder="https://facebook.com/yourpage"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={socialImportLoading === 'facebook'}
                        onClick={() => handleImportSocialAvatar('facebook')}
                        className="shrink-0 border-[#1877F2] text-[#1877F2] hover:bg-blue-50"
                      >
                        {socialImportLoading === 'facebook' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        <span className="ml-1 hidden sm:inline">Import Photo</span>
                      </Button>
                    </div>
                  </div>

                  {/* Instagram */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-[#E1306C]">
                      <Instagram className="h-4 w-4" /> Instagram Page URL
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={profile.socialLinks?.instagram || ''}
                        onChange={(e) => setProfile({ ...profile, socialLinks: { ...(profile.socialLinks || {}), facebook: profile.socialLinks?.facebook || '', instagram: e.target.value, youtube: profile.socialLinks?.youtube || '' } })}
                        placeholder="https://instagram.com/yourhandle"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={socialImportLoading === 'instagram'}
                        onClick={() => handleImportSocialAvatar('instagram')}
                        className="shrink-0 border-[#E1306C] text-[#E1306C] hover:bg-pink-50"
                      >
                        {socialImportLoading === 'instagram' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        <span className="ml-1 hidden sm:inline">Import Photo</span>
                      </Button>
                    </div>
                  </div>

                  {/* YouTube */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-[#FF0000]">
                      <Youtube className="h-4 w-4" /> YouTube Channel URL
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={profile.socialLinks?.youtube || ''}
                        onChange={(e) => setProfile({ ...profile, socialLinks: { ...(profile.socialLinks || {}), facebook: profile.socialLinks?.facebook || '', instagram: profile.socialLinks?.instagram || '', youtube: e.target.value } })}
                        placeholder="https://youtube.com/@yourchannel"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={socialImportLoading === 'youtube'}
                        onClick={() => handleImportSocialAvatar('youtube')}
                        className="shrink-0 border-[#FF0000] text-[#FF0000] hover:bg-red-50"
                      >
                        {socialImportLoading === 'youtube' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        <span className="ml-1 hidden sm:inline">Import Photo</span>
                      </Button>
                    </div>
                  </div>

                  {/* Preview of imported photo */}
                  {profile.profileImage && (
                    <div className="flex items-center gap-3 mt-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                      <img
                        src={profile.profileImage}
                        alt="Profile"
                        className="h-14 w-14 rounded-full object-cover border-2 border-slate-200"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Current profile photo</p>
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:underline mt-0.5"
                          onClick={() => setProfile(prev => ({ ...prev, profileImage: '' }))}
                        >Remove</button>
                      </div>
                    </div>
                  )}
                </div>

                <Button onClick={handleSaveProfile} disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Profile
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab - Signature & Seal */}
          <TabsContent value="documents">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Registration Number Card */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSignature className="h-5 w-5" />
                    Medical Registration
                  </CardTitle>
                  <CardDescription>Your medical council registration details</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label htmlFor="regNo">Registration Number</Label>
                    <Input
                      id="regNo"
                      value={documents.registrationNumber}
                      onChange={(e) => setDocuments(prev => ({ ...prev, registrationNumber: e.target.value }))}
                      placeholder="e.g., MCI-12345 or SMC/2020/1234"
                      className="max-w-md"
                    />
                    <p className="text-sm text-muted-foreground">
                      Your medical council registration number will appear on all prescriptions and documents
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Signature Upload Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSignature className="h-5 w-5" />
                    Digital Signature
                  </CardTitle>
                  <CardDescription>Upload your signature for prescriptions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {documents.signature ? (
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4 bg-white dark:bg-slate-800">
                        <img
                          src={documents.signature}
                          alt="Your Signature"
                          className="max-h-24 object-contain mx-auto"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => signatureInputRef.current?.click()}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Change
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveSignature}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                      onClick={() => signatureInputRef.current?.click()}
                    >
                      <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="font-medium text-foreground">Upload Signature</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        PNG with transparent background recommended
                      </p>
                      <p className="text-xs text-muted-foreground">Max 2MB</p>
                    </div>
                  )}
                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />
                  <p className="text-sm text-muted-foreground">
                    Sign on white paper, scan or photograph it. For best results, use a transparent PNG.
                  </p>
                </CardContent>
              </Card>

              {/* Seal/Stamp Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Stamp className="h-5 w-5" />
                    Doctor's Seal
                  </CardTitle>
                  <CardDescription>Auto-generated seal with your details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {documents.seal ? (
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4 bg-white dark:bg-slate-800 flex justify-center">
                        <img
                          src={documents.seal}
                          alt="Doctor's Seal"
                          className="w-40 h-40 object-contain"
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateSeal}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Regenerate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveSeal}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                        onClick={handleGenerateSeal}
                      >
                        <Stamp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="font-medium text-foreground">Generate Digital Seal</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Click to create your professional seal
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Your seal will include: Name, Qualifications, Registration Number, and Specialization
                  </p>
                </CardContent>
              </Card>

              {/* Preview Card */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Prescription Footer Preview</CardTitle>
                  <CardDescription>How your signature and seal will appear on prescriptions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg p-6 bg-white dark:bg-slate-800">
                    <div className="flex justify-between items-end">
                      {/* Seal */}
                      <div className="text-center">
                        {documents.seal ? (
                          <img
                            src={documents.seal}
                            alt="Seal"
                            className="w-20 h-20 object-contain opacity-80"
                          />
                        ) : (
                          <div className="w-20 h-20 border border-dashed rounded-full flex items-center justify-center text-xs text-muted-foreground">
                            No Seal
                          </div>
                        )}
                      </div>

                      {/* Signature & Details */}
                      <div className="text-right">
                        {documents.signature ? (
                          <img
                            src={documents.signature}
                            alt="Signature"
                            className="max-w-32 h-12 object-contain ml-auto"
                          />
                        ) : (
                          <div className="h-12 w-32 border border-dashed rounded flex items-center justify-center text-xs text-muted-foreground ml-auto">
                            No Signature
                          </div>
                        )}
                        <p className="font-bold mt-2 text-foreground">
                          Dr. {profile.firstName || currentDoctor?.firstName || 'First'} {profile.lastName || currentDoctor?.lastName || 'Last'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {profile.qualifications || (currentDoctor as any)?.qualifications || 'MBBS'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {profile.specialization || currentDoctor?.specialization || 'General Practitioner'}
                        </p>
                        {documents.registrationNumber && (
                          <p className="text-xs text-muted-foreground">
                            Reg. No: {documents.registrationNumber}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="lg:col-span-2">
                <Button onClick={handleSaveDocuments} disabled={updateTemplateSettings.isPending}>
                  {updateTemplateSettings.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Documents
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Practice Tab */}
          <TabsContent value="practice">
            <Card>
              <CardHeader>
                <CardTitle>Practice Settings</CardTitle>
                <CardDescription>Configure your consultation settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fee">Consultation Fee (₹)</Label>
                    <Input
                      id="fee"
                      type="number"
                      value={practice.consultationFee}
                      onChange={(e) => setPractice({ ...practice, consultationFee: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Slot Duration (minutes)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={practice.slotDuration}
                      onChange={(e) => setPractice({ ...practice, slotDuration: parseInt(e.target.value) || 30 })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium">Availability Status</p>
                    <p className="text-sm text-muted-foreground">Toggle to show/hide from patient searches</p>
                  </div>
                  <Switch
                    checked={practice.isAvailable}
                    onCheckedChange={(checked) => setPractice({ ...practice, isAvailable: checked })}
                  />
                </div>

                {/* Practice Locations Section */}
                <div className="border-t pt-6 mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-medium">Practice Locations</h4>
                      <p className="text-sm text-muted-foreground">Add hospitals or clinics where you practice</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addPracticeLocation}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Location
                    </Button>
                  </div>

                  {practice.practiceLocations.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                      <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No practice locations added yet</p>
                      <Button variant="link" onClick={addPracticeLocation}>
                        Add your first location
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {practice.practiceLocations.map((location, index) => (
                        <div key={location.id} className="p-4 border rounded-lg space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-5 w-5 text-primary" />
                              <span className="font-medium">Location {index + 1}</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => removePracticeLocation(index)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Hospital/Clinic Name</Label>
                              <Input
                                value={location.name}
                                onChange={(e) => updatePracticeLocation(index, 'name', e.target.value)}
                                placeholder="e.g., Apollo Hospital"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Type</Label>
                              <select
                                className="w-full h-10 px-3 border rounded-md bg-background"
                                value={location.type}
                                onChange={(e) => updatePracticeLocation(index, 'type', e.target.value)}
                              >
                                <option value="hospital">Hospital</option>
                                <option value="clinic">Clinic</option>
                              </select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Address</Label>
                            <Input
                              value={location.address}
                              onChange={(e) => updatePracticeLocation(index, 'address', e.target.value)}
                              placeholder="Street address, building, floor"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>City</Label>
                              <Input
                                value={location.city}
                                onChange={(e) => updatePracticeLocation(index, 'city', e.target.value)}
                                placeholder="City"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Pincode</Label>
                              <Input
                                value={location.pincode}
                                onChange={(e) => updatePracticeLocation(index, 'pincode', e.target.value)}
                                placeholder="560001"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Contact Phone</Label>
                              <Input
                                value={location.phone}
                                onChange={(e) => updatePracticeLocation(index, 'phone', e.target.value)}
                                placeholder="+91 98765 43210"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Consultation Fee at this location (₹)</Label>
                            <Input
                              type="number"
                              className="max-w-xs"
                              value={location.consultationFee || ''}
                              onChange={(e) => updatePracticeLocation(index, 'consultationFee', e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder="Fee for this location (optional)"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Additional Services Section */}
                <div className="border-t pt-6 mt-6">
                  <h4 className="font-medium mb-4">Additional Services</h4>
                  
                  {/* Second Opinion */}
                  <div className="flex items-center justify-between p-4 border rounded-lg mb-4">
                    <div>
                      <p className="font-medium">Second Opinion Consultations</p>
                      <p className="text-sm text-muted-foreground">Offer expert second opinions on diagnoses</p>
                    </div>
                    <Switch
                      checked={practice.offersSecondOpinion}
                      onCheckedChange={(checked) => setPractice({ ...practice, offersSecondOpinion: checked })}
                    />
                  </div>
                  {practice.offersSecondOpinion && (
                    <div className="ml-4 mb-4">
                      <Label htmlFor="secondOpinionFee">Second Opinion Fee (₹)</Label>
                      <Input
                        id="secondOpinionFee"
                        type="number"
                        className="max-w-xs mt-1"
                        value={practice.secondOpinionFee || ''}
                        onChange={(e) => setPractice({ ...practice, secondOpinionFee: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="Enter fee amount"
                      />
                    </div>
                  )}

                  {/* Home Visits */}
                  <div className="flex items-center justify-between p-4 border rounded-lg mb-4">
                    <div>
                      <p className="font-medium">Home Visit Consultations</p>
                      <p className="text-sm text-muted-foreground">Provide in-home medical consultations</p>
                    </div>
                    <Switch
                      checked={practice.offersHomeVisits}
                      onCheckedChange={(checked) => setPractice({ ...practice, offersHomeVisits: checked })}
                    />
                  </div>
                  {practice.offersHomeVisits && (
                    <div className="ml-4 mb-4 space-y-4">
                      <div>
                        <Label htmlFor="homeVisitFee">Home Visit Fee (₹)</Label>
                        <Input
                          id="homeVisitFee"
                          type="number"
                          className="max-w-xs mt-1"
                          value={practice.homeVisitFee || ''}
                          onChange={(e) => setPractice({ ...practice, homeVisitFee: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="Enter fee amount"
                        />
                      </div>
                      <div>
                        <Label htmlFor="homeVisitRadius">Service Radius (km)</Label>
                        <Input
                          id="homeVisitRadius"
                          type="number"
                          className="max-w-xs mt-1"
                          value={practice.homeVisitRadiusKm}
                          onChange={(e) => setPractice({ ...practice, homeVisitRadiusKm: parseInt(e.target.value) || 10 })}
                          placeholder="Enter radius in km"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Button onClick={handleSavePractice} disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Practice Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose how you want to receive notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive appointment updates via email</p>
                  </div>
                  <Switch
                    checked={notifications.emailNotifications}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, emailNotifications: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">SMS Notifications</p>
                    <p className="text-sm text-muted-foreground">Get text messages for urgent updates</p>
                  </div>
                  <Switch
                    checked={notifications.smsNotifications}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, smsNotifications: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-muted-foreground">Browser and mobile push alerts</p>
                  </div>
                  <Switch
                    checked={notifications.pushNotifications}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, pushNotifications: checked })}
                  />
                </div>

                <Button onClick={handleSaveNotifications} disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your account security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 border rounded-lg space-y-4">
                  <div>
                    <p className="font-medium">Change Password</p>
                    <p className="text-sm text-muted-foreground">Update your account password</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <Input id="currentPassword" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input id="newPassword" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input id="confirmPassword" type="password" />
                    </div>
                    <Button variant="outline">Update Password</Button>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                    </div>
                    <Button variant="outline">Enable 2FA</Button>
                  </div>
                </div>

                <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-destructive">Delete Account</p>
                      <p className="text-sm text-muted-foreground">Permanently delete your account and data</p>
                    </div>
                    <Button variant="destructive">Delete Account</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default DoctorSettings;
