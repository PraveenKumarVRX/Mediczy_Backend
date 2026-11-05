import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, FlaskConical, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { loadRazorpayScript } from '@/utils/razorpay';

type Package = { eligibleRelations?: string[]; id: string; name: string; description?: string; tests?: { name?: string }[]; preparationInstructions?: string[]; price: number; currency?: string; validTo?: string | null; usedAt?: string | null };
type Lab = { id: string; name: string; address?: Record<string, string> | string; rating?: number; accreditation?: string[] };
type Slot = { id: string; label: string; value: string; available: boolean };
type Booking = { relation?: string; id: string; bookingReference: string; package: Package; lab: Lab; patient: { name: string; phone: string; email?: string }; date: string; timeSlot: string; status: string; payment: { status: string; amount: number } };

const displayDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const addressText = (address?: Lab['address']) => typeof address === 'string' ? address : Object.values(address || {}).filter(Boolean).join(', ');
const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return date.toISOString().slice(0, 10); };

export default function HealthCheckupBooking() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const requestedPackageId = searchParams.get('packageId');
  const requestedLabId = searchParams.get('labId');
  // Optional beneficiary hint from the Benefits page "Book for family" action; only accept known
  // relations, and the member can still change it to the exact beneficiary the package covers.
  const requestedRelation = (() => { const r = String(searchParams.get('relation') || '').trim(); return ['self', 'spouse', 'child', 'parent', 'parent_in_law', 'sibling'].includes(r) ? r : 'self'; })();
  const [packages, setPackages] = useState<Package[]>([]);
  const [memberType, setMemberType] = useState<'individual' | 'corporate' | null>(null);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [labSearch, setLabSearch] = useState('');
  const [relation, setRelation] = useState(requestedRelation);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [patient, setPatient] = useState({ name: '', phone: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showBookings, setShowBookings] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [member, packageResponse, bookingResponse] = await Promise.all([api.get('/health-checkups/me'), api.get('/health-checkups/packages'), api.get('/health-checkups/bookings')]);
      const availablePackages: Package[] = packageResponse.data?.packages || [];
      setMemberType(member.data?.memberType || null); setPackages(availablePackages); setBookings(bookingResponse.data?.bookings || []);
      if (requestedPackageId) setSelectedPackage(availablePackages.find((item) => item.id === requestedPackageId) || null);
      if (!patient.name && member.data?.employee) setPatient({ name: [member.data.employee.firstName, member.data.employee.lastName].filter(Boolean).join(' '), phone: member.data.employee.phone || '', email: member.data.employee.email || '' });
    } catch (error: any) { toast({ title: 'Unable to load checkups', description: error.response?.data?.message || 'Please try again.', variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [requestedPackageId, requestedLabId]);

  useEffect(() => {
    if (!selectedLab || !date) { setSlots([]); setTimeSlot(''); return; }
    let current = true; setTimeSlot(''); setSlotsLoading(true);
    api.get('/health-checkups/slots', { params: { labId: selectedLab.id, date, packageId: selectedPackage?.id, relation } }).then((response) => { if (current) setSlots(response.data?.slots || []); }).catch(() => { if (current) setSlots([]); }).finally(() => { if (current) setSlotsLoading(false); });
    return () => { current = false; };
  }, [selectedLab, date, selectedPackage?.id, relation]);

  useEffect(() => {
    if (!selectedPackage || reschedulingId) return;
    const initial = (selectedPackage.eligibleRelations || ['self'])[0] || 'self';
    setRelation(initial);
    if (initial !== 'self') setPatient({ name: '', phone: '', email: '' });
  }, [selectedPackage?.id, reschedulingId]);

  useEffect(() => {
    let current = true;
    setLabs([]); setSelectedLab(null); setSlots([]); setTimeSlot('');
    if (selectedPackage && relation) api.get('/health-checkups/labs', { params: { packageId: selectedPackage.id, relation, search: labSearch } }).then((response) => {
      if (!current) return;
      const available: Lab[] = response.data?.labs || []; setLabs(available);
      const venueId = reschedulingId ? bookings.find((booking) => booking.id === reschedulingId)?.lab.id : requestedLabId;
      if (venueId) setSelectedLab(available.find((lab) => String(lab.id) === String(venueId)) || null);
    }).catch(() => { if (current) toast({ title: 'Unable to load eligible venues', variant: 'destructive' }); });
    return () => { current = false; };
  }, [selectedPackage?.id, relation, requestedLabId, reschedulingId, labSearch]);

  const canBook = Boolean(selectedPackage && selectedLab && date && timeSlot && (reschedulingId || (patient.name.trim() && patient.phone.trim())));
  const packageTests = useMemo(() => selectedPackage?.tests?.map((test) => test.name).filter(Boolean) || [], [selectedPackage]);

  const payBooking = async (booking: Booking) => {
    try {
      const orderResponse = await api.post(`/health-checkups/bookings/${booking.id}/payment`);
      const payment = orderResponse.data?.payment;
      if (!payment?.required) return;
      if (!(await loadRazorpayScript()) || !window.Razorpay) throw new Error('Payment checkout is unavailable');
      await new Promise<void>((resolve, reject) => {
        const checkout = new window.Razorpay({ key: payment.key, amount: payment.amountInPaise, currency: payment.currency, name: 'Mediqzy', description: booking.package.name, order_id: payment.orderId, prefill: { name: booking.patient.name, email: booking.patient.email, contact: booking.patient.phone }, theme: { color: '#0891b2' }, handler: async (response: any) => { try { await api.post(`/health-checkups/bookings/${booking.id}/payment/verify`, { razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }); toast({ title: 'Payment confirmed', description: `Booking ${booking.bookingReference} is confirmed.` }); resolve(); } catch (error) { reject(error); } }, modal: { ondismiss: () => reject(new Error('Payment cancelled')) } });
        checkout.open();
      });
      await load();
    } catch (error: any) { toast({ title: 'Payment pending', description: error.message || 'Complete payment from My bookings.', variant: 'destructive' }); }
  };

  const createBooking = async () => {
    if (!canBook || !selectedPackage || !selectedLab) return;
    setSaving(true);
    try {
      const result = reschedulingId ? await api.post(`/health-checkups/bookings/${reschedulingId}/reschedule`, { date, timeSlot }) : await api.post('/health-checkups/bookings', { packageId: selectedPackage.id, labId: selectedLab.id, date, timeSlot, patient, relation });
      if (reschedulingId) { setBookings((current) => current.map((item) => item.id === reschedulingId ? result.data.booking : item)); toast({ title: 'Booking rescheduled', description: `Reference ${result.data.booking.bookingReference}` }); setReschedulingId(null); setSelectedPackage(null); setSelectedLab(null); setDate(''); setTimeSlot(''); setShowBookings(true); return; }
      const booking: Booking = result.data.booking;
      if (booking.payment?.status === 'pending') { toast({ title: 'Booking created', description: 'Opening secure payment to confirm this package.' }); await payBooking(booking); } else toast({ title: 'Booking confirmed', description: `Reference ${booking.bookingReference}` });
      setBookings((current) => [booking, ...current]); setConfirmedBooking(booking); setSelectedPackage(null); setSelectedLab(null); setDate(''); setTimeSlot('');
    } catch (error: any) { toast({ title: 'Booking failed', description: error.response?.data?.message || 'The selected slot may no longer be available.', variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const startReschedule = (booking: Booking) => { setReschedulingId(booking.id); setRelation(booking.relation || 'self'); setSelectedPackage(booking.package); setSelectedLab(labs.find((lab) => lab.id === booking.lab.id) || booking.lab); setDate(booking.date); setTimeSlot(booking.timeSlot); setShowBookings(false); };
  const cancel = async (id: string) => { try { const response = await api.post(`/health-checkups/bookings/${id}/cancel`, { reason: 'Cancelled by member' }); setBookings((items) => items.map((booking) => booking.id === id ? response.data.booking : booking)); toast({ title: 'Booking cancelled', description: 'A cancellation confirmation is being sent through configured channels.' }); } catch (error: any) { toast({ title: 'Unable to cancel', description: error.response?.data?.message || 'Please try again.', variant: 'destructive' }); } };

  const bookingList = <Card><CardHeader><CardTitle>My health checkup bookings</CardTitle></CardHeader><CardContent className="space-y-3">{bookings.length === 0 ? <p className="text-sm text-muted-foreground">No health checkup bookings yet.</p> : bookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div><p className="font-semibold">{booking.package.name}</p><p className="text-sm text-muted-foreground">{booking.lab.name} · {displayDate(booking.date)} · {booking.timeSlot}</p><p className="text-xs text-muted-foreground">Reference: {booking.bookingReference}</p></div><div className="flex items-center gap-2"><Badge>{booking.status.replace('_', ' ')}</Badge>{['payment_pending', 'confirmed', 'scheduled', 'rescheduled'].includes(booking.status) && <><Button size="sm" variant="outline" onClick={() => startReschedule(booking)}>Reschedule</Button><Button size="sm" variant="outline" onClick={() => cancel(booking.id)}>Cancel</Button></>}</div></div>)}</CardContent></Card>;

  return <MainLayout><div className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-primary">Patient App · Health Checkups {memberType && <Badge className="ml-2 align-middle">{memberType === 'corporate' ? 'Corporate member' : 'Individual member'}</Badge>}</p><h1 className="text-2xl font-bold">Book a health checkup</h1><p className="text-sm text-muted-foreground">Your eligibility, package price, approved network and availability are verified by the server.</p></div><Button variant="outline" onClick={() => setShowBookings((value) => !value)}>{showBookings ? 'New booking' : 'My bookings'}</Button></div>
    {confirmedBooking && !showBookings && <Card className="border-success/40 bg-success/10"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="h-5 w-5" />Booking confirmed</p><p className="mt-1 text-sm text-foreground">{confirmedBooking.package.name} · {displayDate(confirmedBooking.date)} · {confirmedBooking.timeSlot}</p><p className="mt-1 text-xs text-muted-foreground">Reference: {confirmedBooking.bookingReference}. Your confirmation is being sent through configured channels.</p></div><Button size="sm" variant="outline" onClick={() => setShowBookings(true)}>Manage booking</Button></CardContent></Card>}
    {showBookings ? bookingList : loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div> : <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Eligible packages</CardTitle></CardHeader><CardContent className="space-y-3">{packages.length === 0 ? <p className="text-sm text-muted-foreground">No eligible health checkup package is assigned to this account. Corporate eligibility is configured by HR.</p> : packages.map((item) => <button key={item.id} disabled={Boolean(reschedulingId)} onClick={() => setSelectedPackage(item)} className={`w-full rounded-xl border p-4 text-left transition ${selectedPackage?.id === item.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-sm text-muted-foreground">{item.description || 'Preventive health screening package'}</p></div><Badge>{memberType === 'corporate' ? '₹0 · employer paid' : item.price > 0 ? `₹${item.price.toLocaleString('en-IN')}` : 'Included'}</Badge></div>{(item.tests || []).length > 0 && <p className="mt-3 text-xs text-muted-foreground"><FlaskConical className="mr-1 inline h-3.5 w-3.5" />{item.tests?.map((test) => test.name).filter(Boolean).join(' · ')}</p>}{(item.preparationInstructions || []).length > 0 && <p className="mt-2 text-xs text-warning">Preparation: {item.preparationInstructions?.join(' · ')}</p>}</button>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>{reschedulingId ? 'Reschedule appointment' : 'Choose venue and appointment'}</CardTitle></CardHeader><CardContent className="space-y-5"><div><Label>Beneficiary relation</Label><select aria-label="Beneficiary relation" disabled={Boolean(reschedulingId)} className="mt-2 w-full rounded-md border border-input bg-background p-2 text-sm" value={relation} onChange={(event) => { setRelation(event.target.value); setPatient({ name: '', phone: '', email: '' }); }}>{(selectedPackage?.eligibleRelations || ['self']).map((item) => <option key={item} value={item}>{item === 'self' ? 'Employee / self' : item.replace(/_/g, ' ')}</option>)}</select></div><div><Label>Find an approved centre</Label><Input className="mt-2" disabled={!selectedPackage || Boolean(reschedulingId)} value={labSearch} onChange={(event) => setLabSearch(event.target.value)} placeholder="Search by diagnostic centre or city" />{selectedPackage && labs.length === 0 && <p className="mt-2 text-xs text-warning">No approved venues match this package and beneficiary. Contact your benefits team for help.</p>}{labs.length > 0 && <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">{labs.map((lab) => <button key={lab.id} type="button" disabled={Boolean(reschedulingId)} onClick={() => setSelectedLab(lab)} className={`w-full rounded-lg border p-3 text-left transition disabled:opacity-50 ${selectedLab?.id === lab.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}><p className="font-medium">{lab.name}</p>{addressText(lab.address) && <p className="mt-0.5 text-xs text-muted-foreground">{addressText(lab.address)}</p>}</button>)}</div>}</div><div><Label>Date</Label><Input className="mt-2" type="date" min={tomorrow()} disabled={!selectedLab} value={date} onChange={(event) => setDate(event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Choose any future date. Times are shown only after the centre confirms availability.</p></div><div><Label>Time slot</Label>{slotsLoading ? <Loader2 className="mt-3 h-4 w-4 animate-spin" /> : slots.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Select a venue and date. Only configured slots are shown.</p> : <div className="mt-2 grid grid-cols-2 gap-2">{slots.map((slot) => <button key={slot.id} disabled={!slot.available} onClick={() => setTimeSlot(slot.value)} className={`rounded-lg border p-2 text-sm ${timeSlot === slot.value ? 'border-primary bg-primary/10' : 'border-border'} disabled:cursor-not-allowed disabled:opacity-40`}><Clock className="mr-1 inline h-3.5 w-3.5" />{slot.label}</button>)}</div>}</div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Patient name</Label><Input className="mt-2" value={patient.name} onChange={(event) => setPatient({ ...patient, name: event.target.value })} /></div><div><Label>Phone</Label><Input className="mt-2" value={patient.phone} onChange={(event) => setPatient({ ...patient, phone: event.target.value })} /></div></div><div><Label>Email (optional)</Label><Input className="mt-2" type="email" value={patient.email} onChange={(event) => setPatient({ ...patient, email: event.target.value })} /></div><div className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground"><MapPin className="mr-1 inline h-4 w-4 text-primary" />{selectedPackage ? `${selectedPackage.name} · ` : 'Choose a package · '}{selectedLab ? selectedLab.name : 'choose a lab'}{packageTests.length > 0 && <span className="mt-1 block text-xs text-muted-foreground">Includes: {packageTests.join(', ')}</span>}<span className="mt-2 block text-xs text-success">{memberType === 'corporate' ? '₹0 today — this eligible checkup is paid by your employer. No payment step will appear.' : 'Price and payment requirement are confirmed after booking.'}</span></div><Button disabled={!canBook || saving} onClick={createBooking} className="w-full">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{reschedulingId ? 'Save new appointment' : memberType === 'corporate' ? 'Confirm ₹0 booking' : 'Confirm booking'}</Button><p className="text-xs text-muted-foreground">Your employer receives programme-level utilisation information, not your clinical report. Corporate eligibility and the final amount are verified by the server.</p></CardContent></Card>
    </div>}
  </div></div></MainLayout>;
}
