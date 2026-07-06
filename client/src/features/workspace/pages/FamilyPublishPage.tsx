import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { publishFamilyUpdate, listFamilyUpdates } from '@/services/workspace.service';

export default function FamilyPublishPage() {
  const { patientId } = useWorkspace();
  const [familyTitle, setFamilyTitle] = useState('');
  const [familyBody, setFamilyBody] = useState('');
  const [familyUpdates, setFamilyUpdates] = useState<any[]>([]);

  const loadFamily = async () => {
    const res = await listFamilyUpdates(patientId);
    setFamilyUpdates(res?.data || []);
  };

  useEffect(() => {
    loadFamily();
  }, [patientId]);

  const publishFamily = async () => {
    if (!familyTitle.trim() || !familyBody.trim()) return;
    await publishFamilyUpdate(patientId, { title: familyTitle, body: familyBody, visibleToFamily: true });
    setFamilyTitle('');
    setFamilyBody('');
    await loadFamily();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Publish family update</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Title (plain language)" value={familyTitle} onChange={(e) => setFamilyTitle(e.target.value)} />
          <Input placeholder="Message for family" value={familyBody} onChange={(e) => setFamilyBody(e.target.value)} />
          <Button onClick={publishFamily}>Publish (clinician-approved)</Button>
          <p className="text-xs text-muted-foreground">Family-facing portal will show only approved updates.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Published updates</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {familyUpdates.map((u) => (
            <div key={u.id} className="border rounded p-2">
              <p className="font-medium">{u.title}</p>
              <p className="text-muted-foreground">{u.body}</p>
            </div>
          ))}
          {!familyUpdates.length && <p className="text-muted-foreground">No updates yet</p>}
        </CardContent>
      </Card>
    </div>
  );
}
