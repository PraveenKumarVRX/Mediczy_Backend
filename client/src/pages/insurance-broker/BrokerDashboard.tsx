import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Users,
  TrendingUp,
  DollarSign,
  Shield,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import BrokerLayout from "@/components/insurance-broker/BrokerLayout";
import api from "@/utils/api";

const BrokerDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [brokerInfo, setBrokerInfo] = useState<any>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const brokerData = localStorage.getItem("insuranceBrokerData");
      if (brokerData) {
        setBrokerInfo(JSON.parse(brokerData));
      }

      const response = await api.get("/insurance-broker/dashboard");
      if (response.data?.success) {
        setDashboardData(response.data.dashboard);
      }
    } catch (error: any) {
      console.error("Failed to load dashboard data", error);
      toast.error(error?.response?.data?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <BrokerLayout title="Dashboard" subtitle="Welcome back to your insurance broker portal">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </BrokerLayout>
    );
  }

  return (
    <BrokerLayout title="Dashboard" subtitle="Welcome back to your InsureCorrect broker portal">
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                Welcome back, {dashboardData?.brokerName || "Broker"}!
              </h2>
              <p className="text-blue-100">
                Manage your policies, track commissions, and grow your business
              </p>
            </div>
            <div className="flex items-center gap-2">
              {dashboardData?.isVerified ? (
                <Badge className="bg-green-500 text-white">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              ) : (
                <Badge className="bg-yellow-500 text-white">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Pending Verification
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Key Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Policies */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                Total Policies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {dashboardData?.totalPolicies || 0}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {dashboardData?.activePolicies || 0} active
              </p>
            </CardContent>
          </Card>

          {/* Active Policies */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Active Policies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {dashboardData?.activePolicies || 0}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {dashboardData?.pendingPolicies || 0} pending
              </p>
            </CardContent>
          </Card>

          {/* Total Premium Facilitated */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-yellow-500" />
                Premium Facilitated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                ₹{(dashboardData?.totalPremiumFacilitated || 0).toLocaleString("en-IN")}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Total managed premium
              </p>
            </CardContent>
          </Card>

          {/* Commission Rate */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                Commission Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {dashboardData?.commissionPercentage || 0}%
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Your earning rate
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Details Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Broker Information */}
          <Card className="lg:col-span-2 border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle>Broker Information</CardTitle>
              <CardDescription>Your business details and credentials</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Broker Name</p>
                    <p className="text-white font-medium">{dashboardData?.brokerName || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">License Number</p>
                    <p className="text-white font-medium">{brokerInfo?.irdaiLicenseNumber || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Business Type</p>
                    <p className="text-white font-medium">{brokerInfo?.businessType || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Status</p>
                    <Badge className={`${brokerInfo?.status === "active" ? "bg-green-500" : "bg-yellow-500"} text-white`}>
                      {brokerInfo?.status || "—"}
                    </Badge>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-slate-400">Office Address</p>
                    <p className="text-white font-medium">
                      {brokerInfo?.officeAddress
                        ? `${brokerInfo.officeAddress}, ${brokerInfo.city}, ${brokerInfo.state} - ${brokerInfo.pincode}`
                        : "—"
                      }
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-4">
                  <Button
                    onClick={() => navigate("/insurance-broker/profile")}
                    variant="outline"
                    className="w-full border-slate-600 text-blue-400 hover:text-blue-300"
                  >
                    Edit Profile
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* License Information */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle>License</CardTitle>
              <CardDescription>Your IRDAI credentials</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-400">License Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    {dashboardData?.isVerified ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-white font-medium">Active & Verified</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                        <span className="text-white font-medium">Pending Verification</span>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-slate-400">Validity Date</p>
                  <p className="text-white font-medium mt-1">
                    {dashboardData?.licenseValidityDate
                      ? new Date(dashboardData.licenseValidityDate).toLocaleDateString("en-IN")
                      : "—"
                    }
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-400">PAN</p>
                  <p className="text-white font-medium mt-1">{brokerInfo?.panNumber || "—"}</p>
                </div>

                <div>
                  <p className="text-sm text-slate-400">GSTIN</p>
                  <p className="text-white font-medium mt-1">{brokerInfo?.gstin || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-slate-700 bg-slate-800/50">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Button
                variant="outline"
                onClick={() => navigate("/insurance-broker/policies")}
                className="border-slate-600 text-blue-400 hover:text-blue-300 h-auto py-3"
              >
                <FileText className="w-5 h-5 mr-2" />
                View Policies
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/insurance-broker/corporates")}
                className="border-slate-600 text-blue-400 hover:text-blue-300 h-auto py-3"
              >
                <Users className="w-5 h-5 mr-2" />
                Manage Corporates
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/insurance-broker/commissions")}
                className="border-slate-600 text-blue-400 hover:text-blue-300 h-auto py-3"
              >
                <DollarSign className="w-5 h-5 mr-2" />
                Track Commissions
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/insurance-broker/reports")}
                className="border-slate-600 text-blue-400 hover:text-blue-300 h-auto py-3"
              >
                <TrendingUp className="w-5 h-5 mr-2" />
                View Reports
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </BrokerLayout>
  );
};

export default BrokerDashboard;
