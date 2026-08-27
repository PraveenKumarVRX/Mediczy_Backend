/**
 * Structured radiology report editor — templates, AI draft, server Whisper dictation.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FileText, Mic, MicOff, Loader2, Sparkles } from 'lucide-react';
import ImagingAICopilot from './ImagingAICopilot';

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
  studyInstanceUID: string;
  patientName: string;
  modality: string;
  value: string;
  onChange: (text: string) => void;
  token: string;
}

export default function ImagingReportEditor({
  studyId,
  studyInstanceUID,
  patientName,
  modality,
  value,
  onChange,
  token,
}: ImagingReportEditorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  const appendDictation = (text: string) => {
    onChange(`${value}${value ? '\n' : ''}${text.trim()}`);
  };

  const stopRecorder = useCallback(() => {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.stop();
    }
    setDictating(false);
  }, []);

  const startServerDictation = useCallback(async () => {
    if (dictating) {
      stopRecorder();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'dictation.webm');
          const res = await axios.post(`${PLATFORM_API}/reports/dictate`, fd, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
          });
          if (res.data.text) appendDictation(res.data.text);
        } catch {
          fallbackBrowserDictation();
        } finally {
          setTranscribing(false);
        }
      };
      mediaRef.current = recorder;
      recorder.start();
      setDictating(true);
    } catch {
      fallbackBrowserDictation();
    }
  }, [dictating, stopRecorder, token, value, onChange]);

  const fallbackBrowserDictation = () => {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-IN';
    rec.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript;
      if (text) appendDictation(text);
    };
    rec.start();
  };

  return (
    <div className="space-y-3">
      <ImagingAICopilot
        studyId={studyId}
        studyInstanceUID={studyInstanceUID}
        patientName={patientName}
        token={token}
        currentText={value}
        onDraftGenerated={onChange}
      />

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
          onClick={startServerDictation}
          disabled={transcribing}
          className={`ml-auto text-xs px-2 py-1 rounded flex items-center gap-1 ${
            dictating || transcribing ? 'bg-red-900 text-red-200' : 'bg-gray-800 text-gray-300 border border-gray-700'
          }`}
          title="Whisper dictation (server)"
        >
          {transcribing ? <Loader2 size={12} className="animate-spin" /> : dictating ? <MicOff size={12} /> : <Mic size={12} />}
          {transcribing ? 'Transcribing…' : dictating ? 'Stop' : 'Dictate'}
        </button>
      </div>

      <textarea
        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 min-h-[220px]"
        placeholder="Findings, impression, recommendations…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={14}
      />

      <p className="text-[10px] text-gray-600 flex items-center gap-1">
        <Sparkles size={10} />
        AI drafts are advisory — physician sign-off required before finalizing.
      </p>
    </div>
  );
}
