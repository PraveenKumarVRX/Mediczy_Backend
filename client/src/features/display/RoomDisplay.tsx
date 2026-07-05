import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DisplayShell from '@/pages/display/DisplayShell';
import { VitalsStrip } from '@/components/clinical/VitalsStrip';

/** Bedside room display — /display/room/:bedId */
export default function RoomDisplay() {
  const { bedId } = useParams<{ bedId: string }>();
  const [room, setRoom] = useState<{
    patientName?: string;
    ward?: string;
    nurse?: string;
    vitals?: { hr?: number; spo2?: number; bp?: string };
    message?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/display/bedside?bed=${encodeURIComponent(bedId || '')}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setRoom(json);
        else setRoom({ patientName: 'Patient', ward: bedId, message: 'Welcome — your care team is here for you.' });
      })
      .catch(() => setRoom({ patientName: 'Patient', ward: bedId, message: 'Room display active.' }));
  }, [bedId]);

  return (
    <DisplayShell zone={`room-${bedId}`} zoneName={`Room ${bedId}`} fullscreen>
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <p className="text-gray-500 text-sm uppercase tracking-widest mb-2">Bed {bedId}</p>
        <h1 className="text-4xl font-bold text-white mb-2">{room?.patientName || '—'}</h1>
        {room?.ward && <p className="text-teal-400 mb-6">{room.ward}</p>}
        {room?.vitals && (
          <div className="max-w-xl w-full mb-6">
            <VitalsStrip vitals={room.vitals} />
          </div>
        )}
        {room?.nurse && <p className="text-gray-400">Assigned nurse: {room.nurse}</p>}
        {room?.message && (
          <p className="text-gray-300 mt-8 text-lg max-w-md">{room.message}</p>
        )}
      </div>
    </DisplayShell>
  );
}
