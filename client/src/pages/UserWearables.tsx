import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FiWatch, FiActivity, FiHeart, FiBattery, FiWifi, FiUser,
  FiCalendar, FiSettings, FiTrendingUp, FiAlertCircle,
  FiArrowLeft, FiRefreshCw
} from 'react-icons/fi';

const UserWearables = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [wearables, setWearables] = useState([]);
  const [healthSummary, setHealthSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('devices');

  useEffect(() => {
    if (userId) {
      fetchUserWearables();
      fetchHealthSummary();
    }
  }, [userId]);

  const fetchUserWearables = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/wearables/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setWearables(response.data.wearables);
      }
    } catch (error) {
      console.error('Failed to fetch user wearables:', error);
    }
  };

  const fetchHealthSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/wearables/user/${userId}/health-summary?days=7`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setHealthSummary(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch health summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type) => {
    switch(type) {
      case 'smartwatch': return '⌚';
      case 'smartband': return '⏱️';
      case 'smartring': return '💍';
      default: return '📱';
    }
  };

  const renderHealthMetric = (name, data) => {
    if (!data || !data.latest) return null;

    const getValueDisplay = (value) => {
      if (typeof value === 'object') {
        if (value.systolic && value.diastolic) {
          return `${value.systolic}/${value.diastolic}`;
        }
        if (value.value !== undefined) {
          return value.value;
        }
      }
      return value;
    };

    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 capitalize">
            {name.replace('_', ' ')}
          </h3>
          <FiActivity className="text-blue-600" />
        </div>
        <div className="text-2xl font-bold text-gray-900 mb-1">
          {getValueDisplay(data.latest)}
        </div>
        {data.average && (
          <div className="text-sm text-gray-600">
            Avg (7d): {Math.round(data.average)}
          </div>
        )}
        <div className="text-xs text-gray-500 mt-2">
          {new Date(data.latest_timestamp).toLocaleString()}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <FiRefreshCw className="animate-spin text-4xl text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <FiArrowLeft />
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <FiUser className="text-blue-600" />
                User Health Dashboard
              </h1>
              <p className="text-gray-600 mt-1">User ID: {userId}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('devices')}
              className={`px-6 py-3 font-medium ${
                activeTab === 'devices'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FiWatch className="inline mr-2" />
              Devices ({wearables.length})
            </button>
            <button
              onClick={() => setActiveTab('health')}
              className={`px-6 py-3 font-medium ${
                activeTab === 'health'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FiHeart className="inline mr-2" />
              Health Summary
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'devices' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wearables.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-gray-500">
                No wearable devices assigned
              </div>
            ) : (
              wearables.map((wearable) => (
                <div key={wearable.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-4xl">{getTypeIcon(wearable.type)}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{wearable.device_name}</h3>
                      <p className="text-sm text-gray-500">{wearable.model}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        wearable.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {wearable.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Battery</span>
                      <div className="flex items-center gap-2">
                        <FiBattery className={
                          wearable.battery_level >= 50 ? 'text-green-600' :
                          wearable.battery_level >= 20 ? 'text-yellow-600' : 'text-red-600'
                        } />
                        <span className="text-sm font-medium">
                          {wearable.battery_level !== null ? `${wearable.battery_level}%` : 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Connection</span>
                      <div className="flex items-center gap-2">
                        <FiWifi className={wearable.is_online ? 'text-green-600' : 'text-gray-400'} />
                        <span className="text-sm font-medium">
                          {wearable.is_online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>

                    {wearable.last_sync && (
                      <div className="text-xs text-gray-500 pt-2 border-t">
                        Last sync: {new Date(wearable.last_sync).toLocaleString()}
                      </div>
                    )}

                    {wearable.subscription_type && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-gray-600">Subscription</span>
                        <span className="text-xs font-medium text-blue-600 uppercase">
                          {wearable.subscription_type}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'health' && healthSummary && (
          <div>
            {/* Abnormal Readings Alert */}
            {healthSummary.abnormal_readings_count > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-center gap-3">
                <FiAlertCircle className="text-yellow-600 text-2xl" />
                <div>
                  <h3 className="font-semibold text-yellow-900">Abnormal Readings Detected</h3>
                  <p className="text-sm text-yellow-800">
                    {healthSummary.abnormal_readings_count} abnormal readings in the last {healthSummary.period_days} days
                  </p>
                </div>
              </div>
            )}

            {/* Health Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(healthSummary.summary).map(([key, data]) => 
                renderHealthMetric(key, data)
              )}
            </div>

            {/* Recent Abnormal Readings */}
            {healthSummary.abnormal_readings && healthSummary.abnormal_readings.length > 0 && (
              <div className="mt-6 bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <h3 className="font-semibold text-gray-900">Recent Abnormal Readings</h3>
                </div>
                <div className="divide-y">
                  {healthSummary.abnormal_readings.map((reading, index) => (
                    <div key={index} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 capitalize">
                          {reading.reading_type.replace('_', ' ')}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(reading.recorded_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-red-600">
                          {JSON.stringify(reading.value)}
                        </p>
                        {reading.alert_severity && (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            reading.alert_severity === 'critical' ? 'bg-red-100 text-red-800' :
                            reading.alert_severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {reading.alert_severity}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserWearables;
