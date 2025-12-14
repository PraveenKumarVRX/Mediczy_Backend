import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FiWatch, FiActivity, FiHeart, FiBattery, FiWifi,
  FiPlus, FiSearch, FiUser, FiTrendingUp, FiAlertCircle
} from 'react-icons/fi';

const WearablesDashboard = () => {
  const navigate = useNavigate();
  const [wearables, setWearables] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    low_battery: 0,
    offline: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchWearables();
  }, [typeFilter, statusFilter]);

  const fetchWearables = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;

      const response = await axios.get('/api/wearables', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      if (response.data.success) {
        const devices = response.data.wearables;
        setWearables(devices);
        
        // Calculate stats
        setStats({
          total: devices.length,
          active: devices.filter(d => d.status === 'active').length,
          low_battery: devices.filter(d => d.battery_level && d.battery_level < 20).length,
          offline: devices.filter(d => !d.is_online).length
        });
      }
    } catch (error) {
      console.error('Failed to fetch wearables:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWearables = wearables.filter(w =>
    w.device_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.model?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeIcon = (type) => {
    switch(type) {
      case 'smartwatch': return '⌚';
      case 'smartband': return '⏱️';
      case 'smartring': return '💍';
      default: return '📱';
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      assigned: 'bg-blue-100 text-blue-800',
      available: 'bg-gray-100 text-gray-800',
      inactive: 'bg-yellow-100 text-yellow-800',
      damaged: 'bg-red-100 text-red-800',
      lost: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getBatteryColor = (level) => {
    if (level >= 50) return 'text-green-600';
    if (level >= 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <FiWatch className="text-blue-600" />
                Wearable Devices
              </h1>
              <p className="text-gray-600 mt-1">Health monitoring smartwatch, band & ring</p>
            </div>
            <button
              onClick={() => navigate('/admin/wearables/provision')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <FiPlus /> Provision Device
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Devices</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <FiWatch className="text-3xl text-blue-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              </div>
              <FiActivity className="text-3xl text-green-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Low Battery</p>
                <p className="text-2xl font-bold text-gray-900">{stats.low_battery}</p>
              </div>
              <FiBattery className="text-3xl text-yellow-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Offline</p>
                <p className="text-2xl font-bold text-gray-900">{stats.offline}</p>
              </div>
              <FiWifi className="text-3xl text-red-600" />
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
                placeholder="Search devices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="smartwatch">Smartwatch</option>
              <option value="smartband">Smart Band</option>
              <option value="smartring">Smart Ring</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="assigned">Assigned</option>
              <option value="available">Available</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Devices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-3 flex justify-center items-center py-12">
              <div className="animate-spin text-4xl">⏳</div>
            </div>
          ) : filteredWearables.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-gray-500">
              No wearable devices found
            </div>
          ) : (
            filteredWearables.map((wearable) => (
              <div
                key={wearable.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 cursor-pointer"
                onClick={() => navigate(`/admin/wearables/${wearable.id}`)}
              >
                {/* Device Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{getTypeIcon(wearable.type)}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{wearable.device_name}</h3>
                      <p className="text-sm text-gray-500">{wearable.model}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(wearable.status)}`}>
                    {wearable.status}
                  </span>
                </div>

                {/* Device ID */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500">Device ID</p>
                  <p className="text-sm font-mono text-gray-700">{wearable.device_id}</p>
                </div>

                {/* User Info */}
                {wearable.user_id && (
                  <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                    <FiUser size={14} />
                    <span>User ID: {wearable.user_id}</span>
                  </div>
                )}

                {/* Health Metrics */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <FiBattery className={getBatteryColor(wearable.battery_level)} />
                    <span className="text-sm text-gray-700">
                      {wearable.battery_level !== null ? `${wearable.battery_level}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FiWifi className={wearable.is_online ? 'text-green-600' : 'text-gray-400'} />
                    <span className="text-sm text-gray-700">
                      {wearable.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>

                {/* Last Sync */}
                {wearable.last_sync && (
                  <div className="text-xs text-gray-500">
                    Last sync: {new Date(wearable.last_sync).toLocaleString()}
                  </div>
                )}

                {/* Subscription */}
                {wearable.subscription_active && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Subscription</span>
                      <span className="text-green-600 font-medium">Active</span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Count */}
        <div className="mt-6 text-center text-sm text-gray-600">
          Showing {filteredWearables.length} of {wearables.length} devices
        </div>
      </div>
    </div>
  );
};

export default WearablesDashboard;
