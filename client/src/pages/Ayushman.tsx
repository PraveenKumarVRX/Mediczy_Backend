import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  Hospital, 
  Users, 
  Search, 
  MapPin, 
  Phone,
  FileText,
  CheckCircle2,
  Clock,
  BadgeIndianRupee,
  Building2,
  Volume,
  Languages,
  Loader2,
  Search as SearchIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import api from "@/utils/api";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AyushmanDetails {
  cardNumber: string;
  beneficiaryName: string;
  familyMembers: number;
  validUntil: string;
  status: string;
  availableBalance: string;
  usedAmount: string;
}

interface Hospital {
  id: number;
  name: string;
  distance: string;
  address: string;
  phone: string;
  specialties: string[];
  rating: number;
  waitTime: string;
}

interface Claim {
  id: string;
  date: string;
  hospital: string;
  treatment: string;
  amount: number;
  status: string;
}

const LoadingCard = () => (
  <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
    <CardHeader className="space-y-2">
      <Skeleton className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700" />
      <Skeleton className="h-6 w-2/3 bg-slate-200 dark:bg-slate-700" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-20 w-full bg-slate-200 dark:bg-slate-700" />
    </CardContent>
  </Card>
);

const LoadingHospital = () => (
  <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3 bg-white dark:bg-slate-800/50">
    <Skeleton className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700" />
    <Skeleton className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700" />
    <div className="flex gap-2">
      <Skeleton className="h-6 w-20 bg-slate-200 dark:bg-slate-700" />
      <Skeleton className="h-6 w-20 bg-slate-200 dark:bg-slate-700" />
      <Skeleton className="h-6 w-20 bg-slate-200 dark:bg-slate-700" />
    </div>
  </div>
);

const LoadingClaim = () => (
  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
    <div className="space-y-2">
      <Skeleton className="h-5 w-40 bg-slate-200 dark:bg-slate-700" />
      <Skeleton className="h-4 w-32 bg-slate-200 dark:bg-slate-700" />
      <Skeleton className="h-4 w-24 bg-slate-200 dark:bg-slate-700" />
    </div>
    <Skeleton className="h-8 w-24 bg-slate-200 dark:bg-slate-700" />
  </div>
);

const Ayushman = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [ayushmanDetails, setAyushmanDetails] = useState<AyushmanDetails | null>(null);
  const [nearbyHospitals, setNearbyHospitals] = useState<Hospital[]>([]);
  const [recentClaims, setRecentClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState({
    details: false,
    hospitals: false,
    claims: false,
    verification: false
  });
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [verificationDetails, setVerificationDetails] = useState({
    cardNumber: "",
    mobileNumber: "",
    dateOfBirth: ""
  });
  const [isVerified, setIsVerified] = useState(false);

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = selectedLanguage;
    window.speechSynthesis.speak(utterance);
  };

  const handleVerification = async () => {
    if (!verificationDetails.cardNumber || !verificationDetails.mobileNumber || !verificationDetails.dateOfBirth) {
      toast.error("Please fill in all verification details");
      return;
    }

    setLoading(prev => ({ ...prev, verification: true }));
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate verification success
      setIsVerified(true);
      fetchUserData();
      toast.success("Verification successful!");
    } catch (error) {
      toast.error("Verification failed. Please try again.");
    } finally {
      setLoading(prev => ({ ...prev, verification: false }));
    }
  };

  const fetchUserData = async () => {
    setLoading({
      details: true,
      hospitals: true,
      claims: true,
      verification: false
    });

    try {
      // Simulate API calls with delays
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate data for demo
      const mockData = {
        details: {
          data: {
            cardNumber: verificationDetails.cardNumber,
            beneficiaryName: "Rajesh Kumar",
            familyMembers: 4,
            validUntil: "2025-12-31",
            status: "Active",
            availableBalance: "₹5,00,000",
            usedAmount: "₹1,25,000"
          }
        },
        hospitals: {
          data: [
            {
              id: 1,
              name: "City General Hospital",
              distance: "2.5 km",
              address: "123 Healthcare Lane, New Delhi",
              phone: "+91 98765 43210",
              specialties: ["General Medicine", "Cardiology", "Orthopedics"],
              rating: 4.5,
              waitTime: "15 mins"
            },
            {
              id: 2,
              name: "Apollo Hospital",
              distance: "4.1 km",
              address: "456 Medical Road, New Delhi",
              phone: "+91 98765 43211",
              specialties: ["Neurology", "Oncology", "Pediatrics"],
              rating: 4.8,
              waitTime: "30 mins"
            }
          ]
        },
        claims: {
          data: [
            {
              id: "CLM001",
              date: "2024-02-15",
              hospital: "City General Hospital",
              treatment: "Knee Surgery",
              amount: 75000,
              status: "Approved"
            },
            {
              id: "CLM002",
              date: "2024-01-20",
              hospital: "Apollo Hospital",
              treatment: "Medical Tests",
              amount: 25000,
              status: "Processing"
            }
          ]
        }
      };

      setAyushmanDetails(mockData.details.data);
      setNearbyHospitals(mockData.hospitals.data);
      setRecentClaims(mockData.claims.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data. Please try again later.');
    } finally {
      setLoading({
        details: false,
        hospitals: false,
        claims: false,
        verification: false
      });
    }
  };

  const filteredHospitals = nearbyHospitals.filter((hospital) =>
    hospital.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hospital.specialties.some(specialty => 
      specialty.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const calculateUsagePercentage = () => {
    if (!ayushmanDetails) return 0;
    const used = parseInt(ayushmanDetails.usedAmount.replace(/[^0-9]/g, ''));
    const total = parseInt(ayushmanDetails.availableBalance.replace(/[^0-9]/g, ''));
    return (used / total) * 100;
  };

  return (
    // <MainLayout>
      <div className="container py-6 space-y-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Ayushman Bharat</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-[100px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white">
                <Languages className="h-4 w-4 mr-2 text-teal-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectItem value="en" className="text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700">English</SelectItem>
                <SelectItem value="hi" className="text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700">हिंदी</SelectItem>
                <SelectItem value="bn" className="text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700">বাংলা</SelectItem>
                <SelectItem value="te" className="text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700">తెలుగు</SelectItem>
                <SelectItem value="ta" className="text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700">தமிழ்</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => speak("Welcome to Ayushman Bharat")}
              className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <Volume className="h-4 w-4 text-teal-500" />
            </Button>
          </div>
        </div>

        {!isVerified ? (
          <Card className="mb-8 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
                <SearchIcon className="h-5 w-5 text-teal-500" />
                Verify Your Ayushman Card
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  placeholder="Card Number"
                  value={verificationDetails.cardNumber}
                  onChange={(e) => setVerificationDetails(prev => ({
                    ...prev,
                    cardNumber: e.target.value
                  }))}
                  className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500"
                />
                <Input
                  placeholder="Mobile Number"
                  value={verificationDetails.mobileNumber}
                  onChange={(e) => setVerificationDetails(prev => ({
                    ...prev,
                    mobileNumber: e.target.value
                  }))}
                  className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500"
                />
                <Input
                  type="date"
                  placeholder="Date of Birth"
                  value={verificationDetails.dateOfBirth}
                  onChange={(e) => setVerificationDetails(prev => ({
                    ...prev,
                    dateOfBirth: e.target.value
                  }))}
                  className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>
              <Button 
                className="mt-4 w-full bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-600 dark:hover:bg-teal-700"
                onClick={handleVerification}
                disabled={loading.verification}
              >
                {loading.verification && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify Details
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-3 mb-8">
              {loading.details ? (
                <>
                  <LoadingCard />
                  <LoadingCard />
                  <LoadingCard />
                </>
              ) : ayushmanDetails ? (
                <>
                  <Card className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/20 dark:to-slate-800/50 border-slate-200 dark:border-slate-700">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">Card Status</CardTitle>
                      <Shield className="h-4 w-4 text-teal-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                        {ayushmanDetails.status}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Valid until {ayushmanDetails.validUntil}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 border-slate-200 dark:border-slate-700">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">Balance</CardTitle>
                      <BadgeIndianRupee className="h-4 w-4 text-teal-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-slate-800 dark:text-white">{ayushmanDetails.availableBalance}</div>
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400">Used: {ayushmanDetails.usedAmount}</span>
                          <span className="text-slate-500 dark:text-slate-400">{calculateUsagePercentage().toFixed(1)}%</span>
                        </div>
                        <Progress value={calculateUsagePercentage()} className="h-2 bg-slate-200 dark:bg-slate-700 [&>div]:bg-teal-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/50 dark:to-slate-800/30 border-slate-200 dark:border-slate-700">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">Family Members</CardTitle>
                      <Users className="h-4 w-4 text-teal-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-slate-800 dark:text-white">{ayushmanDetails.familyMembers}</div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Covered under this policy
                      </p>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="col-span-3 text-center py-8 text-slate-500 dark:text-slate-400">
                  Unable to fetch card details
                </div>
              )}
            </div>

            <Card className="mb-8 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
                  <Building2 className="h-5 w-5 text-teal-500" />
                  Find Nearby Hospitals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <Input
                    className="pl-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-500 focus:ring-teal-500"
                    placeholder="Search hospitals or specialties..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {loading.hospitals ? (
                      <>
                        <LoadingHospital />
                        <LoadingHospital />
                        <LoadingHospital />
                      </>
                    ) : (
                      filteredHospitals.map((hospital) => (
                        <div key={hospital.id} className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 bg-white dark:bg-slate-800/30 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-slate-800 dark:text-white">{hospital.name}</h3>
                            <Badge variant="outline" className="border-teal-500 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20">{hospital.distance}</Badge>
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-teal-500" />
                              {hospital.address}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Phone className="h-4 w-4 text-teal-500" />
                              {hospital.phone}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {hospital.specialties.map((specialty, index) => (
                              <Badge key={index} variant="secondary" className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-0">
                                {specialty}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
                  <FileText className="h-5 w-5 text-teal-500" />
                  Recent Claims
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading.claims ? (
                  <div className="space-y-4">
                    <LoadingClaim />
                    <LoadingClaim />
                    <LoadingClaim />
                  </div>
                ) : recentClaims.length > 0 ? (
                  <div className="space-y-4">
                    {recentClaims.map((claim) => (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <div>
                          <h3 className="font-semibold text-slate-800 dark:text-white">{claim.hospital}</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {claim.treatment} • {claim.date}
                          </p>
                          <p className="text-sm font-medium text-teal-600 dark:text-teal-400">₹{claim.amount.toLocaleString()}</p>
                        </div>
                        <Badge variant={claim.status === "Approved" ? "outline" : "secondary"} className={claim.status === "Approved" ? "border-teal-500 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20" : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-0"}>
                          {claim.status === "Approved" ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <Clock className="h-3 w-3 mr-1" />
                          )}
                          {claim.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    No recent claims found
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    // </MainLayout>
  );
};

export default Ayushman; 