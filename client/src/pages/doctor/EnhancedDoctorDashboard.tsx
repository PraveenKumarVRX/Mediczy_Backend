/**
 * Enhanced Doctor Dashboard with Clinical Workflow Features
 * Queue + SOAP notes only — additional panels ship when APIs are ready.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Users } from 'lucide-react';
import ClinicalWorkflowPanel from './panels/ClinicalWorkflowPanel';
import QueueManagementPanel from './panels/QueueManagementPanel';

export default function EnhancedDoctorDashboard() {
  const [activeTab, setActiveTab] = useState('queue');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clinical Notes</h1>
        <p className="text-sm text-muted-foreground">OPD queue and SOAP documentation</p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Queue</span>
          </TabsTrigger>
          <TabsTrigger value="clinical" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>SOAP Notes</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6">
          <QueueManagementPanel />
        </TabsContent>

        <TabsContent value="clinical" className="mt-6">
          <ClinicalWorkflowPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
