import api from '@/lib/api';

const API_URL = '/api';

// Get auth token
const getAuthHeader = () => {
  const token = localStorage.getItem('pharmacyToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Get pharmacy data from localStorage
const getPharmacyData = () => {
  const data = localStorage.getItem('pharmacyData');
  return data ? JSON.parse(data) : null;
};

const pharmacyService = {
  // ============ Authentication ============
  login: async (credentials: { email: string; password: string }) => {
    const response = await api.post(`${API_URL}/pharmacy/login`, credentials);
    if (response.data.token) {
      localStorage.setItem('pharmacyToken', response.data.token);
      localStorage.setItem('pharmacyData', JSON.stringify(response.data.pharmacy));
    }
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('pharmacyToken');
    localStorage.removeItem('pharmacyData');
  },

  // ============ Profile ============
  getProfile: async () => {
    const response = await api.get(`${API_URL}/pharmacy/profile`, {
      headers: getAuthHeader(),
    });
    return response.data;
  },

  updateProfile: async (data: any) => {
    const response = await api.put(`${API_URL}/pharmacy/profile`, data, {
      headers: getAuthHeader(),
    });
    return response.data;
  },

  // ============ Batch Management ============
  batches: {
    // Get all batches
    getAll: async (params?: { limit?: number; offset?: number }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.get(`${API_URL}/pharmacy/batches`, {
        headers: getAuthHeader(),
        params: {
          pharmacyId,
          ...params,
        },
      });
      return response.data;
    },

    // Add new batch
    create: async (batchData: {
      batchNumber: string;
      medicineId: number;
      quantity: number;
      expiryDate?: string;
      manufacturingDate?: string;
      costPrice?: number;
      sellingPrice?: number;
      supplier?: string;
    }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.post(
        `${API_URL}/pharmacy/batches`,
        {
          ...batchData,
          pharmacyId,
        },
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },

    // Update batch
    update: async (batchId: number, updates: any) => {
      const response = await api.put(
        `${API_URL}/pharmacy/batches/${batchId}`,
        updates,
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },

    // Delete batch
    delete: async (batchId: number) => {
      const response = await api.delete(
        `${API_URL}/pharmacy/batches/${batchId}`,
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },
  },

  // ============ Analytics ============
  analytics: {
    // Get dashboard analytics
    getDashboard: async () => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.get(`${API_URL}/pharmacy/analytics/dashboard`, {
        headers: getAuthHeader(),
        params: { pharmacyId },
      });
      return response.data;
    },

    // Get sales analytics
    getSales: async (days: number = 30) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.get(`${API_URL}/pharmacy/analytics/sales`, {
        headers: getAuthHeader(),
        params: { pharmacyId, days },
      });
      return response.data;
    },
  },

  // ============ Inventory Management ============
  inventory: {
    // Get all medicines
    getMedicines: async (params?: { search?: string; category?: string; limit?: number; offset?: number }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.get(`${API_URL}/pharmacy/inventory`, {
        headers: getAuthHeader(),
        params: {
          pharmacyId,
          ...params,
        },
      });
      return response.data;
    },

    // Get low stock items
    getLowStock: async () => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.get(`${API_URL}/pharmacy/inventory/low-stock`, {
        headers: getAuthHeader(),
        params: { pharmacyId },
      });
      return response.data;
    },

    // Add medicine
    addMedicine: async (medicineData: {
      name: string;
      genericName?: string;
      category?: string;
      manufacturer?: string;
      dosage?: string;
      form?: string;
      minStockLevel?: number;
      maxStockLevel?: number;
    }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.post(
        `${API_URL}/pharmacy/inventory`,
        {
          ...medicineData,
          pharmacyId,
        },
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },

    // Update medicine
    updateMedicine: async (medicineId: number, updates: any) => {
      const response = await api.put(
        `${API_URL}/pharmacy/inventory/${medicineId}`,
        updates,
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },
  },

  // ============ Sales / Prescriptions ============
  sales: {
    // Get all sales
    getAll: async (params?: { startDate?: string; endDate?: string; limit?: number; offset?: number }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.get(`${API_URL}/pharmacy/sales`, {
        headers: getAuthHeader(),
        params: {
          pharmacyId,
          ...params,
        },
      });
      return response.data;
    },

    // Create sale
    create: async (saleData: {
      customerId?: number;
      prescriptionId?: number;
      items: Array<{
        medicineId: number;
        batchId: number;
        quantity: number;
        price: number;
      }>;
      totalAmount: number;
      paymentMethod: string;
    }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.post(
        `${API_URL}/pharmacy/sales`,
        {
          ...saleData,
          pharmacyId,
        },
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },

    // Get sale details
    getById: async (saleId: number) => {
      const response = await api.get(`${API_URL}/pharmacy/sales/${saleId}`, {
        headers: getAuthHeader(),
      });
      return response.data;
    },
  },

  // ============ Prescriptions ============
  prescriptions: {
    // Get all prescriptions
    getAll: async (params?: { status?: string; limit?: number; offset?: number }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.get(`${API_URL}/pharmacy/prescriptions`, {
        headers: getAuthHeader(),
        params: {
          pharmacyId,
          ...params,
        },
      });
      return response.data;
    },

    // Get prescription details
    getById: async (prescriptionId: number) => {
      const response = await api.get(
        `${API_URL}/pharmacy/prescriptions/${prescriptionId}`,
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },

    // Update prescription status
    updateStatus: async (prescriptionId: number, status: string) => {
      const response = await api.patch(
        `${API_URL}/pharmacy/prescriptions/${prescriptionId}/status`,
        { status },
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },
  },

  // ============ Customers ============
  customers: {
    // Get all customers
    getAll: async (params?: { search?: string; limit?: number; offset?: number }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.get(`${API_URL}/pharmacy/customers`, {
        headers: getAuthHeader(),
        params: {
          pharmacyId,
          ...params,
        },
      });
      return response.data;
    },

    // Add customer
    create: async (customerData: {
      name: string;
      phone: string;
      email?: string;
      address?: string;
    }) => {
      const pharmacyData = getPharmacyData();
      const pharmacyId = pharmacyData?.pharmacyId;

      const response = await api.post(
        `${API_URL}/pharmacy/customers`,
        {
          ...customerData,
          pharmacyId,
        },
        {
          headers: getAuthHeader(),
        }
      );
      return response.data;
    },

    // Get customer details
    getById: async (customerId: number) => {
      const response = await api.get(`${API_URL}/pharmacy/customers/${customerId}`, {
        headers: getAuthHeader(),
      });
      return response.data;
    },
  },
};

export default pharmacyService;
