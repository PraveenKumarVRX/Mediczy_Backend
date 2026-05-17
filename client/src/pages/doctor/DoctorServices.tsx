import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import MainLayout from '@/components/layout/MainLayoutdoctor';
import { 
  Stethoscope, 
  Home, 
  MapPin, 
  IndianRupee,
  CheckCircle2,
  Clock,
  Users,
  FileText,
  AlertCircle,
  Loader2,
  Save
} from 'lucide-react';
import api from '@/utils/api';

interface ServiceSettings {
  offersSecondOpinion: boolean;
  secondOpinionFee: number | null;
  offersHomeVisits: boolean;
  homeVisitFee: number | null;
  homeVisitRadiusKm: number;
}

export default function DoctorServices() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ServiceSettings>({
    offersSecondOpinion: false,
    secondOpinionFee: null,
    offersHomeVisits: false,
    homeVisitFee: null,
    homeVisitRadiusKm: 10
  });

  useEffect(() => {
    fetchServiceSettings();
  }, []);

  const fetchServiceSettings = async () => {
    try {
      const response = await api.get('/doctors/profile');
      // Handle both wrapped {success, doctor} and unwrapped {id, ...} responses
      const doctor = response.data.doctor || response.data;
      if (doctor && doctor.id) {
        setSettings({
          offersSecondOpinion: doctor.offersSecondOpinion || false,
          secondOpinionFee: doctor.secondOpinionFee || null,
          offersHomeVisits: doctor.offersHomeVisits || false,
          homeVisitFee: doctor.homeVisitFee || null,
          homeVisitRadiusKm: doctor.homeVisitRadiusKm || 10
        });
      }
    } catch (error) {
      console.error('Error fetching service settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await api.put('/doctors/services', settings);
      if (response.data.success) {
        toast({
          title: 'Settings Saved',
          description: 'Your service preferences have been updated successfully.',
        });
        
        // Refetch to confirm saved values
        await fetchServiceSettings();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save service settings. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
            Service Enrollment
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Expand your practice by offering additional services
          </p>
        </div>
        <Button onClick={saveSettings} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      {/* Second Opinion Service */}
      <Card className="border-2 hover:border-blue-200 transition-colors">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Stethoscope className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-xl">Second Opinion Service</CardTitle>
                <CardDescription className="mt-1">
                  Help patients get expert second opinions on their diagnoses
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.offersSecondOpinion}
              onCheckedChange={(checked) => 
                setSettings(prev => ({ ...prev, offersSecondOpinion: checked }))
              }
            />
          </div>
        </CardHeader>
        
        {settings.offersSecondOpinion && (
          <CardContent className="space-y-4 pt-0">
            <Separator />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="secondOpinionFee" className="flex items-center gap-2">
                  <IndianRupee className="w-4 h-4" />
                  Consultation Fee
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                  <Input
                    id="secondOpinionFee"
                    type="number"
                    placeholder="1500"
                    className="pl-8"
                    value={settings.secondOpinionFee || ''}
                    onChange={(e) => 
                      setSettings(prev => ({ 
                        ...prev, 
                        secondOpinionFee: e.target.value ? Number(e.target.value) : null 
                      }))
                    }
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Recommended: ₹1000 - ₹3000 based on specialization
                </p>
              </div>
            </div>

            {/* Benefits */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                How it works:
              </h4>
              <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-400">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Patients upload their medical reports and current diagnosis</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>You review the case and provide your expert opinion</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Optional video consultation for complex cases</span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Response expected within 24-48 hours</span>
                </li>
              </ul>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Home Visit Service */}
      <Card className="border-2 hover:border-green-200 transition-colors">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <Home className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-xl">Home Visit Service</CardTitle>
                <CardDescription className="mt-1">
                  Provide homecare consultations for patients who cannot visit clinic
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.offersHomeVisits}
              onCheckedChange={(checked) => 
                setSettings(prev => ({ ...prev, offersHomeVisits: checked }))
              }
            />
          </div>
        </CardHeader>
        
        {settings.offersHomeVisits && (
          <CardContent className="space-y-4 pt-0">
            <Separator />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="homeVisitFee" className="flex items-center gap-2">
                  <IndianRupee className="w-4 h-4" />
                  Home Visit Fee
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                  <Input
                    id="homeVisitFee"
                    type="number"
                    placeholder="2000"
                    className="pl-8"
                    value={settings.homeVisitFee || ''}
                    onChange={(e) => 
                      setSettings(prev => ({ 
                        ...prev, 
                        homeVisitFee: e.target.value ? Number(e.target.value) : null 
                      }))
                    }
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Usually 2-3x regular consultation fee
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="radius" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Service Radius
                </Label>
                <div className="relative">
                  <Input
                    id="radius"
                    type="number"
                    placeholder="10"
                    value={settings.homeVisitRadiusKm}
                    onChange={(e) => 
                      setSettings(prev => ({ 
                        ...prev, 
                        homeVisitRadiusKm: Number(e.target.value) || 10 
                      }))
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                    km
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Maximum distance you're willing to travel
                </p>
              </div>
            </div>

            {/* Benefits */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <h4 className="font-medium text-green-800 dark:text-green-300 mb-2">
                Home Visit Benefits:
              </h4>
              <ul className="space-y-2 text-sm text-green-700 dark:text-green-400">
                <li className="flex items-start gap-2">
                  <Users className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Serve elderly patients, bedridden patients, and those with mobility issues</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Premium service with higher consultation fees</span>
                </li>
                <li className="flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Digital prescriptions generated on-site</span>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Patients within your service radius can book home visits</span>
                </li>
              </ul>
            </div>

            {/* Alert */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <p className="font-medium">Important Note:</p>
                <p>Home visits should include basic examination equipment. Carry your medical kit with essentials like stethoscope, BP monitor, pulse oximeter, etc.</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Stats Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Service Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">0</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Second Opinions</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-green-600">0</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Home Visits</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">₹0</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">This Month</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enrolled Services Summary */}
      <div className="flex flex-wrap gap-2">
        {settings.offersSecondOpinion && (
          <Badge variant="secondary" className="gap-1 py-1.5 px-3">
            <Stethoscope className="w-3 h-3" />
            Second Opinion Active
          </Badge>
        )}
        {settings.offersHomeVisits && (
          <Badge variant="secondary" className="gap-1 py-1.5 px-3">
            <Home className="w-3 h-3" />
            Home Visits Active ({settings.homeVisitRadiusKm}km radius)
          </Badge>
        )}
        {!settings.offersSecondOpinion && !settings.offersHomeVisits && (
          <p className="text-gray-500 text-sm">
            No additional services enrolled. Enable services above to expand your practice.
          </p>
        )}
      </div>
    </div>
    </MainLayout>
  );
}
