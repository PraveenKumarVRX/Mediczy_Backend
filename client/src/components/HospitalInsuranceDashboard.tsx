import React from 'react';
import '../styles/HospitalInsuranceDashboard.css';
import { BRAND } from '../config/brand';

const HospitalInsuranceDashboard: React.FC = () => {
  return (
    <div className="ihx-container">
      {/* Header */}
      <div className="ihx-header">
        <div className="ihx-logo">
          <img src={BRAND.logo} alt={BRAND.name} />
          <span>{BRAND.name}</span>
        </div>
        
        <div className="ihx-search">
          <input
            type="text"
            className="search-input"
            placeholder="Search claims, patients, or providers..."
          />
        </div>
        
        <div className="ihx-header-actions">
          <button className="notification-btn">
            🔔
            <span className="notification-badge">3</span>
          </button>
          <div className="user-menu">
            <span>Hospital Admin</span>
            <span className="dropdown-icon">▼</span>
          </div>
        </div>
      </div>
      
      {/* Main Layout */}
      <div className="ihx-main">
        {/* Sidebar */}
        <div className="ihx-sidebar">
          <nav className="ihx-nav">
            <div className="nav-item-group">
              <button className="nav-item active">
                <span className="nav-icon">📊</span>
                <span className="nav-label">Dashboard</span>
              </button>
              <button className="nav-item">
                <span className="nav-icon">📋</span>
                <span className="nav-label">Claims</span>
              </button>
              <button className="nav-item">
                <span className="nav-icon">✅</span>
                <span className="nav-label">Pre-Authorization</span>
              </button>
              <button className="nav-item">
                <span className="nav-icon">📄</span>
                <span className="nav-label">Documents</span>
              </button>
              <button className="nav-item">
                <span className="nav-icon">💰</span>
                <span className="nav-label">Finance</span>
              </button>
              <button className="nav-item">
                <span className="nav-icon">📈</span>
                <span className="nav-label">Reports</span>
              </button>
              <button className="nav-item">
                <span className="nav-icon">⚙️</span>
                <span className="nav-label">Settings</span>
              </button>
            </div>
          </nav>
        </div>
        
        {/* Content Area */}
        <div className="ihx-content">
          <div className="ihx-screen">
            <div className="screen-header">
              <h1>Insurance Dashboard</h1>
              <button className="btn-primary">+ Create New Claim</button>
            </div>
            
            {/* Metrics Grid */}
            <div className="metrics-grid">
              <div className="metric-card metric-primary">
                <div className="metric-label">Total Claims</div>
                <div className="metric-value">1,234</div>
              </div>
              <div className="metric-card metric-warning">
                <div className="metric-label">Pending Claims</div>
                <div className="metric-value">45</div>
              </div>
              <div className="metric-card metric-success">
                <div className="metric-label">Approved Amount</div>
                <div className="metric-value">₹12.5L</div>
              </div>
              <div className="metric-card metric-primary">
                <div className="metric-label">Approval Rate</div>
                <div className="metric-value">87%</div>
              </div>
            </div>
            
            {/* Recent Claims Table */}
            <div className="table-section">
              <div className="table-header">
                <h2>Recent Claims</h2>
                <button className="btn-secondary">View All</button>
              </div>
              
              <table className="ihx-table">
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Patient</th>
                    <th>Provider</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>CLM-2024-001</td>
                    <td>John Doe</td>
                    <td>ICICI Lombard</td>
                    <td>₹25,000</td>
                    <td><span className="status-badge status-approved">Approved</span></td>
                    <td>Jan 30, 2026</td>
                  </tr>
                  <tr>
                    <td>CLM-2024-002</td>
                    <td>Jane Smith</td>
                    <td>Star Health</td>
                    <td>₹18,500</td>
                    <td><span className="status-badge status-pending">Pending</span></td>
                    <td>Jan 29, 2026</td>
                  </tr>
                  <tr>
                    <td>CLM-2024-003</td>
                    <td>Mike Johnson</td>
                    <td>HDFC ERGO</td>
                    <td>₹32,000</td>
                    <td><span className="status-badge status-query">Query</span></td>
                    <td>Jan 28, 2026</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HospitalInsuranceDashboard;
