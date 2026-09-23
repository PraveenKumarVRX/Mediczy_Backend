import { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Pill,
  Save,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Package,
  DollarSign,
  Calendar,
  MapPin,
  Phone,
  Mail,
  FlaskConical
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Pharmacy {
  id: string;
  name: string;
  licenseNumber: string;
  address: string;
  phone: string;
  email: string;
  manager: string;
  status: 'active' | 'inactive' | 'suspended';
  licenseExpiry: string;
  totalMedicines: number;
  monthlyRevenue: number;
  rating: number;
  lastAudit: string;
}

const TeamPharmacyEdit = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);

  // Mock pharmacy data - in real app, fetch from API
  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setPharmacy({
        id: 'PH-001',
        name: 'City Medical Pharmacy',
        licenseNumber: 'PHL-2024-001',
        address: '123 Main Street, Downtown, City - 400001',
        phone: '+91-9876543210',
        email: 'contact@citypharmacy.com',
        manager: 'Dr. Rajesh Kumar',
        status: 'active',
        licenseExpiry: '2025-12-31',
        totalMedicines: 2500,
        monthlyRevenue: 125000,
        rating: 4.2,
        lastAudit: '2024-11-15'
      });
    }, 1000);
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast({
        title: "Pharmacy Updated",
        description: "Pharmacy information has been successfully updated.",
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to update pharmacy information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (pharmacy) {
      setPharmacy({ ...pharmacy, status: newStatus as Pharmacy['status'] });
    }
  };

  if (!pharmacy) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading pharmacy details...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* WP-0.3: the loaded pharmacy details and the save action below are both simulated — there is
            no real backend endpoint behind this screen yet. */}
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <FlaskConical className="h-4 w-4 shrink-0" />
          Demo mode — pharmacy details shown are sample data and changes here are not yet saved to a real backend.
        </div>
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/team/pharmacy-edit">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pharmacies
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Edit Pharmacy</h1>
            <p className="text-muted-foreground">Manage pharmacy information and settings</p>
          </div>
        </div>

        {/* Pharmacy Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Medicines</p>
                  <p className="text-lg font-semibold">{pharmacy.totalMedicines.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                  <p className="text-lg font-semibold">₹{pharmacy.monthlyRevenue.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Rating</p>
                  <p className="text-lg font-semibold">{pharmacy.rating}/5.0</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Last Audit</p>
                  <p className="text-lg font-semibold">{new Date(pharmacy.lastAudit).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Pharmacy Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Pharmacy Name</Label>
                  <Input
                    id="name"
                    value={pharmacy.name}
                    onChange={(e) => setPharmacy({ ...pharmacy, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="license">License Number</Label>
                  <Input
                    id="license"
                    value={pharmacy.licenseNumber}
                    onChange={(e) => setPharmacy({ ...pharmacy, licenseNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="manager">Manager Name</Label>
                  <Input
                    id="manager"
                    value={pharmacy.manager}
                    onChange={(e) => setPharmacy({ ...pharmacy, manager: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={pharmacy.status} onValueChange={handleStatusChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Active
                        </div>
                      </SelectItem>
                      <SelectItem value="inactive">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                          Inactive
                        </div>
                      </SelectItem>
                      <SelectItem value="suspended">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          Suspended
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={pharmacy.phone}
                    onChange={(e) => setPharmacy({ ...pharmacy, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={pharmacy.email}
                    onChange={(e) => setPharmacy({ ...pharmacy, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="licenseExpiry">License Expiry Date</Label>
                  <Input
                    id="licenseExpiry"
                    type="date"
                    value={pharmacy.licenseExpiry}
                    onChange={(e) => setPharmacy({ ...pharmacy, licenseExpiry: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={pharmacy.address}
                onChange={(e) => setPharmacy({ ...pharmacy, address: e.target.value })}
                rows={3}
              />
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Current Status:</span>
              <Badge
                variant={pharmacy.status === 'active' ? 'default' : pharmacy.status === 'inactive' ? 'secondary' : 'destructive'}
              >
                {pharmacy.status.charAt(0).toUpperCase() + pharmacy.status.slice(1)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4">
          <Link to="/team/pharmacy-edit">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default TeamPharmacyEdit;