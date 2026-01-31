/**
 * Hospital Insurance Claims Dashboard - IHX Provider Portal Style
 * Main page wrapper for the comprehensive insurance claims management system
 */

import HospitalInsuranceDashboard from "@/components/HospitalInsuranceDashboard";
import "@/styles/HospitalInsuranceDashboard.css";

const HospitalInsuranceClaimsDashboard = () => {
  return (
    <div className="hospital-insurance-page">
      <div className="page-header">
        <h1>Insurance Claims Management</h1>
        <p className="page-subtitle">
          Comprehensive claims processing, pre-authorization, and revenue tracking
        </p>
      </div>
      
      <HospitalInsuranceDashboard />
    </div>
  );
};

export default HospitalInsuranceClaimsDashboard;
