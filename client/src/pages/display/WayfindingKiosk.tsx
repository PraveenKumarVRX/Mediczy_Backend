import React, { useState } from 'react';
import DisplayShell from './DisplayShell';

export default function WayfindingKiosk() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ direction?: string; zone?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/display/kiosk/wayfinding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (json.success) setResult(json);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DisplayShell zone="lobby" zoneName="Wayfinding" fullscreen>
      <div className="max-w-xl mx-auto mt-16 p-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Where do you need to go?</h1>
        <p className="text-gray-400 mb-8">AI-assisted directions — no paper map needed</p>
        <input
          className="w-full rounded-xl px-4 py-4 text-lg text-gray-900 mb-4"
          placeholder="e.g. OPD, lab, pharmacy, emergency"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" onClick={ask} disabled={loading} className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-4 rounded-xl">
          {loading ? 'Finding route…' : 'Get directions'}
        </button>
        {result?.direction && (
          <div className="mt-8 p-6 bg-gray-800 rounded-xl border border-teal-700 text-left">
            <p className="text-teal-400 text-sm uppercase mb-2">Zone: {result.zone}</p>
            <p className="text-white text-xl">{result.direction}</p>
          </div>
        )}
      </div>
    </DisplayShell>
  );
}
