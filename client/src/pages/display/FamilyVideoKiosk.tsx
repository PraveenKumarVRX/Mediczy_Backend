import React, { useState } from 'react';
import DisplayShell from './DisplayShell';
import { displayDeviceHeaders } from '@/utils/displayDeviceAuth';

export default function FamilyVideoKiosk() {
  const [bed, setBed] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const startSession = async () => {
    if (!bed.trim()) {
      setMessage('Enter patient bed or room number.');
      return;
    }
    setStatus('connecting');
    setMessage('');
    try {
      const res = await fetch('/api/display/video/sessions', {
        method: 'POST',
        headers: displayDeviceHeaders(),
        body: JSON.stringify({
          sessionType: 'family',
          targetZone: 'bedside',
          bedId: bed,
          role: 'family',
          metadata: { phone },
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus('ready');
        setMessage('Video call started. A nurse will join shortly on the bedside display.');
      } else {
        setStatus('error');
        setMessage(json.message || 'Could not start video session.');
      }
    } catch (_) {
      setStatus('error');
      setMessage('Connection error.');
    }
  };

  return (
    <DisplayShell zone="family-video" zoneName="Family Video Visit" fullscreen>
      <div className="h-full flex flex-col items-center justify-center p-8 max-w-lg mx-auto">
        <h1 className="text-3xl font-bold text-teal-300 mb-2">Family Video Visit</h1>
        <p className="text-gray-400 text-center mb-8">Connect with your loved one via the bedside display.</p>

        <input
          className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700 mb-4"
          placeholder="Bed / room number (e.g. 3B-02)"
          value={bed}
          onChange={(e) => setBed(e.target.value)}
        />
        <input
          className="w-full p-4 rounded-xl bg-gray-800 border border-gray-700 mb-6"
          placeholder="Your mobile (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
        />

        {message && (
          <p className={`mb-4 text-sm text-center ${status === 'error' ? 'text-red-400' : 'text-teal-300'}`}>{message}</p>
        )}

        <button
          type="button"
          onClick={startSession}
          disabled={status === 'connecting'}
          className="w-full py-5 bg-teal-600 hover:bg-teal-500 rounded-2xl text-xl font-bold disabled:opacity-50"
        >
          {status === 'connecting' ? 'Starting…' : '📹 Start Video Visit'}
        </button>
      </div>
    </DisplayShell>
  );
}
