// Canonical catalog of Team-portal permission strings.
// Every value here must exactly match a string passed to requirePermission()
// somewhere in server/routes/*.js — this file is the single source of truth
// for the RBAC editor UI (client/src/pages/team/TeamStaffManagement.tsx).

export const TEAM_PERMISSIONS_CATALOG = [
  { key: 'Dashboard Access',          group: 'General',    description: 'View the Team dashboard and KPIs' },
  { key: 'Analytics Access',          group: 'General',    description: 'View analytics and reporting dashboards' },
  { key: 'Patient Reports',           group: 'General',    description: 'View and export patient reports' },
  { key: 'Audit Access',              group: 'General',    description: 'View audit logs and plan governance' },
  { key: 'Audit Logs',                group: 'General',    description: 'View raw activity/audit log entries' },
  { key: 'User Management',           group: 'Admin',      description: 'Create, edit and manage internal team members and their permissions' },
  { key: 'Doctor Management',         group: 'Clinical',   description: 'Manage doctor onboarding, profiles and registrations' },
  { key: 'Pharmacy Management',       group: 'Clinical',   description: 'Manage pharmacy onboarding and records' },
  { key: 'Appointment Management',    group: 'Operations', description: 'Manage and reschedule appointments' },
  { key: 'Corporate Management',      group: 'Corporate',  description: 'Manage corporate accounts, employees and plans' },
  { key: 'Provider Network',          group: 'Corporate',  description: 'Manage the provider network directory and bot' },
  { key: 'Broker Management',         group: 'Corporate',  description: 'Manage insurance brokers' },
  { key: 'Insurance RFQ Management',  group: 'Insurance',  description: 'Manage RFQs, quotes, agents, agencies and commissions' },
  { key: 'Chat Dashboard Access',     group: 'Communication', description: 'Access chat, WhatsApp and social inbox' },
  { key: 'Finance Access',            group: 'Finance',    description: 'View orders, payments and revenue history' },
];

export const TEAM_PERMISSION_KEYS = TEAM_PERMISSIONS_CATALOG.map((p) => p.key);
