/**
 * Tenant module packs — modules attached by tenant type on create.
 *
 * Access model (personalised domain first):
 *   https://{subdomain}.mediqzy.com{loginPath}   ← primary (ajdental, hycare, …)
 *   https://app.mediqzy.com{appLoginPath}        ← platform fallback
 *
 * `routePrefix` organises SPA/API modules for that type under the tenant host.
 */

export const PLATFORM_BASE_DOMAIN = process.env.PLATFORM_BASE_DOMAIN || 'mediqzy.com';
export const PLATFORM_APP_HOST = process.env.PLATFORM_APP_HOST || `app.${PLATFORM_BASE_DOMAIN}`;

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
 *
 * loginPath / accessPath = paths on the tenant personalised host
 *   e.g. https://ajdental.mediqzy.com/login
 * appLoginPath = path on app.mediqzy.com when not using a subdomain
 */
export const TENANT_MODULE_PACKS = {
  hospital: {
    id: 'hospital',
    label: 'Hospital',
    description:
      'Hospital on a personalised subdomain (e.g. hycare.mediqzy.com). Staff use role logins — not /hospital/login.',
    icon: '🏥',
    minPlan: 'professional',
    routePrefix: '/hospital',
    apiPrefix: '/api/hospital',
    // No single staff login — each role has its own path on the tenant host
    loginPath: null,
    accessPath: '/hospital/dashboard',
    appLoginPath: null,
    roleLogins: true,
    modules: [
      // Role portals (primary access on {subdomain}.mediqzy.com)
      mod('doctor', 'Doctor', '/doctor/login', { kind: 'role_login', dashboard: '/doctor/dashboard' }),
      mod('nurse', 'Nurse', '/nurse/login', { kind: 'role_login', dashboard: '/nurse/dashboard' }),
      mod('frontdesk', 'Front Desk', '/frontdesk/login', { kind: 'role_login', dashboard: '/assistant/dashboard', aliases: ['/assistant/login'] }),
      mod('lab', 'Lab', '/lab/login', { kind: 'role_login', dashboard: '/lab/dashboard' }),
      mod('pharmacy', 'Pharmacy', '/pharmacy/login', { kind: 'role_login', dashboard: '/pharmacy/dashboard' }),
      mod('mrd', 'MRD', '/mrd/login', { kind: 'role_login', dashboard: '/mrd/dashboard' }),
      mod('hr', 'HR', '/hr/login', { kind: 'role_login', dashboard: '/hr/dashboard' }),
      mod('accounts', 'Accounts', '/accounts/login', { kind: 'role_login', dashboard: '/accounts/dashboard' }),
      mod('insurance_desk', 'Insurance Desk', '/insurance-desk/login', { kind: 'role_login', dashboard: '/insurance-desk/dashboard' }),
      mod('ot', 'OT', '/ot/login', { kind: 'role_login', dashboard: '/ot/dashboard' }),
      mod('icu', 'ICU', '/icu/login', { kind: 'role_login', dashboard: '/icu/dashboard' }),
      mod('security', 'Security', '/security/login', { kind: 'role_login', dashboard: '/security/dashboard' }),
      mod('quality', 'Quality', '/quality/login', { kind: 'role_login', dashboard: '/quality/dashboard' }),
      mod('it_edp', 'IT / EDP', '/it-edp/login', { kind: 'role_login', dashboard: '/it-edp/dashboard' }),
      // Ops modules (post-login hospital OS surfaces)
      mod('opd', 'OPD', '/hospital/opd', { kind: 'ops' }),
      mod('ipd', 'IPD', '/hospital/ipd', { kind: 'ops' }),
      mod('ehr', 'EHR / EMR', '/hospital/ehr', { kind: 'ops' }),
      mod('billing', 'Billing', '/hospital/billing', { kind: 'ops' }),
      mod('os', 'Hospital OS', '/hospital/os', { kind: 'ops' }),
      mod('settings', 'Settings', '/hospital/settings', { kind: 'ops' }),
    ],
    optionalModules: [
      mod('ambulance', 'Ambulance Desk', '/ambulance/login', { enabled: false, kind: 'role_login' }),
      mod('homecare', 'Homecare Desk', '/homecare/login', { enabled: false, kind: 'role_login' }),
      mod('dms', 'Document Management', '/hospital/dms', { enabled: false, kind: 'ops' }),
      mod('housekeeping', 'Housekeeping', '/hospital/housekeeping', { enabled: false, kind: 'ops' }),
      mod('parking', 'Parking (Security)', '/security/parking', { enabled: false, kind: 'ops' }),
      mod('surveillance', 'Camera Analytics (Security)', '/security/camera-analytics', { enabled: false, kind: 'ops' }),
      mod('asset_tracking', 'Asset Tracking (RFID/IoT)', '/hospital/asset-tracking', { enabled: false, kind: 'ops' }),
      mod('patient_portal', 'Patient Engagement Portal', '/patient-portal', { enabled: false, kind: 'ops' }),
    ],
  },

  clinic: {
    id: 'clinic',
    label: 'Clinic',
    description: 'Clinic portal on personalised subdomain (e.g. ajdental.mediqzy.com/login)',
    icon: '🏨',
    minPlan: 'free',
    routePrefix: '/clinic',
    apiPrefix: '/api/clinic',
    loginPath: '/login',
    accessPath: '/clinic/dashboard',
    appLoginPath: '/clinic/login',
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
    description: 'Lab portal on personalised subdomain (e.g. acmelab.mediqzy.com/lab/login)',
    icon: '🔬',
    minPlan: 'free',
    routePrefix: '/lab',
    apiPrefix: '/api/lab',
    loginPath: '/lab/login',
    accessPath: '/lab/dashboard',
    appLoginPath: '/lab/login',
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
      mod('pacs_devices', 'PACS Devices', '/lab/pacs-devices', { enabled: false }),
    ],
  },

  diagnostic_centre: {
    id: 'diagnostic_centre',
    label: 'Diagnostic Centre',
    description: 'Imaging + diagnostics on personalised subdomain (shares lab portal paths)',
    icon: '🩻',
    minPlan: 'free',
    routePrefix: '/lab',
    apiPrefix: '/api/lab',
    loginPath: '/lab/login',
    accessPath: '/lab/dashboard',
    appLoginPath: '/lab/login',
    modules: [
      mod('dashboard', 'Dashboard', '/lab/dashboard'),
      mod('test_catalog', 'Test Catalog', '/lab/test-catalog'),
      mod('orders', 'Orders', '/lab/orders'),
      mod('ris', 'RIS / Imaging', '/lab/ris'),
      mod('imaging', 'Imaging', '/lab/imaging'),
      mod('sonology', 'Sonology', '/lab/sonology'),
      mod('pacs_devices', 'PACS Devices', '/lab/pacs-devices'),
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
    description: 'Employer wellness portal on personalised subdomain',
    icon: '🏢',
    minPlan: 'professional',
    routePrefix: '/corporate',
    apiPrefix: '/api/corporate',
    loginPath: '/corporate/login',
    accessPath: '/corporate/dashboard',
    appLoginPath: '/corporate/login',
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
    description: 'Homecare portal on personalised subdomain',
    icon: '🏠',
    minPlan: 'professional',
    routePrefix: '/homecare',
    apiPrefix: '/api/homecare',
    loginPath: '/homecare/login',
    accessPath: '/homecare/dashboard',
    appLoginPath: '/homecare/login',
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
    description: 'EMS dispatch portal on personalised subdomain',
    icon: '🚑',
    minPlan: 'professional',
    routePrefix: '/ambulance',
    apiPrefix: '/api/ambulance',
    loginPath: '/ambulance/login',
    accessPath: '/ambulance/dashboard',
    appLoginPath: '/ambulance/login',
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
    description: 'Pharmacy portal on personalised subdomain',
    icon: '💊',
    minPlan: 'free',
    routePrefix: '/pharmacy',
    apiPrefix: '/api/pharmacy',
    loginPath: '/pharmacy/login',
    accessPath: '/pharmacy/dashboard',
    appLoginPath: '/pharmacy/login',
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
    description: 'TPA portal on personalised subdomain',
    icon: '📋',
    minPlan: 'enterprise',
    routePrefix: '/tpa',
    apiPrefix: '/api/tpa',
    loginPath: '/tpa/login',
    accessPath: '/tpa/dashboard',
    appLoginPath: '/tpa/login',
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
    description: 'Insurer portal on personalised subdomain',
    icon: '🛡️',
    minPlan: 'enterprise',
    routePrefix: '/insurer',
    apiPrefix: '/api/insurer',
    loginPath: '/insurer/login',
    accessPath: '/insurer/dashboard',
    appLoginPath: '/insurer/login',
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
    description: 'Broker portal on personalised subdomain',
    icon: '🤝',
    minPlan: 'professional',
    routePrefix: '/intermediary',
    apiPrefix: '/api/broker',
    loginPath: '/intermediary/login',
    accessPath: '/intermediary/dashboard',
    appLoginPath: '/intermediary/login',
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
    description: 'PSU portal on personalised subdomain',
    icon: '🏛️',
    minPlan: 'enterprise',
    routePrefix: '/psu',
    apiPrefix: '/api/psu',
    loginPath: '/psu/login',
    accessPath: '/psu/dashboard',
    appLoginPath: '/psu/login',
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
    description: 'NGO portal on personalised subdomain',
    icon: '❤️',
    minPlan: 'free',
    routePrefix: '/ngo',
    apiPrefix: '/api/ngo',
    loginPath: '/ngo/login',
    accessPath: '/ngo/dashboard',
    appLoginPath: '/ngo/login',
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
 * Build personalised portal URLs for a tenant subdomain / custom domain.
 * Primary: https://{subdomain}.mediqzy.com/...
 *
 * Hospital tenants use role logins (doctor/nurse/lab/…) — not a single /hospital/login.
 */
export function buildTenantPortalUrls({
  type,
  subdomain,
  custom_domain,
  customDomain,
  baseDomain = PLATFORM_BASE_DOMAIN,
  appHost = PLATFORM_APP_HOST,
} = {}) {
  const pack = getTenantModulePack(type);
  const domain = custom_domain || customDomain || null;
  const label = subdomain ? String(subdomain).trim().toLowerCase() : null;

  const origin = domain
    ? `https://${String(domain).replace(/^https?:\/\//, '').replace(/\/$/, '')}`
    : label
      ? `https://${label}.${baseDomain}`
      : null;

  const roleMods = (pack?.modules || []).filter((m) => m.enabled !== false && m.kind === 'role_login');

  const role_logins = roleMods.map((m) => ({
    key: m.key,
    label: m.label,
    path: m.path,
    dashboard: m.dashboard || null,
    url: origin ? `${origin}${m.path}` : null,
  }));

  const accessPath = pack?.accessPath || role_logins[0]?.dashboard || '/';

  return {
    origin,
    host: origin ? origin.replace(/^https?:\/\//, '') : null,
    subdomain: label,
    custom_domain: domain || null,
    // Single login only when the pack defines one (clinic / lab / …). Hospital → null.
    login_path: pack?.loginPath || null,
    access_path: accessPath,
    login_url: pack?.loginPath && origin ? `${origin}${pack.loginPath}` : null,
    access_url: origin ? `${origin}${accessPath}` : null,
    app_login_url: pack?.appLoginPath ? `https://${appHost}${pack.appLoginPath}` : null,
    // Role portals on personalised domain (hospital staff)
    role_logins,
    example_login_url: role_logins[0]?.url || (pack?.loginPath && origin ? `${origin}${pack.loginPath}` : null),
    module_prefix: pack?.routePrefix || null,
  };
}

/**
 * Build features/settings payloads to attach on tenant create.
 */
export function buildTenantModuleAttachment(type, planFeatures = {}, portalOpts = {}) {
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
  const portal = buildTenantPortalUrls({
    type,
    subdomain: portalOpts.subdomain,
    custom_domain: portalOpts.custom_domain || portalOpts.customDomain,
  });
  const roleLoginKeys = (portal.role_logins || []).map((r) => r.key);

  return {
    features: {
      ...planFeatures,
      pack_id: pack.id,
      modules: moduleKeys,
      role_logins: roleLoginKeys,
      // boolean convenience flags used by requireFeature middleware
      ...Object.fromEntries(moduleKeys.map((key) => [`module_${key}`, true])),
    },
    settings: {
      module_prefix: pack.routePrefix,
      api_prefix: pack.apiPrefix,
      login_path: pack.loginPath,
      access_path: pack.accessPath,
      app_login_path: pack.appLoginPath || null,
      module_pack_id: pack.id,
      role_logins: true,
      // Personalised domain — primary access surface
      tenant_domain: portal.host,
      portal_origin: portal.origin,
      portal_login_url: portal.login_url,
      portal_access_url: portal.access_url,
      portal_role_logins: portal.role_logins,
    },
    metadata: {
      module_pack: {
        id: pack.id,
        version: 3,
        route_prefix: pack.routePrefix,
        api_prefix: pack.apiPrefix,
        login_path: pack.loginPath,
        access_path: pack.accessPath,
        app_login_path: pack.appLoginPath,
        tenant_domain: portal.host,
        portal_origin: portal.origin,
        portal_login_url: portal.login_url,
        role_logins: portal.role_logins,
        modules: enabledModules,
        optional_modules: pack.optionalModules || [],
        attached_at: new Date().toISOString(),
      },
    },
    pack,
    portal,
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
  PLATFORM_BASE_DOMAIN,
  normalizeTenantType,
  getTenantModulePack,
  listTenantModulePacks,
  buildTenantPortalUrls,
  buildTenantModuleAttachment,
  tenantHasModule,
};
