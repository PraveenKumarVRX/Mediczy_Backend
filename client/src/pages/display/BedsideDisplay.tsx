import React, { useEffect, useState, useCallback } from 'react';
import DisplayShell from './DisplayShell';
import { displayDeviceHeaders } from '@/utils/displayDeviceAuth';

interface BedData {
  bed_number: string;
  patient_name: string;
  age: number;
  gender: string;
  blood_group: string;
  diagnosis: string;
  admitted_on: string;
  ward: string;
  care_team: Array<{ role: string; name: string; specialty?: string }>;
  medications_today: Array<{ name: string; time: string; given: boolean }>;
  diet: { plan: string; next_meal: string; restriction: string };
  vitals: { spo2: number; hr: number; bp: string; temp: number; time: string };
  notes_for_patient: string;
}

function NurseCallButton() {
  const [calling, setCalling] = useState(false);
  const [called, setCalled] = useState(false);

  const handleCall = async () => {
    if (calling || called) return;
    setCalling(true);
    try {
      const bed = new URLSearchParams(window.location.search).get('bed') ?? '3B-02';
      await fetch('/api/display/bedside/nurse-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bed,
          ward: new URLSearchParams(window.location.search).get('ward') || 'ward',
          patient_name: document.title,
        }),
      });
      setCalling(false);
      setCalled(true);
      setTimeout(() => setCalled(false), 15000);
    } catch (_) {
      setCalling(false);
    }
  };

  return (
    <button
      onClick={handleCall}
      className={`w-full py-4 rounded-2xl text-xl font-bold transition-all active:scale-95 mt-4
        ${called ? 'bg-green-600 cursor-default' : calling ? 'bg-amber-600 animate-pulse' : 'bg-red-600 hover:bg-red-500'}`}
    >
      {called ? '✓ Nurse notified — please wait' : calling ? '🔔 Calling nurse…' : '🔔 Call Nurse'}
    </button>
  );
}

export default function BedsideDisplay() {
  const [data, setData] = useState<BedData | null>(null);
  const [mealRating, setMealRating] = useState<number | null>(null);

  // Bed number comes from URL query param ?bed=3B-02
  const bed = new URLSearchParams(window.location.search).get('bed') ?? '3B-02';

  const fetchBedside = useCallback(async () => {
    try {
      const res = await fetch(`/api/display/bedside?bed=${encodeURIComponent(bed)}`);
      const json = await res.json();
      if (json.success) setData(json.bed);
    } catch (_) {}
  }, [bed]);

  useEffect(() => {
    fetchBedside();
    const t = setInterval(fetchBedside, 60000);
    return () => clearInterval(t);
  }, [fetchBedside]);

  if (!data) {
    return (
      <DisplayShell zone="bedside" zoneName={`Bedside — ${bed}`} fullscreen>
        <div className="h-full flex items-center justify-center text-gray-500 text-xl">Loading patient information…</div>
      </DisplayShell>
    );
  }

  return (
    <DisplayShell zone="bedside" zoneName={`Bedside — ${data.bed_number}`} fullscreen>
      <div className="h-full overflow-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: Patient info + care team */}
        <div className="space-y-3">
          {/* Patient card */}
          <div className="bg-teal-900/40 border border-teal-700 rounded-2xl p-4">
            <h2 className="text-xl font-bold text-teal-300">{data.patient_name}</h2>
            <p className="text-gray-400 text-sm">{data.age}y · {data.gender} · {data.blood_group}</p>
            <p className="text-white mt-2 font-medium">{data.diagnosis}</p>
            <p className="text-gray-500 text-xs mt-1">Admitted: {data.admitted_on} · {data.ward}</p>
          </div>

          {/* Care team */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-widest">Your Care Team</h3>
            <div className="space-y-2">
              {data.care_team.map((m, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center text-sm font-bold shrink-0">
                    {m.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{m.name}</p>
                    <p className="text-gray-500 text-xs">{m.role}{m.specialty ? ` · ${m.specialty}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current vitals */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-widest">Latest Vitals</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'SpO₂', value: `${data.vitals.spo2}%` },
                { label: 'Heart Rate', value: `${data.vitals.hr} /min` },
                { label: 'BP', value: data.vitals.bp },
                { label: 'Temp', value: `${data.vitals.temp}°C` },
              ].map(v => (
                <div key={v.label} className="bg-gray-900/50 rounded-xl p-3 text-center">
                  <p className="text-gray-500 text-xs">{v.label}</p>
                  <p className="text-white font-bold">{v.value}</p>
                </div>
              ))}
            </div>
            <p className="text-gray-600 text-xs mt-2 text-right">
              As of {new Date(data.vitals.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Centre: Medications + diet */}
        <div className="space-y-3">
          {/* Medications */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-widest">Today's Medications</h3>
            <div className="space-y-2">
              {data.medications_today.map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-900/40">
                  <span className="text-lg">{m.given ? '✅' : '⏳'}</span>
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{m.name}</p>
                    <p className="text-gray-500 text-xs">{m.time}</p>
                  </div>
                  <span className={`text-xs font-semibold ${m.given ? 'text-green-400' : 'text-amber-400'}`}>
                    {m.given ? 'Given' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Diet */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-widest">Diet Plan</h3>
            <p className="text-white font-medium mb-1">{data.diet.plan}</p>
            <p className="text-gray-400 text-sm">Next meal: {data.diet.next_meal}</p>
            {data.diet.restriction && (
              <p className="text-amber-400 text-xs mt-2">⚠️ {data.diet.restriction}</p>
            )}
          </div>

          {/* Meal rating */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-widest">Rate Your Last Meal</h3>
            <div className="flex justify-center gap-3">
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  onClick={() => setMealRating(star)}
                  className={`text-3xl transition-transform hover:scale-110 active:scale-95 ${mealRating !== null && star <= mealRating ? 'opacity-100' : 'opacity-30'}`}
                >
                  ⭐
                </button>
              ))}
            </div>
            {mealRating !== null && (
              <p className="text-center text-green-400 text-sm mt-2">Thank you for your feedback!</p>
            )}
          </div>
        </div>

        {/* Right: Notes + nurse call */}
        <div className="space-y-3">
          {/* Patient notes */}
          <div className="bg-blue-900/30 border border-blue-800 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-3 uppercase tracking-widest">Notes for You</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{data.notes_for_patient}</p>
          </div>

          {/* Emergency info */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-widest">Important</h3>
            <div className="space-y-2 text-sm text-gray-400">
              <p>🏥 <strong className="text-white">Visiting Hours:</strong> 10am–12pm, 5pm–7pm</p>
              <p>📵 <strong className="text-white">Mobile Use:</strong> Silent mode in ward</p>
              <p>🚫 <strong className="text-white">Food:</strong> Only hospital diet unless cleared</p>
              <p>💊 <strong className="text-white">Medicines:</strong> Do not take own medicines without nurse approval</p>
            </div>
          </div>

          {/* Nurse call */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-widest">Need Help?</h3>
            <NurseCallButton />
            <button
              type="button"
              className="w-full py-3 mt-3 bg-teal-800 hover:bg-teal-700 rounded-xl text-sm font-semibold"
              onClick={async () => {
                const ward = new URLSearchParams(window.location.search).get('ward') || 'ward';
                await fetch('/api/display/video/sessions', {
                  method: 'POST',
                  headers: displayDeviceHeaders(),
                  body: JSON.stringify({
                    sessionType: 'bedside-consult',
                    targetZone: ward,
                    bedId: bed,
                    patientId: data.patient_name,
                    role: 'patient',
                  }),
                });
              }}
            >
              📹 Video consult
            </button>
          </div>

          {/* Entertainment placeholder */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-widest">Entertainment</h3>
            <div className="grid grid-cols-2 gap-2">
              {['📺 TV Guide', '📻 Radio', '🎵 Music', '📰 News'].map(item => (
                <button key={item} className="py-3 bg-gray-700/50 hover:bg-gray-700 rounded-xl text-sm font-medium transition-all">
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DisplayShell>
  );
}
