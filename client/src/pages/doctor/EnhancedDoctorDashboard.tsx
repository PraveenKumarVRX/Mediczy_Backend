/**
 * Enhanced Doctor Dashboard with Clinical Workflow Features
 * Integrates SOAP notes, lab results, care plans, queue management, etc.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/card";
import {
  FileText,
  FlaskConical,
  ClipboardList,
  Users,
  TrendingUp,
  Shield,
  MessageSquare,
  UserCog
} from 'lucide-react';

// Import sub-components (to be created)
import ClinicalWorkflowPanel from './panels/ClinicalWorkflowPanel';
import LabResultsPanel from './panels/LabResultsPanel';
import CarePlansPanel from './panels/CarePlansPanel';
import QueueManagementPanel from './panels/QueueManagementPanel';
import RevenueInsightsPanel from './panels/RevenueInsightsPanel';
import ConsentManagementPanel from './panels/ConsentManagementPanel';
import PatientEngagementPanel from './panels/PatientEngagementPanel';
import DelegationPanel from './panels/DelegationPanel';

export default function EnhancedDoctorDashboard() {
  const [activeTab, setActiveTab] = useState('queue');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Queue</span>
          </TabsTrigger>
          
          <TabsTrigger value="clinical" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Clinical Notes</span>
          </TabsTrigger>
          
          <TabsTrigger value="labs" className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">Labs/Imaging</span>
          </TabsTrigger>
          
          <TabsTrigger value="careplans" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Care Plans</span>
          </TabsTrigger>
          
          <TabsTrigger value="revenue" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Revenue</span>
          </TabsTrigger>
          
          <TabsTrigger value="consent" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Consent</span>
          </TabsTrigger>
          
          <TabsTrigger value="engagement" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Patient Engage</span>
          </TabsTrigger>
          
          <TabsTrigger value="delegation" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            <span className="hidden sm:inline">Delegation</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6">
          <QueueManagementPanel />
        </TabsContent>

        <TabsContent value="clinical" className="mt-6">
          <ClinicalWorkflowPanel />
        </TabsContent>

        <TabsContent value="labs" className="mt-6">
          <LabResultsPanel />
        </TabsContent>

        <TabsContent value="careplans" className="mt-6">
          <CarePlansPanel />
        </TabsContent>

        <TabsContent value="revenue" className="mt-6">
          <RevenueInsightsPanel />
        </TabsContent>

        <TabsContent value="consent" className="mt-6">
          <ConsentManagementPanel />
        </TabsContent>

        <TabsContent value="engagement" className="mt-6">
          <PatientEngagementPanel />
        </TabsContent>

        <TabsContent value="delegation" className="mt-6">
          <DelegationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
