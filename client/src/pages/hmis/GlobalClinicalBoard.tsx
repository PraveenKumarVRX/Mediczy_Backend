import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Globe, Users, FileText, Languages } from 'lucide-react';
import {
  startGlobalClinicalBoard, joinGlobalBoard, listNetworkOrgs,
  createReferral, shareDocument, translateClinical, listReferrals,
  listPatientImaging,
} from '@/services/careos.service';
import { HEALTH_OS } from '@/config/brand';

export default function GlobalClinicalBoard() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const pid = Number(patientId);

  const [session, setSession] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [title, setTitle] = useState('Cross-border Clinical Board');
  const [selectedOrgs, setSelectedOrgs] = useState<number[]>([]);
  const [referReason, setReferReason] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [translateText, setTranslateText] = useState('');
  const [translateResult, setTranslateResult] = useState('');
  const [targetLang, setTargetLang] = useState('hi');
  const [imagingStudies, setImagingStudies] = useState<any[]>([]);
  const [selectedStudyUid, setSelectedStudyUid] = useState('');

  const loadOrgs = async () => {
    const res = await listNetworkOrgs();
    setOrgs(res?.data || []);
  };

  const startBoard = async () => {
    const res = await startGlobalClinicalBoard({
      patientId: pid,
      title,
      invitedOrgIds: selectedOrgs,
      languages: ['en', targetLang],
    });
    setSession(res?.data);
  };

  const join = async () => {
    if (!session?.id) return;
    await joinGlobalBoard(session.id, { role: 'specialist', languagePreference: targetLang });
  };

  const refer = async () => {
    if (!selectedOrgs[0] || !referReason) return;
    await createReferral({
      fromOrgId: orgs[0]?.id || 1,
      toOrgId: selectedOrgs[0],
      patientId: pid,
      reason: referReason,
      urgency: 'routine',
    });
    const r = await listReferrals({ patientId: String(pid) });
    setReferrals(r?.data || []);
  };

  const shareDoc = async () => {
    await shareDocument({
      patientId: pid,
      globalSessionId: session?.id,
      documentType: selectedStudyUid ? 'dicom_imaging' : 'clinical_summary',
      title: docTitle || (selectedStudyUid ? 'DICOM imaging study' : 'Clinical summary'),
      fhirBundle: { resourceType: 'Bundle', type: 'document' },
      dicomStudyUid: selectedStudyUid || undefined,
    });
  };

  const loadImaging = async () => {
    const res = await listPatientImaging(pid);
    setImagingStudies(res?.data || []);
  };

  const translate = async () => {
    const res = await translateClinical(translateText, 'en', targetLang);
    setTranslateResult(res?.data?.translated || JSON.stringify(res?.data));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Globe className="h-5 w-5 text-teal-600" /> Global Clinical Board</h1>
            <p className="text-sm text-muted-foreground">Patient {patientId} — {HEALTH_OS.brandLine}</p>
          </div>
          <Button variant="outline" size="sm" asChild className="ml-auto">
            <Link to={`/hmis/patient/${patientId}/healthos`}>Workspace</Link>
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Start board</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Board title" />
              <Button variant="outline" size="sm" onClick={loadOrgs}>Load network orgs</Button>
              <div className="flex flex-wrap gap-1">
                {orgs.map((o) => (
                  <Badge
                    key={o.id}
                    variant={selectedOrgs.includes(o.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setSelectedOrgs((s) => s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id])}
                  >
                    {o.display_name} ({o.country_code})
                  </Badge>
                ))}
              </div>
              <Button onClick={startBoard} className="w-full">Start Global Board</Button>
              {session && (
                <div className="text-sm bg-teal-50 p-3 rounded-lg">
                  <p>Session #{session.id} — Room: {session.livekit_room}</p>
                  <Button size="sm" className="mt-2" onClick={join}>Join session</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Federated referral</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Reason for referral" value={referReason} onChange={(e) => setReferReason(e.target.value)} />
              <Button onClick={refer} disabled={!referReason}>Send referral</Button>
              {referrals.map((r) => (
                <div key={r.id} className="text-xs border rounded p-2">{r.reason} — <Badge variant="outline">{r.status}</Badge></div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Share document / imaging</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Document title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
              <Button variant="outline" size="sm" onClick={loadImaging}>Load DICOMweb studies</Button>
              {imagingStudies.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {imagingStudies.map((s) => (
                    <Badge
                      key={s.studyUID || s.id}
                      variant={selectedStudyUid === (s.studyUID || s.study_instance_uid) ? 'default' : 'outline'}
                      className="cursor-pointer text-[10px]"
                      onClick={() => setSelectedStudyUid(s.studyUID || s.study_instance_uid)}
                    >
                      {s.modality || 'IMG'} — {s.study_description || s.studyUID}
                    </Badge>
                  ))}
                </div>
              )}
              <Button onClick={shareDoc} disabled={!session}>Share to board</Button>
              {selectedStudyUid && <p className="text-xs text-muted-foreground">DICOMweb: /api/hypergrid/dicom/studies/{selectedStudyUid}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Languages className="h-4 w-4" /> AI translation</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Target language code (hi, ar, ja…)" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} />
              <Input placeholder="Clinical text to translate" value={translateText} onChange={(e) => setTranslateText(e.target.value)} />
              <Button onClick={translate}>Translate</Button>
              {translateResult && <p className="text-sm bg-slate-100 p-2 rounded">{translateResult}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
