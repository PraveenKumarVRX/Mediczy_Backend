import { useEffect, useState } from 'react';
import api from '@/utils/api';
import { nursingGet } from '@/services/nursing.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function NursingSessionGate({ children }: {
    children: React.ReactNode;
}) {
    const [locked, setLocked] = useState(false), [actor, setActor] = useState<number | null>(null);
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('');
    const nurse = window.location.pathname.startsWith('/nurse/');
    useEffect(() => {
        if (!nurse)
            return;
        nursingGet('/context').then(context => setActor(context.actorId)).catch(() => setLocked(true));
        let timer: ReturnType<typeof setTimeout>;
        const reset = () => { clearTimeout(timer); timer = setTimeout(() => setLocked(true), 5 * 60000); };
        const lock = () => setLocked(true);
        window.addEventListener('nursing-session-expired', lock);
        ['pointerdown', 'keydown'].forEach(e => window.addEventListener(e, reset));
        reset();
        return () => { clearTimeout(timer); window.removeEventListener('nursing-session-expired', lock); ['pointerdown', 'keydown'].forEach(e => window.removeEventListener(e, reset)); };
    }, [nurse]);
    const unlock = async (event: React.FormEvent) => { event.preventDefault(); try {
        const result = await api.post('/nurse/login', { email, password }, { skipAuth: true } as any);
        if (actor && Number(result.data.nurse.id) !== actor)
            throw new Error('Use the same nurse account to recover this session.');
        localStorage.setItem('nurseToken', result.data.token);
        setActor(Number(result.data.nurse.id));
        setPassword('');
        setLocked(false);
        setError('');
    }
    catch (e: any) {
        setError(e.response?.data?.message || e.message);
    } };
    // Keep children mounted under a hidden, inert surface so an interrupted dose form survives re-authentication.
    return <><div hidden={locked} ref={node => { node?.toggleAttribute('inert', locked); }}>{children}</div>{locked && <main className="p-6 max-w-md mx-auto space-y-3"><h1 className="text-xl font-semibold">Nursing session locked</h1><p>Reauthenticate to return to your unfinished dose form.</p>{error && <p role="alert">{error}</p>}<form onSubmit={unlock} className="space-y-3"><Label htmlFor="gate-email">Email</Label><Input id="gate-email" type="email" required value={email} onChange={e => setEmail(e.target.value)}/><Label htmlFor="gate-password">Password</Label><Input id="gate-password" type="password" required value={password} onChange={e => setPassword(e.target.value)}/><Button>Unlock</Button></form></main>}</>;
}
