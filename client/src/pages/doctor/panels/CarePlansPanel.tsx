import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export default function CarePlansPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Care Plans & Follow-ups</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-gray-600">Patient care plans with tasks, goals, and progress tracking</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Task Completion</span>
              <span>65%</span>
            </div>
            <Progress value={65} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
