import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from 'lucide-react';

export default function PatientEngagementPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Patient Engagement
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-gray-600">Post-visit instructions, education materials, and secure messaging</p>
          <div className="text-sm text-gray-500">
            Multi-channel delivery: Email, SMS, WhatsApp, In-App
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
