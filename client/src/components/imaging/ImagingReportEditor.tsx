/**
 * Structured radiology report editor — templates, macros, voice dictation.
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, Mic, MicOff, Loader2 } from 'lucide-react';

const PLATFORM_API = '/api/imaging/platform';

interface Template {
  id: number;
  name: string;
  modality: string;
  body: string;
  macros: string[];
  is_default: boolean;
}

interface ImagingReportEditorProps {
  studyId: number;
  modality: string;
  value: string;
  onChange: (text: string) => void;
  token: string;
}

export default function ImagingReportEditor({
  studyId,
  modality,
  value,
  onChange,
  token,
}: ImagingReportEditorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);

  useEffect(() => {
    setLoadingTpl(true);
    axios
      .get(`${PLATFORM_API}/templates`, {
        params: { modality: modality === 'X-Ray' ? 'XR' : modality },
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpl(false));
  }, [modality, token]);

  const applyTemplate = async (tpl: Template) => {
    try {
      const res = await axios.post(
        `${PLATFORM_API}/templates/apply`,
        {
          body: tpl.body,
          values: {
            technique: `${modality} study — standard protocol`,
            findings: '',
            impression: '',
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      onChange(res.data.report || tpl.body);
    } catch {
      onChange(tpl.body);
    }
  };

  const toggleDictation = useCallback(() => {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;

    if (dictating && recognition) {
      recognition.stop();
      setDictating(false);
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        chunk += event.results[i][0].transcript;
      }
      if (chunk.trim()) onChange(`${value}${value ? ' ' : ''}${chunk.trim()}`);
    };
    rec.onerror = () => setDictating(false);
    rec.onend = () => setDictating(false);
    rec.start();
    setRecognition(rec);
    setDictating(true);
  }, [dictating, recognition, value, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <FileText size={12} /> Templates
        </span>
        {loadingTpl ? (
          <Loader2 size={14} className="animate-spin text-gray-500" />
        ) : (
          templates.slice(0, 4).map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700 hover:border-indigo-500"
            >
              {tpl.name}
            </button>
          ))
        )}
        <button
          type="button"
          onClick={toggleDictation}
          className={`ml-auto text-xs px-2 py-1 rounded flex items-center gap-1 ${
            dictating ? 'bg-red-900 text-red-200' : 'bg-gray-800 text-gray-300 border border-gray-700'
          }`}
          title="Voice dictation (browser)"
        >
          {dictating ? <MicOff size={12} /> : <Mic size={12} />}
          {dictating ? 'Stop' : 'Dictate'}
        </button>
      </div>
      <textarea
        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 min-h-[200px]"
        placeholder="Findings, impression, recommendations…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
      />
      <p className="text-[10px] text-gray-600">Study #{studyId} · AI triage is advisory — physician sign-off required.</p>
    </div>
  );
}
