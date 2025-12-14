import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AdminLayout from '../../components/admin/AdminLayout';
import DeviceRegistrationForm from '../../components/admin/DeviceRegistrationForm';
import {
  FiTablet, FiPlus, FiSearch, FiFilter, FiPhone, FiBattery,
  FiWifi, FiCheckCircle, FiAlertCircle, FiDollarSign, FiBarChart2,
  FiEdit2, FiRefreshCw, FiActivity
} from 'react-icons/fi';

const DeviceManagement = () => {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [stats, setStats] = useState({
    total_devices: 0,
    active_devices: 0,
    monthly_recurring_revenue: 0,
    active_amcs: 0
  });

  useEffect(() => {
    fetchDevices();
    fetchRevenueStats();
  }, [statusFilter, planFilter]);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken');
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (planFilter) params.subscription_plan = planFilter;

      const response = await axios.get('/api/devices', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      if (response.data.success) {
        setDevices(response.data.devices);
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenueStats = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.get('/api/devices/stats/revenue', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch revenue stats:', error);
    }
  };

  const filteredDevices = devices.filter(device =>
    device.device_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.phone_number?.includes(searchTerm)
  );

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      maintenance: 'bg-yellow-100 text-yellow-800',
      faulty: 'bg-red-100 text-red-800',
      returned: 'bg-blue-100 text-blue-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPlanBadge = (plan) => {
    const colors = {
      basic: 'bg-blue-100 text-blue-800',
      standard: 'bg-purple-100 text-purple-800',
      premium: 'bg-orange-100 text-orange-800',
      enterprise: 'bg-red-100 text-red-800'
    };
    return colors[plan] || 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <FiTablet className="text-blue-600" />
                Device Management
              </h1>
              <p className="text-gray-600 mt-1">Smart tablets with SIM + Software + AMC</p>
            </div>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <FiPlus /> Register Device
            </button>
          </div>
        </div>

        {/* Revenue Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Devices</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_devices}</p>
              </div>
              <FiTablet className="text-3xl text-blue-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active AMCs</p>
                <p className="text-2xl font-bold text-gray-900">{stats.active_amcs}</p>
              </div>
              <FiCheckCircle className="text-3xl text-green-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Monthly Recurring</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(stats.monthly_recurring_revenue)}
                </p>
              </div>
              <FiDollarSign className="text-3xl text-purple-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Annual Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(stats.annual_recurring_revenue || stats.monthly_recurring_revenue * 12)}
                </p>
              </div>
              <FiBarChart2 className="text-3xl text-orange-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by device ID, name, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
              <option value="faulty">Faulty</option>
              <option value="returned">Returned</option>
            </select>

            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Plans</option>
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        {/* Devices Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Health</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AMC</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <div className="flex justify-center items-center">
                      <FiRefreshCw className="animate-spin text-3xl text-blue-600" />
                    </div>
                  </td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    No devices found
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FiTablet className="text-2xl text-gray-400" />
                        <div>
                          <div className="font-medium text-gray-900">{device.device_name}</div>
                          <div className="text-sm text-gray-500">{device.device_id}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <FiPhone size={12} />
                            {device.phone_number || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(device.status)}`}>
                        {device.status}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPlanBadge(device.subscription_plan)}`}>
                        {device.subscription_plan}
                      </span>
                      {!device.subscription_active && (
                        <div className="text-xs text-red-600 mt-1">Expired</div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {device.assigned_to ? (
                        <div>
                          <div className="text-sm font-medium text-gray-900">{device.assigned_to.type}</div>
                          <div className="text-xs text-gray-500">Tenant #{device.assigned_to.tenant_id}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Unassigned</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {device.battery_level !== null && (
                          <div className="flex items-center gap-1 text-sm">
                            <FiBattery
                              className={device.battery_level > 20 ? 'text-green-600' : 'text-red-600'}
                            />
                            {device.battery_level}%
                          </div>
                        )}
                        {device.last_online && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <FiActivity size={12} />
                            {new Date(device.last_online).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {device.amc_active ? (
                        <span className="flex items-center gap-1 text-sm text-green-600">
                          <FiCheckCircle />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-sm text-red-600">
                          <FiAlertCircle />
                          Expired
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/admin/devices/${device.id}`)}
                        className="text-blue-600 hover:text-blue-800 mr-3"
                        title="View Details"
                      >
                        <FiEdit2 />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Device Count */}
        <div className="mt-4 text-sm text-gray-600 text-center">
          Showing {filteredDevices.length} of {devices.length} devices
        </div>
      </div>

      {/* Register Device Modal */}
      {showRegisterModal && (
        <DeviceRegistrationForm
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => {
            fetchDevices();
            fetchRevenueStats();
          }}
        />
      )}
    </AdminLayout>
  );
};

export default DeviceManagement;
