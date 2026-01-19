/**
 * My Reports Component - Frontend Fix
 * File: src/pages/MyReports.jsx or src/components/MyReports.jsx
 * 
 * This component handles the patient's medical reports
 * with proper tab switching and data fetching
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; // Adjust path as needed
import './MyReports.css'; // Optional: for styling

const MyReports = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('total');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filteredReports, setFilteredReports] = useState([]);

  const tabs = [
    { id: 'total', label: 'Total Reports', type: null },
    { id: 'lab', label: 'Lab Reports', type: 'lab' },
    { id: 'imaging', label: 'Imaging', type: 'imaging' },
    { id: 'prescription', label: 'Prescriptions', type: 'prescription' }
  ];

  // Fetch reports when component mounts or token changes
  useEffect(() => {
    if (token) {
      fetchAllReports();
    }
  }, [token]);

  // Filter reports when active tab changes
  useEffect(() => {
    filterReports();
  }, [activeTab, reports]);

  const fetchAllReports = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/reports', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch reports: ${response.statusText}`);
      }

      const data = await response.json();
      const reportsList = data.data || [];
      setReports(reportsList);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError(err.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const filterReports = () => {
    const activeTabData = tabs.find(t => t.id === activeTab);
    
    if (!activeTabData.type) {
      // Total reports - show all
      setFilteredReports(reports);
    } else {
      // Filter by type
      setFilteredReports(reports.filter(report => report.reportType === activeTabData.type));
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    // Optional: Scroll to top when changing tabs
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUploadClick = () => {
    // Navigate to upload page or open upload modal
    window.location.href = '/upload-report';
  };

  const downloadReport = async (report) => {
    try {
      // Create a temporary link and click it to download
      const link = document.createElement('a');
      link.href = report.fileUrl;
      link.download = report.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading report:', err);
      alert('Failed to download report');
    }
  };

  const deleteReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this report?')) {
      return;
    }

    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete report');
      }

      // Remove from local state
      setReports(reports.filter(r => r.id !== reportId));
      alert('Report deleted successfully');
    } catch (err) {
      console.error('Error deleting report:', err);
      alert('Failed to delete report');
    }
  };

  return (
    <div className="my-reports-container">
      <div className="reports-header">
        <h2>My Reports</h2>
        <button 
          className="btn-upload" 
          onClick={handleUploadClick}
        >
          + Upload New Report
        </button>
      </div>

      {/* Tabs */}
      <div className="reports-tabs">
        <div className="tab-buttons">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <p>Loading reports...</p>
          <div className="spinner"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="error-state">
          <p>❌ Error: {error}</p>
          <button onClick={fetchAllReports} className="btn-retry">
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredReports.length === 0 && (
        <div className="empty-state">
          <p>📄 No {activeTab !== 'total' ? activeTab : ''} reports found</p>
          <p className="empty-hint">Upload a report to get started</p>
          <button 
            className="btn-upload-primary" 
            onClick={handleUploadClick}
          >
            Upload Your First Report
          </button>
        </div>
      )}

      {/* Reports List */}
      {!loading && !error && filteredReports.length > 0 && (
        <div className="reports-list">
          <div className="reports-count">
            Showing {filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''}
          </div>
          
          <ul className="report-items">
            {filteredReports.map(report => (
              <li key={report.id} className="report-item">
                <div className="report-info">
                  <div className="report-icon">
                    {report.reportType === 'lab' && '🧪'}
                    {report.reportType === 'imaging' && '📸'}
                    {report.reportType === 'prescription' && '💊'}
                    {report.reportType === 'general' && '📄'}
                  </div>
                  
                  <div className="report-details">
                    <h4 className="report-name">{report.fileName}</h4>
                    <p className="report-type">{report.reportType.toUpperCase()}</p>
                    {report.description && (
                      <p className="report-description">{report.description}</p>
                    )}
                    <p className="report-date">
                      Uploaded: {new Date(report.uploadedAt).toLocaleDateString()}
                    </p>
                    <p className="report-size">
                      Size: {(report.fileSize / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                
                <div className="report-actions">
                  <button
                    className="btn-action btn-download"
                    onClick={() => downloadReport(report)}
                    title="Download report"
                  >
                    ⬇️ Download
                  </button>
                  <button
                    className="btn-action btn-view"
                    onClick={() => window.open(report.fileUrl)}
                    title="View report"
                  >
                    👁️ View
                  </button>
                  <button
                    className="btn-action btn-delete"
                    onClick={() => deleteReport(report.id)}
                    title="Delete report"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MyReports;

/**
 * CSS Styling (MyReports.css)
 * 
 * .my-reports-container {
 *   padding: 20px;
 *   max-width: 1200px;
 *   margin: 0 auto;
 * }
 * 
 * .reports-header {
 *   display: flex;
 *   justify-content: space-between;
 *   align-items: center;
 *   margin-bottom: 30px;
 * }
 * 
 * .reports-header h2 {
 *   font-size: 24px;
 *   margin: 0;
 * }
 * 
 * .btn-upload {
 *   background: #007bff;
 *   color: white;
 *   border: none;
 *   padding: 10px 20px;
 *   border-radius: 5px;
 *   cursor: pointer;
 *   font-weight: 600;
 * }
 * 
 * .btn-upload:hover {
 *   background: #0056b3;
 * }
 * 
 * .reports-tabs {
 *   margin-bottom: 30px;
 *   border-bottom: 2px solid #e0e0e0;
 * }
 * 
 * .tab-buttons {
 *   display: flex;
 *   gap: 10px;
 * }
 * 
 * .tab-btn {
 *   padding: 12px 20px;
 *   border: none;
 *   background: none;
 *   cursor: pointer;
 *   font-size: 16px;
 *   color: #666;
 *   border-bottom: 3px solid transparent;
 *   transition: all 0.3s ease;
 * }
 * 
 * .tab-btn.active {
 *   color: #007bff;
 *   border-bottom-color: #007bff;
 * }
 * 
 * .tab-btn:hover {
 *   color: #0056b3;
 * }
 * 
 * .loading-state, .empty-state {
 *   text-align: center;
 *   padding: 60px 20px;
 * }
 * 
 * .spinner {
 *   width: 40px;
 *   height: 40px;
 *   border: 4px solid #f3f3f3;
 *   border-top: 4px solid #007bff;
 *   border-radius: 50%;
 *   animation: spin 1s linear infinite;
 *   margin: 20px auto;
 * }
 * 
 * @keyframes spin {
 *   0% { transform: rotate(0deg); }
 *   100% { transform: rotate(360deg); }
 * }
 * 
 * .error-state {
 *   background: #f8d7da;
 *   color: #721c24;
 *   padding: 20px;
 *   border-radius: 5px;
 *   margin: 20px 0;
 * }
 * 
 * .btn-retry {
 *   margin-top: 10px;
 *   background: #721c24;
 *   color: white;
 *   padding: 8px 16px;
 *   border: none;
 *   border-radius: 4px;
 *   cursor: pointer;
 * }
 * 
 * .reports-list {
 *   background: white;
 *   border-radius: 8px;
 * }
 * 
 * .reports-count {
 *   padding: 20px;
 *   color: #666;
 *   font-weight: 500;
 *   border-bottom: 1px solid #e0e0e0;
 * }
 * 
 * .report-items {
 *   list-style: none;
 *   padding: 0;
 *   margin: 0;
 * }
 * 
 * .report-item {
 *   display: flex;
 *   justify-content: space-between;
 *   align-items: center;
 *   padding: 20px;
 *   border-bottom: 1px solid #e0e0e0;
 *   transition: background 0.2s ease;
 * }
 * 
 * .report-item:hover {
 *   background: #f9f9f9;
 * }
 * 
 * .report-info {
 *   display: flex;
 *   gap: 20px;
 *   flex: 1;
 * }
 * 
 * .report-icon {
 *   font-size: 32px;
 *   min-width: 50px;
 *   text-align: center;
 * }
 * 
 * .report-details h4 {
 *   margin: 0 0 5px 0;
 *   color: #333;
 *   font-weight: 600;
 * }
 * 
 * .report-type {
 *   display: inline-block;
 *   background: #e7f3ff;
 *   color: #0066cc;
 *   padding: 3px 8px;
 *   border-radius: 3px;
 *   font-size: 12px;
 *   font-weight: 600;
 *   margin: 5px 0;
 * }
 * 
 * .report-description {
 *   color: #666;
 *   font-size: 14px;
 *   margin: 5px 0;
 * }
 * 
 * .report-date, .report-size {
 *   color: #999;
 *   font-size: 12px;
 *   margin: 3px 0;
 * }
 * 
 * .report-actions {
 *   display: flex;
 *   gap: 10px;
 * }
 * 
 * .btn-action {
 *   padding: 8px 12px;
 *   border: none;
 *   border-radius: 4px;
 *   cursor: pointer;
 *   font-size: 14px;
 *   font-weight: 500;
 * }
 * 
 * .btn-download {
 *   background: #e7f3ff;
 *   color: #0066cc;
 * }
 * 
 * .btn-download:hover {
 *   background: #b3d9ff;
 * }
 * 
 * .btn-view {
 *   background: #e0f5e0;
 *   color: #006600;
 * }
 * 
 * .btn-view:hover {
 *   background: #b3e5b3;
 * }
 * 
 * .btn-delete {
 *   background: #ffe0e0;
 *   color: #cc0000;
 * }
 * 
 * .btn-delete:hover {
 *   background: #ffb3b3;
 * }
 * 
 * @media (max-width: 768px) {
 *   .report-item {
 *     flex-direction: column;
 *     align-items: flex-start;
 *   }
 * 
 *   .report-actions {
 *     width: 100%;
 *     margin-top: 15px;
 *     flex-wrap: wrap;
 *   }
 * 
 *   .reports-header {
 *     flex-direction: column;
 *     gap: 15px;
 *   }
 * }
 */
