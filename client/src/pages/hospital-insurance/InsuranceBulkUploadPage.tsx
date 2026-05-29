import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { MalwareWarningDialog, parseMalwareError } from '@/components/MalwareWarningDialog';
import { Upload, Download, FileText, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

const InsuranceBulkUploadPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const base = `/hospital/${slug || localStorage.getItem('hospitalInsuranceSlug') || 'hospital'}/insurance`;
  const [malwareWarning, setMalwareWarning] = useState<{ open: boolean; threat?: string; fileName?: string }>({ open: false });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState('claims');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const uploadTypes = [
    { value: 'claims', label: 'Bulk Claims Upload', template: 'claims_template.csv' },
    { value: 'tariff', label: 'Tariff / Rate Card', template: 'hospital-rate-card-template.csv' },
  ];

  const toCell = (value: unknown) => String(value ?? '').trim();
  const normalizeHeader = (value: unknown) => toCell(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const toAmount = (value: unknown) => Number(toCell(value).replace(/[^0-9.-]/g, '')) || 0;

  const parseCsv = (text: string) => {
    const rows: string[][] = [];
    let current = '';
    let record: string[] = [];
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        record.push(current.trim());
        current = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') index += 1;
        record.push(current.trim());
        if (record.some(Boolean)) rows.push(record);
        current = '';
        record = [];
      } else {
        current += char;
      }
    }
    record.push(current.trim());
    if (record.some(Boolean)) rows.push(record);
    return rows;
  };

  const rowsToObjects = (rows: unknown[][]) => {
    const [headerRow, ...dataRows] = rows;
    const headers = (headerRow || []).map(normalizeHeader);
    return dataRows.map((row) => {
      const item: Record<string, unknown> = {};
      headers.forEach((header, index) => { item[header] = row[index]; });
      return item;
    }).filter((row) => Object.values(row).some((value) => toCell(value)));
  };

  const parseUploadRows = async (selectedFile: File) => {
    if (/\.csv$/i.test(selectedFile.name)) return rowsToObjects(parseCsv(await selectedFile.text()));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await selectedFile.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];
    const rows: unknown[][] = [];
    worksheet.eachRow((row) => rows.push(row.values.slice(1)));
    return rowsToObjects(rows);
  };

  const mapClaimRows = (rows: Record<string, unknown>[]) => rows.map((row) => ({
    patientId: toCell(row.patientid || row.patientuhid || row.uhid),
    patientName: toCell(row.patientname || row.patient),
    policyNumber: toCell(row.policynumber || row.policy),
    insuranceProvider: toCell(row.insurer || row.insuranceprovider || row.payer),
    claimAmount: toAmount(row.claimamount || row.billedamount || row.amount),
    diagnosis: toCell(row.diagnosis),
    admissionDate: toCell(row.admissiondate),
    dischargeDate: toCell(row.dischargedate),
    documentsStatus: toCell(row.documentsstatus || row.documentstatus || 'pending'),
  })).filter((row) => row.policyNumber && row.claimAmount > 0);

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
    if (uploadType === 'tariff') {
      navigate(`${base}/tariff`);
      return;
    }
    if (!file) {
      toast({ title: 'Error', description: 'Please select a file first.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const parsedRows = await parseUploadRows(file);
      const claims = mapClaimRows(parsedRows);
      if (!claims.length) {
        throw new Error('No valid claim rows found. Policy number and claim amount are required.');
      }
      const { data } = await api.post('/hospital/insurance/claims/bulk-upload', { claims });
      if (data.success) {
        const successRows = data.results?.success || [];
        const failedRows = data.results?.failed || [];
        setResults({
          total: successRows.length + failedRows.length,
          success: successRows.length,
          failed: failedRows.length,
          errors: failedRows.map((row: any, index: number) => ({ row: index + 2, field: 'record', error: row.error || 'Unable to create claim' })),
        });
        toast({ title: 'Upload Complete', description: `${successRows.length} of ${successRows.length + failedRows.length} records processed.` });
      }
    } catch (err: any) {
      const malware = parseMalwareError(err);
      if (malware.isMalware) {
        setMalwareWarning({ open: true, threat: malware.threat, fileName: file?.name });
      } else {
        toast({ title: 'Upload Failed', description: err?.response?.data?.message || err?.message || 'Failed to upload file', variant: 'destructive' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (uploadType === 'tariff') {
      navigate(`${base}/tariff`);
      return;
    }
    const headers = ['Patient ID', 'Patient Name', 'Policy Number', 'Insurer', 'Claim Amount', 'Diagnosis', 'Admission Date', 'Discharge Date', 'Documents Status'];
    const sample = ['1', 'Ramesh Kumar', 'POL123456', 'Star Health', '125000', 'Appendectomy', '2026-04-05', '2026-04-08', 'pending'];
    const csv = [headers, sample].map((row) => row.map((value) => `"${value}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = uploadTypes.find(t => t.value === uploadType)?.template || 'claims_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
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
                    <Download className="h-4 w-4 mr-1" /> {uploadType === 'tariff' ? 'Open Tariff Upload' : 'Download Template'}
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
                    {uploading ? 'Processing...' : uploadType === 'tariff' ? 'Open Tariff Workspace' : 'Upload & Process'}
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
                  <li>Claims upload posts parsed JSON to the claims bulk endpoint</li>
                  <li>Date format: YYYY-MM-DD</li>
                  <li>Amount must be numeric (no commas)</li>
                  <li>Required columns cannot be empty</li>
                  <li>Use Tariff / Rate Card to open the dedicated payer-wise SOC workspace</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </InsurancePortalLayout>
    <MalwareWarningDialog
      open={malwareWarning.open}
      onClose={() => setMalwareWarning({ open: false })}
      threat={malwareWarning.threat}
      fileName={malwareWarning.fileName}
    />
    </>
  );
};

export default InsuranceBulkUploadPage;
