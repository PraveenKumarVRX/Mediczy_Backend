import api from '@/utils/api';

const getLabAuthHeader = () => {
  const token = localStorage.getItem('labToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface IncomingLabOrder {
  id: number;
  order_number: string;
  patient_id: number;
  patient_name?: string;
  test_type?: string;
  tests?: unknown;
  priority?: string;
  status: string;
  notes?: string;
  total_amount?: number;
  created_at: string;
  billing_amount?: number;
  billing_status?: string;
}

const labOrderService = {
  getIncoming: async (params?: { status?: string; limit?: number; offset?: number }) => {
    const response = await api.get('/api/lab/orders', {
      headers: getLabAuthHeader(),
      params,
    });
    return response.data;
  },

  getById: async (orderId: number | string) => {
    const response = await api.get(`/api/lab/orders/${orderId}`, {
      headers: getLabAuthHeader(),
    });
    return response.data;
  },

  updateStatus: async (
    orderId: number | string,
    status: string,
    extras?: { results?: unknown; amount?: number }
  ) => {
    const response = await api.patch(
      `/api/lab/orders/${orderId}/status`,
      { status, ...extras },
      { headers: getLabAuthHeader() }
    );
    return response.data;
  },
};

export default labOrderService;
