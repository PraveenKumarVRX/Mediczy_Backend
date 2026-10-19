import api from '@/utils/api';
// Keep a key for the same unresolved user action. Never persist clinical payloads in browser storage.
const pending = new Map<string, string>();
export async function nursingWrite(path: string, payload: unknown) {
    const fingerprint = JSON.stringify([path, payload]);
    const key = pending.get(fingerprint) || crypto.randomUUID();
    pending.set(fingerprint, key);
    try {
        const result = await api.post(path, payload, { headers: { 'Idempotency-Key': key } });
        pending.delete(fingerprint);
        return result;
    }
    catch (error: any) {
        // Retain uncertain writes for retry. A definitive validation rejection has no committed side effect.
        if (error?.response?.status && error.response.status < 500)
            pending.delete(fingerprint);
        throw error;
    }
}
export const nursingGet = async (path: string) => (await api.get(`/v1/nursing${path}`)).data.data;
export const nursingPost = async (path: string, payload: unknown) => (await nursingWrite(`/v1/nursing${path}`, payload)).data.data;
