import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import {
  Phone, Mail, MapPin, Clock, MessageSquare, HeadphonesIcon,
  Shield, FileText, AlertCircle, ChevronRight,
  Stethoscope, IndianRupee, Activity, Globe,
} from "lucide-react";

const SUPPORT_CHANNELS = [
  {
    icon: Phone, title: "Phone Support",
    description: "Talk to our support team", value: "1800-XXX-XXXX",
    subtext: "Toll-free · Mon–Sat 8AM–8PM", accent: "teal",
    action: () => window.location.href = "tel:1800XXXXXXX",
    actionLabel: "Call Now",
  },
  {
    icon: Mail, title: "Email Support",
    description: "Get a response within 24 hours", value: "support@mediczy.com",
    subtext: "For non-urgent queries", accent: "blue",
    action: () => window.location.href = "mailto:support@mediczy.com",
    actionLabel: "Send Email",
  },
  {
    icon: MessageSquare, title: "WhatsApp",
    description: "Chat with us on WhatsApp", value: "+91 98765 43210",
    subtext: "Mon–Sat 9AM–6PM", accent: "green",
    action: () => window.open("https://wa.me/919876543210", "_blank"),
    actionLabel: "Open WhatsApp",
  },
  {
    icon: HeadphonesIcon, title: "Live Chat",
    description: "Get instant support in-app", value: "Available now",
    subtext: "Avg. response < 5 mins", accent: "purple",
    action: null,
    actionLabel: "Start Chat",
    isHelp: true,
  },
];

const QUICK_LINKS = [
  { icon: Stethoscope, label: "Book an Appointment", path: "/doctors" },
  { icon: FileText,    label: "My Prescriptions",    path: "/my-prescriptions" },
  { icon: Activity,   label: "My Reports",           path: "/patient/my-reports" },
  { icon: IndianRupee,label: "Billing & Invoices",   path: "/billing/invoices" },
  { icon: Shield,     label: "My Insurance Policies",path: "/my-insurance" },
  { icon: AlertCircle,label: "Raise a Ticket",       path: "/help" },
];

const OFFICE_LOCATIONS = [
  {
    city: "Mumbai — HQ",
    address: "Level 12, One BKC, Bandra Kurla Complex, Mumbai — 400 051",
    phone: "+91 22 4567 8900",
    hours: "Mon–Fri 9AM–6PM",
  },
  {
    city: "Bengaluru",
    address: "Embassy TechVillage, Outer Ring Road, Devarabisanahalli, Bengaluru — 560 103",
    phone: "+91 80 4567 8901",
    hours: "Mon–Fri 9AM–6PM",
  },
  {
    city: "Delhi NCR",
    address: "DLF Cyber Hub, Sector 24, Gurugram, Haryana — 122 002",
    phone: "+91 11 4567 8902",
    hours: "Mon–Fri 9AM–6PM",
  },
];

const ACCENT_CLASSES: Record<string, { icon: string; bg: string; border: string }> = {
  teal:   { icon: "text-teal-500",   bg: "bg-teal-50 dark:bg-teal-900/20",   border: "border-teal-200 dark:border-teal-800"   },
  blue:   { icon: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20",   border: "border-blue-200 dark:border-blue-800"   },
  green:  { icon: "text-green-500",  bg: "bg-green-50 dark:bg-green-900/20", border: "border-green-200 dark:border-green-800" },
  purple: { icon: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800" },
};

const ContactUs = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50 via-sky-50 to-blue-50 p-5 md:p-6 mb-8 shadow-sm transition-all duration-300">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Contact Us</h1>
        <p className="text-sm text-slate-600 mt-1">Reach the right support channel quickly for care, billing, or account help.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-5">
          <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
            <p className="text-xs font-semibold text-teal-700">Step 1: Pick channel</p>
            <p className="text-[11px] text-slate-600">Choose phone, email, WhatsApp, or in-app live support.</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
            <p className="text-xs font-semibold text-teal-700">Step 2: Share details</p>
            <p className="text-[11px] text-slate-600">Include order, appointment, or policy reference for faster assistance.</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-white/80 px-3 py-2">
            <p className="text-xs font-semibold text-teal-700">Step 3: Escalate if needed</p>
            <p className="text-[11px] text-slate-600">Use Help tickets for tracked resolution and SLA visibility.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition-all duration-300">
        <div>
          <p className="text-xs font-semibold text-teal-700">Next Best Action</p>
          <p className="text-[11px] text-slate-600">For urgent care-blocking issues, call support first, then raise a trackable ticket in Help.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => window.location.href = "tel:1800XXXXXXX"}>
            <Phone className="w-3.5 h-3.5 mr-1" /> Call Support
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/help")}>Raise Ticket</Button>
        </div>
      </div>

      {/* Support channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {SUPPORT_CHANNELS.map(ch => {
          const ac = ACCENT_CLASSES[ch.accent];
          const Icon = ch.icon;
          return (
            <Card key={ch.title} className={`border ${ac.border} hover:shadow-md transition-shadow`}>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full ${ac.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${ac.icon}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{ch.title}</p>
                    <p className="text-sm text-slate-500 mb-1">{ch.description}</p>
                    <p className={`text-sm font-medium ${ac.icon}`}>{ch.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{ch.subtext}</p>
                    <Button
                      size="sm" variant="outline" className="mt-3"
                      onClick={ch.isHelp ? () => navigate("/help") : ch.action || undefined}
                    >
                      {ch.actionLabel}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Support hours */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-500" />
            <CardTitle className="text-base">Support Hours</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { day: "Monday – Friday",   hours: "8:00 AM – 9:00 PM",  badge: "Full Support" },
              { day: "Saturday",          hours: "9:00 AM – 6:00 PM",  badge: "Limited" },
              { day: "Sunday & Holidays", hours: "10:00 AM – 2:00 PM", badge: "Emergency Only" },
            ].map(row => (
              <div key={row.day} className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{row.day}</p>
                <p className="text-base font-bold text-teal-600 dark:text-teal-400 mt-1">{row.hours}</p>
                <Badge variant="outline" className="mt-2 text-xs">{row.badge}</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 text-center mt-4">
            Emergency medical assistance is available 24×7 via the Emergency SOS button in the app.
          </p>
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {QUICK_LINKS.map(link => {
            const Icon = link.icon;
            return (
              <button
                key={link.path}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                onClick={() => navigate(link.path)}
              >
                <Icon className="w-4 h-4 text-teal-500 shrink-0" />
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{link.label}</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Office locations */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal-500" />
            <CardTitle className="text-base">Our Offices</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {OFFICE_LOCATIONS.map((loc, i) => (
            <div key={loc.city}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4 text-teal-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{loc.city}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{loc.address}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{loc.phone}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{loc.hours}</p>
                  </div>
                </div>
              </div>
              {i < OFFICE_LOCATIONS.length - 1 && <Separator className="mt-4" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Legal links */}
      <div className="flex items-center justify-center gap-6 flex-wrap pb-4">
        {[
          { icon: Globe,      label: "Website",         href: "https://mediczy.com"         },
          { icon: FileText,   label: "Privacy Policy",  href: "/privacy-policy"              },
          { icon: FileText,   label: "Terms of Service",href: "/terms"                       },
          { icon: Shield,     label: "HIPAA / DPDP",    href: "/compliance"                  },
        ].map(link => {
          const Icon = link.icon;
          return (
            <a
              key={link.label}
              href={link.href}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />{link.label}
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default ContactUs;
