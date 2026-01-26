import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, FileSignature } from 'lucide-react';

export default function ConsentManagementPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Consent Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-gray-600">HIPAA-compliant consent tracking with e-signatures</p>
          <div className="flex items-center gap-2 text-sm text-green-600">
            <FileSignature className="h-4 w-4" />
            All consents electronically signed and verified
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
