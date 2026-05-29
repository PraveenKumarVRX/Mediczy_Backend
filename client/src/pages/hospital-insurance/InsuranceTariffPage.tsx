import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { fetchPortalSection, savePortalSection } from '@/utils/hospitalInsurancePortalApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Calendar, Download, FileSpreadsheet, IndianRupee, Plus, Search, Upload, X } from 'lucide-react';

type DiscountType = 'percentage' | 'flat' | 'package' | 'none';
type TariffStatus = 'active' | 'upcoming' | 'expired';

type TariffRow = {
  id: string;
  payerName: string;
  payerType: 'insurer' | 'tpa' | 'government' | 'corporate';
  tpaName: string;
  agreementCode: string;
  category: string;
  serviceCode: string;
  serviceName: string;
  unit: string;
  grossRate: number;
  discountType: DiscountType;
  discountValue: number;
  contractedRate: number;
  gst: number;
  validFrom: string;
  validTo: string;
  discountTerms: string;
  documentName: string;
  uploadedAt: string;
  status: TariffStatus;
};

type UploadBatch = {
  id: string;
  fileName: string;
  payerName: string;
  tpaName: string;
  rowCount: number;
  validFrom: string;
  validTo: string;
  uploadedAt: string;
};

type TariffSection = {
  insurers?: string[];
  tpas?: string[];
  categories?: string[];
  items?: unknown[];
  uploads?: UploadBatch[];
  lastUpdated?: string;
};

type DraftState = {
  payerName: string;
  payerType: TariffRow['payerType'];
  tpaName: string;
  agreementCode: string;
  validFrom: string;
  validTo: string;
  discountType: DiscountType;
  discountValue: string;
  discountTerms: string;
  category: string;
  serviceCode: string;
  serviceName: string;
  unit: string;
  grossRate: string;
  contractedRate: string;
  gst: string;
};

const defaultPayers = ['Star Health', 'Medi Assist', 'Care Health', 'HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz', 'Niva Bupa', 'New India', 'United India', 'CGHS', 'ECHS'];
const defaultTpas = ['Direct', 'Medi Assist', 'Vidal Health', 'Paramount', 'MDIndia', 'FHPL', 'Heritage', 'HealthIndia'];
const defaultCategories = ['Room Charges', 'ICU', 'Procedures', 'Nursing', 'OT Charges', 'Diagnostics', 'Pharmacy', 'Packages', 'Consumables'];

const emptyDraft: DraftState = {
  payerName: 'Star Health',
  payerType: 'insurer',
  tpaName: 'Direct',
  agreementCode: '',
  validFrom: '',
  validTo: '',
  discountType: 'percentage',
  discountValue: '0',
  discountTerms: '',
  category: 'Room Charges',
  serviceCode: '',
  serviceName: '',
  unit: 'per day',
  grossRate: '',
  contractedRate: '',
  gst: '0',
};

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const buildId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const asString = (value: unknown) => String(value ?? '').trim();
const asNumber = (value: unknown) => Number(String(value ?? '0').replace(/[^0-9.-]/g, '')) || 0;

const parseDateValue = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = asString(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
};

const getStatus = (validFrom: string, validTo: string): TariffStatus => {
  const today = new Date().toISOString().slice(0, 10);
  if (validTo && validTo < today) return 'expired';
  if (validFrom && validFrom > today) return 'upcoming';
  return 'active';
};

const calculateContractedRate = (grossRate: number, discountType: DiscountType, discountValue: number, explicitRate?: number) => {
  if (explicitRate && explicitRate > 0) return Math.round(explicitRate);
  if (discountType === 'percentage') return Math.max(0, Math.round(grossRate - (grossRate * discountValue / 100)));
  if (discountType === 'flat') return Math.max(0, Math.round(grossRate - discountValue));
  return Math.round(grossRate);
};

const normalizeDiscountType = (value: unknown): DiscountType => {
  const normalized = asString(value).toLowerCase();
  if (normalized.includes('%') || normalized.includes('percent')) return 'percentage';
  if (normalized.includes('flat') || normalized.includes('amount')) return 'flat';
  if (normalized.includes('package')) return 'package';
  if (normalized === 'none' || normalized === 'na') return 'none';
  return 'percentage';
};

const normalizeTariffRow = (row: any, fallback: Partial<TariffRow> = {}): TariffRow => {
  const payerName = asString(row.payerName || row.payer || row.insurer || fallback.payerName || 'Unassigned Payer');
  const tpaName = asString(row.tpaName || row.tpa || fallback.tpaName || 'Direct');
  const grossRate = asNumber(row.grossRate ?? row.rate ?? row.standardRate);
  const discountType = normalizeDiscountType(row.discountType ?? fallback.discountType ?? 'percentage');
  const discountValue = asNumber(row.discountValue ?? fallback.discountValue ?? 0);
  const validFrom = parseDateValue(row.validFrom ?? row.effective ?? fallback.validFrom);
  const validTo = parseDateValue(row.validTo ?? row.expiry ?? row.expiryDate ?? fallback.validTo);
  const contractedRate = calculateContractedRate(grossRate, discountType, discountValue, asNumber(row.contractedRate ?? row.netRate));

  return {
    id: asString(row.id) || buildId('tariff'),
    payerName,
    payerType: row.payerType || fallback.payerType || (payerName.toLowerCase().includes('cghs') || payerName.toLowerCase().includes('echs') ? 'government' : 'insurer'),
    tpaName,
    agreementCode: asString(row.agreementCode || row.mouCode || fallback.agreementCode),
    category: asString(row.category || fallback.category || 'General'),
    serviceCode: asString(row.serviceCode || row.code || row.itemCode),
    serviceName: asString(row.serviceName || row.item || row.itemName || row.particulars || 'Unnamed service'),
    unit: asString(row.unit || fallback.unit || 'per unit'),
    grossRate,
    discountType,
    discountValue,
    contractedRate,
    gst: asNumber(row.gst),
    validFrom,
    validTo,
    discountTerms: asString(row.discountTerms || row.terms || fallback.discountTerms),
    documentName: asString(row.documentName || fallback.documentName),
    uploadedAt: parseDateValue(row.uploadedAt) || new Date().toISOString(),
    status: getStatus(validFrom, validTo),
  };
};

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
  const headers = (headerRow || []).map((header) => asString(header).toLowerCase().replace(/[^a-z0-9]+/g, ''));
  return dataRows.map((row) => {
    const item: Record<string, unknown> = {};
    headers.forEach((header, index) => { item[header] = row[index]; });
    return item;
  }).filter((row) => Object.values(row).some((value) => asString(value)));
};

const mapImportedRow = (row: Record<string, unknown>, fallback: Partial<TariffRow>): TariffRow => normalizeTariffRow({
  payerName: row.payerinsurancecompany || row.payer || row.insurer || row.insurancecompany,
  payerType: row.payertype,
  tpaName: row.tpa || row.tpaname,
  agreementCode: row.agreementmoucode || row.moucode || row.agreementcode,
  category: row.category || row.servicecategory,
  serviceCode: row.servicecode || row.code,
  serviceName: row.servicename || row.item || row.particulars || row.serviceitem,
  unit: row.unit || row.billingunit,
  grossRate: row.grossrate || row.standardrate || row.hospitalrate || row.rate,
  discountType: row.discounttype,
  discountValue: row.discountvalue || row.discount,
  contractedRate: row.contractedrate || row.netrate || row.approvedrate,
  gst: row.gst,
  validFrom: row.validfrom || row.effectivefrom,
  validTo: row.validto || row.effectiveto || row.expirydate,
  discountTerms: row.discountterms || row.terms,
}, fallback);

const InsuranceTariffPage = () => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [uploads, setUploads] = useState<UploadBatch[]>([]);
  const [payers, setPayers] = useState(defaultPayers);
  const [tpas, setTpas] = useState(defaultTpas);
  const [categories, setCategories] = useState(defaultCategories);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [searchTerm, setSearchTerm] = useState('');
  const [payerFilter, setPayerFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const persistTariffs = async (nextRows: TariffRow[], nextUploads = uploads, extra: Partial<TariffSection> = {}) => {
    setSaving(true);
    const normalizedRows = nextRows.map((row) => ({ ...row, status: getStatus(row.validFrom, row.validTo) }));
    await savePortalSection('compliance/tariff', {
      insurers: Array.from(new Set([...payers, ...normalizedRows.map((row) => row.payerName)].filter(Boolean))),
      tpas: Array.from(new Set([...tpas, ...normalizedRows.map((row) => row.tpaName)].filter(Boolean))),
      categories: Array.from(new Set([...categories, ...normalizedRows.map((row) => row.category)].filter(Boolean))),
      items: normalizedRows,
      uploads: nextUploads,
      lastUpdated: new Date().toISOString(),
      ...extra,
    });
    setTariffs(normalizedRows);
    setUploads(nextUploads);
    setPayers((prev) => Array.from(new Set([...prev, ...normalizedRows.map((row) => row.payerName)].filter(Boolean))));
    setTpas((prev) => Array.from(new Set([...prev, ...normalizedRows.map((row) => row.tpaName)].filter(Boolean))));
    setCategories((prev) => Array.from(new Set([...prev, ...normalizedRows.map((row) => row.category)].filter(Boolean))));
    setSaving(false);
  };

  useEffect(() => {
    fetchPortalSection('compliance/tariff')
      .then((response) => {
        const section = (response?.data || {}) as TariffSection;
        const rows = Array.isArray(section.items) ? section.items.map((row) => normalizeTariffRow(row)) : [];
        setTariffs(rows);
        setUploads(Array.isArray(section.uploads) ? section.uploads : []);
        setPayers(Array.from(new Set([...(section.insurers || []), ...defaultPayers, ...rows.map((row) => row.payerName)].filter(Boolean))));
        setTpas(Array.from(new Set([...(section.tpas || []), ...defaultTpas, ...rows.map((row) => row.tpaName)].filter(Boolean))));
        setCategories(Array.from(new Set([...(section.categories || []), ...defaultCategories, ...rows.map((row) => row.category)].filter(Boolean))));
      })
      .catch(() => {
        toast({ title: 'Unable to load tariff workspace', description: 'Please retry after refreshing the hospital insurance portal.', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const filteredTariffs = useMemo(() => tariffs.filter((row) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = !search || [row.payerName, row.tpaName, row.serviceCode, row.serviceName, row.category, row.agreementCode].some((value) => value.toLowerCase().includes(search));
    return matchesSearch
      && (payerFilter === 'All' || row.payerName === payerFilter)
      && (categoryFilter === 'All' || row.category === categoryFilter)
      && (statusFilter === 'All' || row.status === statusFilter);
  }), [tariffs, searchTerm, payerFilter, categoryFilter, statusFilter]);

  const stats = useMemo(() => ({
    payers: new Set(tariffs.map((row) => row.payerName)).size,
    active: tariffs.filter((row) => row.status === 'active').length,
    expiring: tariffs.filter((row) => row.validTo && row.status === 'active' && row.validTo <= new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)).length,
    uploads: uploads.length,
  }), [tariffs, uploads]);

  const handleTemplateDownload = () => {
    const headers = ['Payer / Insurance Company', 'Payer Type', 'TPA', 'Agreement / MOU Code', 'Category', 'Service Code', 'Service Name', 'Unit', 'Gross Rate', 'Discount Type', 'Discount Value', 'Contracted Rate', 'GST', 'Valid From', 'Valid To', 'Discount Terms'];
    const sample = ['Star Health', 'insurer', 'Direct', 'MOU-SH-2026', 'Room Charges', 'ROOM-PRIVATE', 'Private Room', 'per day', '6000', 'percentage', '10', '5400', '0', '2026-04-01', '2027-03-31', '10% discount on room tariff as per MOU'];
    const csv = [headers, sample].map((row) => row.map((value) => `"${value}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hospital-rate-card-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const headers = ['Payer', 'TPA', 'Agreement', 'Category', 'Service Code', 'Service Name', 'Unit', 'Gross Rate', 'Discount Type', 'Discount Value', 'Contracted Rate', 'GST', 'Valid From', 'Valid To', 'Terms', 'Status'];
    const rows = filteredTariffs.map((row) => [row.payerName, row.tpaName, row.agreementCode, row.category, row.serviceCode, row.serviceName, row.unit, row.grossRate, row.discountType, row.discountValue, row.contractedRate, row.gst, row.validFrom, row.validTo, row.discountTerms, row.status]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hospital-payer-rate-cards.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let rows: Record<string, unknown>[] = [];
      if (/\.csv$/i.test(file.name)) {
        rows = rowsToObjects(parseCsv(await file.text()));
      } else if (/\.xlsx$/i.test(file.name)) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const worksheet = workbook.worksheets[0];
        const tableRows: unknown[][] = [];
        worksheet.eachRow((row) => tableRows.push(row.values.slice(1)));
        rows = rowsToObjects(tableRows);
      } else {
        throw new Error('Upload a CSV or XLSX rate card.');
      }
      const importedRows = rows.map((row) => mapImportedRow(row, {
        payerName: draft.payerName,
        payerType: draft.payerType,
        tpaName: draft.tpaName,
        agreementCode: draft.agreementCode,
        validFrom: draft.validFrom,
        validTo: draft.validTo,
        discountType: draft.discountType,
        discountValue: asNumber(draft.discountValue),
        discountTerms: draft.discountTerms,
        documentName: file.name,
      })).filter((row) => row.serviceName && row.grossRate > 0);
      if (!importedRows.length) throw new Error('No valid tariff rows found. Check the template headers and rates.');
      const batch: UploadBatch = {
        id: buildId('upload'),
        fileName: file.name,
        payerName: draft.payerName,
        tpaName: draft.tpaName,
        rowCount: importedRows.length,
        validFrom: importedRows[0]?.validFrom || draft.validFrom,
        validTo: importedRows[0]?.validTo || draft.validTo,
        uploadedAt: new Date().toISOString(),
      };
      await persistTariffs([...tariffs, ...importedRows], [batch, ...uploads]);
      toast({ title: 'Rate card uploaded', description: `${importedRows.length} tariff rows were added for payer adjudication.` });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error?.message || 'Unable to parse the selected file.', variant: 'destructive' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAddManual = async () => {
    if (!draft.payerName || !draft.serviceName || !draft.grossRate || !draft.validFrom || !draft.validTo) {
      toast({ title: 'Missing tariff details', description: 'Payer, service, gross rate, valid from, and valid to are required.', variant: 'destructive' });
      return;
    }
    const row = normalizeTariffRow({
      ...draft,
      discountValue: asNumber(draft.discountValue),
      grossRate: asNumber(draft.grossRate),
      contractedRate: asNumber(draft.contractedRate),
      gst: asNumber(draft.gst),
    });
    await persistTariffs([...tariffs, row]);
    setDraft({ ...emptyDraft, payerName: draft.payerName, payerType: draft.payerType, tpaName: draft.tpaName, agreementCode: draft.agreementCode, validFrom: draft.validFrom, validTo: draft.validTo, discountType: draft.discountType, discountValue: draft.discountValue, discountTerms: draft.discountTerms });
    toast({ title: 'Tariff row added' });
  };

  const handleDelete = async (id: string) => {
    await persistTariffs(tariffs.filter((row) => row.id !== id));
    toast({ title: 'Tariff row removed' });
  };

  return (
    <InsurancePortalLayout title="Rate Cards & Schedule of Charges" subtitle="Upload payer-wise hospital tariffs, validity windows, and discount terms for cashless adjudication">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          {[{ label: 'Payers mapped', value: stats.payers }, { label: 'Active tariff rows', value: stats.active }, { label: 'Expiring in 45 days', value: stats.expiring }, { label: 'Uploaded rate cards', value: stats.uploads }].map((item) => (
            <Card key={item.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4" /> Upload payer tariff / SOC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Insurance company / TPA</label>
                <Input list="payer-list" value={draft.payerName} onChange={(event) => setDraft({ ...draft, payerName: event.target.value })} placeholder="Star Health" />
                <datalist id="payer-list">{payers.map((payer) => <option key={payer} value={payer} />)}</datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Payer type</label>
                <Select value={draft.payerType} onValueChange={(value: TariffRow['payerType']) => setDraft({ ...draft, payerType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insurer">Insurer</SelectItem>
                    <SelectItem value="tpa">TPA</SelectItem>
                    <SelectItem value="government">Government</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">TPA / channel</label>
                <Input list="tpa-list" value={draft.tpaName} onChange={(event) => setDraft({ ...draft, tpaName: event.target.value })} />
                <datalist id="tpa-list">{tpas.map((tpa) => <option key={tpa} value={tpa} />)}</datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Valid from</label>
                <Input type="date" value={draft.validFrom} onChange={(event) => setDraft({ ...draft, validFrom: event.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Valid to</label>
                <Input type="date" value={draft.validTo} onChange={(event) => setDraft({ ...draft, validTo: event.target.value })} />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-6">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Agreement / MOU</label>
                <Input value={draft.agreementCode} onChange={(event) => setDraft({ ...draft, agreementCode: event.target.value })} placeholder="MOU-2026" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Discount type</label>
                <Select value={draft.discountType} onValueChange={(value: DiscountType) => setDraft({ ...draft, discountType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="flat">Flat amount</SelectItem>
                    <SelectItem value="package">Package rate</SelectItem>
                    <SelectItem value="none">No discount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Discount value</label>
                <Input type="number" value={draft.discountValue} onChange={(event) => setDraft({ ...draft, discountValue: event.target.value })} />
              </div>
              <div className="lg:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Discount terms</label>
                <Input value={draft.discountTerms} onChange={(event) => setDraft({ ...draft, discountTerms: event.target.value })} placeholder="Room cap, exclusions, package inclusions, escalation terms" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} className="hidden" type="file" accept=".csv,.xlsx" onChange={handleFileUpload} />
              <Button onClick={() => fileRef.current?.click()} disabled={saving}><FileSpreadsheet className="mr-2 h-4 w-4" /> Upload CSV/XLSX</Button>
              <Button variant="outline" onClick={handleTemplateDownload}><Download className="mr-2 h-4 w-4" /> Template</Button>
              <p className="text-xs text-muted-foreground">Headers can include payer, TPA, category, service code/name, gross rate, discount, contracted rate, validity, and terms.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Add one tariff row</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-7">
              <Input list="category-list" placeholder="Category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
              <datalist id="category-list">{categories.map((category) => <option key={category} value={category} />)}</datalist>
              <Input placeholder="Service code" value={draft.serviceCode} onChange={(event) => setDraft({ ...draft, serviceCode: event.target.value })} />
              <Input className="lg:col-span-2" placeholder="Service / package name" value={draft.serviceName} onChange={(event) => setDraft({ ...draft, serviceName: event.target.value })} />
              <Input placeholder="Unit" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
              <Input type="number" placeholder="Gross rate" value={draft.grossRate} onChange={(event) => setDraft({ ...draft, grossRate: event.target.value })} />
              <Input type="number" placeholder="Contracted rate" value={draft.contractedRate} onChange={(event) => setDraft({ ...draft, contractedRate: event.target.value })} />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleAddManual} disabled={saving}><Plus className="mr-2 h-4 w-4" /> Add row</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Select value={payerFilter} onValueChange={setPayerFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="All">All payers</SelectItem>{payers.map((payer) => <SelectItem key={payer} value={payer}>{payer}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="All">All categories</SelectItem>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="All">All status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="upcoming">Upcoming</SelectItem><SelectItem value="expired">Expired</SelectItem></SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="w-64 pl-9" placeholder="Search payer, service, MOU..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </div>
          </div>
          <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export filtered</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="border-b bg-slate-50 text-xs text-muted-foreground">
                  <tr>
                    {['Payer / TPA', 'Service', 'Gross', 'Discount', 'Contracted', 'Validity', 'Terms', 'Status', ''].map((header) => <th key={header} className="px-4 py-3 text-left font-medium">{header}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading tariff workspace...</td></tr>}
                  {!loading && filteredTariffs.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-900">{row.payerName}</div>
                        <div className="text-xs text-muted-foreground">{row.tpaName} · {row.agreementCode || 'No MOU code'}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{row.serviceName}</div>
                        <div className="text-xs text-muted-foreground">{row.category} · {row.serviceCode || 'No code'} · {row.unit}</div>
                      </td>
                      <td className="px-4 py-3 align-top font-semibold">{currency.format(row.grossRate)}</td>
                      <td className="px-4 py-3 align-top text-xs">
                        {row.discountType === 'percentage' ? `${row.discountValue}%` : row.discountType === 'flat' ? currency.format(row.discountValue) : row.discountType}
                      </td>
                      <td className="px-4 py-3 align-top font-semibold text-emerald-700">{currency.format(row.contractedRate)}</td>
                      <td className="px-4 py-3 align-top text-xs"><Calendar className="mr-1 inline h-3 w-3" />{row.validFrom || 'NA'} to {row.validTo || 'NA'}</td>
                      <td className="max-w-xs px-4 py-3 align-top text-xs text-muted-foreground">{row.discountTerms || 'No terms recorded'}</td>
                      <td className="px-4 py-3 align-top"><Badge variant={row.status === 'active' ? 'default' : row.status === 'upcoming' ? 'secondary' : 'destructive'}>{row.status}</Badge></td>
                      <td className="px-4 py-3 align-top"><Button size="icon" variant="ghost" onClick={() => handleDelete(row.id)}><X className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                  {!loading && filteredTariffs.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No tariff rows match the current filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Recent uploads</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {uploads.slice(0, 5).map((upload) => (
                <div key={upload.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm">{upload.fileName}</p>
                    <p className="text-xs text-muted-foreground">{upload.payerName} · {upload.tpaName} · {upload.rowCount} rows · {upload.validFrom || 'NA'} to {upload.validTo || 'NA'}</p>
                  </div>
                  <Badge variant="outline">{new Date(upload.uploadedAt).toLocaleDateString('en-IN')}</Badge>
                </div>
              ))}
              {!uploads.length && <p className="text-sm text-muted-foreground">No rate card uploads yet.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertCircle className="h-4 w-4" /> Controls for payer negotiation</CardTitle></CardHeader>
            <CardContent>
              <Textarea readOnly className="min-h-32 resize-none text-sm" value={'Maintain one active rate card per payer/TPA/MOU period. Upload revised Schedule of Charges before expiry, preserve discount terms, and keep gross vs contracted rates explicit so pre-auth estimates and claim deductions can be reconciled payer-wise.'} />
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                <div><IndianRupee className="mb-1 h-4 w-4" />Gross and contracted rate both stored</div>
                <div><Calendar className="mb-1 h-4 w-4" />Validity drives active/upcoming/expired status</div>
                <div><FileSpreadsheet className="mb-1 h-4 w-4" />CSV/XLSX rate cards retained as batches</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceTariffPage;
