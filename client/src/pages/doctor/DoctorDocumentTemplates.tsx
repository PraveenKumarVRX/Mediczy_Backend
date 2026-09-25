import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import MainLayout from "@/components/layout/MainLayoutdoctor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  FileText, 
  FlaskConical, 
  UserCheck, 
  Heart, 
  ClipboardList,
  Plus,
  Edit,
  Trash2,
  Copy,
  Eye,
  MoreVertical,
  Search,
  Filter,
  Stethoscope
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";
import { useToast } from "@/hooks/use-toast";

interface Template {
  id: string;
  name: string;
  type: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// invented-data-check: static-reference -- document-template type configuration.
const templateTypes = [
  { id: "prescription", name: "Prescription", icon: FileText, color: "bg-blue-500" },
  { id: "lab_referral", name: "Lab Referral", icon: FlaskConical, color: "bg-purple-500" },
  { id: "specialist_referral", name: "Specialist Referral", icon: UserCheck, color: "bg-green-500" },
  { id: "specialist_opinion", name: "Specialist Opinion", icon: Stethoscope, color: "bg-amber-500" },
  { id: "fitness_certificate", name: "Fitness Certificate", icon: Heart, color: "bg-red-500" },
  { id: "discharge_summary", name: "Discharge Summary", icon: ClipboardList, color: "bg-orange-500" },
];

const DoctorDocumentTemplates = () => {
  const { currentDoctor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    type: "prescription",
    content: "",
    isDefault: false
  });

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['doctor-templates', selectedType],
    queryFn: async () => {
      try {
        const response = await api.get('/doctors/templates', {
          params: { type: selectedType !== 'all' ? selectedType : undefined }
        });
        return response.data;
      } catch (err) {
        // Return mock data for now
        return {
          success: true,
          templates: [
            {
              id: "1",
              name: "Standard Prescription",
              type: "prescription",
              content: "Patient Name: {{patient_name}}\nDate: {{date}}\n\nRx:\n\n1. {{medication_1}}\n   Dosage: {{dosage_1}}\n   Duration: {{duration_1}}\n\nInstructions: {{instructions}}\n\nDoctor's Signature",
              isDefault: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            {
              id: "2",
              name: "Blood Test Referral",
              type: "lab_referral",
              content: "Patient Name: {{patient_name}}\nAge: {{age}}\nDate: {{date}}\n\nTests Required:\n{{test_list}}\n\nClinical Notes: {{clinical_notes}}\n\nUrgency: {{urgency}}",
              isDefault: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            {
              id: "3",
              name: "Cardiology Referral",
              type: "specialist_referral",
              content: "Referring To: Cardiologist\n\nPatient: {{patient_name}}\nAge: {{age}}\nDate: {{date}}\n\nReason for Referral:\n{{reason}}\n\nClinical History:\n{{history}}\n\nCurrent Medications:\n{{medications}}",
              isDefault: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            {
              id: "4",
              name: "Specialist Opinion",
              type: "specialist_opinion",
              content: `SPECIALIST OPINION REPORT
═══════════════════════════════════════════════════════════════

Date: {{date}}
Reference Number: {{reference_number}}

PATIENT INFORMATION
───────────────────────────────────────────────────────────────
Patient Name: {{patient_name}}
Age/Gender: {{age}} / {{gender}}
Contact: {{phone_number}}
Address: {{address}}

REFERRING PHYSICIAN
───────────────────────────────────────────────────────────────
Name: {{referring_doctor}}
Hospital/Clinic: {{referring_hospital}}
Contact: {{referring_contact}}

DOCUMENTS REVIEWED
───────────────────────────────────────────────────────────────
☐ Medical Records
☐ Lab Reports
☐ Imaging Studies (X-Ray/CT/MRI/USG)
☐ Pathology Reports
☐ Previous Prescriptions
☐ Other: {{other_documents}}

ORIGINAL DIAGNOSIS
───────────────────────────────────────────────────────────────
{{original_diagnosis}}

CURRENT SYMPTOMS & COMPLAINTS
───────────────────────────────────────────────────────────────
{{current_symptoms}}

MEDICAL HISTORY SUMMARY
───────────────────────────────────────────────────────────────
{{medical_history}}

CURRENT MEDICATIONS
───────────────────────────────────────────────────────────────
{{current_medications}}

REVIEW OF INVESTIGATIONS
───────────────────────────────────────────────────────────────
{{investigation_review}}

CLINICAL ASSESSMENT
───────────────────────────────────────────────────────────────
{{clinical_assessment}}

EXPERT OPINION
───────────────────────────────────────────────────────────────
Based on thorough review of the medical records and investigations provided:

Diagnosis Confirmation: {{diagnosis_confirmation}}

Opinion: {{expert_opinion}}

RECOMMENDATIONS
───────────────────────────────────────────────────────────────
1. {{recommendation_1}}
2. {{recommendation_2}}
3. {{recommendation_3}}

TREATMENT MODIFICATIONS (if any)
───────────────────────────────────────────────────────────────
{{treatment_modifications}}

ADDITIONAL INVESTIGATIONS SUGGESTED
───────────────────────────────────────────────────────────────
{{additional_investigations}}

PROGNOSIS
───────────────────────────────────────────────────────────────
{{prognosis}}

FOLLOW-UP ADVICE
───────────────────────────────────────────────────────────────
{{followup_advice}}

═══════════════════════════════════════════════════════════════

Note: This second opinion is based solely on the documents and information 
provided. Physical examination findings may alter this opinion. Patient is 
advised to discuss this report with their treating physician.

This opinion is valid for 30 days from the date of issue.

───────────────────────────────────────────────────────────────
Consulting Physician's Signature & Seal

Dr. {{doctor_name}}
{{doctor_qualification}}
{{doctor_specialization}}
Registration No: {{doctor_registration}}`,
              isDefault: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]
        };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (template: typeof newTemplate) => {
      const response = await api.post('/doctors/templates', template);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-templates'] });
      setIsCreateDialogOpen(false);
      setNewTemplate({ name: "", type: "prescription", content: "", isDefault: false });
      toast({ title: "Success", description: "Template created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
    }
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async (template: Template) => {
      const response = await api.put(`/doctors/templates/${template.id}`, template);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-templates'] });
      setEditingTemplate(null);
      toast({ title: "Success", description: "Template updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template", variant: "destructive" });
    }
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await api.delete(`/doctors/templates/${templateId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-templates'] });
      toast({ title: "Success", description: "Template deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete template", variant: "destructive" });
    }
  });

  const filteredTemplates = templatesData?.templates?.filter((template: Template) => {
    const matchesType = selectedType === "all" || template.type === selectedType;
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  }) || [];

  const getTemplateIcon = (type: string) => {
    const templateType = templateTypes.find(t => t.id === type);
    return templateType?.icon || FileText;
  };

  const getTemplateColor = (type: string) => {
    const templateType = templateTypes.find(t => t.id === type);
    return templateType?.color || "bg-gray-500";
  };

  const getTemplateTypeName = (type: string) => {
    const templateType = templateTypes.find(t => t.id === type);
    return templateType?.name || type;
  };

  const handleCreateTemplate = () => {
    if (!newTemplate.name || !newTemplate.content) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createTemplateMutation.mutate(newTemplate);
  };

  const handleDuplicateTemplate = (template: Template) => {
    setNewTemplate({
      name: `${template.name} (Copy)`,
      type: template.type,
      content: template.content,
      isDefault: false
    });
    setIsCreateDialogOpen(true);
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-brand">Document Templates</h1>
              <p className="text-muted mt-1">Manage your prescription and document templates</p>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Template</DialogTitle>
                  <DialogDescription>
                    Create a reusable document template. Use {"{{variable_name}}"} for dynamic fields.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Template Name</Label>
                      <Input
                        placeholder="e.g., Standard Prescription"
                        value={newTemplate.name}
                        onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Template Type</Label>
                      <Select
                        value={newTemplate.type}
                        onValueChange={(value) => setNewTemplate({ ...newTemplate, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {templateTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              <div className="flex items-center gap-2">
                                <type.icon className="h-4 w-4" />
                                {type.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Template Content</Label>
                    <Textarea
                      placeholder="Enter template content. Use {{variable}} for dynamic fields..."
                      className="min-h-[300px] font-mono text-sm"
                      value={newTemplate.content}
                      onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="default"
                      checked={newTemplate.isDefault}
                      onCheckedChange={(checked) => setNewTemplate({ ...newTemplate, isDefault: checked })}
                    />
                    <Label htmlFor="default">Set as default template for this type</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateTemplate} disabled={createTemplateMutation.isPending}>
                    {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Template Type Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {templateTypes.map((type) => {
              const count = templatesData?.templates?.filter((t: Template) => t.type === type.id).length || 0;
              return (
                <Card
                  key={type.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedType === type.id ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setSelectedType(selectedType === type.id ? "all" : type.id)}
                >
                  <CardContent className="p-4 text-center">
                    <div className={`w-12 h-12 mx-auto rounded-full ${type.color} flex items-center justify-center mb-3`}>
                      <type.icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-medium text-sm">{type.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{count} templates</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Search and Filter */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-[200px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {templateTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Templates List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-20 bg-gray-200 rounded"></div>
                  </CardContent>
                </Card>
              ))
            ) : filteredTemplates.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="p-12 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg">No templates found</h3>
                  <p className="text-muted-foreground mt-1">
                    {searchQuery ? "Try a different search term" : "Create your first template to get started"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredTemplates.map((template: Template) => {
                const Icon = getTemplateIcon(template.type);
                return (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${getTemplateColor(template.type)}`}>
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{template.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {getTemplateTypeName(template.type)}
                            </CardDescription>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setPreviewTemplate(template)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingTemplate(template)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicateTemplate(template)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs text-muted-foreground max-h-24 overflow-hidden">
                        {template.content.substring(0, 150)}...
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        {template.isDefault && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          Updated {new Date(template.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Edit Template Dialog */}
          <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Template</DialogTitle>
              </DialogHeader>
              {editingTemplate && (
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Template Name</Label>
                      <Input
                        value={editingTemplate.name}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Template Type</Label>
                      <Select
                        value={editingTemplate.type}
                        onValueChange={(value) => setEditingTemplate({ ...editingTemplate, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {templateTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Template Content</Label>
                    <Textarea
                      className="min-h-[300px] font-mono text-sm"
                      value={editingTemplate.content}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={editingTemplate.isDefault}
                      onCheckedChange={(checked) => setEditingTemplate({ ...editingTemplate, isDefault: checked })}
                    />
                    <Label>Set as default template</Label>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => editingTemplate && updateTemplateMutation.mutate(editingTemplate)}
                  disabled={updateTemplateMutation.isPending}
                >
                  {updateTemplateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Preview Template Dialog */}
          <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Template Preview: {previewTemplate?.name}</DialogTitle>
                <DialogDescription>
                  {previewTemplate && getTemplateTypeName(previewTemplate.type)}
                </DialogDescription>
              </DialogHeader>
              <div className="bg-white border rounded-lg p-6 font-mono text-sm whitespace-pre-wrap max-h-[60vh] overflow-auto">
                {previewTemplate?.content}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
                  Close
                </Button>
                <Button onClick={() => {
                  if (previewTemplate) {
                    setEditingTemplate(previewTemplate);
                    setPreviewTemplate(null);
                  }
                }}>
                  Edit Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </MainLayout>
  );
};

export default DoctorDocumentTemplates;
