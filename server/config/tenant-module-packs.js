/**
 * Tenant module packs — modules attached by tenant type on create.
 * Each pack defines the portal prefix and default modules for that organization type.
 */

export const TENANT_TYPE_ALIASES = {
  diagnostic_center: 'diagnostic_centre',
  'diagnostic-centre': 'diagnostic_centre',
  'diagnostic-center': 'diagnostic_centre',
  diagnosticlab: 'lab',
  diagnostic_lab: 'lab',
  home_care: 'homecare',
  'home-care': 'homecare',
};

export const CORE_TENANT_TYPES = [
  'hospital',
  'clinic',
  'lab',
  'diagnostic_centre',
  'corporate',
  'homecare',
  'ambulance',
  'pharmacy',
];

/** All supported types including insurance/gov packs. */
export const ALL_TENANT_TYPES = [
  ...CORE_TENANT_TYPES,
  'tpa',
  'psu',
  'insurer',
  'broker',
  'ngo',
];

function mod(key, label, path, extra = {}) {
  return {
    key,
    label,
    path,
    enabled: true,
    ...extra,
  };
}

/**
 * Module packs keyed by canonical tenant.type
 */
export const TENANT_MODULE_PACKS = {
  hospital: {
    id: 'hospital',
    label: 'Hospital',
    description: 'Full HMIS / hospital operating system',
    icon: '🏥',
    minPlan: 'professional',
    routePrefix: '/hospital',
    apiPrefix: '/api/hospital',
    loginPath: '/hospital/login',
    accessPath: '/hospital/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/hospital/dashboard'),
      mod('opd', 'OPD', '/hospital/opd'),
      mod('ipd', 'IPD', '/hospital/ipd'),
      mod('ehr', 'EHR / EMR', '/hospital/ehr'),
      mod('appointments', 'Appointments', '/hospital/appointments'),
      mod('patients', 'Patients', '/hospital/patients'),
      mod('billing', 'Billing', '/hospital/billing'),
      mod('lab_orders', 'Lab Orders', '/hospital/lab'),
      mod('pharmacy', 'Pharmacy', '/hospital/pharmacy'),
      mod('staff', 'Staff', '/hospital/staff'),
      mod('insurance', 'Insurance', '/hospital/insurance'),
      mod('os', 'Hospital OS', '/hospital/os'),
      mod('settings', 'Settings', '/hospital/settings'),
    ],
    optionalModules: [
      mod('ambulance', 'Ambulance Desk', '/hospital/ambulance', { enabled: false }),
      mod('homecare', 'Homecare Desk', '/hospital/homecare', { enabled: false }),
    ],
  },

  clinic: {
    id: 'clinic',
    label: 'Clinic',
    description: 'Outpatient clinic / dental / specialty practice',
    icon: '🏨',
    minPlan: 'free',
    routePrefix: '/clinic',
    apiPrefix: '/api/clinic',
    loginPath: '/login', // tenant host; app host uses /clinic/login
    accessPath: '/clinic/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/clinic/dashboard'),
      mod('appointments', 'Appointments', '/clinic/appointments'),
      mod('patients', 'Patients', '/clinic/patients'),
      mod('queue', 'Queue', '/clinic/queue'),
      mod('doctors', 'Doctors', '/clinic/doctors'),
      mod('consultations', 'Consultations', '/clinic/consultations'),
      mod('prescriptions', 'Prescriptions', '/clinic/prescriptions'),
      mod('pharmacy', 'Pharmacy', '/clinic/pharmacy'),
      mod('lab_tests', 'Lab Tests', '/clinic/lab-tests'),
      mod('billing', 'Billing', '/clinic/billing'),
      mod('payments', 'Payments', '/clinic/payments'),
      mod('staff', 'Staff', '/clinic/staff'),
      mod('reports', 'Reports', '/clinic/reports'),
      mod('settings', 'Settings', '/clinic/settings'),
    ],
    optionalModules: [],
  },

  lab: {
    id: 'lab',
    label: 'Lab',
    description: 'Pathology / clinical laboratory',
    icon: '🔬',
    minPlan: 'free',
    routePrefix: '/lab',
    apiPrefix: '/api/lab',
    loginPath: '/lab/login',
    accessPath: '/lab/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/lab/dashboard'),
      mod('test_catalog', 'Test Catalog', '/lab/test-catalog'),
      mod('orders', 'Orders', '/lab/orders'),
      mod('sample_collection', 'Sample Collection', '/lab/sample-collection'),
      mod('results', 'Results', '/lab/results'),
      mod('billing', 'Billing', '/lab/billing'),
      mod('settings', 'Settings', '/lab/settings'),
    ],
    optionalModules: [
      mod('home_collection', 'Home Collection', '/lab/home-collection', { enabled: false }),
    ],
  },

  diagnostic_centre: {
    id: 'diagnostic_centre',
    label: 'Diagnostic Centre',
    description: 'Imaging + diagnostics (RIS / radiology / multi-modal diagnostics)',
    icon: '🩻',
    minPlan: 'free',
    routePrefix: '/lab',
    apiPrefix: '/api/lab',
    loginPath: '/lab/login',
    accessPath: '/lab/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/lab/dashboard'),
      mod('test_catalog', 'Test Catalog', '/lab/test-catalog'),
      mod('orders', 'Orders', '/lab/orders'),
      mod('ris', 'RIS / Imaging', '/lab/ris'),
      mod('imaging', 'Imaging', '/lab/imaging'),
      mod('sonology', 'Sonology', '/lab/sonology'),
      mod('sample_collection', 'Sample Collection', '/lab/sample-collection'),
      mod('results', 'Results', '/lab/results'),
      mod('billing', 'Billing', '/lab/billing'),
      mod('settings', 'Settings', '/lab/settings'),
    ],
    optionalModules: [
      mod('home_collection', 'Home Collection', '/lab/home-collection', { enabled: false }),
    ],
  },

  corporate: {
    id: 'corporate',
    label: 'Corporate',
    description: 'Employer / corporate wellness & benefits',
    icon: '🏢',
    minPlan: 'professional',
    routePrefix: '/corporate',
    apiPrefix: '/api/corporate',
    loginPath: '/corporate/login',
    accessPath: '/corporate/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/corporate/dashboard'),
      mod('employees', 'Employees', '/corporate/employees'),
      mod('benefits', 'Benefits', '/corporate/benefits'),
      mod('claims', 'Claims', '/corporate/claims'),
      mod('wellness', 'Wellness', '/corporate/wellness'),
      mod('reports', 'Reports', '/corporate/reports'),
      mod('settings', 'Settings', '/corporate/settings'),
    ],
    optionalModules: [],
  },

  homecare: {
    id: 'homecare',
    label: 'Homecare',
    description: 'Home healthcare services',
    icon: '🏠',
    minPlan: 'professional',
    routePrefix: '/homecare',
    apiPrefix: '/api/homecare',
    loginPath: '/homecare/login',
    accessPath: '/homecare/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/homecare/dashboard'),
      mod('patients', 'Patients', '/homecare/patients'),
      mod('care_plans', 'Care Plans', '/homecare/care-plans'),
      mod('appointments', 'Visits', '/homecare/appointments'),
      mod('staff', 'Care Staff', '/homecare/staff'),
      mod('services', 'Services', '/homecare/services'),
      mod('billing', 'Billing', '/homecare/billing'),
      mod('settings', 'Settings', '/homecare/settings'),
    ],
    optionalModules: [],
  },

  ambulance: {
    id: 'ambulance',
    label: 'Ambulance',
    description: 'EMS dispatch and fleet',
    icon: '🚑',
    minPlan: 'professional',
    routePrefix: '/ambulance',
    apiPrefix: '/api/ambulance',
    loginPath: '/ambulance/login',
    accessPath: '/ambulance/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/ambulance/dashboard'),
      mod('dispatch', 'Dispatch', '/ambulance/dispatch'),
      mod('active_trips', 'Active Trips', '/ambulance/trips'),
      mod('tracking', 'Live Tracking', '/ambulance/tracking'),
      mod('fleet', 'Fleet', '/ambulance/fleet'),
      mod('staff', 'Crew', '/ambulance/staff'),
      mod('billing', 'Billing', '/ambulance/billing'),
      mod('settings', 'Settings', '/ambulance/settings'),
    ],
    optionalModules: [],
  },

  pharmacy: {
    id: 'pharmacy',
    label: 'Pharmacy',
    description: 'Retail / hospital pharmacy POS & inventory',
    icon: '💊',
    minPlan: 'free',
    routePrefix: '/pharmacy',
    apiPrefix: '/api/pharmacy',
    loginPath: '/pharmacy/login',
    accessPath: '/pharmacy/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/pharmacy/dashboard'),
      mod('pos', 'POS', '/pharmacy/pos'),
      mod('inventory', 'Inventory', '/pharmacy/inventory'),
      mod('prescriptions', 'Prescriptions', '/pharmacy/prescriptions'),
      mod('batches', 'Batches', '/pharmacy/batches'),
      mod('expiry', 'Expiry', '/pharmacy/expiry'),
      mod('billing', 'Billing', '/pharmacy/billing'),
      mod('settings', 'Settings', '/pharmacy/settings'),
    ],
    optionalModules: [],
  },

  tpa: {
    id: 'tpa',
    label: 'TPA',
    description: 'Third Party Administrator',
    icon: '📋',
    minPlan: 'enterprise',
    routePrefix: '/tpa',
    apiPrefix: '/api/tpa',
    loginPath: '/tpa/login',
    accessPath: '/tpa/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/tpa/dashboard'),
      mod('claims', 'Claims', '/tpa/claims'),
      mod('preauth', 'Pre-auth', '/tpa/preauth'),
      mod('providers', 'Providers', '/tpa/providers'),
      mod('settings', 'Settings', '/tpa/settings'),
    ],
    optionalModules: [],
  },

  insurer: {
    id: 'insurer',
    label: 'Insurer',
    description: 'Insurance company portal',
    icon: '🛡️',
    minPlan: 'enterprise',
    routePrefix: '/insurer',
    apiPrefix: '/api/insurer',
    loginPath: '/insurer/login',
    accessPath: '/insurer/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/insurer/dashboard'),
      mod('policies', 'Policies', '/insurer/policies'),
      mod('claims', 'Claims', '/insurer/claims'),
      mod('settings', 'Settings', '/insurer/settings'),
    ],
    optionalModules: [],
  },

  broker: {
    id: 'broker',
    label: 'Broker',
    description: 'Insurance broker / aggregator',
    icon: '🤝',
    minPlan: 'professional',
    routePrefix: '/intermediary',
    apiPrefix: '/api/broker',
    loginPath: '/intermediary/login',
    accessPath: '/intermediary/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/intermediary/dashboard'),
      mod('clients', 'Clients', '/intermediary/clients'),
      mod('quotes', 'Quotes', '/intermediary/quotes'),
      mod('settings', 'Settings', '/intermediary/settings'),
    ],
    optionalModules: [],
  },

  psu: {
    id: 'psu',
    label: 'PSU',
    description: 'Public Sector Undertaking',
    icon: '🏛️',
    minPlan: 'enterprise',
    routePrefix: '/psu',
    apiPrefix: '/api/psu',
    loginPath: '/psu/login',
    accessPath: '/psu/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/psu/dashboard'),
      mod('employees', 'Employees', '/psu/employees'),
      mod('benefits', 'Benefits', '/psu/benefits'),
      mod('settings', 'Settings', '/psu/settings'),
    ],
    optionalModules: [],
  },

  ngo: {
    id: 'ngo',
    label: 'NGO',
    description: 'Non-profit / NGO healthcare programs',
    icon: '❤️',
    minPlan: 'free',
    routePrefix: '/ngo',
    apiPrefix: '/api/ngo',
    loginPath: '/ngo/login',
    accessPath: '/ngo/dashboard',
    modules: [
      mod('dashboard', 'Dashboard', '/ngo/dashboard'),
      mod('programs', 'Programs', '/ngo/programs'),
      mod('beneficiaries', 'Beneficiaries', '/ngo/beneficiaries'),
      mod('settings', 'Settings', '/ngo/settings'),
    ],
    optionalModules: [],
  },
};

export function normalizeTenantType(type) {
  const raw = String(type || '').trim().toLowerCase().replace(/\s+/g, '_');
  return TENANT_TYPE_ALIASES[raw] || raw;
}

export function getTenantModulePack(type) {
  const canonical = normalizeTenantType(type);
  return TENANT_MODULE_PACKS[canonical] || null;
}

export function listTenantModulePacks({ coreOnly = false } = {}) {
  const keys = coreOnly ? CORE_TENANT_TYPES : Object.keys(TENANT_MODULE_PACKS);
  return keys
    .map((key) => TENANT_MODULE_PACKS[key])
    .filter(Boolean)
    .map((pack) => ({
      type: pack.id,
      ...pack,
      module_keys: pack.modules.map((m) => m.key),
      module_count: pack.modules.length,
    }));
}

/**
 * Build features/settings payloads to attach on tenant create.
 */
export function buildTenantModuleAttachment(type, planFeatures = {}) {
  const pack = getTenantModulePack(type);
  if (!pack) {
    return {
      features: { ...planFeatures },
      settings: {},
      metadata: {},
    };
  }

  const enabledModules = pack.modules.filter((m) => m.enabled !== false);
  const moduleKeys = enabledModules.map((m) => m.key);

  return {
    features: {
      ...planFeatures,
      pack_id: pack.id,
      modules: moduleKeys,
      // boolean convenience flags used by requireFeature middleware
      ...Object.fromEntries(moduleKeys.map((key) => [`module_${key}`, true])),
    },
    settings: {
      module_prefix: pack.routePrefix,
      api_prefix: pack.apiPrefix,
      login_path: pack.loginPath,
      access_path: pack.accessPath,
      module_pack_id: pack.id,
    },
    metadata: {
      module_pack: {
        id: pack.id,
        version: 1,
        route_prefix: pack.routePrefix,
        api_prefix: pack.apiPrefix,
        modules: enabledModules,
        optional_modules: pack.optionalModules || [],
        attached_at: new Date().toISOString(),
      },
    },
    pack,
  };
}

export function tenantHasModule(tenant, moduleKey) {
  const modules = tenant?.features?.modules;
  if (Array.isArray(modules)) return modules.includes(moduleKey);
  return Boolean(tenant?.features?.[`module_${moduleKey}`]);
}

export default {
  TENANT_MODULE_PACKS,
  CORE_TENANT_TYPES,
  ALL_TENANT_TYPES,
  normalizeTenantType,
  getTenantModulePack,
  listTenantModulePacks,
  buildTenantModuleAttachment,
  tenantHasModule,
};
