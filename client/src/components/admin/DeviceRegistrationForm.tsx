import React, { useState } from 'react';
import axios from 'axios';
import { X, Save, AlertCircle } from 'lucide-react';

interface DeviceRegistrationFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

const DeviceRegistrationForm: React.FC<DeviceRegistrationFormProps> = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    device_id: '',
    device_name: '',
    sim_number: '',
    phone_number: '',
    imei: '',
    model: 'Tab10',
    subscription_plan: 'basic',
    device_cost: 15000,
    monthly_software_fee: 1500,
    amc_annual_fee: 3000
  });

  const deviceModels = [
    { value: 'Tab10', label: 'Mediczy Tab 10' },
    { value: 'Tab12', label: 'Mediczy Tab 12' },
    { value: 'TabPro', label: 'Mediczy Tab Pro 10' },
    { value: 'TabPro12', label: 'Mediczy Tab Pro 12' }
  ];

  const subscriptionPlans = [
    { 
      value: 'basic', 
      label: 'Basic', 
      device_cost: 15000, 
      monthly_fee: 1500, 
      amc_fee: 3000,
      features: 'Patient management, Appointments, Prescriptions'
    },
    { 
      value: 'standard', 
      label: 'Standard', 
      device_cost: 18000, 
      monthly_fee: 3500, 
      amc_fee: 4000,
      features: 'Basic + Billing, Reports, Inventory'
    },
    { 
      value: 'premium', 
      label: 'Premium', 
      device_cost: 25000, 
      monthly_fee: 5500, 
      amc_fee: 6000,
      features: 'Standard + Analytics, AI Assistant, Telemedicine'
    },
    { 
      value: 'enterprise', 
      label: 'Enterprise', 
      device_cost: 35000, 
      monthly_fee: 8000, 
      amc_fee: 6000,
      features: 'Premium + Custom Integrations, Priority Support'
    }
  ];

  const handlePlanChange = (plan: string) => {
    const selectedPlan = subscriptionPlans.find(p => p.value === plan);
    if (selectedPlan) {
      setFormData({
        ...formData,
        subscription_plan: plan,
        device_cost: selectedPlan.device_cost,
        monthly_software_fee: selectedPlan.monthly_fee,
        amc_annual_fee: selectedPlan.amc_fee
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.post('/api/devices/register', formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to register device');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const monthlyRevenue = formData.monthly_software_fee + (formData.amc_annual_fee / 12);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Register New Device</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-800">
              <AlertCircle />
              {error}
            </div>
          )}

          {/* Device Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Device Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.device_id}
                  onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                  placeholder="MDZ-TAB-001"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.device_name}
                  onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                  placeholder="Mediczy Tab Pro 10"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {deviceModels.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IMEI <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.imei}
                  onChange={(e) => setFormData({ ...formData, imei: e.target.value })}
                  placeholder="123456789012345"
                  maxLength={15}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SIM Number
                </label>
                <input
                  type="text"
                  value={formData.sim_number}
                  onChange={(e) => setFormData({ ...formData, sim_number: e.target.value })}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="+919876543210"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Subscription Plan */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription Plan</h3>
            <div className="space-y-3">
              {subscriptionPlans.map(plan => (
                <div
                  key={plan.value}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                    formData.subscription_plan === plan.value
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                  onClick={() => handlePlanChange(plan.value)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="subscription_plan"
                          value={plan.value}
                          checked={formData.subscription_plan === plan.value}
                          onChange={() => handlePlanChange(plan.value)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="font-semibold text-gray-900">{plan.label}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 ml-6">{plan.features}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Device Cost</div>
                      <div className="font-semibold text-gray-900">{formatCurrency(plan.device_cost)}</div>
                      <div className="text-sm text-gray-600 mt-2">Monthly Fee</div>
                      <div className="font-semibold text-blue-600">{formatCurrency(plan.monthly_fee)}</div>
                      <div className="text-sm text-gray-600 mt-2">AMC (Annual)</div>
                      <div className="font-semibold text-gray-900">{formatCurrency(plan.amc_fee)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Pricing Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Device Cost (One-time)</span>
                <span className="font-semibold">{formatCurrency(formData.device_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Software Subscription (Monthly)</span>
                <span className="font-semibold">{formatCurrency(formData.monthly_software_fee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">AMC (Annual)</span>
                <span className="font-semibold">{formatCurrency(formData.amc_annual_fee)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-gray-900 font-semibold">Monthly Recurring Revenue</span>
                <span className="font-bold text-blue-600">{formatCurrency(monthlyRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-900 font-semibold">Annual Recurring Revenue</span>
                <span className="font-bold text-green-600">{formatCurrency(monthlyRevenue * 12)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save />
              {loading ? 'Registering...' : 'Register Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeviceRegistrationForm;
