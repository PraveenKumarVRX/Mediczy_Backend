import React, { useState } from 'react';
import DisplayShell from './DisplayShell';
import { displayDeviceHeaders } from '@/utils/displayDeviceAuth';

interface WayfindingResult {
  direction?: string;
  steps?: string[];
  zone?: string;
  destination?: string;
  matched?: boolean;
  configured?: boolean;
}

export default function WayfindingKiosk() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<WayfindingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/display/kiosk/wayfinding', {
        method: 'POST',
        headers: displayDeviceHeaders(),
        body: JSON.stringify({ query }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) setResult(json);
      else {
        setResult(null);
        setError(json.message || 'Directions are unavailable right now. Please ask at the reception desk.');
      }
    } catch {
      setResult(null);
      setError('Directions are unavailable right now. Please ask at the reception desk.');
    } finally {
      setLoading(false);
    }
  };

  const steps = result?.steps?.length ? result.steps : result?.direction ? [result.direction] : [];

  return (
    <DisplayShell zone="lobby" zoneName="Wayfinding" fullscreen>
      <div className="max-w-xl mx-auto mt-16 p-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Where do you need to go?</h1>
        <p className="text-gray-400 mb-8">Type a department or service</p>
        <input
          className="w-full rounded-xl px-4 py-4 text-lg text-gray-900 mb-4"
          placeholder="e.g. OPD, lab, pharmacy, emergency"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && query.trim().length >= 3 && !loading) ask(); }}
        />
        <button
          type="button"
          onClick={ask}
          disabled={loading || query.trim().length < 3}
          className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-4 rounded-xl disabled:opacity-50"
        >
          {loading ? 'Finding route…' : 'Get directions'}
        </button>
        {error && <p className="mt-6 text-amber-400">{error}</p>}
        {steps.length > 0 && (
          <div className="mt-8 p-6 bg-gray-800 rounded-xl border border-teal-700 text-left">
            {result?.destination && <p className="text-teal-400 text-sm uppercase mb-2">{result.destination}</p>}
            <ol className="text-white text-xl space-y-2 list-decimal list-inside">
              {steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        )}
      </div>
    </DisplayShell>
  );
}
