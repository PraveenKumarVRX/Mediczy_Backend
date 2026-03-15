import HospDeptLayout, { DeptNavSection } from '@/components/hosp-dept/HospDeptLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FolderOpen, LayoutDashboard, FileText, ClipboardList, FileSearch,
  Briefcase, FileCheck, BarChart3, Settings, HelpCircle, PlusCircle,
  Search, ArrowUpRight, Users, Calendar, FileBadge, BookOpen,
  Download, AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const navSections: DeptNavSection[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',        href: '/mrd/dashboard' },
    ],
  },
  {
    title: 'Records',
    items: [
      { icon: FolderOpen,     label: 'Patient Records',    href: '/mrd/records' },
      { icon: Calendar,       label: 'Admissions',         href: '/mrd/admissions' },
      { icon: FileCheck,      label: 'Discharge Summary',  href: '/mrd/discharge-summary' },
      { icon: FileSearch,     label: 'Record Requests',    href: '/mrd/requests' },
    ],
  },
  {
    title: 'Coding & Legal',
    items: [
      { icon: BookOpen,       label: 'ICD-10 Coding',      href: '/mrd/icd-coding' },
      { icon: Briefcase,      label: 'Medico-Legal Cases', href: '/mrd/medico-legal' },
      { icon: FileBadge,      label: 'File Tracking',      href: '/mrd/file-tracking' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: BarChart3,      label: 'Statistics',   href: '/mrd/statistics' },
      { icon: Settings,       label: 'Settings',     href: '/mrd/settings' },
      { icon: HelpCircle,     label: 'Support',      href: '/mrd/support' },
    ],
  },
];

const kpis = [
  { label: 'New Admissions Today',   value: '34',    sub: '+5 from yesterday',     icon: PlusCircle,  color: 'text-teal-600' },
  { label: 'Pending Record Requests',value: '18',    sub: '6 urgent',              icon: AlertCircle, color: 'text-amber-600' },
  { label: 'Records Completed',      value: '127',   sub: 'This week',             icon: FileCheck,   color: 'text-emerald-600' },
  { label: 'Discharged Today',       value: '21',    sub: 'Summaries pending: 4',  icon: ArrowUpRight,color: 'text-blue-600' },
];

const recentAdmissions = [
  { id: 'MRN-10421', name: 'Rakesh Singh',    dept: 'Cardiology',   ward: 'W-3B', date: '2026-03-15', status: 'Admitted' },
  { id: 'MRN-10420', name: 'Meera Patel',     dept: 'Medicine',     ward: 'W-1A', date: '2026-03-15', status: 'Admitted' },
  { id: 'MRN-10419', name: 'Suresh Rao',      dept: 'Orthopaedics', ward: 'W-2C', date: '2026-03-14', status: 'Discharged' },
  { id: 'MRN-10418', name: 'Anita Joshi',     dept: 'Gynaecology',  ward: 'W-4A', date: '2026-03-14', status: 'Admitted' },
  { id: 'MRN-10417', name: 'Vijay Kumar',     dept: 'Neurology',    ward: 'ICU-1', date:'2026-03-14', status: 'ICU' },
];

const recordRequests = [
  { ref: 'REQ-882', patient: 'R.K. Sharma',   type: 'Court Order',   priority: 'Urgent',  due: 'Today' },
  { ref: 'REQ-881', patient: 'Suman Das',      type: 'Insurance',     priority: 'Normal',  due: 'Tomorrow' },
  { ref: 'REQ-880', patient: 'Priya Mehra',    type: 'Patient Copy',  priority: 'Normal',  due: '17-Mar' },
  { ref: 'REQ-879', patient: 'Harish Gupta',   type: 'Transfer',      priority: 'High',    due: 'Today' },
];

const statusColor: Record<string, string> = {
  Admitted:   'bg-blue-100 text-blue-700',
  Discharged: 'bg-slate-100 text-slate-600',
  ICU:        'bg-red-100 text-red-700',
};
const priorityColor: Record<string, string> = {
  Urgent: 'bg-red-100 text-red-700',
  High:   'bg-amber-100 text-amber-700',
  Normal: 'bg-slate-100 text-slate-600',
};

const MRDDashboard = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  return (
    <HospDeptLayout
      deptKey="mrd"
      deptName="Medical Records"
      badgeLabel="MRD"
      loginPath="/mrd/login"
      DeptIcon={FolderOpen}
      navSections={navSections}
      title="MRD Dashboard"
      subtitle="Medical records & documentation"
    >
      {/* Search bar */}
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient by name, MRN, UHID…"
            className="w-full h-10 pl-9 pr-4 border rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700 gap-2" onClick={() => navigate('/mrd/records')}>
          <Search className="h-4 w-4" />Search Records
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => navigate('/mrd/admissions')}>
          <PlusCircle className="h-4 w-4" />New Admission
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        {kpis.map((k) => (
          <Card key={k.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Admissions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Recent Admissions / Active Cases</CardTitle>
              <Button variant="outline" size="sm" className="gap-1"><Download className="h-4 w-4" />Export</Button>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">MRN</th>
                    <th className="pb-2 text-left font-medium">Patient</th>
                    <th className="pb-2 text-left font-medium hidden md:table-cell">Dept</th>
                    <th className="pb-2 text-left font-medium hidden md:table-cell">Ward</th>
                    <th className="pb-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentAdmissions.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                        onClick={() => navigate('/mrd/records')}>
                      <td className="py-2.5 font-medium text-teal-700">{a.id}</td>
                      <td className="py-2.5">{a.name}</td>
                      <td className="py-2.5 text-muted-foreground hidden md:table-cell">{a.dept}</td>
                      <td className="py-2.5 text-muted-foreground hidden md:table-cell">{a.ward}</td>
                      <td className="py-2.5 text-center">
                        <Badge className={`${statusColor[a.status]} border-0 text-xs`}>{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="ghost" size="sm" className="mt-3 w-full text-teal-600" onClick={() => navigate('/mrd/admissions')}>
                View all admissions →
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { label: 'Search Record', icon: Search,      path: '/mrd/records',          color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
                { label: 'New Admission', icon: PlusCircle,  path: '/mrd/admissions',       color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { label: 'Discharge',     icon: FileCheck,   path: '/mrd/discharge-summary',color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
                { label: 'ICD Coding',    icon: BookOpen,    path: '/mrd/icd-coding',       color: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
                { label: 'Medico-Legal',  icon: Briefcase,   path: '/mrd/medico-legal',     color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { label: 'File Track',    icon: FileBadge,   path: '/mrd/file-tracking',    color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
              ].map((a) => (
                <button key={a.label} onClick={() => navigate(a.path)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors ${a.color}`}>
                  <a.icon className="h-5 w-5" />
                  {a.label}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Record Requests */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Pending Requests
            </CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {recordRequests.map((r) => (
                <div key={r.ref} className="flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded"
                     onClick={() => navigate('/mrd/requests')}>
                  <div>
                    <p className="text-sm font-medium">{r.patient}</p>
                    <p className="text-xs text-muted-foreground">{r.type} · Due {r.due}</p>
                  </div>
                  <Badge className={`${priorityColor[r.priority]} border-0 text-xs`}>{r.priority}</Badge>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-teal-600 mt-1" onClick={() => navigate('/mrd/requests')}>
                View all requests →
              </Button>
            </CardContent>
          </Card>

          {/* Today's Stats */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-teal-500" /> Today's Stats
            </CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: 'Total Admissions',   value: '34' },
                { label: 'Total Discharges',   value: '21' },
                { label: 'Records Indexed',    value: '56' },
                { label: 'ICD Coded Today',    value: '29' },
                { label: 'ML Cases Active',    value: '3' },
              ].map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-semibold">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </HospDeptLayout>
  );
};

export default MRDDashboard;
