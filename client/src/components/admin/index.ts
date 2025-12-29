/**
 * Admin Components Index
 * Centralized exports for all admin-related components
 * Use these components to maintain consistent branding across admin pages
 */

// Page Layout Components
export { default as AdminPageHeader, SimplePageHeader } from './AdminPageHeader';
export type { AdminPageHeaderProps, PageAction } from './AdminPageHeader';

// Status & Badge Components
export { default as AdminStatusBadge, ActiveStatusBadge, PaymentStatusBadge, PriorityBadge } from './AdminStatusBadge';
export type { StatusType, PriorityType } from './AdminStatusBadge';

// Data Display Components
export { default as StatCard } from './StatCard';
export { default as AdminTable } from './AdminTable';
export { default as ActivityStats } from './ActivityStats';

// Auth Components
export { default as AdminAuthGuard } from './AdminAuthGuard';

// Wrappers
export { default as AdminPageWrapper } from './AdminPageWrapper';

// Feature Components
export { default as ChatDashboard } from './ChatDashboard';
export { default as SimpleChatDashboard } from './SimpleChatDashboard';
export { default as DeviceRegistrationForm } from './DeviceRegistrationForm';

// Re-export branding constants for convenience
export * from '@/constants/admin-branding';
