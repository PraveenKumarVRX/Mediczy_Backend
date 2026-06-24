/**
 * Inpatient admission QR wristband — print-ready patient identification band.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, ArrowLeft, QrCode, CheckCircle2 } from 'lucide-react';

export default function AdmissionWristbandPrint() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [qrUrl, setQrUrl] = useState('');

  const patientId = params.get('patientId') || '1';
  const patientName = params.get('name') ? decodeURIComponent(params.get('name')!) : 'Patient';
  const admissionNumber = params.get('admissionNumber') || `IP${Date.now().toString().slice(-8)}`;
  const uhid = params.get('uhid') || `UHID${patientId.padStart(6, '0')}`;
  const bedNumber = params.get('bed') || 'TBD';
  const wardName = params.get('ward') ? decodeURIComponent(params.get('ward')!) : 'General Ward';
  const admissionDate = params.get('date') || new Date().toISOString().slice(0, 10);

  const generateQr = useCallback(async () => {
    const payload = JSON.stringify({
      type: 'ip_admission',
      patientId,
      uhid,
      admissionNumber,
      patientName,
      bed: bedNumber,
      ward: wardName,
      admittedAt: admissionDate,
      hospital: 'Mediqzy Demo Hospital',
    });
    const url = await QRCode.toDataURL(payload, {
      width: 200,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    setQrUrl(url);
  }, [patientId, uhid, admissionNumber, patientName, bedNumber, wardName, admissionDate]);

  useEffect(() => { generateQr(); }, [generateQr]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <HospitalLayout title="Patient Wristband" subtitle="QR identification band for inpatient">
      <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4 print:p-0">
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>

        {/* Print-only wristband */}
        <div id="wristband-print" className="print:block">
          <Card className="border-2 border-slate-300 overflow-hidden print:shadow-none print:border-black">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-4 py-2 flex justify-between items-center">
              <span className="font-bold text-sm tracking-wide">MEDIQZY HOSPITAL</span>
              <Badge className="bg-white/20 text-white border-0 text-xs">IPD</Badge>
            </div>
            <CardContent className="p-4 flex gap-4 items-center">
              <div className="shrink-0 border-2 border-slate-200 rounded-lg p-1 bg-white">
                {qrUrl ? (
                  <img src={qrUrl} alt="Patient QR" className="w-24 h-24 block" />
                ) : (
                  <QrCode className="w-24 h-24 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-sm space-y-1">
                <p className="text-lg font-bold text-slate-900 truncate">{patientName}</p>
                <p><span className="text-slate-500">UHID:</span> <strong>{uhid}</strong></p>
                <p><span className="text-slate-500">Adm No:</span> <strong>{admissionNumber}</strong></p>
                <p><span className="text-slate-500">Ward/Bed:</span> <strong>{wardName} · {bedNumber}</strong></p>
                <p className="text-xs text-slate-500">Admitted: {admissionDate}</p>
              </div>
            </CardContent>
            <div className="bg-slate-100 px-4 py-1.5 text-[10px] text-slate-600 text-center border-t">
              Scan QR at pharmacy · lab · OT · discharge desk · nurse station
            </div>
          </Card>
        </div>

        <div className="flex gap-3 print:hidden">
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> Print Wristband
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={() => navigate('/hospital/ward')}>
            <CheckCircle2 className="h-4 w-4" /> Ward Dashboard
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center print:hidden">
          Band encodes patient ID, admission number, ward and bed for bedside scanning workflows.
        </p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #wristband-print, #wristband-print * { visibility: visible; }
          #wristband-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </HospitalLayout>
  );
}
