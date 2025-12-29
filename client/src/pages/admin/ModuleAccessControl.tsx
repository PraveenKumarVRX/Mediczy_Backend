import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, 
  Users, 
  Stethoscope, 
  Building2, 
  FlaskConical, 
  Pill, 
  Hospital,
  Save,
  RotateCcw,
  Search,
  Eye,
  Edit,
  Trash2,
  Download,
  Plus,
  Check,
  X,
  Lock,
  Unlock,
  Settings,
  LayoutDashboard,
  Calendar,
  Video,
  FileText,
  HeartPulse,
  CreditCard,
  MessageSquare,
  Bell,
  User,
  Target,
  Gift,
  Clock,
  BarChart3,
  Mic,
  UserPlus,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/utils/api';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

// Icon mapping for modules
const iconMap: Record<string, React.ComponentType<any>> = {
  LayoutDashboard, Calendar, Video, FileText, HeartPulse, CreditCard, MessageSquare,
  Bell, User, Users, Target, Gift, Clock, BarChart3, Mic, UserPlus, Shield,
  Stethoscope, Building2, FlaskConical, Pill, Hospital, Settings, Eye, Edit,
  Trash2, Download
};

// User type configurations
const userTypeConfig = [
  { id: 'patient', name: 'Patient / Member', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'doctor', name: 'Doctor', icon: Stethoscope, color: 'text-green-500', bg: 'bg-green-500/10' },
  { id: 'corporate_admin', name: 'Corporate Admin', icon: Building2, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'corporate_employee', name: 'Corporate Employee', icon: Users, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'lab_admin', name: 'Lab Admin', icon: FlaskConical, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { id: 'pharmacy_admin', name: 'Pharmacy Admin', icon: Pill, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  { id: 'hospital_admin', name: 'Hospital Admin', icon: Hospital, color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'nurse', name: 'Nurse', icon: HeartPulse, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  { id: 'assistant', name: 'Doctor Assistant', icon: UserPlus, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  { id: 'team_member', name: 'Team Member', icon: Users, color: 'text-slate-500', bg: 'bg-slate-500/10' },
];

interface ModuleAccess {
  id?: string;
  userType: string;
  moduleId: string;
  moduleName: string;
  category: string;
  isEnabled: boolean;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  displayOrder: number;
  icon?: string;
  routePath?: string;
}

const ModuleAccessControl: React.FC = () => {
  const [selectedUserType, setSelectedUserType] = useState('patient');
  const [modules, setModules] = useState<ModuleAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [originalModules, setOriginalModules] = useState<ModuleAccess[]>([]);

  // Load modules for selected user type
  useEffect(() => {
    loadModules();
  }, [selectedUserType]);

  const loadModules = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/module-access/${selectedUserType}`);
      if (response.data.success) {
        setModules(response.data.data);
        setOriginalModules(JSON.parse(JSON.stringify(response.data.data)));
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Error loading modules:', error);
      // Initialize with default modules if API fails
      initializeDefaultModules();
    } finally {
      setLoading(false);
    }
  };

  const initializeDefaultModules = () => {
    // Default module structure based on user type
    const defaultModules = getDefaultModulesForType(selectedUserType);
    setModules(defaultModules);
    setOriginalModules(JSON.parse(JSON.stringify(defaultModules)));
  };

  const getDefaultModulesForType = (userType: string): ModuleAccess[] => {
    const baseModules: Record<string, ModuleAccess[]> = {
      patient: [
        { userType, moduleId: 'user_dashboard', moduleName: 'Dashboard', category: 'Main', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false, displayOrder: 1, icon: 'LayoutDashboard' },
        { userType, moduleId: 'user_appointments', moduleName: 'Appointments', category: 'Healthcare', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: false, displayOrder: 2, icon: 'Calendar' },
        { userType, moduleId: 'user_consultations', moduleName: 'Consultations', category: 'Healthcare', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false, displayOrder: 3, icon: 'Video' },
        { userType, moduleId: 'user_prescriptions', moduleName: 'Prescriptions', category: 'Healthcare', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: true, displayOrder: 4, icon: 'FileText' },
        { userType, moduleId: 'user_lab_reports', moduleName: 'Lab Reports', category: 'Healthcare', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: true, displayOrder: 5, icon: 'FlaskConical' },
        { userType, moduleId: 'user_health_records', moduleName: 'Health Records', category: 'Healthcare', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 6, icon: 'HeartPulse' },
        { userType, moduleId: 'user_vitals', moduleName: 'Vitals', category: 'Health', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 7, icon: 'HeartPulse' },
        { userType, moduleId: 'user_medications', moduleName: 'Medications', category: 'Healthcare', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false, displayOrder: 8, icon: 'Pill' },
        { userType, moduleId: 'user_insurance', moduleName: 'Insurance', category: 'Finance', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false, displayOrder: 9, icon: 'Shield' },
        { userType, moduleId: 'user_payments', moduleName: 'Payments', category: 'Finance', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: true, displayOrder: 10, icon: 'CreditCard' },
        { userType, moduleId: 'user_family', moduleName: 'Family Members', category: 'Account', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: false, displayOrder: 11, icon: 'Users' },
        { userType, moduleId: 'user_ai_chat', moduleName: 'AI Health Assistant', category: 'Support', isEnabled: true, canView: true, canCreate: true, canEdit: false, canDelete: false, canExport: false, displayOrder: 12, icon: 'MessageSquare' },
        { userType, moduleId: 'user_notifications', moduleName: 'Notifications', category: 'Account', isEnabled: true, canView: true, canCreate: false, canEdit: true, canDelete: true, canExport: false, displayOrder: 13, icon: 'Bell' },
        { userType, moduleId: 'user_profile', moduleName: 'Profile', category: 'Account', isEnabled: true, canView: true, canCreate: false, canEdit: true, canDelete: false, canExport: false, displayOrder: 14, icon: 'User' },
        { userType, moduleId: 'user_wearables', moduleName: 'Wearables', category: 'Health', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true, displayOrder: 15, icon: 'Clock' },
        { userType, moduleId: 'user_health_goals', moduleName: 'Health Goals', category: 'Health', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: false, displayOrder: 16, icon: 'Target' },
        { userType, moduleId: 'user_rewards', moduleName: 'Rewards', category: 'Engagement', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false, displayOrder: 17, icon: 'Gift' },
      ],
      doctor: [
        { userType, moduleId: 'doctor_dashboard', moduleName: 'Dashboard', category: 'Main', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false, displayOrder: 1, icon: 'LayoutDashboard' },
        { userType, moduleId: 'doctor_appointments', moduleName: 'Appointments', category: 'Clinical', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true, displayOrder: 2, icon: 'Calendar' },
        { userType, moduleId: 'doctor_patients', moduleName: 'My Patients', category: 'Clinical', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 3, icon: 'Users' },
        { userType, moduleId: 'doctor_emr', moduleName: 'EMR', category: 'Clinical', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 4, icon: 'HeartPulse' },
        { userType, moduleId: 'doctor_prescriptions', moduleName: 'Prescriptions', category: 'Clinical', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 5, icon: 'FileText' },
        { userType, moduleId: 'doctor_consultations', moduleName: 'Consultations', category: 'Clinical', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 6, icon: 'Video' },
        { userType, moduleId: 'doctor_schedule', moduleName: 'Schedule', category: 'Management', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: false, displayOrder: 7, icon: 'Clock' },
        { userType, moduleId: 'doctor_billing', moduleName: 'Billing', category: 'Finance', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 8, icon: 'CreditCard' },
        { userType, moduleId: 'doctor_analytics', moduleName: 'Analytics', category: 'Management', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: true, displayOrder: 9, icon: 'BarChart3' },
        { userType, moduleId: 'doctor_ai_scribe', moduleName: 'AI Scribe', category: 'Tools', isEnabled: true, canView: true, canCreate: true, canEdit: false, canDelete: false, canExport: true, displayOrder: 10, icon: 'Mic' },
        { userType, moduleId: 'doctor_chat', moduleName: 'Chat', category: 'Communication', isEnabled: true, canView: true, canCreate: true, canEdit: false, canDelete: false, canExport: false, displayOrder: 11, icon: 'MessageSquare' },
        { userType, moduleId: 'doctor_profile', moduleName: 'Profile', category: 'Account', isEnabled: true, canView: true, canCreate: false, canEdit: true, canDelete: false, canExport: false, displayOrder: 12, icon: 'User' },
        { userType, moduleId: 'doctor_assistants', moduleName: 'Assistants', category: 'Management', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: false, displayOrder: 13, icon: 'UserPlus' },
      ],
      corporate_admin: [
        { userType, moduleId: 'corporate_dashboard', moduleName: 'Dashboard', category: 'Main', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false, displayOrder: 1, icon: 'LayoutDashboard' },
        { userType, moduleId: 'corporate_employees', moduleName: 'Employees', category: 'Management', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 2, icon: 'Users' },
        { userType, moduleId: 'corporate_health_programs', moduleName: 'Health Programs', category: 'Programs', isEnabled: true, canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true, displayOrder: 3, icon: 'HeartPulse' },
        { userType, moduleId: 'corporate_analytics', moduleName: 'Analytics', category: 'Reports', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: true, displayOrder: 4, icon: 'BarChart3' },
        { userType, moduleId: 'corporate_billing', moduleName: 'Billing', category: 'Finance', isEnabled: true, canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: true, displayOrder: 5, icon: 'CreditCard' },
        { userType, moduleId: 'corporate_reports', moduleName: 'Reports', category: 'Reports', isEnabled: true, canView: true, canCreate: true, canEdit: false, canDelete: false, canExport: true, displayOrder: 6, icon: 'FileText' },
      ],
    };
    return baseModules[userType] || [];
  };

  const handleModuleChange = (moduleId: string, field: keyof ModuleAccess, value: any) => {
    setModules(prev => prev.map(m => 
      m.moduleId === moduleId ? { ...m, [field]: value } : m
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/module-access/${selectedUserType}/bulk`, { modules });
      toast.success('Module access settings saved successfully');
      setOriginalModules(JSON.parse(JSON.stringify(modules)));
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setModules(JSON.parse(JSON.stringify(originalModules)));
    setHasChanges(false);
    toast.info('Changes reverted');
  };

  const enableAllModules = () => {
    setModules(prev => prev.map(m => ({ ...m, isEnabled: true, canView: true })));
    setHasChanges(true);
  };

  const disableAllModules = () => {
    setModules(prev => prev.map(m => ({ ...m, isEnabled: false })));
    setHasChanges(true);
  };

  const grantFullAccess = () => {
    setModules(prev => prev.map(m => ({ 
      ...m, 
      isEnabled: true, 
      canView: true, 
      canCreate: true, 
      canEdit: true, 
      canDelete: true, 
      canExport: true 
    })));
    setHasChanges(true);
  };

  const grantViewOnly = () => {
    setModules(prev => prev.map(m => ({ 
      ...m, 
      isEnabled: true, 
      canView: true, 
      canCreate: false, 
      canEdit: false, 
      canDelete: false, 
      canExport: false 
    })));
    setHasChanges(true);
  };

  // Group modules by category
  const groupedModules = modules.reduce((acc, module) => {
    const cat = module.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(module);
    return acc;
  }, {} as Record<string, ModuleAccess[]>);

  // Filter modules by search
  const filteredGroupedModules = Object.entries(groupedModules).reduce((acc, [cat, mods]) => {
    const filtered = mods.filter(m => 
      m.moduleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.moduleId.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) acc[cat] = filtered;
    return acc;
  }, {} as Record<string, ModuleAccess[]>);

  const selectedTypeConfig = userTypeConfig.find(t => t.id === selectedUserType);
  const TypeIcon = selectedTypeConfig?.icon || Users;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Module Access Control</h1>
              <p className="text-muted-foreground">Configure which modules each user type can access</p>
            </div>
          </div>
          
          {hasChanges && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleReset} disabled={saving}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>

        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Super Admin Control</AlertTitle>
          <AlertDescription>
            As Super Admin, you control which modules are visible and accessible to each user type. 
            Changes here affect all users of the selected type across the platform.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* User Type Selector */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">User Types</CardTitle>
              <CardDescription>Select a user type to configure</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="space-y-1 p-3">
                  {userTypeConfig.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setSelectedUserType(type.id)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                          selectedUserType === type.id
                            ? "bg-gradient-to-r from-blue-500/15 to-purple-500/10 text-blue-600 border border-blue-500/20"
                            : "hover:bg-accent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <div className={cn("p-1.5 rounded-md", type.bg)}>
                          <Icon className={cn("h-4 w-4", type.color)} />
                        </div>
                        <span className="flex-1 text-left font-medium">{type.name}</span>
                        {selectedUserType === type.id && (
                          <Check className="h-4 w-4 text-blue-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Module Configuration */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", selectedTypeConfig?.bg)}>
                    <TypeIcon className={cn("h-5 w-5", selectedTypeConfig?.color)} />
                  </div>
                  <div>
                    <CardTitle>{selectedTypeConfig?.name} Modules</CardTitle>
                    <CardDescription>
                      {modules.filter(m => m.isEnabled).length} of {modules.length} modules enabled
                    </CardDescription>
                  </div>
                </div>
                
                {/* Quick Actions */}
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={grantViewOnly}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Only Access</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={grantFullAccess}>
                          <Unlock className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Full Access</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={disableAllModules}>
                          <Lock className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Disable All</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              
              {/* Search */}
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search modules..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                </div>
              ) : (
                <ScrollArea className="h-[450px] pr-4">
                  <Accordion type="multiple" defaultValue={Object.keys(filteredGroupedModules)} className="space-y-2">
                    {Object.entries(filteredGroupedModules).map(([category, categoryModules]) => (
                      <AccordionItem key={category} value={category} className="border rounded-lg px-4">
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{category}</span>
                            <Badge variant="secondary" className="text-xs">
                              {categoryModules.filter(m => m.isEnabled).length}/{categoryModules.length}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pb-3">
                            {categoryModules.map((module) => {
                              const ModuleIcon = iconMap[module.icon || 'Settings'] || Settings;
                              return (
                                <div 
                                  key={module.moduleId}
                                  className={cn(
                                    "flex items-center justify-between p-3 rounded-lg border transition-all",
                                    module.isEnabled 
                                      ? "bg-accent/30 border-border" 
                                      : "bg-muted/30 border-muted opacity-60"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "p-2 rounded-md",
                                      module.isEnabled ? "bg-blue-500/10" : "bg-muted"
                                    )}>
                                      <ModuleIcon className={cn(
                                        "h-4 w-4",
                                        module.isEnabled ? "text-blue-600" : "text-muted-foreground"
                                      )} />
                                    </div>
                                    <div>
                                      <p className="font-medium text-sm">{module.moduleName}</p>
                                      <p className="text-xs text-muted-foreground">{module.moduleId}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-4">
                                    {/* Permission Toggles */}
                                    <div className="flex items-center gap-3">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1.5">
                                              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                              <Switch
                                                checked={module.canView}
                                                onCheckedChange={(v) => handleModuleChange(module.moduleId, 'canView', v)}
                                                disabled={!module.isEnabled}
                                                className="scale-75"
                                              />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>View</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1.5">
                                              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                              <Switch
                                                checked={module.canCreate}
                                                onCheckedChange={(v) => handleModuleChange(module.moduleId, 'canCreate', v)}
                                                disabled={!module.isEnabled}
                                                className="scale-75"
                                              />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>Create</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1.5">
                                              <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                                              <Switch
                                                checked={module.canEdit}
                                                onCheckedChange={(v) => handleModuleChange(module.moduleId, 'canEdit', v)}
                                                disabled={!module.isEnabled}
                                                className="scale-75"
                                              />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>Edit</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1.5">
                                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                              <Switch
                                                checked={module.canDelete}
                                                onCheckedChange={(v) => handleModuleChange(module.moduleId, 'canDelete', v)}
                                                disabled={!module.isEnabled}
                                                className="scale-75"
                                              />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>Delete</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1.5">
                                              <Download className="h-3.5 w-3.5 text-muted-foreground" />
                                              <Switch
                                                checked={module.canExport}
                                                onCheckedChange={(v) => handleModuleChange(module.moduleId, 'canExport', v)}
                                                disabled={!module.isEnabled}
                                                className="scale-75"
                                              />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>Export</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                    
                                    <Separator orientation="vertical" className="h-6" />
                                    
                                    {/* Enable/Disable Toggle */}
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs text-muted-foreground">
                                        {module.isEnabled ? 'Enabled' : 'Disabled'}
                                      </Label>
                                      <Switch
                                        checked={module.isEnabled}
                                        onCheckedChange={(v) => handleModuleChange(module.moduleId, 'isEnabled', v)}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Legend */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span>View</span>
              </div>
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <span>Create</span>
              </div>
              <div className="flex items-center gap-2">
                <Edit className="h-4 w-4 text-muted-foreground" />
                <span>Edit</span>
              </div>
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <span>Delete</span>
              </div>
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" />
                <span>Export</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default ModuleAccessControl;
