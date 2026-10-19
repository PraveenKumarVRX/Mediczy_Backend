import { useState } from 'react';
import NursingHandover from '@/components/clinical/NursingHandover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { generateNurseHandover } from '@/services/hospitalOs.service';
export default function NurseHandoverPage() {
    const [ward, setWard] = useState('');
    const [activeWard, setActiveWard] = useState<number | null>(null);
    const [draft, setDraft] = useState<any>(null);
    const [error, setError] = useState('');
    return <main className="space-y-4"><h1 className="text-xl font-semibold">Nursing shift handover</h1><form className="flex flex-wrap gap-2 items-end" onSubmit={e => { e.preventDefault(); setActiveWard(Number(ward)); setDraft(null); }}><div><Label htmlFor="handover-ward">Ward ID</Label><Input id="handover-ward" type="number" min="1" required value={ward} onChange={e => setWard(e.target.value)}/></div><Button>Open ward handover</Button></form>{error && <p role="alert">{error}</p>}{activeWard && <><NursingHandover wardId={activeWard}/><Button variant="outline" onClick={async () => {
                try {
                    setError('');
                    const r = await generateNurseHandover(activeWard, 'day');
                    setDraft(r.data);
                }
                catch (e: any) {
                    setError(e.response?.data?.message || 'Draft could not be generated.');
                }
            }}>Prepare a draft briefing</Button>{draft && <section className="border p-3 rounded"><p>Review required · {draft.patientCount} patients · {draft.provider}{draft.aiUnavailable ? ' · AI unavailable; showing a deterministic draft' : ''}</p>{Object.entries(draft.handover.sbar).map(([k, v]) => <p key={k}>{k}: {String(v)}</p>)}</section>}</>}</main>;
}
