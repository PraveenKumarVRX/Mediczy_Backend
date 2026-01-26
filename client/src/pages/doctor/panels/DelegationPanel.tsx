import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCog, Shield } from 'lucide-react';

export default function DelegationPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          Delegation & Audit Trail
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-gray-600">Track assistant actions, review delegated tasks, and co-sign orders</p>
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Shield className="h-4 w-4" />
            Complete audit trail with before/after states
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
