import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useEffect, useRef } from "react";
import Layout from "@/components/layout/MainLayout";
import { Phone, MapPin, Loader2, Locate, Stethoscope, AlertTriangle, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DrISHAChat } from "@/components/DrISHAChat";
import { drIshaAPI } from '@/services/drIsha';
import axios from 'axios';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-shadow.png',
});

interface Hospital {
  id: string;
  name: string;
  address: string;
  phone?: string;
  lat: number;
  lon: number;
  distance?: number;
  type: string;
  emergency: boolean;
}

interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

interface SMSResponse {
  success: boolean;
  message: string;
}

// Calculate distance between two points using Haversine formula
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Real hospital data
const hospitalData: Hospital[] = [
  {
    id: "1",
    name: "AIIMS Delhi",
    address: "Sri Aurobindo Marg, Ansari Nagar, New Delhi, Delhi 110029",
    phone: "011-26588500",
    lat: 28.5672,
    lon: 77.2100,
    type: "Hospital",
    emergency: true
  },
  {
    id: "2",
    name: "Fortis Hospital",
    address: "Sector B-1, Vasant Kunj, New Delhi, Delhi 110070",
    phone: "011-42776222",
    lat: 28.5231,
    lon: 77.1558,
    type: "Hospital",
    emergency: true
  },
  {
    id: "3",
    name: "Max Super Speciality Hospital",
    address: "1, Press Enclave Road, Saket, New Delhi, Delhi 110017",
    phone: "011-26515050",
    lat: 28.5284,
    lon: 77.2157,
    type: "Hospital",
    emergency: true
  },
  {
    id: "4",
    name: "Apollo Hospital",
    address: "Sarita Vihar, Delhi Mathura Road, New Delhi, Delhi 110076",
    phone: "011-71791090",
    lat: 28.5361,
    lon: 77.2833,
    type: "Hospital",
    emergency: true
  },
  {
    id: "5",
    name: "Safdarjung Hospital",
    address: "Ansari Nagar East, New Delhi, Delhi 110029",
    phone: "011-26707444",
    lat: 28.5686,
    lon: 77.2066,
    type: "Hospital",
    emergency: true
  },
  {
    id: "6",
    name: "Sir Ganga Ram Hospital",
    address: "Rajinder Nagar, New Delhi, Delhi 110060",
    phone: "011-25750000",
    lat: 28.6403,
    lon: 77.1897,
    type: "Hospital",
    emergency: true
  }
];

const DEFAULT_LOCATION = { lat: 28.6139, lng: 77.2090 };

const Emergency = () => {
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [showTriageDialog, setShowTriageDialog] = useState(false);
  const [emergencySymptoms, setEmergencySymptoms] = useState("");
  const [triageResult, setTriageResult] = useState<any>(null);
  const [isTriaging, setIsTriaging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [showAllHospitals, setShowAllHospitals] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const routingControlRef = useRef<any>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const { toast } = useToast();
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>(() => {
    const saved = localStorage.getItem('emergencyContacts');
    return saved ? JSON.parse(saved) : [];
  });
  const [isEditingContacts, setIsEditingContacts] = useState(false);
  const [newContact, setNewContact] = useState<EmergencyContact>({ name: '', phone: '', relationship: '' });

  const saveEmergencyContacts = (contacts: EmergencyContact[]) => {
    localStorage.setItem('emergencyContacts', JSON.stringify(contacts));
    setEmergencyContacts(contacts);
  };

  const addEmergencyContact = () => {
    if (!newContact.name || !newContact.phone) {
      toast({
        title: "Validation Error",
        description: "Name and phone number are required",
        variant: "destructive",
      });
      return;
    }

    if (!validatePhoneNumber(newContact.phone)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number",
        variant: "destructive",
      });
      return;
    }

    const updatedContacts = [...emergencyContacts, newContact];
    saveEmergencyContacts(updatedContacts);
    setNewContact({ name: '', phone: '', relationship: '' });
    toast({
      title: "Contact Added",
      description: `${newContact.name} has been added to your emergency contacts.`,
    });
  };

  const removeEmergencyContact = (index: number) => {
    const updatedContacts = emergencyContacts.filter((_, i) => i !== index);
    saveEmergencyContacts(updatedContacts);
    toast({
      title: "Contact Removed",
      description: "Emergency contact has been removed.",
    });
  };

  const sendSOSMessage = async () => {
    if (!userLocation) return;
    
    const sosMessage = `EMERGENCY SOS ALERT!\nLocation: https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}\nThis person needs immediate assistance!`;
    
    try {
      // Show dummy success messages for each contact
      for (const contact of emergencyContacts) {
        toast({
          title: "SOS Message Sent",
          description: `Emergency message sent to ${contact.name} (Demo Mode)`,
        });
      }
    } catch (error) {
      console.error('Error in demo SMS:', error);
      toast({
        title: "Demo Mode",
        description: "SMS would be sent in production mode",
      });
    }
  };

  const handleSOS = async () => {
    setIsSOSActive(true);
    
    // Show emergency toast
    toast({
      title: "SOS Activated",
      description: "Sending emergency alerts and contacting emergency services...",
      variant: "destructive",
      duration: 5000,
    });

    // Send SOS messages to emergency contacts
    await sendSOSMessage();

    // Call emergency number
    setTimeout(() => {
      window.location.href = `tel:102`;
    }, 3000);

    // Reset SOS state after 5 seconds
    setTimeout(() => {
      setIsSOSActive(false);
    }, 5000);
  };

  const callHospital = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  // Emergency triage with Dr. iSHA
  const performEmergencyTriage = async () => {
    if (!emergencySymptoms.trim()) {
      toast({
        title: "Symptoms Required",
        description: "Please describe your symptoms for emergency triage.",
        variant: "destructive",
      });
      return;
    }

    setIsTriaging(true);
    
    try {
      // Format emergency triage request
      const triageQuery = `EMERGENCY TRIAGE REQUEST:

Symptoms: ${emergencySymptoms}

Please provide:
🚨 URGENCY LEVEL (IMMEDIATE/URGENT/LESS URGENT)
🏥 RECOMMENDED ACTION (Emergency room, urgent care, etc.)
⚠️ WARNING SIGNS to watch for
🩺 IMMEDIATE CARE instructions while waiting
📞 WHEN TO CALL 911 immediately

This is for emergency medical guidance. Please prioritize safety and immediate care recommendations.`;

      const response = await drIshaAPI.consult(
        triageQuery,
        'en',
        {
          emergencyMode: true,
          location: userLocation,
          userAgent: 'Mediczy Emergency Triage'
        }
      );

      if (response.success && response.data) {
        setTriageResult({
          assessment: response.data.response,
          timestamp: new Date(),
          symptoms: emergencySymptoms
        });
        
        // Extract urgency level from response
        const urgencyMatch = response.data.response.match(/URGENCY LEVEL.*?(IMMEDIATE|URGENT|LESS URGENT)/i);
        const urgencyLevel = urgencyMatch ? urgencyMatch[1].toUpperCase() : 'UNKNOWN';
        
        // Show appropriate action based on urgency
        if (urgencyLevel === 'IMMEDIATE') {
          toast({
            title: "⚠️ IMMEDIATE ATTENTION NEEDED",
            description: "Dr. iSHA recommends calling emergency services immediately!",
            variant: "destructive",
          });
          
          // Auto-suggest calling emergency services
          setTimeout(() => {
            if (confirm("Dr. iSHA recommends calling emergency services immediately. Would you like to call now?")) {
              window.location.href = 'tel:108'; // Indian emergency number
            }
          }, 2000);
        } else if (urgencyLevel === 'URGENT') {
          toast({
            title: "🚨 URGENT Care Needed",
            description: "Dr. iSHA recommends seeking immediate medical attention.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "📋 Medical Assessment Complete",
            description: "Dr. iSHA has provided emergency guidance. Please review the recommendations.",
          });
        }
      } else {
        throw new Error(response.error?.message || 'Emergency triage failed');
      }
    } catch (error) {
      console.error("Emergency triage error:", error);
      toast({
        title: "Triage Error", 
        description: "Unable to complete emergency triage. If this is urgent, call emergency services directly.",
        variant: "destructive",
      });
      
      // Fallback emergency guidance
      setTriageResult({
        assessment: `Emergency Triage Unavailable\n\n⚠️ If you are experiencing:\n• Chest pain\n• Difficulty breathing\n• Severe bleeding\n• Loss of consciousness\n• Severe allergic reaction\n\nCALL EMERGENCY SERVICES IMMEDIATELY: 108 (India) / 911 (US)\n\nFor less urgent symptoms, contact your healthcare provider or visit the nearest hospital.`,
        timestamp: new Date(),
        symptoms: emergencySymptoms,
        fallback: true
      });
    } finally {
      setIsTriaging(false);
    }
  };

  const showRoute = (hospital: Hospital) => {
    if (!userLocation || !mapRef.current) return;

    // Remove existing route if any
    if (routingControlRef.current) {
      mapRef.current.removeControl(routingControlRef.current);
    }

    // Create new route
    routingControlRef.current = L.Routing.control({
      waypoints: [
        L.latLng(userLocation.lat, userLocation.lng),
        L.latLng(hospital.lat, hospital.lon)
      ],
      routeWhileDragging: false,
      showAlternatives: true,
      fitSelectedRoutes: true,
      lineOptions: {
        styles: [{ color: '#6366f1', weight: 6 }]
      },
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1'
      }),
      show: false,
      collapsible: true,
      collapsed: true,
      autoRoute: true,
      addWaypoints: false,
      draggableWaypoints: false,
      createMarker: function() { return null; }
    }).addTo(mapRef.current);

    // Add estimated time and distance to hospital info
    routingControlRef.current.on('routesfound', (e: any) => {
      const route = e.routes[0];
      const time = Math.round(route.summary.totalTime / 60);
      const distance = (route.summary.totalDistance / 1000).toFixed(1);
      
      toast({
        title: `Route to ${hospital.name}`,
        description: `Estimated time: ${time} minutes\nDistance: ${distance} km`,
      });

      // Hide routing container after route is found
      const routingContainer = document.querySelector('.leaflet-routing-container');
      if (routingContainer) {
        routingContainer.remove();
      }
    });
  };

  // Add this function after the showRoute function
  const openInGoogleMaps = (hospital: Hospital) => {
    if (!userLocation) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${hospital.lat},${hospital.lon}&travelmode=driving`;
    window.open(url, '_blank');
  };

  // Fetch nearby hospitals using Overpass API
  const fetchNearbyHospitals = async (lat: number, lon: number) => {
    try {
      // Search within a 25km radius and include more medical facilities
      const radius = 25000;
      const query = `
        [out:json][timeout:90];
        (
          // Hospitals
          node["amenity"="hospital"](around:${radius},${lat},${lon});
          way["amenity"="hospital"](around:${radius},${lat},${lon});
          relation["amenity"="hospital"](around:${radius},${lat},${lon});
          
          // Clinics
          node["amenity"="clinic"](around:${radius},${lat},${lon});
          way["amenity"="clinic"](around:${radius},${lat},${lon});
          
          // Medical Centers
          node["healthcare"="centre"](around:${radius},${lat},${lon});
          way["healthcare"="centre"](around:${radius},${lat},${lon});
          
          // Doctors
          node["healthcare"="doctor"](around:${radius},${lat},${lon});
          way["healthcare"="doctor"](around:${radius},${lat},${lon});
          
          // Emergency Medical Services
          node["emergency"="ambulance_station"](around:${radius},${lat},${lon});
          node["healthcare"="emergency"](around:${radius},${lat},${lon});
          
          // Additional Healthcare Facilities
          node["healthcare"="hospital"](around:${radius},${lat},${lon});
          way["healthcare"="hospital"](around:${radius},${lat},${lon});
          
          // Nursing Homes
          node["healthcare"="nursing_home"](around:${radius},${lat},${lon});
          way["healthcare"="nursing_home"](around:${radius},${lat},${lon});
          
          // Medical Labs
          node["healthcare"="laboratory"](around:${radius},${lat},${lon});
          way["healthcare"="laboratory"](around:${radius},${lat},${lon});
          
          // Pharmacies (for emergency medicines)
          node["amenity"="pharmacy"](around:${radius},${lat},${lon});
          way["amenity"="pharmacy"](around:${radius},${lat},${lon});
        );
        out body center;
        >;
        out skel qt;
      `;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
      });

      const data = await response.json();
      
      // Process and filter the results
      const processedHospitals: Hospital[] = data.elements
        .filter((element: any) => element.tags && element.tags.name)
        .map((element: any, index: number) => {
          const distance = calculateDistance(lat, lon, element.lat || element.center?.lat, element.lon || element.center?.lon);
          let facilityType = '';
          if (element.tags.amenity === 'hospital') facilityType = 'Hospital';
          else if (element.tags.amenity === 'clinic') facilityType = 'Clinic';
          else if (element.tags.healthcare === 'centre') facilityType = 'Medical Center';
          else if (element.tags.emergency === 'ambulance_station') facilityType = 'Ambulance Station';
          else if (element.tags.healthcare === 'emergency') facilityType = 'Emergency Service';
          else if (element.tags.healthcare === 'doctor') facilityType = 'Doctor';
          else if (element.tags.healthcare === 'nursing_home') facilityType = 'Nursing Home';
          else if (element.tags.healthcare === 'laboratory') facilityType = 'Medical Lab';
          else if (element.tags.amenity === 'pharmacy') facilityType = 'Pharmacy';
          else facilityType = 'Medical Facility';

          // Get the correct coordinates based on node or way type
          const latitude = element.lat || element.center?.lat;
          const longitude = element.lon || element.center?.lon;

          // Only return facilities with valid coordinates
          if (!latitude || !longitude) return null;

          return {
            id: element.id.toString(),
            name: element.tags.name,
            address: element.tags['addr:street'] 
              ? `${element.tags['addr:street']}${element.tags['addr:housenumber'] ? ' ' + element.tags['addr:housenumber'] : ''}`
              : element.tags['addr:full'] || element.tags.address || 'Address not available',
            phone: element.tags.phone || element.tags['contact:phone'] || element.tags['phone:emergency'] || 'Phone not available',
            lat: latitude,
            lon: longitude,
            distance: distance,
            type: facilityType,
            emergency: element.tags.emergency === 'yes' || 
                      element.tags.healthcare === 'emergency' ||
                      element.tags.amenity === 'hospital' ||
                      (element.tags.opening_hours === '24/7')
          };
        })
        .filter(Boolean) // Remove null entries
        .sort((a: Hospital, b: Hospital) => (a.distance || 0) - (b.distance || 0));

      // Limit to first 50 results to prevent performance issues
      const limitedResults = processedHospitals.slice(0, 50);
      setHospitals(limitedResults);
      console.log('Fetched medical facilities:', limitedResults);

      // Show toast with total results
      toast({
        title: "Medical Facilities Found",
        description: `Found ${processedHospitals.length} facilities. Showing nearest 50.`,
      });
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      toast({
        title: "Error",
        description: "Failed to fetch nearby hospitals. Using default list.",
        variant: "destructive",
      });
      // Use default hospital data if API fails
      const defaultHospitals = hospitalData.map(h => ({
        ...h,
        distance: calculateDistance(lat, lon, h.lat, h.lon),
        type: 'Hospital',
        emergency: true
      })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
      setHospitals(defaultHospitals);
    }
  };

  const useApproximateLocation = async (contextMessage?: string) => {
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (response.ok) {
        const data = await response.json();
        if (data.latitude && data.longitude) {
          const approxLocation = {
            lat: Number(data.latitude),
            lng: Number(data.longitude)
          };
          setUserLocation(approxLocation);
          await fetchNearbyHospitals(approxLocation.lat, approxLocation.lng);
          toast({
            title: "Approximate Location Detected",
            description: `Using network location${data.city ? ` near ${data.city}, ${data.region}` : ''}. ${contextMessage || ''}`.trim(),
          });
          return;
        }
      }
      throw new Error('Network lookup failed');
    } catch (err) {
      console.error('Network-based location fallback failed:', err);
      setUserLocation(DEFAULT_LOCATION);
      await fetchNearbyHospitals(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng);
      toast({
        title: "Location Unavailable",
        description: "Showing hospitals near New Delhi. Enable location for accurate results.",
        variant: "destructive",
      });
    }
  };

  // Get user location
  useEffect(() => {
    if (!userLocation && !locationError) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            setUserLocation({ lat: latitude, lng: longitude });
            await fetchNearbyHospitals(latitude, longitude);
            setLoading(false);
          },
          async (error) => {
            console.error('Error getting location:', error);
            setLocationError('Unable to get your location. Please enable location services.');
            await useApproximateLocation('Could not read GPS coordinates.');
            setLoading(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0,
          }
        );
      } else {
        setLocationError('Your browser does not support geolocation.');
        const initFallback = async () => {
          await useApproximateLocation('Browser does not expose GPS hardware.');
          setLoading(false);
        };
        initFallback();
      }
    }
  }, []);

  // Initialize map after component mounts and container is available
  useEffect(() => {
    if (userLocation && !mapInitialized && document.getElementById('map')) {
      console.log('Initializing map with user location:', userLocation);
      
      const container = document.getElementById('map');
      if (container && !mapRef.current) {
        try {
          // Clear any existing markers
          markersRef.current.forEach(marker => marker.remove());
          markersRef.current = [];

          // Initialize map
          mapRef.current = L.map('map');
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
          }).addTo(mapRef.current);

          // Add user marker
          const userIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          });

          const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
            .addTo(mapRef.current)
            .bindPopup('Your Location')
            .openPopup();
          markersRef.current.push(userMarker);

          // Add hospital markers
          const hospitalIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
          });

          // Add markers for hospitals
          hospitals.forEach(hospital => {
            console.log('Adding hospital marker:', hospital.name, hospital.lat, hospital.lon);
            
            const marker = L.marker([hospital.lat, hospital.lon], { icon: hospitalIcon })
              .addTo(mapRef.current!);
            markersRef.current.push(marker);

            const popupContent = document.createElement('div');
            popupContent.innerHTML = `
              <div class="hospital-popup">
                <h3 class="font-bold">${hospital.name}</h3>
                <p class="text-sm text-purple-600">${hospital.type}</p>
                ${hospital.address !== 'Address not available' ? `<p class="text-sm">${hospital.address}</p>` : ''}
                <p class="text-sm">Phone: ${hospital.phone}</p>
                <p class="text-sm text-blue-600">Distance: ${hospital.distance?.toFixed(1)} km</p>
                ${hospital.emergency ? '<p class="text-sm text-red-600">24/7 Emergency Services</p>' : ''}
                <div class="flex gap-2 mt-2">
                  <button class="get-directions bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-sm flex-1">Map Route</button>
                  <button class="google-maps bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-sm flex-1">Google Maps</button>
                </div>
              </div>
            `;

            const mapRouteButton = popupContent.querySelector('.get-directions');
            const googleMapsButton = popupContent.querySelector('.google-maps');
            
            if (mapRouteButton) {
              mapRouteButton.addEventListener('click', () => {
                showRoute(hospital);
                marker.closePopup();
              });
            }

            if (googleMapsButton) {
              googleMapsButton.addEventListener('click', () => {
                openInGoogleMaps(hospital);
                marker.closePopup();
              });
            }

            marker.bindPopup(popupContent);
          });

          // Smart zoom level calculation
          if (hospitals.length > 0) {
            const bounds = L.latLngBounds([userLocation.lat, userLocation.lng]);
            
            // Get the 3 nearest hospitals
            const nearestHospitals = hospitals.slice(0, 3);
            
            // Add user location and nearest hospitals to bounds
            bounds.extend([userLocation.lat, userLocation.lng]);
            nearestHospitals.forEach(hospital => {
              bounds.extend([hospital.lat, hospital.lon]);
            });

            // Calculate the maximum distance among the nearest hospitals
            const maxDistance = Math.max(...nearestHospitals.map(h => h.distance || 0));

            if (maxDistance <= 2) {
              // If hospitals are very close (within 2km)
              mapRef.current.setView([userLocation.lat, userLocation.lng], 15);
            } else if (maxDistance <= 5) {
              // If hospitals are moderately close (within 5km)
              mapRef.current.setView([userLocation.lat, userLocation.lng], 14);
            } else {
              // If hospitals are spread out, fit bounds with padding
              mapRef.current.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 15,  // Don't zoom in too far
                minZoom: 13   // Don't zoom out too far
              });
            }

            // Ensure all 3 nearest hospitals are visible
            const currentBounds = mapRef.current.getBounds();
            let allVisible = nearestHospitals.every(hospital => 
              currentBounds.contains([hospital.lat, hospital.lon])
            );

            if (!allVisible) {
              mapRef.current.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 14
              });
            }
          } else {
            // If no hospitals found, zoom to user location
            mapRef.current.setView([userLocation.lat, userLocation.lng], 14);
          }

          setMapInitialized(true);
          console.log('Map initialized successfully with', hospitals.length, 'hospitals');
        } catch (error) {
          console.error('Error initializing map:', error);
          toast({
            title: "Map Error",
            description: "There was an error initializing the map. Please refresh the page.",
            variant: "destructive",
          });
        }
      }
    }
  }, [userLocation, mapInitialized, hospitals]);

  // Cleanup
  useEffect(() => {
    return () => {
      // Clear all markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      if (mapRef.current) {
        if (routingControlRef.current) {
          mapRef.current.removeControl(routingControlRef.current);
        }
        mapRef.current.remove();
        mapRef.current = null;
        setMapInitialized(false);
      }
    };
  }, []);

  // Get displayed hospitals based on showAllHospitals state
  const displayedHospitals = showAllHospitals ? hospitals : hospitals.slice(0, 5);

  // Add function to handle resetting map view to user location
  const resetMapToUserLocation = () => {
    if (!userLocation || !mapRef.current) return;
    
    mapRef.current.setView([userLocation.lat, userLocation.lng], 13);
    
    toast({
      title: "Location Reset",
      description: "Map view centered to your location",
    });
  };

  // Add phone number validation function
  const validatePhoneNumber = (phone: string): boolean => {
    // Add your country-specific phone validation regex here
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    return phoneRegex.test(phone.replace(/[-\s]/g, ''));
  };

  return (
    // <Layout>
    <>
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-3 text-center lg:text-left">
          <span className="inline-flex items-center justify-center rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-600">
            Rapid Response
          </span>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Emergency Services</h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            Get instant AI triage, trigger SOS alerts, and navigate to the nearest 24/7 emergency facilities.
          </p>
        </header>

        <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start lg:gap-8 lg:space-y-0">
          <section className="space-y-6">
            {/* Emergency Triage with Dr. iSHA */}
            <Card className="border-orange-200 bg-orange-50/60 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                    <Stethoscope className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-orange-800">Emergency Medical Triage</h2>
                    <p className="text-sm text-orange-600">Describe symptoms and Dr. iSHA prioritizes urgency in seconds.</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  <div>
                    <Label htmlFor="symptoms" className="text-orange-700">
                      Describe your emergency symptoms:
                    </Label>
                    <Textarea
                      id="symptoms"
                      placeholder="Example: Severe chest pain, difficulty breathing, sudden headache..."
                      value={emergencySymptoms}
                      onChange={(e) => setEmergencySymptoms(e.target.value)}
                      className="mt-2 border-orange-200 focus:border-orange-500"
                      rows={3}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      onClick={performEmergencyTriage}
                      disabled={isTriaging || !emergencySymptoms.trim()}
                      className="flex-1 bg-orange-600 text-white hover:bg-orange-700"
                    >
                      {isTriaging ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Dr. iSHA Analyzing...
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          Get Emergency Triage
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => setShowTriageDialog(true)}
                      disabled={!triageResult}
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    >
                      View Results
                    </Button>
                  </div>

                  {triageResult && (
                    <div className="rounded-lg border border-orange-200 bg-white p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        <span className="font-medium text-orange-800">Emergency assessment complete</span>
                      </div>
                      <p className="text-sm text-orange-600">
                        Dr. iSHA has analyzed your symptoms. Review the detailed guidance in the results panel.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* SOS + Contacts */}
            <Card className="border-red-200 bg-gradient-to-br from-red-50 via-orange-50 to-white shadow-sm">
              <CardContent className="space-y-5 p-6">
                <div className="space-y-1 text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Immediate SOS</p>
                  <h2 className="text-2xl font-bold text-red-700">Trigger emergency alerts</h2>
                  <p className="text-sm text-muted-foreground">
                    Share live location with trusted contacts and auto-dial emergency services.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)]">
                  <Button
                    size="lg"
                    variant={isSOSActive ? "destructive" : "default"}
                    className={`relative flex h-28 w-full flex-col items-center justify-center overflow-hidden rounded-xl text-2xl font-bold ${
                      isSOSActive ? 'animate-pulse bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'
                    }`}
                    onClick={handleSOS}
                    disabled={isSOSActive}
                  >
                    <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                      <span>{isSOSActive ? "SOS ACTIVATED" : "SOS"}</span>
                      <span className="text-sm font-normal">
                        {isSOSActive ? "Contacting Emergency Services..." : "Press for Emergency"}
                      </span>
                    </div>
                    {isSOSActive && (
                      <div className="absolute inset-0 z-0 rounded-xl bg-red-500 opacity-70 pointer-events-none animate-ping" />
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="h-14 w-full border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center gap-2"
                    onClick={() => setIsEditingContacts(true)}
                  >
                    <Users className="h-5 w-5" />
                    Manage Emergency Contacts
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Numbers */}
            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Emergency Numbers</h3>
                <p className="text-sm text-muted-foreground">
                  Quick access to national emergency helplines.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                        <Phone className="h-6 w-6 text-red-600" />
                      </div>
                      <span className="text-lg font-medium">Ambulance</span>
                      <span className="mb-3 text-sm text-gray-600">Medical Emergency</span>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full border-red-200 bg-red-50 hover:bg-red-100"
                        onClick={() => callHospital("102")}
                      >
                        <Phone className="mr-2 h-4 w-4 text-red-600" />
                        <span className="font-semibold text-red-600">102</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                        <Phone className="h-6 w-6 text-blue-600" />
                      </div>
                      <span className="text-lg font-medium">Police</span>
                      <span className="mb-3 text-sm text-gray-600">Law Enforcement</span>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full border-blue-200 bg-blue-50 hover:bg-blue-100"
                        onClick={() => callHospital("100")}
                      >
                        <Phone className="mr-2 h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-blue-600">100</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                        <Phone className="h-6 w-6 text-orange-600" />
                      </div>
                      <span className="text-lg font-medium">Fire</span>
                      <span className="mb-3 text-sm text-gray-600">Fire Emergency</span>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full border-orange-200 bg-orange-50 hover:bg-orange-100"
                        onClick={() => callHospital("101")}
                      >
                        <Phone className="mr-2 h-4 w-4 text-orange-600" />
                        <span className="font-semibold text-orange-600">101</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>
          </section>

          <section className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader className="space-y-1 pb-0">
                <CardTitle className="text-xl">Live Map & Directions</CardTitle>
                <CardDescription>Locate emergency-ready hospitals and re-center to your position anytime.</CardDescription>
              </CardHeader>
              <CardContent className="relative p-0">
                <div
                  id="map"
                  className="h-[420px] w-full rounded-b-xl"
                  style={{ zIndex: 0 }}
                />

                {loading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-b-xl bg-white/80 backdrop-blur">
                    <Loader2 className="h-6 w-6 animate-spin text-red-500" />
                    <span className="mt-2 text-sm font-medium text-gray-600">Locating nearby hospitals...</span>
                  </div>
                )}

                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute bottom-4 left-4 h-14 w-14 rounded-full bg-white shadow-lg transition-transform hover:scale-105"
                  onClick={resetMapToUserLocation}
                >
                  <Locate className="h-6 w-6 text-blue-600" />
                </Button>
                {locationError && (
                  <div className="absolute bottom-4 right-4 rounded-md border border-yellow-400 bg-yellow-100 px-4 py-2 text-sm text-yellow-700">
                    {locationError}
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Nearby Hospitals</p>
                  <h2 className="text-2xl font-semibold leading-tight">Emergency-ready facilities</h2>
                </div>
                {!loading && hospitals.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    Showing {showAllHospitals ? hospitals.length : Math.min(5, hospitals.length)} of {hospitals.length} facilities
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2 text-sm">Finding nearby hospitals...</span>
                </div>
              ) : (
                <>
                  <div className="grid gap-4">
                    {displayedHospitals.map((hospital) => (
                      <Card key={hospital.id} className="hover:shadow-lg transition-shadow">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-4">
                            <div className="flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-bold">{hospital.name}</h3>
                                {hospital.emergency && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                    24/7
                                  </span>
                                )}
                              </div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                                  {hospital.type}
                                </span>
                                {hospital.distance && (
                                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                                    {hospital.distance.toFixed(1)} km away
                                  </span>
                                )}
                              </div>
                              {hospital.address !== 'Address not available' && (
                                <p className="mb-1 flex items-center gap-1 text-sm text-gray-600">
                                  <MapPin className="h-4 w-4" />
                                  {hospital.address}
                                </p>
                              )}
                              {hospital.phone && hospital.phone !== 'Phone not available' && (
                                <p className="flex items-center gap-1 text-sm text-gray-600">
                                  <Phone className="h-4 w-4" />
                                  {hospital.phone}
                                </p>
                              )}
                            </div>
                            <div className="flex w-40 flex-col gap-2">
                              {hospital.phone && hospital.phone !== 'Phone not available' && (
                                <Button variant="outline" size="sm" onClick={() => callHospital(hospital.phone!)}>
                                  <Phone className="mr-2 h-4 w-4" />Call
                                </Button>
                              )}
                              <Button size="sm" onClick={() => showRoute(hospital)}>
                                <MapPin className="mr-2 h-4 w-4" />Map Route
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                onClick={() => openInGoogleMaps(hospital)}
                              >
                                <MapPin className="mr-2 h-4 w-4" />Google Maps
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {hospitals.length > 5 && (
                    <Button
                      variant="outline"
                      className="w-full py-5 text-base hover:bg-gray-100"
                      onClick={() => setShowAllHospitals(!showAllHospitals)}
                    >
                      {showAllHospitals ? 'Show fewer hospitals' : `Show more (${hospitals.length - 5} more)`}
                    </Button>
                  )}
                </>
              )}
            </section>
          </section>
        </div>
      </div>

      {/* Emergency Triage Results Dialog */}
      <Dialog open={showTriageDialog} onOpenChange={setShowTriageDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-orange-600" />
              Emergency Medical Assessment - Dr. iSHA
            </DialogTitle>
            <DialogDescription>
              {triageResult ? (
                <div className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="h-4 w-4" />
                  Assessment completed at {triageResult.timestamp.toLocaleString()}
                </div>
              ) : (
                "Emergency medical guidance from Dr. iSHA"
              )}
            </DialogDescription>
          </DialogHeader>
          
          {triageResult && (
            <div className="space-y-4">
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <h3 className="font-semibold text-orange-800 mb-2">Your Symptoms:</h3>
                <p className="text-orange-700">{triageResult.symptoms}</p>
              </div>
              
              <div className="p-4 bg-white rounded-lg border">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Dr. iSHA's Emergency Assessment:
                </h3>
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-gray-700">
                    {triageResult.assessment}
                  </div>
                </div>
              </div>
              
              {triageResult.fallback && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="font-semibold text-red-800">Service Unavailable</span>
                  </div>
                  <p className="text-red-700 text-sm">
                    Dr. iSHA's emergency triage service is currently unavailable. The above is fallback emergency guidance.
                  </p>
                </div>
              )}
              
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => window.location.href = 'tel:108'}
                  className="bg-red-600 hover:bg-red-700 text-white flex-1"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call Emergency (108)
                </Button>
                
                <Button
                  variant="outline" 
                  onClick={() => setShowTriageDialog(false)}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditingContacts} onOpenChange={setIsEditingContacts}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Emergency Contacts</DialogTitle>
            <DialogDescription>
              Add or remove emergency contacts who will receive SOS messages with your location.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Contact Name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="Phone Number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="relationship">Relationship</Label>
              <Input
                id="relationship"
                value={newContact.relationship}
                onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                placeholder="Relationship (e.g., Parent, Spouse)"
              />
            </div>
            <Button onClick={addEmergencyContact}>Add Contact</Button>
            
            <div className="mt-4">
              <h4 className="mb-2 font-semibold">Current Emergency Contacts</h4>
              {emergencyContacts.map((contact, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b">
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-sm text-gray-600">{contact.phone}</p>
                    <p className="text-sm text-gray-500">{contact.relationship}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeEmergencyContact(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
    // </Layout>
  );
};

export default Emergency; 