import ECardDisplay from "@/components/tpa/ECardDisplay";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Download, Shield } from "lucide-react";

export default function TPAECardPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Digital E-Card Retrieval</h1>
        <p className="text-muted-foreground">
          Get your digital health insurance card from any TPA provider instantly
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instant Access</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">&lt;1s</div>
            <p className="text-xs text-muted-foreground">Retrieval time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Download Options</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">PDF</div>
            <p className="text-xs text-muted-foreground">Print & download</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Secure</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">256-bit</div>
            <p className="text-xs text-muted-foreground">Encryption</p>
          </CardContent>
        </Card>
      </div>

      {/* E-Card Display */}
      <Card>
        <CardHeader>
          <CardTitle>Retrieve Your E-Card</CardTitle>
          <CardDescription>
            Enter your policy details to view and download your digital health insurance card
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ECardDisplay policyNumber="" memberId="" />
        </CardContent>
      </Card>

      {/* Features */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">E-Card Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
            <div className="flex-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">Instant Digital Access</p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Get your health insurance card immediately without waiting for physical copies
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
            <div className="flex-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">Download & Print</p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Download as PDF for offline access and print physical copies when needed
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
            <div className="flex-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">Multi-Provider Support</p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Access e-cards from all supported TPA providers through one unified interface
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
            <div className="flex-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">QR Code Integration</p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                E-cards include QR codes for quick verification at hospitals and clinics
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
