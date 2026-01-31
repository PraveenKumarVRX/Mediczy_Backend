/**
 * Hospital Insurance Claims Dashboard
 * Comprehensive insurance claims management system integrated with hospital portal
 */

import HospitalLayout from "@/components/hospital/HospitalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  DollarSign, 
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  Download
} from "lucide-react";

const HospitalInsuranceClaimsDashboard = () => {
  // Sample data - in production, fetch from API
  const metrics = [
    { 
      label: "Total Claims", 
      value: "1,234", 
      trend: "+12%", 
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-500/10"
    },
    { 
      label: "Pending Claims", 
      value: "45", 
      trend: "-8%", 
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-500/10"
    },
    { 
      label: "Approved Amount", 
      value: "₹12.5L", 
      trend: "+18%", 
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-500/10"
    },
    { 
      label: "Approval Rate", 
      value: "87%", 
      trend: "+5%", 
      icon: TrendingUp,
      color: "text-teal-600",
      bg: "bg-teal-500/10"
    },
  ];

  const recentClaims = [
    { id: "CLM-2024-001", patient: "John Doe", provider: "ICICI Lombard", amount: "₹25,000", status: "Approved", date: "Jan 30, 2026" },
    { id: "CLM-2024-002", patient: "Jane Smith", provider: "Star Health", amount: "₹18,500", status: "Pending", date: "Jan 29, 2026" },
    { id: "CLM-2024-003", patient: "Mike Johnson", provider: "HDFC ERGO", amount: "₹32,000", status: "Query", date: "Jan 28, 2026" },
    { id: "CLM-2024-004", patient: "Sarah Williams", provider: "Care Health", amount: "₹45,000", status: "Approved", date: "Jan 27, 2026" },
    { id: "CLM-2024-005", patient: "Robert Brown", provider: "Max Bupa", amount: "₹28,500", status: "Processing", date: "Jan 26, 2026" },
  ];

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved": return "text-green-600 bg-green-500/10";
      case "pending": return "text-blue-600 bg-blue-500/10";
      case "query": return "text-amber-600 bg-amber-500/10";
      case "processing": return "text-purple-600 bg-purple-500/10";
      case "rejected": return "text-red-600 bg-red-500/10";
      default: return "text-slate-600 bg-slate-500/10";
    }
  };

  return (
    <HospitalLayout 
      title="Insurance Claims Dashboard" 
      subtitle="Manage insurance claims, pre-authorizations, and settlements"
    >
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button className="bg-gradient-to-r from-teal-500 to-teal-600">
          <FileText className="w-4 h-4 mr-2" />
          Create New Claim
        </Button>
        <Button variant="outline">
          <Shield className="w-4 h-4 mr-2" />
          Pre-Authorization
        </Button>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const isPositive = metric.trend.startsWith('+');
          
          return (
            <Card key={index} className="hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className={`${metric.bg} p-3 rounded-xl`}>
                    <Icon className={`w-6 h-6 ${metric.color}`} />
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    {isPositive ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className={isPositive ? "text-green-600" : "text-red-600"}>
                      {metric.trend}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">{metric.label}</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{metric.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Claims Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Recent Claims</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search claims..." 
                  className="pl-10 w-64"
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Claim ID</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Patient</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Provider</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Amount</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentClaims.map((claim) => (
                  <tr 
                    key={claim.id} 
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-white">
                      {claim.id}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {claim.patient}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {claim.provider}
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white">
                      {claim.amount}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(claim.status)}`}>
                        {claim.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {claim.date}
                    </td>
                    <td className="py-3 px-4">
                      <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700 hover:bg-teal-500/10">
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Showing 5 of 1,234 claims
            </p>
            <Button variant="outline" size="sm">
              View All Claims
            </Button>
          </div>
        </CardContent>
      </Card>
    </HospitalLayout>
  );
};

export default HospitalInsuranceClaimsDashboard;
