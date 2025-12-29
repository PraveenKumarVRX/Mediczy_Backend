import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getStatusColors, getPriorityColors, STATUS_COLORS, PRIORITY_COLORS } from '@/constants/admin-branding';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  AlertCircle,
  Pause,
  Play,
  Eye,
  Ban,
  Send,
  Mail,
  MailOpen
} from 'lucide-react';

export type StatusType = keyof typeof STATUS_COLORS;
export type PriorityType = keyof typeof PRIORITY_COLORS;

interface AdminStatusBadgeProps {
  status: string;
  type?: 'status' | 'priority';
  showIcon?: boolean;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

// Icon mapping for statuses
const statusIcons: Record<string, React.ComponentType<any>> = {
  // General
  active: CheckCircle,
  inactive: Pause,
  pending: Clock,
  verified: CheckCircle,
  unverified: AlertCircle,
  suspended: Ban,
  
  // Appointment
  scheduled: Clock,
  confirmed: CheckCircle,
  completed: CheckCircle,
  cancelled: XCircle,
  noShow: AlertTriangle,
  rescheduled: Clock,
  
  // Payment
  paid: CheckCircle,
  unpaid: AlertTriangle,
  overdue: AlertCircle,
  refunded: XCircle,
  
  // Communication
  sent: Send,
  delivered: CheckCircle,
  failed: XCircle,
  read: MailOpen,
  bounced: AlertTriangle,
  
  // Result
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: AlertCircle,
};

const priorityIcons: Record<string, React.ComponentType<any>> = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: AlertCircle,
  low: Clock,
  normal: CheckCircle,
};

export default function AdminStatusBadge({
  status,
  type = 'status',
  showIcon = true,
  size = 'default',
  className,
}: AdminStatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/[\s-_]/g, '');
  
  const colors = type === 'priority' 
    ? getPriorityColors(normalizedStatus)
    : getStatusColors(normalizedStatus);
  
  const icons = type === 'priority' ? priorityIcons : statusIcons;
  const Icon = icons[normalizedStatus];
  
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    default: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1',
  };
  
  const iconSizeClasses = {
    sm: 'h-2.5 w-2.5',
    default: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  };

  // Format status for display (capitalize first letter, add spaces)
  const displayStatus = status
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium border',
        colors.text,
        colors.bg,
        colors.border,
        sizeClasses[size],
        showIcon && Icon && 'gap-1',
        className
      )}
    >
      {showIcon && Icon && <Icon className={cn(iconSizeClasses[size])} />}
      {displayStatus}
    </Badge>
  );
}

// Convenience exports for common status types
export function ActiveStatusBadge({ isActive, ...props }: Omit<AdminStatusBadgeProps, 'status'> & { isActive: boolean }) {
  return <AdminStatusBadge status={isActive ? 'active' : 'inactive'} {...props} />;
}

export function PaymentStatusBadge({ status, ...props }: Omit<AdminStatusBadgeProps, 'type'>) {
  return <AdminStatusBadge status={status} type="status" {...props} />;
}

export function PriorityBadge({ priority, ...props }: Omit<AdminStatusBadgeProps, 'status' | 'type'> & { priority: string }) {
  return <AdminStatusBadge status={priority} type="priority" {...props} />;
}
