import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Upload } from 'lucide-react';

export default function LabResultsPanel() {
  const [results, setResults] = useState([]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lab Results & Imaging</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-gray-600">Lab results integration panel - displays abnormal flags and critical values</p>
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Abnormal
            </Badge>
            <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Normal
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
