// Demo data for admin panel when using demo admin token

export const isDemoAdminToken = (token: string | null): boolean => {
  return token?.startsWith('admin-demo-token') || false;
};

export const demoInsuranceProviders = [
  {
    id: 1,
    name: "ICICI Lombard",
    code: "ICICI01",
    contactEmail: "support@icicilombard.com",
    contactPhone: "+91-1800-123-456",
    website: "https://www.icicilombard.com",
    address: "Mumbai, Maharashtra",
    networkType: "TPA",
    claimProcessDays: 15,
    isActive: true
  },
  {
    id: 2,
    name: "Star Health",
    code: "STAR01", 
    contactEmail: "care@starhealth.in",
    contactPhone: "+91-1800-425-2255",
    website: "https://www.starhealth.in",
    address: "Chennai, Tamil Nadu",
    networkType: "Direct",
    claimProcessDays: 10,
    isActive: true
  }
];

export const demoInsurancePolicies = [
  {
    id: 1,
    providerId: 1,
    policyName: "Family Health Plus",
    policyNumber: "ICICI-FHP-001",
    policyType: "Family",
    coverageAmount: 500000,
    premiumAmount: 15000,
    coPaymentPercent: 10,
    waitingPeriod: 30,
    roomRentLimit: 5000,
    description: "Comprehensive family health coverage",
    validFrom: "2024-01-01",
    validTo: "2024-12-31",
    isActive: true,
    provider: demoInsuranceProviders[0]
  },
  {
    id: 2,
    providerId: 2,
    policyName: "Senior Citizen Care",
    policyNumber: "STAR-SCC-001", 
    policyType: "Senior",
    coverageAmount: 300000,
    premiumAmount: 12000,
    coPaymentPercent: 15,
    waitingPeriod: 60,
    roomRentLimit: 3000,
    description: "Specialized coverage for senior citizens",
    validFrom: "2024-01-01", 
    validTo: "2024-12-31",
    isActive: true,
    provider: demoInsuranceProviders[1]
  }
];

export const demoInsuranceEnrollments = [
  {
    id: 1,
    userId: 123,
    policyId: 1,
    enrollmentNumber: "ENR001",
    enrollmentDate: "2024-01-15",
    expiryDate: "2024-12-31",
    status: "Active",
    claimsUsed: 25000,
    claimsCount: 2,
    provider: demoInsuranceProviders[0],
    policy: demoInsurancePolicies[0]
  },
  {
    id: 2,
    userId: 456,
    policyId: 2,
    enrollmentNumber: "ENR002", 
    enrollmentDate: "2024-02-01",
    expiryDate: "2024-12-31",
    status: "Active",
    claimsUsed: 15000,
    claimsCount: 1,
    provider: demoInsuranceProviders[1],
    policy: demoInsurancePolicies[1]
  }
];

export const demoInsuranceClaims = [
  {
    id: 1,
    userInsuranceId: 1,
    claimNumber: "CLM001",
    claimAmount: 15000,
    approvedAmount: 13500,
    claimType: "Hospitalization",
    status: "Approved",
    treatmentDate: "2024-03-15",
    hospitalName: "Apollo Hospital",
    diagnosis: "Appendectomy",
    provider: demoInsuranceProviders[0],
    policy: demoInsurancePolicies[0]
  },
  {
    id: 2,
    userInsuranceId: 2,
    claimNumber: "CLM002",
    claimAmount: 8000,
    approvedAmount: 0,
    claimType: "Consultation", 
    status: "Under Review",
    treatmentDate: "2024-03-20",
    hospitalName: "Fortis Hospital",
    diagnosis: "Diabetes consultation",
    provider: demoInsuranceProviders[1],
    policy: demoInsurancePolicies[1]
  }
];

export const demoMembershipPlans = [
  {
    id: 1,
    name: "Basic Plan",
    description: "Entry-level healthcare coverage",
    durationDays: 30,
    priceINR: 999,
    isActive: true,
    benefitLimits: { pharmacyLimitINR: 500, homeCareLimitINR: 1000, ambulanceLimitINR: 2000 },
    teleConsultLimits: { allSpecialties: 5 },
    healthCheckPackage: "Basic Health Check",
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    name: "Premium Plan", 
    description: "Comprehensive healthcare with specialist access",
    durationDays: 90,
    priceINR: 2999,
    isActive: true,
    benefitLimits: { pharmacyLimitINR: 1500, homeCareLimitINR: 3000, ambulanceLimitINR: 5000 },
    teleConsultLimits: { Cardiology: 3, Dermatology: 5, "General Medicine": 10 },
    healthCheckPackage: "Premium Health Check",
    createdAt: new Date().toISOString()
  }
];