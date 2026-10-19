import { useEffect, useState } from 'react';
import api from '@/utils/api';
import { Button } from '@/components/ui/button';
export default function PharmacyNursingReconciliation() {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<any[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState<number | null>(null);
    const load = async () => { setLoading(true); try {
        const r = await api.get('/v1/pharmacy-dispense/pending');
        setRows(r.data.data);
        setError('');
    }
    catch (e: any) {
        setRows([]);
        setError(e.response?.data?.message || 'Reconciliation queue could not be loaded.');
    }
    finally {
        setLoading(false);
    } };
    useEffect(() => { load(); }, []);
    return <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-4"><h1 className="text-xl font-semibold">Nursing medication consumption review</h1><p>Review recorded administrations against pharmacy supply and return records. Confirming review does not issue stock or create a new bill.</p>{error && <p role="alert" className="bg-red-50 p-3">{error}</p>}<Button variant="outline" onClick={load}>Refresh</Button>{loading && <p role="status">Loading reconciliation queue…</p>}{!loading && !rows.length && !error && <p>No pending administration reconciliations.</p>}{rows.map(row => <article key={row.id} className="border rounded p-4 flex flex-wrap gap-3 items-center"><div className="flex-1"><strong>{row.drug_name} · {row.dose} · {row.route}</strong><p>Admission {row.admission_id} · Administration {row.administration_id}</p></div><Button disabled={busy !== null} onClick={async () => { setBusy(row.id); try {
        await api.post(`/v1/pharmacy-dispense/${row.id}/dispense`, {});
        await load();
    }
    catch (e: any) {
        setError(e.response?.data?.message || 'Review confirmation failed.');
    }
    finally {
        setBusy(null);
    } }}>{busy === row.id ? 'Saving…' : 'Confirm reconciliation'}</Button></article>)}</main>;
}
