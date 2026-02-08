import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building,
  Users,
  TrendingUp,
  Heart,
  CheckCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import AggregatorLayout from "@/components/aggregator/AggregatorLayout";
import api from "@/utils/api";

const AggregatorDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [aggInfo, setAggInfo] = useState<any>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const aggData = localStorage.getItem("aggregatorData");
      if (aggData) {
        setAggInfo(JSON.parse(aggData));
      }

      const response = await api.get("/aggregator-auth/dashboard");
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
      <AggregatorLayout title="Dashboard" subtitle="Manage your aggregator network">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        </div>
      </AggregatorLayout>
    );
  }

  return (
    <AggregatorLayout title="Dashboard" subtitle="Manage your aggregator network">
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                Welcome back, {dashboardData?.organizationName || aggInfo?.brokerName || "Organization"}!
              </h2>
              <p className="text-indigo-100">
                Manage your corporate network, wellness partners, and employee benefits
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

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Corporates */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-500" />
                Corporates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {dashboardData?.totalCorporates || 0}
              </div>
              <p className="text-xs text-slate-400 mt-1">In your network</p>
            </CardContent>
          </Card>

          {/* Employees */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-green-500" />
                Employees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {dashboardData?.totalEmployees || 0}
              </div>
              <p className="text-xs text-slate-400 mt-1">Total covered</p>
            </CardContent>
          </Card>

          {/* Wellness Partners */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                Wellness Partners
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {dashboardData?.totalPartners || 0}
              </div>
              <p className="text-xs text-slate-400 mt-1">In network</p>
            </CardContent>
          </Card>

          {/* Total Policies */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                Policies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {dashboardData?.totalPolicies || 0}
              </div>
              <p className="text-xs text-slate-400 mt-1">Active</p>
            </CardContent>
          </Card>
        </div>

        {/* Organization Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Organization Info */}
          <Card className="lg:col-span-2 border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>Your organization information and credentials</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Organization Name</p>
                    <p className="text-white font-medium">{dashboardData?.organizationName || aggInfo?.brokerName || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Business Type</p>
                    <p className="text-white font-medium">{aggInfo?.businessType || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Status</p>
                    <Badge className={`${dashboardData?.status === "active" ? "bg-green-500" : "bg-yellow-500"} text-white`}>
                      {dashboardData?.status || "—"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Email</p>
                    <p className="text-white font-medium">{aggInfo?.email || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-slate-400">Address</p>
                    <p className="text-white font-medium">
                      {aggInfo?.officeAddress
                        ? `${aggInfo.officeAddress}, ${aggInfo.city}, ${aggInfo.state} - ${aggInfo.pincode}`
                        : "—"
                      }
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-4">
                  <Button
                    onClick={() => navigate("/aggregator/settings")}
                    variant="outline"
                    className="w-full border-slate-600 text-indigo-400 hover:text-indigo-300"
                  >
                    Edit Organization
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Info */}
          <Card className="border-slate-700 bg-slate-800/50">
            <CardHeader>
              <CardTitle>Verification Status</CardTitle>
              <CardDescription>Organization credentials</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-400">Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    {dashboardData?.isVerified ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-white font-medium">Verified</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                        <span className="text-white font-medium">Pending</span>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-slate-400">PAN</p>
                  <p className="text-white font-medium mt-1">{aggInfo?.panNumber || "—"}</p>
                </div>

                <div>
                  <p className="text-sm text-slate-400">GSTIN</p>
                  <p className="text-white font-medium mt-1">{aggInfo?.gstin || "—"}</p>
                </div>

                <div>
                  <p className="text-sm text-slate-400">Contact</p>
                  <p className="text-white font-medium mt-1">{aggInfo?.phoneNumber || "—"}</p>
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
                onClick={() => navigate("/aggregator/corporates")}
                className="border-slate-600 text-indigo-400 hover:text-indigo-300 h-auto py-3"
              >
                <Building className="w-5 h-5 mr-2" />
                Manage Corporates
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/aggregator/partners")}
                className="border-slate-600 text-indigo-400 hover:text-indigo-300 h-auto py-3"
              >
                <Heart className="w-5 h-5 mr-2" />
                Wellness Partners
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/aggregator/reports")}
                className="border-slate-600 text-indigo-400 hover:text-indigo-300 h-auto py-3"
              >
                <TrendingUp className="w-5 h-5 mr-2" />
                View Reports
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/aggregator/analytics")}
                className="border-slate-600 text-indigo-400 hover:text-indigo-300 h-auto py-3"
              >
                <TrendingUp className="w-5 h-5 mr-2" />
                Analytics
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AggregatorLayout>
  );
};

export default AggregatorDashboard;
