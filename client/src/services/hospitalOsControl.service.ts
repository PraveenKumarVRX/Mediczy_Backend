import api from '@/utils/api';

const base = '/v1/hospital-os';

export async function listDisplayDevices() {
  const res = await api.get(`${base}/devices`);
  return res.data;
}

export async function registerDisplayDevice(body: {
  zone: string;
  locationLabel: string;
  screenType?: string;
  deviceToken: string;
}) {
  const res = await api.post(`${base}/devices`, body);
  return res.data;
}

export async function listSignageContent() {
  const res = await api.get(`${base}/cms/signage`);
  return res.data;
}

export async function createSignageContent(body: { title: string; body?: string; zone?: string }) {
  const res = await api.post(`${base}/cms/signage`, body);
  return res.data;
}
