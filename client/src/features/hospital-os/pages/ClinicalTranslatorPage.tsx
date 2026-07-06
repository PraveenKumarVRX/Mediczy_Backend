import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Languages } from 'lucide-react';
import { listTranslatorLanguages, translateClinical } from '@/services/hospitalOs.service';

export default function ClinicalTranslatorPage() {
  const [languages, setLanguages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [targetLang, setTargetLang] = useState('hi');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    listTranslatorLanguages().then((r) => setLanguages(r?.data || []));
  }, []);

  const translate = async () => {
    const r = await translateClinical({ text, targetLang, sourceLang: 'en' });
    setResult(r?.data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Languages className="h-5 w-5 text-blue-600" />
        Clinical Translator (Pillar 12)
      </h2>
      <Card>
        <CardContent className="pt-4 space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Clinical text to translate..." rows={4} />
          <select className="border rounded-md px-3 py-2 text-sm" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
            {(languages.length ? languages : ['hi', 'ta', 'te']).map((l: any) => {
              const code = typeof l === 'string' ? l : l.code;
              const name = typeof l === 'string' ? l.toUpperCase() : (l.name || l.code);
              return <option key={code} value={code}>{name}</option>;
            })}
          </select>
          <Button onClick={translate}>Translate</Button>
          {result && (
            <div className="bg-teal-50 border border-teal-200 rounded p-3 text-sm">
              {result.translatedText || result.translation || JSON.stringify(result)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
