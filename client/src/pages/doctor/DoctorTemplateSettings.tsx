import { useState, useRef } from "react";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  Image, 
  Upload, 
  Trash2, 
  Save,
  Building2,
  Stamp,
  PenTool,
  Eye,
  FileText,
  Loader2,
  Check,
  AlertCircle
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TemplateSettings {
  logo: string | null;
  logoPosition: "left" | "center" | "right";
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicEmail: string;
  clinicWebsite: string;
  registrationNumber: string;
  seal: string | null;
  signature: string | null;
  signatureName: string;
  footerText: string;
  headerColor: string;
  showWatermark: boolean;
}

const DoctorTemplateSettings = () => {
  const { currentDoctor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sealInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<TemplateSettings>({
    logo: null,
    logoPosition: "left",
    clinicName: "",
    clinicAddress: "",
    clinicPhone: "",
    clinicEmail: "",
    clinicWebsite: "",
    registrationNumber: "",
    seal: null,
    signature: null,
    signatureName: "",
    footerText: "",
    headerColor: "#1a56db",
    showWatermark: false
  });

  const [uploading, setUploading] = useState<string | null>(null);

  // Fetch template settings
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['doctor-template-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/template-settings');
        return response.data;
      } catch (err) {
        // Return default settings
        return {
          success: true,
          settings: {
            logo: null,
            logoPosition: "left",
            clinicName: currentDoctor?.clinicName || "",
            clinicAddress: "",
            clinicPhone: currentDoctor?.phoneNumber || "",
            clinicEmail: currentDoctor?.email || "",
            clinicWebsite: "",
            registrationNumber: currentDoctor?.registrationNumber || "",
            seal: null,
            signature: null,
            signatureName: `Dr. ${currentDoctor?.firstName} ${currentDoctor?.lastName}`,
            footerText: "This is a computer-generated document. Signature is for authentication purposes.",
            headerColor: "#1a56db",
            showWatermark: false
          }
        };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Update settings when data is fetched
  useState(() => {
    if (settingsData?.settings) {
      setSettings(settingsData.settings);
    }
  });

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (data: TemplateSettings) => {
      const response = await api.put('/doctors/template-settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-template-settings'] });
      toast({ title: "Success", description: "Template settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    }
  });

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    field: "logo" | "seal" | "signature"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please upload an image file", variant: "destructive" });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Error", description: "File size should be less than 2MB", variant: "destructive" });
      return;
    }

    setUploading(field);

    try {
      // Convert to base64 for preview (in production, upload to server)
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings(prev => ({ ...prev, [field]: reader.result as string }));
        setUploading(null);
        toast({ title: "Success", description: `${field.charAt(0).toUpperCase() + field.slice(1)} uploaded successfully` });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setUploading(null);
      toast({ title: "Error", description: "Failed to upload file", variant: "destructive" });
    }
  };

  const handleRemoveFile = (field: "logo" | "seal" | "signature") => {
    setSettings(prev => ({ ...prev, [field]: null }));
  };

  const handleSave = () => {
    saveSettingsMutation.mutate(settings);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-brand">Template Settings</h1>
              <p className="text-muted mt-1">Configure your document header, logo, seal, and signature</p>
            </div>
            <Button onClick={handleSave} disabled={saveSettingsMutation.isPending} className="gap-2">
              {saveSettingsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Settings Panel */}
            <div className="lg:col-span-2 space-y-6">
              <Tabs defaultValue="branding" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="branding">Branding</TabsTrigger>
                  <TabsTrigger value="clinic">Clinic Info</TabsTrigger>
                  <TabsTrigger value="signature">Signature & Seal</TabsTrigger>
                </TabsList>

                <TabsContent value="branding" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Image className="h-5 w-5" />
                        Clinic Logo
                      </CardTitle>
                      <CardDescription>
                        Upload your clinic logo to appear on all documents
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <input
                        type="file"
                        ref={logoInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "logo")}
                      />
                      
                      {settings.logo ? (
                        <div className="flex items-center gap-4">
                          <div className="w-32 h-32 border rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                            <img
                              src={settings.logo}
                              alt="Clinic Logo"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <div className="space-y-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => logoInputRef.current?.click()}
                              disabled={uploading === "logo"}
                            >
                              {uploading === "logo" ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Upload className="h-4 w-4 mr-2" />
                              )}
                              Change Logo
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleRemoveFile("logo")}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Click to upload logo (PNG, JPG, max 2MB)
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Logo Position</Label>
                        <div className="flex gap-2">
                          {(["left", "center", "right"] as const).map((pos) => (
                            <Button
                              key={pos}
                              variant={settings.logoPosition === pos ? "default" : "outline"}
                              size="sm"
                              onClick={() => setSettings(prev => ({ ...prev, logoPosition: pos }))}
                            >
                              {pos.charAt(0).toUpperCase() + pos.slice(1)}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Header Color</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={settings.headerColor}
                            onChange={(e) => setSettings(prev => ({ ...prev, headerColor: e.target.value }))}
                            className="w-10 h-10 rounded cursor-pointer"
                          />
                          <Input
                            value={settings.headerColor}
                            onChange={(e) => setSettings(prev => ({ ...prev, headerColor: e.target.value }))}
                            className="w-32"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="clinic" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Clinic Information
                      </CardTitle>
                      <CardDescription>
                        This information will appear on your document headers
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Clinic/Hospital Name</Label>
                        <Input
                          placeholder="Enter clinic or hospital name"
                          value={settings.clinicName}
                          onChange={(e) => setSettings(prev => ({ ...prev, clinicName: e.target.value }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Address</Label>
                        <Textarea
                          placeholder="Enter complete address"
                          value={settings.clinicAddress}
                          onChange={(e) => setSettings(prev => ({ ...prev, clinicAddress: e.target.value }))}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Phone Number</Label>
                          <Input
                            placeholder="+91 98765 43210"
                            value={settings.clinicPhone}
                            onChange={(e) => setSettings(prev => ({ ...prev, clinicPhone: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            type="email"
                            placeholder="clinic@example.com"
                            value={settings.clinicEmail}
                            onChange={(e) => setSettings(prev => ({ ...prev, clinicEmail: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Website</Label>
                          <Input
                            placeholder="www.clinic.com"
                            value={settings.clinicWebsite}
                            onChange={(e) => setSettings(prev => ({ ...prev, clinicWebsite: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Registration Number</Label>
                          <Input
                            placeholder="MCI/State Reg. No."
                            value={settings.registrationNumber}
                            onChange={(e) => setSettings(prev => ({ ...prev, registrationNumber: e.target.value }))}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="signature" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PenTool className="h-5 w-5" />
                        Digital Signature
                      </CardTitle>
                      <CardDescription>
                        Upload your signature image for documents
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <input
                        type="file"
                        ref={signatureInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "signature")}
                      />
                      
                      {settings.signature ? (
                        <div className="flex items-center gap-4">
                          <div className="w-48 h-24 border rounded-lg overflow-hidden bg-white flex items-center justify-center">
                            <img
                              src={settings.signature}
                              alt="Signature"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <div className="space-y-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => signatureInputRef.current?.click()}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Change
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleRemoveFile("signature")}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                          onClick={() => signatureInputRef.current?.click()}
                        >
                          <PenTool className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Upload signature image (transparent PNG recommended)
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Name below signature</Label>
                        <Input
                          placeholder="Dr. John Doe, MBBS, MD"
                          value={settings.signatureName}
                          onChange={(e) => setSettings(prev => ({ ...prev, signatureName: e.target.value }))}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Stamp className="h-5 w-5" />
                        Official Seal/Stamp
                      </CardTitle>
                      <CardDescription>
                        Upload your official seal or stamp image
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <input
                        type="file"
                        ref={sealInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "seal")}
                      />
                      
                      {settings.seal ? (
                        <div className="flex items-center gap-4">
                          <div className="w-32 h-32 border rounded-lg overflow-hidden bg-white flex items-center justify-center">
                            <img
                              src={settings.seal}
                              alt="Seal"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <div className="space-y-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => sealInputRef.current?.click()}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Change
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleRemoveFile("seal")}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                          onClick={() => sealInputRef.current?.click()}
                        >
                          <Stamp className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Upload seal/stamp image (transparent PNG recommended)
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Footer Text</CardTitle>
                      <CardDescription>
                        Text that appears at the bottom of documents
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        placeholder="Enter footer text..."
                        value={settings.footerText}
                        onChange={(e) => setSettings(prev => ({ ...prev, footerText: e.target.value }))}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Preview Panel */}
            <div className="lg:col-span-1">
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Document Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg bg-white p-4 shadow-sm min-h-[400px] text-xs">
                    {/* Header */}
                    <div 
                      className="border-b pb-3 mb-3"
                      style={{ borderColor: settings.headerColor }}
                    >
                      <div className={`flex ${
                        settings.logoPosition === "center" ? "flex-col items-center" : 
                        settings.logoPosition === "right" ? "flex-row-reverse" : "flex-row"
                      } gap-3`}>
                        {settings.logo && (
                          <img 
                            src={settings.logo} 
                            alt="Logo" 
                            className="w-16 h-16 object-contain"
                          />
                        )}
                        <div className={settings.logoPosition === "center" ? "text-center" : ""}>
                          <h3 
                            className="font-bold text-sm"
                            style={{ color: settings.headerColor }}
                          >
                            {settings.clinicName || "Clinic Name"}
                          </h3>
                          <p className="text-gray-600 text-[10px]">
                            {settings.clinicAddress || "Clinic Address"}
                          </p>
                          <p className="text-gray-500 text-[10px]">
                            {settings.clinicPhone && `Tel: ${settings.clinicPhone}`}
                            {settings.clinicEmail && ` | ${settings.clinicEmail}`}
                          </p>
                          {settings.registrationNumber && (
                            <p className="text-gray-500 text-[10px]">
                              Reg. No: {settings.registrationNumber}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Document Content Placeholder */}
                    <div className="space-y-2 py-4">
                      <div className="h-3 bg-gray-100 rounded w-1/3"></div>
                      <div className="h-2 bg-gray-100 rounded w-full"></div>
                      <div className="h-2 bg-gray-100 rounded w-full"></div>
                      <div className="h-2 bg-gray-100 rounded w-2/3"></div>
                      <div className="h-8"></div>
                      <div className="h-2 bg-gray-100 rounded w-1/4"></div>
                      <div className="h-2 bg-gray-100 rounded w-full"></div>
                      <div className="h-2 bg-gray-100 rounded w-3/4"></div>
                    </div>

                    {/* Signature & Seal */}
                    <div className="mt-8 pt-4 border-t flex justify-between items-end">
                      <div className="text-center">
                        {settings.seal && (
                          <img 
                            src={settings.seal} 
                            alt="Seal" 
                            className="w-16 h-16 object-contain opacity-80"
                          />
                        )}
                      </div>
                      <div className="text-right">
                        {settings.signature && (
                          <img 
                            src={settings.signature} 
                            alt="Signature" 
                            className="w-24 h-12 object-contain ml-auto"
                          />
                        )}
                        <p className="text-[10px] font-medium mt-1">
                          {settings.signatureName || "Doctor's Name"}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    {settings.footerText && (
                      <div className="mt-4 pt-2 border-t text-[8px] text-gray-400 text-center">
                        {settings.footerText}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default DoctorTemplateSettings;
