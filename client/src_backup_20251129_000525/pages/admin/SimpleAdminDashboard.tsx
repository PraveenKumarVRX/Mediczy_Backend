import React, { useState, useEffect } from 'react';

const SimpleAdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const token = localStorage.getItem('adminToken');
  const adminData = JSON.parse(localStorage.getItem('adminData') || '{}');

  const fetchDashboardStats = async () => {
    if (!token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      const response = await fetch(`${apiBaseUrl}/admin/dashboard/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      setError(`Unable to load dashboard data: ${err.message}`);
      console.error('Dashboard error:', err);
      // Set default stats if API fails
      setStats({
        users: 0,
        doctors: 0,
        labs: 0,
        pharmacies: 0,
        corporates: 0,
        activeCorporates: 0
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboardStats();
    }
  }, [token]);

  if (!token) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>No Admin Token Found</h1>
        <p>You need to login first</p>
        <button onClick={() => window.location.href = '/admin/login'}>
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#1e40af' }}>Mediqzy Admin Dashboard</h1>
          <p style={{ margin: '5px 0 0 0', color: '#64748b' }}>Welcome back, {adminData.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={() => window.location.href = '/admin'}
            style={{ 
              background: '#3b82f6', 
              color: 'white', 
              padding: '8px 16px', 
              border: 'none', 
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Main Dashboard
          </button>
          <button 
            onClick={() => {
              localStorage.removeItem('adminToken');
              localStorage.removeItem('adminData');
              window.location.href = '/admin/login';
            }}
            style={{ 
              background: '#dc2626', 
              color: 'white', 
              padding: '10px 20px', 
              border: 'none', 
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Authentication Status */}
      <div style={{ background: '#f8fafc', padding: '20px', margin: '20px 0', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#374151' }}>🔐 Authentication Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <p><strong>Token:</strong> <span style={{ color: '#059669' }}>Present ✅</span></p>
          <p><strong>Token Length:</strong> {token?.length || 0}</p>
          <p><strong>Admin Email:</strong> {adminData.email || 'Not found'}</p>
          <p><strong>Admin Role:</strong> <span style={{ color: '#7c3aed' }}>{adminData.role || 'Not found'}</span></p>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#374151' }}>📊 Dashboard Statistics</h3>
          <button 
            onClick={fetchDashboardStats}
            disabled={loading}
            style={{ 
              background: loading ? '#9ca3af' : '#3b82f6', 
              color: 'white', 
              padding: '8px 16px', 
              border: 'none', 
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh Stats'}
          </button>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            Loading statistics...
          </div>
        ) : error ? (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '15px', borderRadius: '6px', border: '1px solid #fecaca' }}>
            {error}
          </div>
        ) : stats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            <div style={{ background: '#eff6ff', padding: '15px', borderRadius: '6px', border: '1px solid #dbeafe' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1d4ed8' }}>{stats.users}</div>
              <div style={{ color: '#3730a3', fontSize: '14px' }}>Users</div>
            </div>
            <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#15803d' }}>{stats.doctors}</div>
              <div style={{ color: '#166534', fontSize: '14px' }}>Doctors</div>
            </div>
            <div style={{ background: '#fdf4ff', padding: '15px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#9333ea' }}>{stats.labs}</div>
              <div style={{ color: '#7c3aed', fontSize: '14px' }}>Labs</div>
            </div>
            <div style={{ background: '#fff7ed', padding: '15px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ea580c' }}>{stats.pharmacies}</div>
              <div style={{ color: '#c2410c', fontSize: '14px' }}>Pharmacies</div>
            </div>
            <div style={{ background: '#f0f9ff', padding: '15px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0369a1' }}>{stats.corporates}</div>
              <div style={{ color: '#075985', fontSize: '14px' }}>Corporates</div>
            </div>
            <div style={{ background: '#ecfdf5', padding: '15px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>{stats.activeCorporates}</div>
              <div style={{ color: '#047857', fontSize: '14px' }}>Active Corporates</div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            Click "Refresh Stats" to load data
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#374151' }}>⚡ Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <button style={{ padding: '15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontWeight: '500', color: '#374151' }}>👥 Manage Users</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>View and manage user accounts</div>
          </button>
          <button style={{ padding: '15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontWeight: '500', color: '#374151' }}>🩺 Manage Doctors</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>View and manage doctor profiles</div>
          </button>
          <button style={{ padding: '15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontWeight: '500', color: '#374151' }}>📊 Reports</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Generate platform reports</div>
          </button>
          <button style={{ padding: '15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontWeight: '500', color: '#374151' }}>⚙️ Settings</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Platform configuration</div>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
        <p>Mediqzy Admin Panel v1.0 • Production Ready • Secure JWT Authentication</p>
      </div>
    </div>
  );
};

export default SimpleAdminDashboard;