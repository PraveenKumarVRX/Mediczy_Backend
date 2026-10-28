import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, FlaskConical, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { loadRazorpayScript } from '@/utils/razorpay';
import { useSearchParams } from 'react-router-dom';

type Package = { eligibleRelations?: string[]; id: string; name: string; description?: string; tests?: { name?: string }[]; benefits?: string[]; price: number; currency?: string; validTo?: string | null; usedAt?: string | null };
type Lab = { id: string; name: string; address?: Record<string, string> | string; rating?: number; accreditation?: string[] };
type Slot = { id: string; label: string; value: string; available: boolean };
type Booking = { relation?: string; id: string; bookingReference: string; package: Package; lab: Lab; patient: { name: string; phone: string; email?: string }; date: string; timeSlot: string; status: string; payment: { status: string; amount: number } };

const today = new Date();
const dates = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i + 1); return d.toISOString().slice(0, 10); });
const displayDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const addressText = (address?: Lab['address']) => typeof address === 'string' ? address : Object.values(address || {}).filter(Boolean).join(', ');

export default function HealthCheckupBooking() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const requestedPackageId = searchParams.get('packageId');
  const requestedLabId = searchParams.get('labId');
  const [packages, setPackages] = useState<Package[]>([]);
  const [memberType, setMemberType] = useState<'individual' | 'corporate' | null>(null);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [relation, setRelation] = useState('self');
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [patient, setPatient] = useState({ name: '', phone: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showBookings, setShowBookings] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, p, b] = await Promise.all([api.get('/health-checkups/me'), api.get('/health-checkups/packages'), api.get('/health-checkups/bookings')]);
      const availablePackages: Package[] = p.data?.packages || [];
      setMemberType(m.data?.memberType || null);
      setPackages(availablePackages); setBookings(b.data?.bookings || []);
      if (requestedPackageId) setSelectedPackage(availablePackages.find((item) => item.id === requestedPackageId) || null);
      if (!patient.name && m.data?.employee) setPatient({ name: [m.data.employee.firstName, m.data.employee.lastName].filter(Boolean).join(' '), phone: m.data.employee.phone || '', email: m.data.employee.email || '' });
    } catch (error: any) { toast({ title: 'Unable to load checkups', description: error.response?.data?.message || 'Please try again.', variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [requestedPackageId, requestedLabId]);
  useEffect(() => {
    if (!selectedLab || !date) { setSlots([]); setTimeSlot(''); return; }
    let current = true; setTimeSlot('');
    setSlotsLoading(true); api.get('/health-checkups/slots', { params: { labId: selectedLab.id, date, packageId:selectedPackage?.id, relation } }).then((r) => {if(current) setSlots(r.data?.slots || []);}).catch(() => {if(current) setSlots([]);}).finally(() => {if(current) setSlotsLoading(false);});
    return () => {current = false;};
  }, [selectedLab, date, selectedPackage?.id, relation]);

  useEffect(() => {
    if (!selectedPackage || reschedulingId) return;
    const initial = (selectedPackage.eligibleRelations || ['self'])[0] || '';
    setRelation(initial);
    if (initial !== 'self') setPatient({name:'',phone:'',email:''});
  }, [selectedPackage?.id, reschedulingId]);
  useEffect(() => {
    let current = true;
    setLabs([]); setSelectedLab(null); setSlots([]); setTimeSlot('');
    if (selectedPackage && relation) api.get('/health-checkups/labs', {params:{packageId:selectedPackage.id,relation}}).then(r => {
      if (!current) return;
      const available: Lab[] = r.data?.labs || []; setLabs(available);
      const venueId = reschedulingId ? bookings.find(b => b.id===reschedulingId)?.lab.id : requestedLabId;
      if (venueId) setSelectedLab(available.find(l => String(l.id) === String(venueId)) || null);
    }).catch(() => {if(current) toast({title:'Unable to load eligible venues',variant:'destructive'});});
    return () => {current = false;};
  }, [selectedPackage?.id, relation, requestedLabId, reschedulingId]);

  const canBook = Boolean(selectedPackage && selectedLab && date && timeSlot && (reschedulingId || (patient.name.trim() && patient.phone.trim())));
  const packageTests = useMemo(() => selectedPackage?.tests?.map((t) => t.name).filter(Boolean) || [], [selectedPackage]);
  const createBooking = async () => {
    if (!canBook || !selectedPackage || !selectedLab) return;
    setSaving(true);
    try {
      const result = reschedulingId
        ? await api.post(`/health-checkups/bookings/${reschedulingId}/reschedule`, { date, timeSlot })
        : await api.post('/health-checkups/bookings', { packageId: selectedPackage.id, labId: selectedLab.id, date, timeSlot, patient, relation });
      if (reschedulingId) {
        setBookings((current) => current.map((item) => item.id === reschedulingId ? result.data.booking : item));
        toast({ title: 'Booking rescheduled', description: `Reference ${result.data.booking.bookingReference}` });
        setReschedulingId(null); setSelectedPackage(null); setSelectedLab(null); setDate(''); setTimeSlot(''); setShowBookings(true);
        return;
      }
      const booking: Booking = result.data.booking;
      if (booking.payment?.status === 'pending') {
        toast({ title: 'Booking created', description: 'Opening secure payment to confirm this package.' });
        await payBooking(booking);
      } else toast({ title: 'Booking confirmed', description: `Reference ${booking.bookingReference}` });
      setBookings((current) => [booking, ...current]); setSelectedPackage(null); setSelectedLab(null); setDate(''); setTimeSlot('');
    } catch (error: any) { toast({ title: 'Booking failed', description: error.response?.data?.message || 'The selected slot may no longer be available.', variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const startReschedule = (booking: Booking) => {
    setReschedulingId(booking.id);
    setRelation(booking.relation || 'self');
    setSelectedPackage(booking.package);
    setSelectedLab(labs.find((lab) => lab.id === booking.lab.id) || booking.lab);
    setDate(booking.date); setTimeSlot(booking.timeSlot); setShowBookings(false);
  };
  const payBooking = async (booking: Booking) => {
    try {
      const orderResponse = await api.post(`/health-checkups/bookings/${booking.id}/payment`);
      const payment = orderResponse.data?.payment;
      if (!payment?.required) return;
      if (!(await loadRazorpayScript()) || !window.Razorpay) throw new Error('Payment checkout is unavailable');
      await new Promise<void>((resolve, reject) => {
        const checkout = new window.Razorpay({ key: payment.key, amount: payment.amountInPaise, currency: payment.currency, name: 'Mediqzy', description: booking.package.name, order_id: payment.orderId, prefill: { name: booking.patient.name, email: booking.patient.email, contact: booking.patient.phone }, theme: { color: '#0891b2' }, handler: async (response: any) => {
          try { await api.post(`/health-checkups/bookings/${booking.id}/payment/verify`, { razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }); toast({ title: 'Payment confirmed', description: `Booking ${booking.bookingReference} is confirmed.` }); resolve(); }
          catch (error: any) { reject(error); }
        }, modal: { ondismiss: () => reject(new Error('Payment cancelled')) } });
        checkout.open();
      });
      await load();
    } catch (error: any) { toast({ title: 'Payment pending', description: error.message || 'Complete payment from My bookings.', variant: 'destructive' }); }
  };
  const cancel = async (id: string) => { try { const r = await api.post(`/health-checkups/bookings/${id}/cancel`, { reason: 'Cancelled by member' }); setBookings((items) => items.map((b) => b.id === id ? r.data.booking : b)); toast({ title: 'Booking cancelled' }); } catch (error: any) { toast({ title: 'Unable to cancel', description: error.response?.data?.message || 'Please try again.', variant: 'destructive' }); } };

  return <MainLayout><div className="min-h-screen bg-slate-950 text-white px-4 py-6 md:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-cyan-300">Patient App · Health Checkups {memberType && <Badge className="ml-2 align-middle">{memberType === 'corporate' ? 'Corporate member' : 'Individual member'}</Badge>}</p><h1 className="text-2xl font-bold">Book a health checkup</h1><p className="text-sm text-slate-400">Your eligibility, package price, network labs and availability are verified by the server.</p></div><Button variant="outline" onClick={() => setShowBookings((v) => !v)}>{showBookings ? 'New booking' : 'My bookings'} </Button></div>
    {showBookings ? <Card className="border-white/10 bg-white/[0.04]"><CardHeader><CardTitle>My health checkup bookings</CardTitle></CardHeader><CardContent className="space-y-3">{bookings.length === 0 ? <p className="text-sm text-slate-400">No health checkup bookings yet.</p> : bookings.map((b) => <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div><p className="font-semibold">{b.package.name}</p><p className="text-sm text-slate-400">{b.lab.name} · {displayDate(b.date)} · {b.timeSlot}</p><p className="text-xs text-slate-500">Reference: {b.bookingReference}</p></div><div className="flex items-center gap-2"><Badge>{b.status.replace('_', ' ')}</Badge>{['payment_pending','confirmed','scheduled','rescheduled'].includes(b.status) && <><Button size="sm" variant="outline" onClick={() => startReschedule(b)}>Reschedule</Button><Button size="sm" variant="outline" onClick={() => cancel(b.id)}>Cancel</Button></>}</div></div>)}</CardContent></Card> : <>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div> : <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="border-white/10 bg-white/[0.04]"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-300" />Eligible packages</CardTitle></CardHeader><CardContent className="space-y-3">{packages.length === 0 ? <p className="text-sm text-slate-400">No eligible health checkup package is assigned to this account. Corporate eligibility is configured by HR.</p> : packages.map((p) => <button key={p.id} disabled={Boolean(reschedulingId)} onClick={() => setSelectedPackage(p)} className={`w-full rounded-xl border p-4 text-left transition ${selectedPackage?.id === p.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 hover:border-cyan-400/50'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{p.name}</p><p className="mt-1 text-sm text-slate-400">{p.description || 'Preventive health screening package'}</p></div><Badge>{memberType !== 'corporate' && p.price > 0 ? `₹${p.price.toLocaleString('en-IN')}` : 'Corporate benefit'}</Badge></div>{(p.tests || []).length > 0 && <p className="mt-3 text-xs text-slate-300"><FlaskConical className="mr-1 inline h-3.5 w-3.5" />{(p.tests || []).map((t) => t.name).filter(Boolean).join(' · ')}</p>}</button>)}</CardContent></Card>
        <Card className="border-white/10 bg-white/[0.04]"><CardHeader><CardTitle>{reschedulingId ? 'Reschedule appointment' : 'Choose venue and appointment'}</CardTitle></CardHeader><CardContent className="space-y-5"><div><Label>Beneficiary relation</Label><select aria-label="Beneficiary relation" disabled={Boolean(reschedulingId)} className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 p-2" value={relation} onChange={e => {setRelation(e.target.value); setPatient({name:'',phone:'',email:''});}}>{(selectedPackage?.eligibleRelations || ['self']).map(r => <option key={r} value={r}>{r === 'self' ? 'Employee / self' : r.replace(/_/g,' ')}</option>)}</select></div><div><Label>Lab, diagnostic centre or hospital</Label><select className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 p-2" disabled={Boolean(reschedulingId)} value={selectedLab?.id || ''} onChange={(e) => setSelectedLab(labs.find((l) => l.id === e.target.value) || null)}><option value="">Select a venue</option>{labs.map((l) => <option key={l.id} value={l.id}>{l.name}{addressText(l.address) ? ` · ${addressText(l.address)}` : ''}</option>)}</select>{labs.length === 0 && <p className="mt-2 text-xs text-amber-300">No venues are available for this package and relation. Contact your account team.</p>}</div><div><Label>Date</Label><div className="mt-2 grid grid-cols-3 gap-2">{dates.map((d) => <button key={d} disabled={!selectedLab} onClick={() => setDate(d)} className={`rounded-lg border p-2 text-xs ${date === d ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10'} disabled:opacity-40`}><Calendar className="mx-auto mb-1 h-3.5 w-3.5" />{displayDate(d)}</button>)}</div></div><div><Label>Time slot</Label>{slotsLoading ? <Loader2 className="mt-3 h-4 w-4 animate-spin" /> : slots.length === 0 ? <p className="mt-2 text-xs text-slate-400">Select a venue and date. Only configured slots are shown.</p> : <div className="mt-2 grid grid-cols-2 gap-2">{slots.map((s) => <button key={s.id} disabled={!s.available} onClick={() => setTimeSlot(s.value)} className={`rounded-lg border p-2 text-sm ${timeSlot === s.value ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10'} disabled:cursor-not-allowed disabled:opacity-40`}><Clock className="mr-1 inline h-3.5 w-3.5" />{s.label}</button>)}</div>}</div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Patient name</Label><Input className="mt-2" value={patient.name} onChange={(e) => setPatient({ ...patient, name: e.target.value })} /></div><div><Label>Phone</Label><Input className="mt-2" value={patient.phone} onChange={(e) => setPatient({ ...patient, phone: e.target.value })} /></div></div><div><Label>Email (optional)</Label><Input className="mt-2" type="email" value={patient.email} onChange={(e) => setPatient({ ...patient, email: e.target.value })} /></div><div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-slate-300"><MapPin className="mr-1 inline h-4 w-4 text-cyan-300" />{selectedPackage ? `${selectedPackage.name} · ` : 'Choose a package · '}{selectedLab ? selectedLab.name : 'choose a lab'}{packageTests.length > 0 && <span className="block mt-1 text-xs text-slate-500">Includes: {packageTests.join(', ')}</span>}</div><Button disabled={!canBook || saving} onClick={createBooking} className="w-full bg-cyan-600 hover:bg-cyan-500">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{reschedulingId ? 'Save new appointment' : 'Confirm booking'}</Button><p className="text-xs text-slate-500">Corporate packages are billed to the employer when eligible. Individual packages with a price require Razorpay payment after booking.</p></CardContent></Card>
      </div>}
    </>}
  </div></div></MainLayout>;
}
