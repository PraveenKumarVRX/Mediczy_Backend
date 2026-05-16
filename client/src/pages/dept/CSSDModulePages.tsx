import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Flame, ListChecks, Layers, BarChart3, PlusCircle } from 'lucide-react';
import DeptStaffLayout from '@/components/hosp-dept/DeptStaffLayout';
import { cssdNav } from './DepartmentDashboards';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';

type CSSDSet = { id: number; set_code: string; name: string; service_line?: string; status: string; sterile_until?: string };
type CSSDJob = { id: number; job_number: string; set_id: number; set_code?: string; set_name?: string; status: string; source_department?: string };
type CSSDCycle = { id: number; cycle_number: string; autoclave_id: string; status: string; temperature?: number; pressure?: number };

const Wrap = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <DeptStaffLayout deptKey="cssd" deptName="CSSD" badgeLabel="CSSD" loginPath="/cssd/login" DeptIcon={ShieldCheck} navSections={cssdNav} title={title} subtitle="Sterilization lifecycle tracking">
    {children}
  </DeptStaffLayout>
);

const useCSSD = () => {
  const [sets, setSets] = useState<CSSDSet[]>([]);
  const [jobs, setJobs] = useState<CSSDJob[]>([]);
  const [cycles, setCycles] = useState<CSSDCycle[]>([]);
  const refresh = async () => {
    const [setRes, jobRes, cycleRes] = await Promise.all([api.get('/cssd/sets'), api.get('/cssd/jobs'), api.get('/cssd/cycles')]);
    setSets(setRes.data.data || []); setJobs(jobRes.data.data || []); setCycles(cycleRes.data.data || []);
  };
  useEffect(() => { refresh(); }, []);
  return { sets, jobs, cycles, refresh };
};

export const CSSDJobs = () => {
  const { sets, jobs, refresh } = useCSSD();
  const [setId, setSetId] = useState('');
  const createJob = async () => { if (!setId) return; await api.post('/cssd/jobs', { setId: Number(setId), sourceDepartment: 'OT', requestedBy: 'OT Desk' }); setSetId(''); refresh(); };
  const release = async (id: number) => { await api.post(`/cssd/jobs/${id}/release`, { sterileUntil: new Date(Date.now() + 30*86400000).toISOString() }); refresh(); };
  return <Wrap title="CSSD Jobs"><div className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Create Job</CardTitle></CardHeader><CardContent className="flex gap-2"><Input placeholder="Set ID" value={setId} onChange={(e)=>setSetId(e.target.value)} /><Button onClick={createJob}><PlusCircle className="h-4 w-4 mr-2"/>New Job</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4"/>Open Work</CardTitle></CardHeader><CardContent className="space-y-2">{jobs.map(job => <div key={job.id} className="flex items-center justify-between border rounded-md p-3"><div><div className="font-medium">{job.job_number} · {job.set_name || job.set_code}</div><div className="text-xs text-muted-foreground">{job.source_department || 'CSSD'} · {job.status}</div></div>{job.status !== 'released' && <Button size="sm" onClick={()=>release(job.id)}>Release</Button>}</div>)}</CardContent></Card></div></Wrap>;
};

export const CSSDEquipment = () => {
  const { sets } = useCSSD();
  return <Wrap title="Instrument Sets"><Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4"/>Instrument Sets</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-3">{sets.map(set => <div key={set.id} className="border rounded-md p-3"><div className="font-medium">{set.name}</div><div className="text-xs text-muted-foreground">{set.set_code} · {set.service_line || 'General'}</div><Badge className="mt-2" variant={set.status === 'available' ? 'secondary' : 'outline'}>{set.status}</Badge></div>)}</CardContent></Card></Wrap>;
};

export const CSSDCycles = () => {
  const { cycles, refresh } = useCSSD();
  const [autoclaveId, setAutoclaveId] = useState('AUTO-1');
  const [cycleNumber, setCycleNumber] = useState('');
  const createCycle = async () => { if (!cycleNumber) return; await api.post('/cssd/cycles', { autoclaveId, cycleNumber, temperature: 134, pressure: 2.1, durationMinutes: 18 }); setCycleNumber(''); refresh(); };
  const release = async (id:number) => { await api.post(`/cssd/cycles/${id}/release`, { biologicalIndicator: 'pass', releasedBy: 'CSSD Lead' }); refresh(); };
  return <Wrap title="Cycle Log"><div className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Start Cycle</CardTitle></CardHeader><CardContent className="flex gap-2"><Input value={autoclaveId} onChange={(e)=>setAutoclaveId(e.target.value)} /><Input placeholder="Cycle number" value={cycleNumber} onChange={(e)=>setCycleNumber(e.target.value)} /><Button onClick={createCycle}>Start</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Flame className="h-4 w-4"/>Cycles</CardTitle></CardHeader><CardContent className="space-y-2">{cycles.map(c => <div key={c.id} className="flex items-center justify-between border rounded-md p-3"><div><div className="font-medium">{c.cycle_number}</div><div className="text-xs text-muted-foreground">{c.autoclave_id} · {c.status}</div></div>{c.status !== 'released' && <Button size="sm" onClick={()=>release(c.id)}>Release</Button>}</div>)}</CardContent></Card></div></Wrap>;
};

export const CSSDReports = () => {
  const { sets, jobs, cycles } = useCSSD();
  const summary = useMemo(() => ({ available: sets.filter(s=>s.status==='available').length, openJobs: jobs.filter(j=>j.status!=='released').length, activeCycles: cycles.filter(c=>c.status!=='released').length }), [sets,jobs,cycles]);
  return <Wrap title="CSSD Reports"><Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4"/>Compliance Snapshot</CardTitle></CardHeader><CardContent className="grid md:grid-cols-3 gap-3">{Object.entries(summary).map(([k,v]) => <div key={k} className="border rounded-md p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="text-2xl font-bold">{v}</div></div>)}</CardContent></Card></Wrap>;
};
