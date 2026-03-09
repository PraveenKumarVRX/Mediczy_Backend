import { useState, useRef } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, FileText, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

const InsuranceBulkUploadPage = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState('claims');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const uploadTypes = [
    { value: 'claims', label: 'Bulk Claims Upload', template: 'claims_template.csv' },
    { value: 'preauth', label: 'Pre-Auth Batch Upload', template: 'preauth_template.csv' },
    { value: 'doctors', label: 'Doctors List', template: 'doctors_template.csv' },
    { value: 'tariff', label: 'Tariff / Rate Card', template: 'tariff_template.csv' },
    { value: 'patients', label: 'Patient Data', template: 'patients_template.csv' },
    { value: 'reconciliation', label: 'Reconciliation Data', template: 'reconciliation_template.csv' },
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.endsWith('.csv') && !f.name.endsWith('.xlsx')) {
        toast({ title: 'Error', description: 'Only CSV and XLSX files are supported.', variant: 'destructive' });
        return;
      }
      setFile(f);
      setResults(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: 'Error', description: 'Please select a file first.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    // Simulate upload
    await new Promise(r => setTimeout(r, 2000));
    setResults({
      total: 45,
      success: 42,
      failed: 3,
      errors: [
        { row: 12, field: 'PolicyNo', error: 'Invalid policy number format' },
        { row: 28, field: 'Amount', error: 'Amount exceeds maximum limit' },
        { row: 34, field: 'DOB', error: 'Invalid date format (expected DD/MM/YYYY)' },
      ]
    });
    setUploading(false);
    toast({ title: 'Upload Complete', description: '42 of 45 records processed successfully.' });
  };

  const handleDownloadTemplate = () => {
    toast({ title: 'Template Downloaded', description: `${uploadTypes.find(t => t.value === uploadType)?.template} downloaded.` });
  };

  return (
    <InsurancePortalLayout title="Bulk Upload" subtitle="Upload bulk data via CSV/Excel templates">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {/* Upload Section */}
          <div className="col-span-2 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="h-5 w-5" /> Upload Data</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Select value={uploadType} onValueChange={setUploadType}>
                    <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {uploadTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={handleDownloadTemplate}>
                    <Download className="h-4 w-4 mr-1" /> Download Template
                  </Button>
                </div>

                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileSelect} />
                  <Upload className="h-10 w-10 mx-auto mb-3 text-indigo-400" />
                  {file ? (
                    <div>
                      <p className="font-medium text-indigo-700">{file.name}</p>
                      <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium">Click to select file or drag & drop</p>
                      <p className="text-sm text-muted-foreground">Supports CSV and XLSX files</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleUpload} disabled={!file || uploading} className="bg-indigo-600 hover:bg-indigo-700">
                    {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                    {uploading ? 'Processing...' : 'Upload & Process'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {results && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" /> Upload Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded text-center">
                      <p className="text-2xl font-bold">{results.total}</p>
                      <p className="text-xs text-muted-foreground">Total Records</p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded text-center">
                      <p className="text-2xl font-bold text-green-600">{results.success}</p>
                      <p className="text-xs text-muted-foreground">Successful</p>
                    </div>
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded text-center">
                      <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>

                  {results.errors.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-red-500" /> Error Details</p>
                      <table className="w-full text-sm">
                        <thead className="bg-red-50 dark:bg-red-900/20">
                          <tr>
                            <th className="py-1 px-3 text-left font-medium">Row</th>
                            <th className="py-1 px-3 text-left font-medium">Field</th>
                            <th className="py-1 px-3 text-left font-medium">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.errors.map((err: any, i: number) => (
                            <tr key={i} className="border-b">
                              <td className="py-1 px-3">{err.row}</td>
                              <td className="py-1 px-3 font-medium">{err.field}</td>
                              <td className="py-1 px-3 text-red-600">{err.error}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Instructions */}
          <Card className="h-fit">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" /> Instructions</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-3">
              <div className="space-y-2">
                <p className="font-medium">Steps:</p>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                  <li>Select the data type to upload</li>
                  <li>Download the template file</li>
                  <li>Fill in the data following the template format</li>
                  <li>Upload the completed file</li>
                  <li>Review results and fix any errors</li>
                </ol>
              </div>
              <div className="space-y-2">
                <p className="font-medium">Rules:</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>Maximum 1000 rows per upload</li>
                  <li>Date format: DD/MM/YYYY</li>
                  <li>Amount must be numeric (no commas)</li>
                  <li>Required columns cannot be empty</li>
                  <li>File size limit: 5MB</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceBulkUploadPage;
