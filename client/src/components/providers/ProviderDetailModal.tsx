import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  Star,
  Award,
  Clock,
  Calendar,
  Building2,
  Users,
  Activity,
  CheckCircle2,
  AlertCircle,
  Navigation,
} from 'lucide-react';

interface ProviderDetailModalProps {
  provider: any;
  open: boolean;
  onClose: () => void;
  type: 'hospital' | 'lab' | 'clinic';
}

const ProviderDetailModal: React.FC<ProviderDetailModalProps> = ({
  provider,
  open,
  onClose,
  type,
}) => {
  if (!provider) return null;

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                {provider.name}
              </DialogTitle>
              <DialogDescription className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  {provider.address && (
                    <span>
                      {provider.address.area && `${provider.address.area}, `}
                      {provider.city}
                      {provider.state && `, ${provider.state}`}
                      {provider.pincode && ` - ${provider.pincode}`}
                    </span>
                  )}
                </div>
              </DialogDescription>
            </div>
            <div className="flex flex-col gap-2">
              {provider.quality_score && (
                <div className="text-right">
                  <div className={`text-2xl font-bold ${getQualityColor(provider.quality_score)}`}>
                    {provider.quality_score}
                  </div>
                  <div className="text-xs text-muted-foreground">Quality Score</div>
                </div>
              )}
              {provider.pincode_mapped && (
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Pincode Mapped
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Contact Information */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {provider.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${provider.phone}`} className="text-primary hover:underline">
                      {provider.phone}
                    </a>
                  </div>
                )}
                {provider.mobile && provider.mobile !== provider.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${provider.mobile}`} className="text-primary hover:underline">
                      {provider.mobile}
                    </a>
                  </div>
                )}
                {provider.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${provider.email}`} className="text-primary hover:underline">
                      {provider.email}
                    </a>
                  </div>
                )}
                {provider.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={provider.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Website
                    </a>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Classification & Type */}
            {provider.classification && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Classification
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{provider.classification}</Badge>
                  {provider.sub_type && <Badge variant="outline">{provider.sub_type}</Badge>}
                  {provider.entity_type && <Badge variant="secondary">{provider.entity_type}</Badge>}
                </div>
              </div>
            )}

            {/* Quality Metrics */}
            {provider.quality_score && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Quality Metrics
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <div className={`text-2xl font-bold ${getQualityColor(provider.quality_score)}`}>
                        {provider.quality_score}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Overall Score</div>
                    </div>
                    {provider.network_strength && (
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {provider.network_strength}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Network Strength</div>
                      </div>
                    )}
                    {provider.service_breadth && (
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {provider.service_breadth}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Service Breadth</div>
                      </div>
                    )}
                    {provider.capacity_score && (
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-orange-600">
                          {provider.capacity_score}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Capacity</div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="services" className="space-y-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Available Services
            </h3>
            {provider.services && provider.services.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {provider.services.map((service: any, index: number) => (
                  <div key={index} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{service.category || service}</div>
                        {service.specialty && (
                          <div className="text-sm text-muted-foreground mt-1">{service.specialty}</div>
                        )}
                      </div>
                      {service.available !== undefined && (
                        <Badge variant={service.available ? 'default' : 'secondary'}>
                          {service.available ? 'Available' : 'Unavailable'}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No service information available</p>
              </div>
            )}

            {/* Emergency Services */}
            {provider.emergency_services && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-semibold">24/7 Emergency Services Available</span>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="location" className="space-y-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location Details
            </h3>

            {/* Address */}
            <div className="p-4 border rounded-lg">
              <div className="space-y-2">
                <div className="font-medium">Address</div>
                <div className="text-sm text-muted-foreground">
                  {provider.address && <div>{provider.address.street || provider.address}</div>}
                  {provider.address?.area && <div>Area: {provider.address.area}</div>}
                  {provider.address?.locality && <div>Locality: {provider.address.locality}</div>}
                  <div>
                    {provider.city}
                    {provider.state && `, ${provider.state}`}
                    {provider.pincode && ` - ${provider.pincode}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Coordinates */}
            {provider.coordinates && (provider.coordinates.lat || provider.coordinates.latitude) && (
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium mb-2 flex items-center gap-2">
                      <Navigation className="h-4 w-4" />
                      GPS Coordinates
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Latitude: {provider.coordinates.lat || provider.coordinates.latitude}
                      <br />
                      Longitude: {provider.coordinates.lng || provider.coordinates.longitude}
                    </div>
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${provider.coordinates.lat || provider.coordinates.latitude},${provider.coordinates.lng || provider.coordinates.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    Open in Maps →
                  </a>
                </div>
              </div>
            )}

            {/* Map placeholder - will be integrated with actual map */}
            {provider.coordinates && (provider.coordinates.lat || provider.coordinates.latitude) && (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Map integration coming soon</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Metadata */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Provider Information
                </h3>
                <div className="space-y-3">
                  {provider.id && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Provider ID:</span>
                      <span className="font-mono text-sm">{provider.id}</span>
                    </div>
                  )}
                  {provider.established_year && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Established:</span>
                      <span>{provider.established_year}</span>
                    </div>
                  )}
                  {provider.registration_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Registration:</span>
                      <span className="font-mono text-sm">{provider.registration_number}</span>
                    </div>
                  )}
                  {provider.medicalCouncil && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Medical Council:</span>
                      <span>{provider.medicalCouncil}</span>
                    </div>
                  )}
                  {provider.is_spn !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Network Provider:</span>
                      <Badge variant={provider.is_spn ? 'default' : 'secondary'}>
                        {provider.is_spn ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Details */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Additional Details
                </h3>
                <div className="space-y-3">
                  {provider.total_beds && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Beds:</span>
                      <span className="font-semibold">{provider.total_beds}</span>
                    </div>
                  )}
                  {provider.available_beds !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Available Beds:</span>
                      <span className="font-semibold text-green-600">{provider.available_beds}</span>
                    </div>
                  )}
                  {provider.doctor_count && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Doctors:</span>
                      <span className="font-semibold">{provider.doctor_count}</span>
                    </div>
                  )}
                  {provider.staff_count && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Staff:</span>
                      <span className="font-semibold">{provider.staff_count}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Accreditations & Certifications */}
            {provider.accreditations && provider.accreditations.length > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Accreditations
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {provider.accreditations.map((accreditation: any, index: number) => (
                      <Badge key={index} variant="secondary" className="text-sm">
                        <Award className="h-3 w-3 mr-1" />
                        {accreditation.name || accreditation}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Google Place ID */}
            {provider.google_place_id && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium text-blue-900">Google Place ID:</span>
                  <span className="ml-2 text-blue-700 font-mono text-xs">
                    {provider.google_place_id}
                  </span>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ProviderDetailModal;
