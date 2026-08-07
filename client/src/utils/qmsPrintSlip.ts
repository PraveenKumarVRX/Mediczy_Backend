export type QmsPrintSlip = {
  tokenNumber?: string;
  token_number?: string;
  journeyToken?: string;
  department?: string;
  patientName?: string;
  patient_name?: string;
  doctorName?: string;
  doctor_name?: string;
  counterId?: string;
  counter_id?: string;
  queueZone?: string;
  queue_zone?: string;
  estimatedWaitMinutes?: number | null;
  estimated_wait_minutes?: number | null;
  specialization?: string | null;
  uhid?: string | null;
  appointmentTime?: string | null;
  hospitalName?: string;
  note?: string;
};

/** Opens a printable OPD token slip (kiosk / reception). */
export function printQmsTokenSlip(token: QmsPrintSlip) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return;

  const tokenNo = token.journeyToken || token.tokenNumber || token.token_number || '—';
  const patient = token.patientName || token.patient_name || 'Patient';
  const doctor = token.doctorName || token.doctor_name || '';
  const counter = token.counterId || token.counter_id || doctor || '—';
  const zone = token.queueZone || token.queue_zone || '';
  const dept = token.department || '';
  const wait = token.estimatedWaitMinutes ?? token.estimated_wait_minutes;
  const hospital = token.hospitalName || 'MediQzy Hospital';
  const issued = new Date().toLocaleString();

  w.document.write(`<!DOCTYPE html><html><head><title>Token ${tokenNo}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; text-align: center; padding: 12px; color: #0f172a; }
  h1 { font-size: 16px; margin: 0 0 4px; letter-spacing: 0.04em; text-transform: uppercase; }
  .token { font-size: 52px; font-weight: 900; color: #0d9488; line-height: 1.1; margin: 12px 0; }
  .meta { font-size: 13px; margin: 4px 0; }
  .box { border: 2px dashed #0d9488; border-radius: 12px; padding: 12px; margin: 12px 0; }
  .foot { font-size: 11px; color: #64748b; margin-top: 16px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
</style></head><body>
  <h1>${hospital}</h1>
  <div class="meta">Hospital Journey Token</div>
  <div class="box">
    <div class="token">${tokenNo}</div>
    <div class="meta"><strong>${patient}</strong></div>
    ${dept ? `<div class="meta">Current: ${dept.toUpperCase()}</div>` : ''}
    ${doctor ? `<div class="meta">Doctor: ${doctor}</div>` : ''}
    ${token.specialization ? `<div class="meta">OPD: ${token.specialization}</div>` : ''}
    <div class="meta">Counter / Room: ${counter}</div>
    ${wait != null ? `<div class="meta">Est. wait: ~${wait} min</div>` : ''}
    ${token.appointmentTime ? `<div class="meta">Appt: ${token.appointmentTime}</div>` : ''}
    ${token.uhid ? `<div class="meta">UHID: ${token.uhid}</div>` : ''}
  </div>
  <div class="meta">Issued: ${issued}</div>
  ${zone ? `<div class="meta">Zone: ${zone}</div>` : ''}
  <hr />
  <div class="foot">Use this <strong>same token</strong> at OPD, Lab, Radiology and Pharmacy today.<br/>A WhatsApp/SMS copy is sent when a mobile is provided. Do not lose this slip.</div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},400)}</script>
</body></html>`);
  w.document.close();
}
