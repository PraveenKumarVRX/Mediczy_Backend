import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';

/**
 * Hospital QMS is unified into the Walk-in Kiosk.
 * This route exists for bookmarks / hub links — it provisions a device token
 * for the hospital org and opens /kiosk/checkin (phone + Aadhaar registration).
 * Staff call-next lives at /hospital/queue-console.
 */
export default function HospitalQmsPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/qms/walk-in-kiosk');
        if (cancelled) return;
        if (!data?.success || !data?.deviceToken) {
          setError(data?.message || 'Could not open walk-in kiosk');
          return;
        }
        try {
          localStorage.setItem('displayDeviceToken', data.deviceToken);
        } catch {
          /* ignore */
        }
        const path = data.kioskPath || `/kiosk/checkin?deviceToken=${encodeURIComponent(data.deviceToken)}`;
        window.location.replace(path);
      } catch (e: unknown) {
        if (cancelled) return;
        // Fallback: open kiosk anyway (may already have a device token in localStorage)
        const existing = localStorage.getItem('displayDeviceToken');
        if (existing) {
          window.location.replace(`/kiosk/checkin?deviceToken=${encodeURIComponent(existing)}`);
          return;
        }
        // Never open bare /kiosk/checkin — Aadhaar server decode needs device token
        setError(e instanceof Error ? e.message : 'Could not open walk-in kiosk');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 px-6">
      <p className="text-2xl font-semibold text-teal-300" style={{ fontFamily: 'Georgia, serif' }}>
        Mediqzy
      </p>
      <p className="mt-3 text-sm text-slate-400">
        {error ? error : 'Opening walk-in kiosk…'}
      </p>
      <p className="mt-6 text-xs text-slate-600">
        Phone + Aadhaar registration · Call next is on Queue Console
      </p>
    </div>
  );
}
