import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Navigation, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  WayfindingFloor,
  deleteWayfindingFloor,
  formatDepartments,
  listWayfindingFloors,
  parseDepartments,
  saveWayfindingFloor,
} from '@/services/wayfinding.service';

export default function WayfindingAdminPage() {
  const [floors, setFloors] = useState<WayfindingFloor[]>([]);
  const [loading, setLoading] = useState(true);
  const [floorNumber, setFloorNumber] = useState('0');
  const [floorName, setFloorName] = useState('Ground Floor');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listWayfindingFloors()
      .then(setFloors)
      .catch(() => setFloors([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const edit = (f: WayfindingFloor) => {
    setFloorNumber(String(f.floor_number));
    setFloorName(f.floor_name || '');
    setText(formatDepartments(f.departments));
    setMessage(null);
  };

  const save = async () => {
    const n = Number(floorNumber);
    if (!Number.isInteger(n)) { setMessage({ ok: false, text: 'Floor number must be a whole number.' }); return; }
    setSaving(true);
    setMessage(null);
    try {
      await saveWayfindingFloor(n, { floorName, departments: parseDepartments(text) });
      setMessage({ ok: true, text: 'Saved. Kiosks use it immediately.' });
      load();
    } catch (e: any) {
      setMessage({ ok: false, text: e?.response?.data?.message || 'Could not save this floor.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n: number) => {
    try { await deleteWayfindingFloor(n); load(); } catch { setMessage({ ok: false, text: 'Could not remove this floor.' }); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Navigation className="h-5 w-5 text-blue-600" />
        Wayfinding
      </h2>
      <Card>
        <CardContent className="pt-6 text-sm space-y-2">
          <p>
            The lobby kiosk answers only from the floors listed here. A hospital with no floors configured tells
            visitors to ask at reception.
          </p>
          <Link to="/kiosk/wayfinding" className="text-teal-600 underline">Open the wayfinding kiosk →</Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Configured floors</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : floors.length === 0 ? (
            <p className="text-muted-foreground">No floors yet.</p>
          ) : floors.map((f) => (
            <div key={f.floor_number} className="flex items-center justify-between gap-2 border-b py-2">
              <span>{f.floor_name || `Floor ${f.floor_number}`} · {f.departments.length} departments</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => edit(f)}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => remove(f.floor_number)}>Remove</Button>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Add or edit a floor</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
            <Input aria-label="Floor number" inputMode="numeric" value={floorNumber} onChange={(e) => setFloorNumber(e.target.value)} />
            <Input aria-label="Floor name" placeholder="Floor name" value={floorName} onChange={(e) => setFloorName(e.target.value)} />
          </div>
          <Textarea
            aria-label="Departments"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Emergency | casualty, er | Straight ahead from the entrance | red doors | 12,68 | 10 | er'}
          />
          <p className="text-muted-foreground">
            One department per line: <code>Name | aliases, comma separated | steps, separated by ; | landmark | x,y | capacity | zone</code>.
            Only the name is required. Visitors see exactly the steps you write. <code>x,y</code> places the department on the
            floor-map display (x 0-100, y 0-80); <code>zone</code> is er, opd, icu, ot, ward, pharmacy, lab, radiology or other,
            and ER, OPD and OT show live occupancy.
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save floor'}</Button>
            {message && <span className={message.ok ? 'text-green-600' : 'text-red-600'}>{message.text}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
