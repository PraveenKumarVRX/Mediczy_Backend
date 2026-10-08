import api from '@/lib/api';

export interface OtProctorRoom {
  roomId: string;
  startedAt: number;
}

export interface OtObserverJoin {
  serverUrl: string;
  token: string;
}

export async function listOtProctorRooms(): Promise<OtProctorRoom[]> {
  const res = await api.get('/display/video/sessions/ot-proctor/active');
  return res.data?.rooms || [];
}

/** Subscribe-only token for a live OT proctoring room of the caller's own hospital. */
export async function joinOtProctorRoom(roomId: string): Promise<OtObserverJoin> {
  const res = await api.post('/display/video/sessions/observer', { roomId });
  return res.data.join;
}
