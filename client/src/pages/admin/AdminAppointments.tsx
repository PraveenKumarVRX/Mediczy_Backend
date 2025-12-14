import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  Video,
  Phone,
  MessageSquare,
  User,
  Stethoscope,
  Loader2,
  Filter,
  Search,
  Download,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
import AdminLayout from "@/components/layout/AdminLayout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface Appointment {
  id: number;
  userId: number;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  doctorId: number;
  doctorName: string;
  specialization: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  consultationType: string;
  consultationFee: number;
  paymentStatus: string;
  symptoms?: string;
  reason?: string;
  createdAt: string;
}

const AdminAppointments = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("all");

  // Fetch all appointments with admin token
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["adminAppointments"],
    queryFn: async () => {
      const adminToken = localStorage.getItem('adminToken');
      const { data } = await api.get('/appointments', {
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      return data.appointments || [];
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["appointmentStats"],
    queryFn: async () => {
      const adminToken = localStorage.getItem('adminToken');
      const { data } = await api.get('/appointments/stats/overview', {
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      return data;
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-700",
      confirmed: "bg-green-100 text-green-700",
      "in-progress": "bg-purple-100 text-purple-700",
      completed: "bg-emerald-100 text-emerald-700",
      cancelled: "bg-red-100 text-red-700",
      "no-show": "bg-gray-100 text-gray-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      paid: "bg-green-100 text-green-700",
      pending: "bg-yellow-100 text-yellow-700",
      refunded: "bg-orange-100 text-orange-700",
      failed: "bg-red-100 text-red-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  const getConsultationIcon = (type: string) => {
    switch (type) {
      case "online":
      case "video":
      case "audio":
      case "chat":
        return <Video className="h-4 w-4" />;
      case "in-person":
        return <User className="h-4 w-4" />;
      default:
        return <Video className="h-4 w-4" />;
    }
  };

  const getConsultationLabel = (type: string) => {
    switch (type) {
      case "online":
      case "video":
      case "audio":
      case "chat":
        return "Online";
      case "in-person":
        return "In-Person";
      default:
        return "Online";
    }
  };

  const handleExport = () => {
    toast({
      title: "Export Started",
      description: "Your appointment report is being generated",
    });
  };

  // Filter appointments
  const filteredAppointments = appointments.filter((appointment: Appointment) => {
    const matchesSearch =
      appointment.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appointment.patientEmail.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === "all" || appointment.status === filterStatus;
    const matchesPayment = filterPaymentStatus === "all" || appointment.paymentStatus === filterPaymentStatus;

    return matchesSearch && matchesStatus && matchesPayment;
  });

  // Group by status
  const statusCounts = {
    all: appointments.length,
    scheduled: appointments.filter((a: Appointment) => a.status === "scheduled").length,
    confirmed: appointments.filter((a: Appointment) => a.status === "confirmed").length,
    completed: appointments.filter((a: Appointment) => a.status === "completed").length,
    cancelled: appointments.filter((a: Appointment) => a.status === "cancelled").length,
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Appointments</h1>
            <p className="text-gray-600 mt-1">Manage all system appointments</p>
          </div>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6">
          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Appointments</p>
                <h3 className="text-2xl font-bold mt-1">{stats?.total || 0}</h3>
                <p className="text-sm text-green-600 mt-1">
                  <TrendingUp className="h-3 w-3 inline mr-1" />
                  {stats?.percentageChange || 0}% vs last month
                </p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Today's Appointments</p>
                <h3 className="text-2xl font-bold mt-1">{stats?.today || 0}</h3>
              </div>
              <Clock className="h-8 w-8 text-green-500" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Revenue (This Month)</p>
                <h3 className="text-2xl font-bold mt-1">₹{stats?.totalRevenue?.toLocaleString('en-IN') || 0}</h3>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Completion Rate</p>
                <h3 className="text-2xl font-bold mt-1">{stats?.completionRate || 0}%</h3>
              </div>
              <Badge className="bg-green-100 text-green-700">Good</Badge>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by patient or doctor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Payment status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Appointments Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled ({statusCounts.scheduled})</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed ({statusCounts.confirmed})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({statusCounts.completed})</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled ({statusCounts.cancelled})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-6">
            {filteredAppointments.length === 0 ? (
              <Card className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No Appointments Found</h3>
                <p className="text-gray-600">No appointments match your filters.</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredAppointments.map((appointment: Appointment) => (
                  <Card key={appointment.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <User className="h-5 w-5 text-gray-500" />
                            <h3 className="font-semibold text-lg">{appointment.patientName}</h3>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">{appointment.patientEmail}</p>
                          <p className="text-sm text-gray-600">{appointment.patientPhone}</p>
                        </div>
                        <div className="border-l pl-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Stethoscope className="h-5 w-5 text-gray-500" />
                            <h3 className="font-semibold">{appointment.doctorName}</h3>
                          </div>
                          <p className="text-sm text-gray-600">{appointment.specialization}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={getStatusColor(appointment.status)}>
                          {appointment.status.toUpperCase().replace("-", " ")}
                        </Badge>
                        <Badge className={getPaymentStatusColor(appointment.paymentStatus)}>
                          {appointment.paymentStatus.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 pt-4 border-t">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(appointment.appointmentDate).toLocaleDateString('en-IN')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="h-4 w-4" />
                        <span>{appointment.appointmentTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        {getConsultationIcon(appointment.consultationType)}
                        <span>{getConsultationLabel(appointment.consultationType)}</span>
                        <span className="ml-auto font-semibold">₹{appointment.consultationFee}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Other tab contents would filter by status */}
          {["scheduled", "confirmed", "completed", "cancelled"].map((status) => (
            <TabsContent key={status} value={status} className="space-y-4 mt-6">
              {filteredAppointments.filter((a: Appointment) => a.status === status).length === 0 ? (
                <Card className="p-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold mb-2">No {status} Appointments</h3>
                  <p className="text-gray-600">No appointments with {status} status.</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {filteredAppointments
                    .filter((a: Appointment) => a.status === status)
                    .map((appointment: Appointment) => (
                      <Card key={appointment.id} className="p-6">
                        {/* Same card structure as above */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <User className="h-5 w-5 text-gray-500" />
                                <h3 className="font-semibold text-lg">{appointment.patientName}</h3>
                              </div>
                              <p className="text-sm text-gray-600">{appointment.patientEmail}</p>
                            </div>
                            <div className="border-l pl-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Stethoscope className="h-5 w-5 text-gray-500" />
                                <h3 className="font-semibold">{appointment.doctorName}</h3>
                              </div>
                              <p className="text-sm text-gray-600">{appointment.specialization}</p>
                            </div>
                          </div>
                          <Badge className={getPaymentStatusColor(appointment.paymentStatus)}>
                            {appointment.paymentStatus.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4 pt-4 border-t">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(appointment.appointmentDate).toLocaleDateString('en-IN')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Clock className="h-4 w-4" />
                            <span>{appointment.appointmentTime}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            {getConsultationIcon(appointment.consultationType)}
                            <span>{getConsultationLabel(appointment.consultationType)}</span>
                            <span className="ml-auto font-semibold">₹{appointment.consultationFee}</span>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminAppointments;
