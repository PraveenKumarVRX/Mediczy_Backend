import ClaimSubmissionUI from "@/components/tpa/ClaimSubmissionUI";
import TPASidebar from "@/components/tpa/TPASidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, CheckCircle2 } from "lucide-react";

export default function TPAClaimSubmissionPage() {
  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Submit Insurance Claim</h1>
        <p className="text-muted-foreground">
          Submit claims to any TPA provider through our unified claim submission interface
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Supported TPAs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">17</div>
            <p className="text-xs text-muted-foreground">All major providers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing Time</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">&lt;2s</div>
            <p className="text-xs text-muted-foreground">Average submission</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">99.5%</div>
            <p className="text-xs text-muted-foreground">Successful submissions</p>
          </CardContent>
        </Card>
      </div>

      {/* Claim Submission Form */}
      <Card>
        <CardHeader>
          <CardTitle>Claim Details</CardTitle>
          <CardDescription>
            Fill in the claim information below. All fields are required for submission.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClaimSubmissionUI
            onSuccess={(claimNumber) => {
              console.log("Claim submitted successfully:", claimNumber);
            }}
          />
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">Need Help?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-blue-800 dark:text-blue-200">
          <p className="text-sm">
            <strong>Tip:</strong> Make sure you have your policy number and member ID ready before starting.
          </p>
          <p className="text-sm">
            <strong>Note:</strong> Claim submissions are processed in real-time and you'll receive a claim number immediately upon success.
          </p>
          <p className="text-sm">
            <strong>Support:</strong> For assistance with claim submission, contact your TPA provider directly or reach out to our support team.
          </p>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}
