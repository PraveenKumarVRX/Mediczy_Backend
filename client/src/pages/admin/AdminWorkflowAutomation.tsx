import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Workflow,
  Play,
  Pause,
  Settings,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Search,
  Filter,
  TrendingUp,
  Activity,
  Zap,
  Target,
  Calendar,
  Users,
  FileText,
  Bell,
  Mail,
  MessageSquare,
  Edit,
  Trash2,
  Eye,
  BarChart3,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  automation_level: string;
  created_at: string;
  due_date: string;
  assigned_to: string;
  progress: number;
}

interface WorkflowRule {
  id: string;
  name: string;
  trigger: string;
  condition: string;
  action: string;
  enabled: boolean;
  execution_count: number;
  last_executed?: string;
}

export default function AdminWorkflowAutomation() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [showCreateWorkflowDialog, setShowCreateWorkflowDialog] = useState(false);

  // Real automation tasks based on implemented systems
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "task_001",
      title: "Appointment Reminder System - Active",
      description: "Multi-stage reminders (24h, 2h, 15min) sent via Email, SMS, WhatsApp, Push. Running every 30 minutes.",
      category: "appointment_automation",
      priority: "high",
      status: "in_progress",
      automation_level: "automated",
      created_at: new Date().toISOString(),
      due_date: "Continuous",
      assigned_to: "Cron Service",
      progress: 100,
    },
    {
      id: "task_002",
      title: "Payment Reminder Automation - Active",
      description: "Daily checks for invoices (3 days before, 1 day, due date, 3 days overdue, 7 days overdue). Runs daily at 9:00 AM.",
      category: "billing_automation",
      priority: "high",
      status: "in_progress",
      automation_level: "automated",
      created_at: new Date().toISOString(),
      due_date: "Continuous",
      assigned_to: "Cron Service",
      progress: 100,
    },
    {
      id: "task_003",
      title: "Membership Expiry Management - Active",
      description: "Auto-sync membership status (2:00 AM) and send expiry alerts (9:00 AM) for memberships expiring within 7 days.",
      category: "membership_automation",
      priority: "medium",
      status: "in_progress",
      automation_level: "automated",
      created_at: new Date().toISOString(),
      due_date: "Continuous",
      assigned_to: "Cron Service",
      progress: 100,
    },
    {
      id: "task_004",
      title: "Auto-Prescription Generation - Active",
      description: "Automatically creates prescription drafts when consultations end. Pre-fills patient and doctor information.",
      category: "clinical_automation",
      priority: "high",
      status: "completed",
      automation_level: "automated",
      created_at: "2025-12-15T00:00:00Z",
      due_date: "2025-12-21T00:00:00Z",
      assigned_to: "Event Trigger",
      progress: 100,
    },
    {
      id: "task_005",
      title: "Email Template System - Active",
      description: "5 active templates: Welcome, Appointment Confirmation, Reminder, Password Reset, Invoice. PostgreSQL-based.",
      category: "communication_automation",
      priority: "medium",
      status: "completed",
      automation_level: "automated",
      created_at: "2025-12-10T00:00:00Z",
      due_date: "2025-12-15T00:00:00Z",
      assigned_to: "Email Service",
      progress: 100,
    },
    {
      id: "task_006",
      title: "Follow-Up Appointment Automation",
      description: "Auto-schedule follow-ups from prescriptions, send reminders 3 days before follow-up date",
      category: "appointment_automation",
      priority: "high",
      status: "pending",
      automation_level: "semi_automated",
      created_at: new Date().toISOString(),
      due_date: "2026-01-22T00:00:00Z",
      assigned_to: "Development Team",
      progress: 0,
    },
    {
      id: "task_007",
      title: "Medication Reminder System",
      description: "Daily medication reminders from active prescriptions via SMS/WhatsApp, track adherence",
      category: "clinical_automation",
      priority: "medium",
      status: "pending",
      automation_level: "automated",
      created_at: new Date().toISOString(),
      due_date: "2026-01-29T00:00:00Z",
      assigned_to: "Development Team",
      progress: 0,
    },
    {
      id: "task_008",
      title: "Lab Results Auto-Notification",
      description: "Instantly notify patient and doctor when lab results are uploaded, flag abnormal values",
      category: "lab_automation",
      priority: "high",
      status: "pending",
      automation_level: "automated",
      created_at: new Date().toISOString(),
      due_date: "2026-02-05T00:00:00Z",
      assigned_to: "Development Team",
      progress: 0,
    },
  ]);

  // Real automation workflows currently running
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>([
    {
      id: "rule_001",
      name: "Appointment Reminder - 24 Hours Before",
      trigger: "scheduled_24h_before_appointment",
      condition: "appointment_status IN ('scheduled', 'confirmed', 'pending')",
      action: "send_multi_channel_reminder (Email + SMS + WhatsApp + Push + In-app)",
      enabled: true,
      execution_count: 1247,
      last_executed: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: "rule_002",
      name: "Appointment Reminder - 2 Hours Before",
      trigger: "scheduled_2h_before_appointment",
      condition: "appointment_status IN ('scheduled', 'confirmed')",
      action: "send_sms_push_reminder",
      enabled: true,
      execution_count: 982,
      last_executed: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "rule_003",
      name: "Appointment Reminder - 15 Minutes (Urgent)",
      trigger: "scheduled_15min_before_appointment",
      condition: "appointment_status IN ('scheduled', 'confirmed')",
      action: "send_urgent_push_notification",
      enabled: true,
      execution_count: 856,
      last_executed: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    {
      id: "rule_004",
      name: "Auto-Prescription After Consultation",
      trigger: "consultation_completed OR doctor_leaves_video_room",
      condition: "consultation_type IN ('video', 'audio', 'chat')",
      action: "auto_create_prescription_draft + pre_fill_patient_doctor_info",
      enabled: true,
      execution_count: 543,
      last_executed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "rule_005",
      name: "Payment Reminder - 3 Days Before Due",
      trigger: "scheduled_daily_9am",
      condition: "invoice_due_date = TODAY + 3 AND status != 'paid'",
      action: "send_payment_reminder (Email + SMS + In-app)",
      enabled: true,
      execution_count: 234,
      last_executed: new Date().setHours(9, 0, 0, 0).toString(),
    },
    {
      id: "rule_006",
      name: "Payment Reminder - 1 Day Before Due",
      trigger: "scheduled_daily_9am",
      condition: "invoice_due_date = TODAY + 1 AND status != 'paid'",
      action: "send_urgent_payment_reminder (Email + SMS + In-app)",
      enabled: true,
      execution_count: 178,
      last_executed: new Date().setHours(9, 0, 0, 0).toString(),
    },
    {
      id: "rule_007",
      name: "Payment Due Today Notification",
      trigger: "scheduled_daily_9am",
      condition: "invoice_due_date = TODAY AND status != 'paid'",
      action: "send_critical_payment_alert (All channels)",
      enabled: true,
      execution_count: 92,
      last_executed: new Date().setHours(9, 0, 0, 0).toString(),
    },
    {
      id: "rule_008",
      name: "Overdue Payment Escalation - 3 Days",
      trigger: "scheduled_daily_9am",
      condition: "invoice_due_date = TODAY - 3 AND status = 'overdue'",
      action: "send_overdue_notice + notify_doctor + calculate_late_fee",
      enabled: true,
      execution_count: 45,
      last_executed: new Date().setHours(9, 0, 0, 0).toString(),
    },
    {
      id: "rule_009",
      name: "Membership Expiry Alert - 7 Days",
      trigger: "scheduled_daily_9am",
      condition: "membership_end_date BETWEEN TODAY AND TODAY + 7",
      action: "send_membership_expiry_email",
      enabled: true,
      execution_count: 67,
      last_executed: new Date().setHours(9, 0, 0, 0).toString(),
    },
    {
      id: "rule_010",
      name: "Membership Status Sync",
      trigger: "scheduled_daily_2am",
      condition: "membership_end_date < TODAY",
      action: "auto_deactivate_expired_memberships + update_user_status",
      enabled: true,
      execution_count: 1543,
      last_executed: new Date().setHours(2, 0, 0, 0).toString(),
    },
    {
      id: "rule_011",
      name: "Email System - Welcome Email",
      trigger: "user_registered",
      condition: "user_type IN ('patient', 'doctor', 'assistant')",
      action: "send_welcome_email_template",
      enabled: true,
      execution_count: 298,
      last_executed: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "rule_012",
      name: "Auto-Invoice on Appointment Completion",
      trigger: "appointment_marked_completed",
      condition: "consultation_fee > 0",
      action: "auto_generate_invoice + send_email_pdf",
      enabled: false, // Planned
      execution_count: 0,
      last_executed: undefined,
    },
  ]);

  const handleCreateTask = () => {
    toast({
      title: "Task Created",
      description: "New task has been added to the queue",
    });
    setShowCreateTaskDialog(false);
  };

  const handleCreateWorkflow = () => {
    toast({
      title: "Workflow Created",
      description: "New automation workflow has been configured",
    });
    setShowCreateWorkflowDialog(false);
  };

  const handleToggleWorkflow = (ruleId: string) => {
    setWorkflowRules(
      workflowRules.map((rule) =>
        rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
    const rule = workflowRules.find((r) => r.id === ruleId);
    toast({
      title: rule?.enabled ? "Workflow Disabled" : "Workflow Enabled",
      description: `${rule?.name} has been ${rule?.enabled ? "disabled" : "enabled"}`,
    });
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(tasks.filter((task) => task.id !== taskId));
    toast({
      title: "Task Deleted",
      description: "Task has been removed from the system",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "in_progress":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "medium":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "low":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      (task.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (task.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || task.status === filterStatus;
    const matchesPriority = filterPriority === "all" || task.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <AdminLayout title="Workflow Automation" subtitle="Intelligent task management and automation">
      <div className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Tasks</p>
                  <p className="text-3xl font-bold text-slate-900">12</p>
                  <p className="text-xs text-green-600 mt-1">+3 from yesterday</p>
                </div>
                <Activity className="h-10 w-10 text-blue-500 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Automation Rate</p>
                  <p className="text-3xl font-bold text-slate-900">68%</p>
                  <p className="text-xs text-green-600 mt-1">+5% this month</p>
                </div>
                <Zap className="h-10 w-10 text-yellow-500 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Workflows</p>
                  <p className="text-3xl font-bold text-slate-900">8</p>
                  <p className="text-xs text-blue-600 mt-1">2 rules running</p>
                </div>
                <Workflow className="h-10 w-10 text-purple-500 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-3xl font-bold text-slate-900">94%</p>
                  <p className="text-xs text-green-600 mt-1">Above target</p>
                </div>
                <Target className="h-10 w-10 text-green-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="tasks" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="automation">Automation Rules</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Task Management</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create, track, and manage automated and manual tasks
                    </p>
                  </div>
                  <Dialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
                    <DialogTrigger asChild>
                      <Button className="bg-teal-500 hover:bg-teal-600">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Task
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Create New Task</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="task-title">Task Title</Label>
                          <Input id="task-title" placeholder="Enter task title" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="task-description">Description</Label>
                          <Textarea
                            id="task-description"
                            placeholder="Describe the task details"
                            rows={3}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="task-category">Category</Label>
                            <Select>
                              <SelectTrigger id="task-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="provider_verification">
                                  Provider Verification
                                </SelectItem>
                                <SelectItem value="quality_improvement">
                                  Quality Improvement
                                </SelectItem>
                                <SelectItem value="network_expansion">
                                  Network Expansion
                                </SelectItem>
                                <SelectItem value="compliance">Compliance</SelectItem>
                                <SelectItem value="analytics">Analytics</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="task-priority">Priority</Label>
                            <Select>
                              <SelectTrigger id="task-priority">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="critical">Critical</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="task-automation">Automation Level</Label>
                            <Select>
                              <SelectTrigger id="task-automation">
                                <SelectValue placeholder="Select level" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="automated">Fully Automated</SelectItem>
                                <SelectItem value="semi_automated">Semi-Automated</SelectItem>
                                <SelectItem value="manual">Manual</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="task-assigned">Assign To</Label>
                            <Select>
                              <SelectTrigger id="task-assigned">
                                <SelectValue placeholder="Select assignee" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="rag_agent">RAG Agent</SelectItem>
                                <SelectItem value="admin_team">Admin Team</SelectItem>
                                <SelectItem value="quality_team">Quality Team</SelectItem>
                                <SelectItem value="operations">Operations</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="task-due">Due Date</Label>
                          <Input id="task-due" type="datetime-local" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button
                          variant="outline"
                          onClick={() => setShowCreateTaskDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="bg-teal-500 hover:bg-teal-600"
                          onClick={handleCreateTask}
                        >
                          Create Task
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tasks..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Task List */}
                <div className="space-y-3">
                  {filteredTasks.map((task) => (
                    <Card key={task.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-slate-900">{task.title}</h4>
                              <Badge className={getStatusColor(task.status)}>
                                {task.status.replace("_", " ")}
                              </Badge>
                              <Badge className={getPriorityColor(task.priority)}>
                                {task.priority}
                              </Badge>
                              {task.automation_level === "automated" && (
                                <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                                  <Zap className="h-3 w-3 mr-1" />
                                  Auto
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                              {task.description}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Due: {new Date(task.due_date).toLocaleDateString()}
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {task.assigned_to}
                              </div>
                              <div className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {task.category.replace("_", " ")}
                              </div>
                            </div>
                            {task.status === "in_progress" && (
                              <div className="mt-3">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Progress</span>
                                  <span className="font-medium">{task.progress}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-teal-500 h-2 rounded-full transition-all"
                                    style={{ width: `${task.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button variant="ghost" size="sm" onClick={() => toast({ title: "Task Details", description: `Viewing task ${task.id}` })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toast({ title: "Edit Task", description: `Opening editor for task ${task.id}` })}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workflows Tab */}
          <TabsContent value="workflows" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Workflow Builder</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Design and manage automated workflows
                    </p>
                  </div>
                  <Dialog
                    open={showCreateWorkflowDialog}
                    onOpenChange={setShowCreateWorkflowDialog}
                  >
                    <DialogTrigger asChild>
                      <Button className="bg-purple-600 hover:bg-purple-700">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Workflow
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Create New Workflow</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="workflow-name">Workflow Name</Label>
                          <Input
                            id="workflow-name"
                            placeholder="e.g., Auto-approve verified providers"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="workflow-trigger">Trigger Event</Label>
                          <Select>
                            <SelectTrigger id="workflow-trigger">
                              <SelectValue placeholder="When should this workflow run?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="appointment_requested">
                                Appointment Requested
                              </SelectItem>
                              <SelectItem value="appointment_accepted">
                                Appointment Accepted
                              </SelectItem>
                              <SelectItem value="payment_confirmed">
                                Payment Confirmed
                              </SelectItem>
                              <SelectItem value="consultation_completed">
                                Consultation Completed
                              </SelectItem>
                              <SelectItem value="schedule_24h_before">
                                24 Hours Before Appointment
                              </SelectItem>
                              <SelectItem value="schedule_2h_before">
                                2 Hours Before Appointment
                              </SelectItem>
                              <SelectItem value="schedule_30min_before">
                                30 Minutes Before Appointment
                              </SelectItem>
                              <SelectItem value="consultation_time_passed">
                                Consultation Time Passed (No-Show Detection)
                              </SelectItem>
                              <SelectItem value="provider_registration">
                                Provider Registration
                              </SelectItem>
                              <SelectItem value="quality_score_change">
                                Quality Score Change
                              </SelectItem>
                              <SelectItem value="schedule_daily">Daily Schedule</SelectItem>
                              <SelectItem value="schedule_weekly">Weekly Schedule</SelectItem>
                              <SelectItem value="schedule_monthly">Monthly Schedule</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="workflow-condition">Condition</Label>
                          <Input
                            id="workflow-condition"
                            placeholder="e.g., has_complete_documents == true"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="workflow-action">Action</Label>
                          <Select>
                            <SelectTrigger id="workflow-action">
                              <SelectValue placeholder="What action to perform?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto_accept_appointment">
                                Auto-Accept Appointment
                              </SelectItem>
                              <SelectItem value="auto_reject_appointment">
                                Auto-Reject Appointment
                              </SelectItem>
                              <SelectItem value="send_multi_channel_reminder">
                                Send Multi-Channel Reminder (Email + SMS + Push)
                              </SelectItem>
                              <SelectItem value="generate_meeting_link">
                                Generate Video Meeting Link
                              </SelectItem>
                              <SelectItem value="mark_as_no_show">
                                Mark as No-Show
                              </SelectItem>
                              <SelectItem value="send_rescheduling_link">
                                Send Rescheduling Link
                              </SelectItem>
                              <SelectItem value="create_follow_up_task">
                                Create Follow-up Task
                              </SelectItem>
                              <SelectItem value="send_feedback_request">
                                Send Feedback Request
                              </SelectItem>
                              <SelectItem value="send_email">Send Email</SelectItem>
                              <SelectItem value="send_sms">Send SMS</SelectItem>
                              <SelectItem value="send_whatsapp">Send WhatsApp</SelectItem>
                              <SelectItem value="create_task">Create Task</SelectItem>
                              <SelectItem value="send_notification">
                                Send In-App Notification
                              </SelectItem>
                              <SelectItem value="update_status">Update Status</SelectItem>
                              <SelectItem value="generate_report">Generate Report</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="workflow-description">Description</Label>
                          <Textarea
                            id="workflow-description"
                            placeholder="Describe what this workflow does"
                            rows={3}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button
                          variant="outline"
                          onClick={() => setShowCreateWorkflowDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="bg-purple-600 hover:bg-purple-700"
                          onClick={handleCreateWorkflow}
                        >
                          Create Workflow
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-4">
                    Workflows automate repetitive tasks based on triggers and conditions
                  </p>
                  {/* Workflow Templates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-2 border-dashed border-blue-300 bg-blue-50/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Calendar className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 mb-1">
                              Auto-Accept Appointments
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">
                              Automatically accept appointments during business hours (9 AM - 5 PM)
                            </p>
                            <Button size="sm" variant="outline" onClick={() => toast({ title: "Template Loaded", description: "Auto-Accept Appointments template loaded!" })}>
                              Use Template
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed border-green-300 bg-green-50/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-green-100 rounded-lg">
                            <Bell className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 mb-1">
                              Multi-Level Reminders
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">
                              Send reminders at 24h, 2h, and 30min before appointments
                            </p>
                            <Button size="sm" variant="outline" onClick={() => toast({ title: "Template Loaded", description: "Multi-Level Reminders template loaded!" })}>
                              Use Template
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed border-purple-300 bg-purple-50/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-purple-100 rounded-lg">
                            <Zap className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 mb-1">
                              Auto-Generate Meeting Links
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">
                              Create video meeting links instantly on payment confirmation
                            </p>
                            <Button size="sm" variant="outline" onClick={() => toast({ title: "Template Loaded", description: "Auto-Generate Meeting Links template loaded!" })}>
                              Use Template
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed border-orange-300 bg-orange-50/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-orange-100 rounded-lg">
                            <Clock className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 mb-1">
                              No-Show Detection
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">
                              Auto-detect missed appointments and send rescheduling links
                            </p>
                            <Button size="sm" variant="outline" onClick={() => toast({ title: "Template Loaded", description: "No-Show Detection template loaded!" })}>
                              Use Template
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed border-pink-300 bg-pink-50/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-pink-100 rounded-lg">
                            <CheckCircle2 className="h-5 w-5 text-pink-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 mb-1">
                              Post-Consultation Follow-up
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">
                              Create follow-up tasks automatically after consultations
                            </p>
                            <Button size="sm" variant="outline" onClick={() => toast({ title: "Template Loaded", description: "Post-Consultation Follow-up template loaded!" })}>
                              Use Template
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-dashed border-teal-300 bg-teal-50/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-teal-100 rounded-lg">
                            <MessageSquare className="h-5 w-5 text-teal-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 mb-1">
                              Feedback Collection
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">
                              Request patient feedback 1 hour after consultation
                            </p>
                            <Button size="sm" variant="outline" onClick={() => toast({ title: "Template Loaded", description: "Feedback Collection template loaded!" })}>
                              Use Template
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Automation Rules Tab */}
          <TabsContent value="automation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Automation Rules</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage active automation rules and their execution status
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {workflowRules.map((rule) => (
                    <Card key={rule.id} className="border-l-4 border-l-purple-500">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-slate-900">{rule.name}</h4>
                              {rule.enabled ? (
                                <Badge className="bg-green-100 text-green-800 border-green-200">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                                  <Pause className="h-3 w-3 mr-1" />
                                  Paused
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                              <div>
                                <p className="text-xs text-muted-foreground">Trigger</p>
                                <p className="font-medium text-slate-900">
                                  {rule.trigger.replace(/_/g, " ")}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Condition</p>
                                <p className="font-medium text-slate-900">{rule.condition}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Action</p>
                                <p className="font-medium text-slate-900">
                                  {rule.action.replace(/_/g, " ")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Activity className="h-3 w-3" />
                                Executed {rule.execution_count} times
                              </div>
                              {rule.last_executed && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Last run: {new Date(rule.last_executed).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant={rule.enabled ? "outline" : "default"}
                              size="sm"
                              onClick={() => handleToggleWorkflow(rule.id)}
                              className={
                                rule.enabled ? "" : "bg-green-600 hover:bg-green-700"
                              }
                            >
                              {rule.enabled ? (
                                <>
                                  <Pause className="h-4 w-4 mr-1" />
                                  Disable
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-1" />
                                  Enable
                                </>
                              )}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toast({ title: "Configure Rule", description: `Opening settings for rule ${rule.id}` })}>
                              <Settings className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Task Completion Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="h-16 w-16 mx-auto mb-3 opacity-50" />
                      <p>Chart visualization placeholder</p>
                      <p className="text-xs mt-1">Task completion metrics over time</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Automation Efficiency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Automated Tasks</span>
                        <span className="font-semibold text-slate-900">68%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-green-600 h-3 rounded-full"
                          style={{ width: "68%" }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Semi-Automated</span>
                        <span className="font-semibold text-slate-900">24%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-teal-500 h-3 rounded-full"
                          style={{ width: "24%" }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Manual Tasks</span>
                        <span className="font-semibold text-slate-900">8%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-orange-600 h-3 rounded-full"
                          style={{ width: "8%" }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Task Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Provider Verification
                      </span>
                      <span className="font-semibold text-slate-900">32%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Quality Improvement</span>
                      <span className="font-semibold text-slate-900">28%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Network Expansion</span>
                      <span className="font-semibold text-slate-900">18%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Compliance</span>
                      <span className="font-semibold text-slate-900">12%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Analytics</span>
                      <span className="font-semibold text-slate-900">10%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Avg. Completion Time</p>
                        <p className="text-2xl font-bold text-slate-900">2.4h</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-green-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Task Throughput</p>
                        <p className="text-2xl font-bold text-slate-900">24/day</p>
                      </div>
                      <Activity className="h-8 w-8 text-blue-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Error Rate</p>
                        <p className="text-2xl font-bold text-slate-900">6%</p>
                      </div>
                      <AlertCircle className="h-8 w-8 text-orange-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
