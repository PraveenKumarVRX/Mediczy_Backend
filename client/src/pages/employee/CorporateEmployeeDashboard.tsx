import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Bell, Building2, CalendarCheck, ChevronRight, CircleHelp,
  ClipboardCheck, FileText, HeartPulse, Home, Hospital, IndianRupee,
  Loader2, MapPin, Pill, ShieldCheck, Sparkles, Stethoscope, Users,
  Wallet, CalendarDays, LogOut, Menu, X, CheckCircle2,
} from "lucide-react";
import api from "@/utils/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/auth/AuthProvider";
import { useLogout } from "@/hooks/auth";
import { useToast } from "@/hooks/use-toast";
import { BRAND } from "@/config/brand";

type DashboardData = {
  context: { corporate: { id: number; name: string }; employee: { employeeId?: string; department?: string | null; designation?: string | null } | null };
  benefits: { wallets: Array<{ id: number; programName: string; category: string; allocatedLimit: number; utilizedAmount: number; reservedAmount: number; remainingAmount: number; coveragePeriodEnd?: string | null }>; annualHealthCheckups: Array<{ id: string; name: string; validFrom?: string | null; validTo?: string | null; usedAt?: string | null; description?: string }>; sponsoredPlans: Array<{ id: string; name: string; kind: string; validFrom?: string | null; validTo?: string | null; usedAt?: string | null; description?: string; coverage: string }>; networkProviders: Array<{ id?: string | number; name?: string; category?: string; providerType?: string; address?: string | { city?: string; address?: string } }> };
  upcomingAppointment: { id: string; packageName: string; date: string; timeSlot: string; status: string; lab?: { name?: string } } | null;
  wellness: { events: Array<{ id: string; title: string; description?: string; date?: string; location?: string; myRsvp?: string }>; challenges: Array<{ id: string; title: string; description?: string; target?: number; unit?: string; endDate?: string; joined?: boolean }> };
  privacyNotice: string;
};

const employeeNavigation = [
  { href: "/employee/home", label: "Home", icon: Home },
  { href: "/employee/benefits", label: "Benefits & Coverage", icon: ShieldCheck },
  { href: "/employee/care", label: "Care", icon: Stethoscope },
  { href: "/employee/health", label: "My Health", icon: HeartPulse },
  { href: "/employee/wellness", label: "Wellness", icon: Sparkles },
  { href: "/employee/support", label: "Help & Claims", icon: CircleHelp },
];

const money = (value: number | undefined) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not specified";

function EmployeeShell({ children, corporateName }: { children: React.ReactNode; corporateName?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = (href: string) => location.pathname === href;
  const signOut = () => logout.mutate(undefined, { onSuccess: () => { navigate("/login", { replace: true }); toast({ title: "Signed out" }); } });

  const links = (
    <>
      <div className="px-3 pb-3 pt-4">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/60">Employee health</p>
      </div>
      {employeeNavigation.map((item) => {
        const Icon = item.icon;
        return <Link key={item.href} to={item.href} onClick={() => setMenuOpen(false)} className={`mx-3 mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active(item.href) ? "bg-primary/10 text-primary ring-1 ring-primary/25" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
          <Icon className="h-4 w-4" />{item.label}
        </Link>;
      })}
      <div className="mx-3 mt-4 border-t border-sidebar-border pt-3">
        <Link to="/profile" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><Users className="h-4 w-4" />Profile & Family</Link>
        <Link to="/patient/notifications" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><Bell className="h-4 w-4" />Notifications</Link>
      </div>
    </>
  );

  return <div className="min-h-screen bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4"><img src={BRAND.logo} alt={`${BRAND.name} logo`} className="h-9 w-9 rounded-lg" /><div><p className="font-bold text-sidebar-foreground">{BRAND.name}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Employee health</p></div></div>
      <nav className="flex-1">{links}</nav>
      <div className="border-t border-sidebar-border p-3"><button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut className="h-4 w-4" />Sign out</button></div>
    </aside>
    <div className="md:ml-64">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/95 px-4 backdrop-blur md:px-7">
        <button onClick={() => setMenuOpen(true)} className="mr-3 rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div><p className="text-sm font-semibold text-foreground">{corporateName || "Employee health"}</p><p className="text-xs text-muted-foreground">Employer-sponsored benefits</p></div>
        <div className="ml-auto flex items-center gap-3"><Button variant="ghost" size="icon" asChild><Link to="/patient/notifications" aria-label="Notifications"><Bell className="h-5 w-5" /></Link></Button><Link to="/profile" className="hidden text-right sm:block"><p className="text-sm font-medium">{currentUser?.firstName || "My profile"}</p><p className="text-xs text-muted-foreground">Employee account</p></Link></div>
      </header>
      <main className="mx-auto max-w-7xl p-4 md:p-7">{children}</main>
    </div>
    {menuOpen && <><div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMenuOpen(false)} /><aside className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden"><div className="flex items-center justify-between border-b border-sidebar-border px-5 py-4"><p className="font-bold text-sidebar-foreground">{BRAND.name} employee health</p><button onClick={() => setMenuOpen(false)} className="text-sidebar-foreground/70"><X /></button></div>{links}</aside></>}
  </div>;
}

const LinkCard = ({ to, title, description, icon: Icon }: { to: string; title: string; description: string; icon: any }) => <Link to={to} className="group"><Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><CardContent className="flex gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5"><Icon className="h-5 w-5 text-primary" /></div><div className="min-w-0"><p className="font-semibold text-foreground">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><ChevronRight className="ml-auto h-4 w-4 self-center text-muted-foreground group-hover:text-primary" /></CardContent></Card></Link>;

export default function CorporateEmployeeDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const page = location.pathname.split("/").pop() || "home";

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const result = await api.get("/employee/home"); setData(result.data); }
    catch (err: any) {
      if (err?.response?.status === 403) { navigate("/", { replace: true }); return; }
      setError(err?.response?.data?.message || "We could not load your employee health dashboard.");
    } finally { setLoading(false); }
  }, [navigate]);
  useEffect(() => { void load(); }, [load]);

  const checkup = data?.benefits.annualHealthCheckups.find((item) => !item.usedAt) || data?.benefits.annualHealthCheckups[0];
  const corporatePlan = data?.benefits.sponsoredPlans[0];
  const bookCheckup = () => checkup ? navigate(`/health-checkups?packageId=${encodeURIComponent(checkup.id)}`) : navigate("/employee/benefits");
  const joinChallenge = async (id: string) => { try { await api.post(`/corporate/gamification/employee/challenges/${id}/join`); toast({ title: "You joined the challenge" }); void load(); } catch (err: any) { toast({ variant: "destructive", title: "Unable to join", description: err?.response?.data?.message || "Please try again." }); } };
  const respondToEvent = async (id: string) => { try { await api.post(`/corporate/wellness-calendar/employee/events/${id}/rsvp`, { status: "confirmed" }); toast({ title: "You are registered" }); void load(); } catch (err: any) { toast({ variant: "destructive", title: "Unable to register", description: err?.response?.data?.message || "Please try again." }); } };

  if (loading) return <EmployeeShell><div className="flex min-h-[50vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading your benefits…</div></EmployeeShell>;
  if (error || !data) return <EmployeeShell><Card className="mx-auto mt-12 max-w-lg"><CardHeader><CardTitle>Dashboard unavailable</CardTitle><CardDescription>{error || "Please refresh and try again."}</CardDescription></CardHeader><CardContent><Button onClick={load}>Try again</Button></CardContent></Card></EmployeeShell>;

  const company = data.context.corporate.name;
  const firstName = currentUser?.firstName || "there";
  const appointment = data.upcomingAppointment;
  const home = <>
    <section className="rounded-2xl bg-gradient-to-br from-teal-700 via-teal-700 to-cyan-700 p-6 text-white shadow-lg md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-3 flex items-center gap-2"><Building2 className="h-4 w-4" /><span className="text-sm font-medium text-teal-100">Benefits provided by {company}</span></div><h1 className="text-2xl font-bold md:text-3xl">Hello, {firstName}</h1><p className="mt-2 max-w-2xl text-teal-50">Your personal health dashboard, with employer-sponsored care shown first.</p></div><Badge className="border-white/25 bg-white/15 text-white hover:bg-white/15">Employee benefits active</Badge></div></section>
    <section className="mt-6 grid gap-4 lg:grid-cols-3">
      <Card className="border-primary/30 bg-primary/5 lg:col-span-2"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="rounded-2xl bg-primary p-3"><ClipboardCheck className="h-7 w-7 text-white" /></div><div className="flex-1"><div className="flex flex-wrap gap-2"><Badge className="bg-primary">Employer covered</Badge>{checkup?.usedAt && <Badge variant="secondary">Completed</Badge>}</div><h2 className="mt-2 text-lg font-bold">{checkup?.name || "Annual Health Checkup"}</h2><p className="mt-1 text-sm text-muted-foreground">{checkup ? `${checkup.usedAt ? "Completed" : "Eligible"}${checkup.validTo ? ` until ${date(checkup.validTo)}` : ""}.` : "No active annual health checkup is assigned to you."}</p></div><Button onClick={bookCheckup}>{checkup?.usedAt ? "View benefits" : checkup ? "Book now" : "View coverage"}</Button></CardContent></Card>
      <Card><CardContent className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Your corporate plan</div><p className="mt-3 font-bold leading-6">{corporatePlan?.name || `${company} employee benefits`}</p><p className="mt-1 text-sm text-muted-foreground">{corporatePlan?.validTo ? `Active until ${date(corporatePlan.validTo)}` : "Employer-sponsored coverage is active."}</p><Link className="mt-3 inline-block text-sm font-semibold text-primary hover:underline" to="/employee/benefits">View plan</Link></CardContent></Card>
    </section>
    <section className="mt-6 grid gap-4 md:grid-cols-3"><Card><CardContent className="p-5"><CalendarCheck className="mb-3 h-5 w-5 text-primary" /><p className="font-semibold">{appointment ? appointment.packageName : "No upcoming care"}</p><p className="mt-1 text-sm text-muted-foreground">{appointment ? `${date(appointment.date)} · ${appointment.timeSlot}` : "Book covered or personal care when you need it."}</p><Link to="/employee/care" className="mt-3 inline-block text-sm font-semibold text-primary">My care</Link></CardContent></Card><LinkCard to="/employee/health" title="My Health" description="Health score, risks, records and wellness tools." icon={HeartPulse} /><LinkCard to="/employee/wellness" title="Wellness" description="Your invited events and workplace challenges." icon={Sparkles} /></section>
    <section className="mt-7"><h2 className="mb-3 text-lg font-bold">Continue your health journey</h2><div className="grid gap-4 md:grid-cols-3"><LinkCard to="/health-risk-assessment" title="Complete risk check" description="A private assessment for your health journey." icon={Activity} /><LinkCard to="/patient/my-reports" title="View my reports" description="Your records remain private to you." icon={FileText} /><LinkCard to="/employee/care" title="Find covered care" description="See eligible providers and booking options." icon={MapPin} /></div></section>
    <p className="mt-7 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">{data.privacyNotice}</p>
  </>;

  const benefits = <><PageHeading title="My Benefits & Coverage" description={`Employer-sponsored services from ${company}. Personal Mediqzy purchases remain separate.`} /><div className="grid gap-4 md:grid-cols-2">{corporatePlan && <Card className="border-primary/30 bg-primary/5"><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-lg">{corporatePlan.name}</CardTitle><CardDescription>Corporate-sponsored health plan</CardDescription></div><Badge>Active</Badge></div></CardHeader><CardContent><p className="text-sm text-muted-foreground">{corporatePlan.coverage}</p><p className="mt-2 text-sm text-muted-foreground">{corporatePlan.validFrom ? `Starts ${date(corporatePlan.validFrom)}` : "Active now"}{corporatePlan.validTo ? ` · valid until ${date(corporatePlan.validTo)}` : ""}</p></CardContent></Card>}{checkup ? <Card className="border-primary/30"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-lg">Annual Health Checkup</CardTitle><Badge>Employer covered</Badge></div><CardDescription>{checkup.description}</CardDescription></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{checkup.usedAt ? `Completed on ${date(checkup.usedAt)}.` : `Available until ${date(checkup.validTo)}.`}</p><Button onClick={bookCheckup}>{checkup.usedAt ? "View booking" : "Book AHC"}</Button></CardContent></Card> : <EmptyBenefit title="No annual health checkup assigned" description="If you expected an AHC, contact your HR benefits team." />}{data.benefits.wallets.map((wallet) => <Card key={wallet.id}><CardHeader><div className="flex justify-between gap-3"><div><CardTitle className="text-lg">{wallet.programName}</CardTitle><CardDescription className="capitalize">{wallet.category.replace(/_/g, " ")} · Employer wallet</CardDescription></div><Wallet className="h-5 w-5 text-primary" /></div></CardHeader><CardContent><p className="text-2xl font-bold">{money(wallet.remainingAmount)}</p><p className="mt-1 text-sm text-muted-foreground">Available of {money(wallet.allocatedLimit)}{wallet.coveragePeriodEnd ? ` · valid to ${date(wallet.coveragePeriodEnd)}` : ""}</p><Button className="mt-4" variant="outline" asChild><Link to="/employee/care">Find covered care</Link></Button></CardContent></Card>)}</div><section className="mt-6 grid gap-4 md:grid-cols-3"><LinkCard to="/employee/care" title="Cashless network" description="Providers available for your active benefits." icon={Hospital} /><LinkCard to="/family-hub" title="Coverage & dependants" description="Manage family health and check applicable coverage." icon={Users} /><LinkCard to="/employee/support" title="Claims & help" description="Track claims or contact benefit support." icon={ShieldCheck} /></section></>;

  const care = <><PageHeading title="Care" description="Use employer-funded services where eligible, or choose personal Mediqzy care." /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><LinkCard to={checkup ? `/health-checkups?packageId=${encodeURIComponent(checkup.id)}` : "/health-checkups"} title="Annual Health Checkup" description={checkup ? "Book or manage your sponsored checkup." : "Review available health checkups."} icon={ClipboardCheck} /><LinkCard to="/doctors" title="Find a doctor" description="Consult online or in person." icon={Stethoscope} /><LinkCard to="/patient/lab-tests" title="Lab tests" description="Book diagnostics and review results." icon={Activity} /><LinkCard to="/patient/pharmacy" title="Order medicines" description="Use eligible employer wallet balance when offered." icon={Pill} /><LinkCard to="/appointments" title="My appointments" description="View your care appointments in one place." icon={CalendarCheck} /><LinkCard to="/employee/benefits" title="My coverage" description="Review sponsored benefits before you book." icon={ShieldCheck} /></div>{data.benefits.networkProviders.length > 0 && <section className="mt-7" id="network"><div className="mb-3 flex items-center gap-2"><Hospital className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">Cashless network available to you</h2></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{data.benefits.networkProviders.slice(0, 6).map((provider, index) => <Card key={String(provider.id || index)}><CardContent className="p-4"><p className="font-semibold">{provider.name || "Network provider"}</p><p className="mt-1 text-sm capitalize text-muted-foreground">{provider.category || provider.providerType || "Employer network"}</p><p className="mt-2 text-xs text-muted-foreground">{typeof provider.address === "string" ? provider.address : provider.address?.city || provider.address?.address || "Confirm availability before visiting."}</p></CardContent></Card>)}</div></section>}</>;

  const health = <><PageHeading title="My Health" description="The same private Mediqzy health tools available in your individual account." /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><LinkCard to="/health-dashboard" title="Health Dashboard" description="A unified view of your health." icon={HeartPulse} /><LinkCard to="/health-intelligence" title="My Health Score" description="Understand your trends and goals." icon={Activity} /><LinkCard to="/health-risk-assessment" title="Risk Check" description="Private prevention assessment." icon={ShieldCheck} /><LinkCard to="/health-diary" title="Health Diary" description="Track your own health notes." icon={FileText} /><LinkCard to="/patient/vital-reports" title="My Vitals" description="Review tracked vitals." icon={Activity} /><LinkCard to="/patient/my-reports" title="My Reports" description="Access your diagnostic reports." icon={FileText} /></div><p className="mt-6 rounded-xl bg-primary/10 p-4 text-sm text-foreground"><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />Your employer cannot use this area to view your clinical records.</p></>;

  const wellness = <><PageHeading title="Wellness" description="Only events and challenges to which you have been invited are shown here." /><div className="grid gap-4 md:grid-cols-2">{data.wellness.events.map((event) => <Card key={event.id}><CardHeader><CardTitle className="text-lg">{event.title}</CardTitle><CardDescription>{date(event.date)}{event.location ? ` · ${event.location}` : ""}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">{event.description || "Workplace wellness event"}</p>{event.myRsvp === "confirmed" ? <Badge className="mt-4 bg-primary"><CheckCircle2 className="mr-1 h-3 w-3" />Registered</Badge> : <Button className="mt-4" onClick={() => respondToEvent(event.id)}>Register</Button>}</CardContent></Card>)}{data.wellness.challenges.map((challenge) => <Card key={challenge.id}><CardHeader><CardTitle className="text-lg">{challenge.title}</CardTitle><CardDescription>{challenge.target ? `Goal: ${challenge.target} ${challenge.unit || ""}` : "Workplace wellness challenge"}{challenge.endDate ? ` · ends ${date(challenge.endDate)}` : ""}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">{challenge.description || "Join at your own pace."}</p>{challenge.joined ? <Badge className="mt-4 bg-primary">Joined</Badge> : <Button className="mt-4" onClick={() => joinChallenge(challenge.id)}>Join challenge</Button>}</CardContent></Card>)}</div>{!data.wellness.events.length && !data.wellness.challenges.length && <EmptyBenefit title="No workplace wellness activity right now" description="Your personal health, care, and wellness tools remain available." />}</>;

  const support = <><PageHeading title="Help & Claims" description="Get help with employer benefits or use your personal Mediqzy support tools." /><div className="grid gap-4 md:grid-cols-3"><LinkCard to="/claims-express" title="Claims" description="Start or track an eligible claim." icon={IndianRupee} /><LinkCard to="/employee/benefits" title="Benefit support" description="Review coverage, wallet and sponsored services." icon={CircleHelp} /><LinkCard to="/help" title="Mediqzy support" description="Answers and support for your account." icon={CircleHelp} /></div><Card className="mt-6"><CardContent className="p-5"><p className="font-semibold">Need help with an employer benefit?</p><p className="mt-1 text-sm text-muted-foreground">Keep your employee ID ready: {data.context.employee?.employeeId || "available in your profile"}. Your clinical records are not shared as part of a support request.</p></CardContent></Card></>;

  const content = page === "benefits" ? benefits : page === "care" ? care : page === "health" ? health : page === "wellness" ? wellness : page === "support" ? support : home;
  return <EmployeeShell corporateName={company}>{content}</EmployeeShell>;
}

function PageHeading({ title, description }: { title: string; description: string }) { return <section className="mb-6"><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{description}</p></section>; }
function EmptyBenefit({ title, description }: { title: string; description: string }) { return <Card className="md:col-span-2"><CardContent className="p-6"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></CardContent></Card>; }
